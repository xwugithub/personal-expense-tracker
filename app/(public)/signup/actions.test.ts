import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockUserInstance {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  _id: { toString: () => string };
}

const {
  signInMock,
  checkRateLimitMock,
  headersMock,
  connectToDatabaseMock,
  userFindOneMock,
  userSaveMock,
  categoryInsertManyMock,
  createdUsers,
} = vi.hoisted(() => {
  return {
    signInMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    headersMock: vi.fn(),
    connectToDatabaseMock: vi.fn().mockResolvedValue(undefined),
    userFindOneMock: vi.fn(),
    userSaveMock: vi.fn().mockResolvedValue(undefined),
    categoryInsertManyMock: vi.fn().mockResolvedValue(undefined),
    createdUsers: [] as MockUserInstance[],
  };
});

vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("@/lib/mongoose", () => ({ connectToDatabase: connectToDatabaseMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/models/User", () => {
  class MockUser implements MockUserInstance {
    _id = { toString: () => "user-id-1" };
    firstName: string;
    lastName: string;
    email: string;
    password?: string;

    constructor(fields: { firstName: string; lastName: string; email: string }) {
      this.firstName = fields.firstName;
      this.lastName = fields.lastName;
      this.email = fields.email;
      createdUsers.push(this);
    }

    save() {
      return userSaveMock();
    }

    static findOne = userFindOneMock;
  }
  return { User: MockUser };
});
vi.mock("@/models/Category", () => ({
  Category: { insertMany: categoryInsertManyMock },
  DEFAULT_CATEGORY_NAMES: ["Food", "Transport", "Housing"],
}));

function selectReturning(value: unknown) {
  return { select: () => Promise.resolve(value) };
}

function headersWithForwardedFor(value: string | null) {
  headersMock.mockResolvedValue({
    get: (name: string) => (name === "x-forwarded-for" ? value : null),
  });
}

beforeEach(() => {
  vi.resetModules();
  signInMock.mockReset();
  signInMock.mockResolvedValue(undefined);
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockReturnValue(true);
  connectToDatabaseMock.mockClear();
  userFindOneMock.mockReset();
  userFindOneMock.mockReturnValue(selectReturning(null));
  userSaveMock.mockReset();
  userSaveMock.mockResolvedValue(undefined);
  categoryInsertManyMock.mockReset();
  categoryInsertManyMock.mockResolvedValue(undefined);
  createdUsers.length = 0;
  headersWithForwardedFor("203.0.113.5");
});

async function loadSignup() {
  const mod = await import("@/app/(public)/signup/actions");
  return mod.signup;
}

const validInput = {
  firstName: "Alice",
  lastName: "Doe",
  email: "alice@example.com",
  password: "password123",
  confirmPassword: "password123",
};

describe("signup", () => {
  it("returns field errors for invalid input without checking rate limits or touching the database", async () => {
    const signup = await loadSignup();

    const result = await signup({ ...validInput, confirmPassword: "mismatch123" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.confirmPassword).toBeDefined();
    }
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("rate limits signup attempts per IP and per email", async () => {
    const signup = await loadSignup();

    await signup(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("signup:ip:203.0.113.5", 10, 60_000);
    expect(checkRateLimitMock).toHaveBeenCalledWith("signup:email:alice@example.com", 3, 60_000);
  });

  it("falls back to 'unknown' as the IP when there is no x-forwarded-for header", async () => {
    headersWithForwardedFor(null);
    const signup = await loadSignup();

    await signup(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("signup:ip:unknown", 10, 60_000);
  });

  it("returns a generic rate-limit error and skips account creation when rate limited", async () => {
    checkRateLimitMock.mockReturnValueOnce(false);
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(result).toEqual({
      success: false,
      error: "Too many attempts. Please try again in a minute.",
    });
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("returns a generic 'unable to create account' error when a user with that email already exists", async () => {
    userFindOneMock.mockReturnValue(selectReturning({ _id: "existing-id" }));
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(result).toEqual({ success: false, error: "Unable to create account." });
    expect(userSaveMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("creates the user, sets the password virtual, seeds default categories, signs in, and returns success", async () => {
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(connectToDatabaseMock).toHaveBeenCalled();
    expect(userFindOneMock).toHaveBeenCalledWith({ email: "alice@example.com" });
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toMatchObject({
      firstName: "Alice",
      lastName: "Doe",
      email: "alice@example.com",
      password: "password123",
    });
    expect(userSaveMock).toHaveBeenCalledTimes(1);
    expect(categoryInsertManyMock).toHaveBeenCalledWith([
      { user: createdUsers[0]._id, name: "Food" },
      { user: createdUsers[0]._id, name: "Transport" },
      { user: createdUsers[0]._id, name: "Housing" },
    ]);
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "alice@example.com",
      password: "password123",
      redirect: false,
    });
    expect(result).toEqual({ success: true, data: null });
  });

  it("returns a generic error when saving the user hits a duplicate-key race", async () => {
    userSaveMock.mockRejectedValue({ code: 11000 });
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(result).toEqual({ success: false, error: "Unable to create account." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns a generic failure message and logs when saving the user fails for another reason", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userSaveMock.mockRejectedValue(new Error("disk on fire"));
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(result).toEqual({
      success: false,
      error: "Something went wrong. Please try again.",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("reports account creation succeeded but asks the user to log in when the post-signup sign-in fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInMock.mockRejectedValue(new Error("session store unavailable"));
    const signup = await loadSignup();

    const result = await signup(validInput);

    expect(userSaveMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: false,
      error: "Account created. Please log in.",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
