import { beforeEach, describe, expect, it, vi } from "vitest";

const { nextAuthMock, credentialsMock, connectToDatabaseMock, userFindOneMock, userFindByIdMock } =
  vi.hoisted(() => {
    return {
      nextAuthMock: vi.fn((config: unknown) => ({
        handlers: {},
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
        __config: config,
      })),
      credentialsMock: vi.fn((config: unknown) => ({ id: "credentials", ...(config as object) })),
      connectToDatabaseMock: vi.fn().mockResolvedValue(undefined),
      userFindOneMock: vi.fn(),
      userFindByIdMock: vi.fn(),
    };
  });

vi.mock("next-auth", () => ({ default: nextAuthMock }));
vi.mock("next-auth/providers/credentials", () => ({ default: credentialsMock }));
vi.mock("@/lib/mongoose", () => ({ connectToDatabase: connectToDatabaseMock }));
vi.mock("@/models/User", () => ({
  User: {
    findOne: userFindOneMock,
    findById: userFindByIdMock,
  },
}));

function selectReturning(value: unknown) {
  return { select: () => Promise.resolve(value) };
}

async function loadAuthConfig() {
  const mod = await import("@/auth");
  return (nextAuthMock.mock.calls[0][0]) as {
    providers: Array<{ authorize: (credentials: unknown) => Promise<unknown> }>;
    callbacks: {
      jwt: (args: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<unknown>;
      session: (args: {
        session: { user: { id?: string } };
        token: Record<string, unknown>;
      }) => Promise<{ user: { id?: string } }>;
    };
  } & { __mod: typeof mod };
}

beforeEach(() => {
  vi.resetModules();
  nextAuthMock.mockClear();
  connectToDatabaseMock.mockClear();
  userFindOneMock.mockReset();
  userFindByIdMock.mockReset();
});

describe("authorize()", () => {
  it("returns null for malformed credentials", async () => {
    const config = await loadAuthConfig();
    const result = await config.providers[0].authorize({
      email: "not-an-email",
      password: "x",
    });
    expect(result).toBeNull();
    expect(userFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when no user matches the email", async () => {
    userFindOneMock.mockReturnValue(selectReturning(null));
    const config = await loadAuthConfig();

    const result = await config.providers[0].authorize({
      email: "user@example.com",
      password: "password1",
    });

    expect(result).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    userFindOneMock.mockReturnValue(
      selectReturning({ comparePassword: vi.fn().mockResolvedValue(false) }),
    );
    const config = await loadAuthConfig();

    const result = await config.providers[0].authorize({
      email: "user@example.com",
      password: "wrong-password",
    });

    expect(result).toBeNull();
  });

  it("returns the user payload when credentials are valid", async () => {
    const objectId = { toString: () => "user-id-123" };
    userFindOneMock.mockReturnValue(
      selectReturning({
        _id: objectId,
        email: "user@example.com",
        firstName: "Alice",
        lastName: "Doe",
        sessionVersion: 2,
        comparePassword: vi.fn().mockResolvedValue(true),
      }),
    );
    const config = await loadAuthConfig();

    const result = await config.providers[0].authorize({
      email: "user@example.com",
      password: "correct-password",
    });

    expect(result).toEqual({
      id: "user-id-123",
      email: "user@example.com",
      firstName: "Alice",
      lastName: "Doe",
      sessionVersion: 2,
    });
  });
});

describe("callbacks.jwt", () => {
  it("seeds the token from the user on initial sign-in", async () => {
    const config = await loadAuthConfig();
    const token = await config.callbacks.jwt({
      token: {},
      user: { id: "user-1", sessionVersion: 3 },
    });
    expect(token).toEqual({ sub: "user-1", sessionVersion: 3 });
  });

  it("returns null when the token has no valid sub", async () => {
    const config = await loadAuthConfig();
    const token = await config.callbacks.jwt({ token: { sub: 123 } });
    expect(token).toBeNull();
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("returns null when the user no longer exists", async () => {
    userFindByIdMock.mockReturnValue(selectReturning(null));
    const config = await loadAuthConfig();

    const token = await config.callbacks.jwt({
      token: { sub: "user-1", sessionVersion: 1 },
    });

    expect(token).toBeNull();
  });

  it("returns null when sessionVersion no longer matches (revocation)", async () => {
    userFindByIdMock.mockReturnValue(selectReturning({ sessionVersion: 2 }));
    const config = await loadAuthConfig();

    const token = await config.callbacks.jwt({
      token: { sub: "user-1", sessionVersion: 1 },
    });

    expect(token).toBeNull();
  });

  it("returns the token unchanged when sessionVersion matches", async () => {
    userFindByIdMock.mockReturnValue(selectReturning({ sessionVersion: 1 }));
    const config = await loadAuthConfig();

    const token = await config.callbacks.jwt({
      token: { sub: "user-1", sessionVersion: 1 },
    });

    expect(token).toEqual({ sub: "user-1", sessionVersion: 1 });
  });
});

describe("callbacks.session", () => {
  it("copies token.sub into session.user.id when it is a string", async () => {
    const config = await loadAuthConfig();
    const session = await config.callbacks.session({
      session: { user: {} },
      token: { sub: "user-1" },
    });
    expect(session.user.id).toBe("user-1");
  });

  it("leaves session.user.id untouched when token.sub is not a string", async () => {
    const config = await loadAuthConfig();
    const session = await config.callbacks.session({
      session: { user: {} },
      token: {},
    });
    expect(session.user.id).toBeUndefined();
  });
});
