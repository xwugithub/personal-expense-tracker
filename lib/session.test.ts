import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, connectToDatabaseMock, userFindByIdMock, redirectMock } = vi.hoisted(() => {
  return {
    authMock: vi.fn(),
    connectToDatabaseMock: vi.fn().mockResolvedValue(undefined),
    userFindByIdMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
  };
});

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/mongoose", () => ({ connectToDatabase: connectToDatabaseMock }));
vi.mock("@/models/User", () => ({ User: { findById: userFindByIdMock } }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

beforeEach(() => {
  vi.resetModules();
  authMock.mockReset();
  connectToDatabaseMock.mockClear();
  userFindByIdMock.mockReset();
  redirectMock.mockClear();
});

async function loadSession() {
  return import("@/lib/session");
}

describe("requireUser", () => {
  it("redirects to /login when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { requireUser } = await loadSession();

    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    expect(redirectMock).toHaveBeenCalledWith("/login");
    expect(connectToDatabaseMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: {} });
    const { requireUser } = await loadSession();

    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /login when the session user no longer exists in the database", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    userFindByIdMock.mockResolvedValue(null);
    const { requireUser } = await loadSession();

    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
    expect(userFindByIdMock).toHaveBeenCalledWith("user-1");
  });

  it("returns the mapped current user when the session and database record are valid", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    userFindByIdMock.mockResolvedValue({
      _id: { toString: () => "user-1" },
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Doe",
    });
    const { requireUser } = await loadSession();

    const result = await requireUser();

    expect(result).toEqual({
      id: "user-1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Doe",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requireUserOrResponse", () => {
  it("returns a 401 JSON response when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const { requireUserOrResponse } = await loadSession();

    const result = await requireUserOrResponse();

    expect(result.user).toBeNull();
    expect(result.response).not.toBeNull();
    expect(result.response?.status).toBe(401);
    await expect(result.response?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns a 401 JSON response when the database user no longer exists", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    userFindByIdMock.mockResolvedValue(null);
    const { requireUserOrResponse } = await loadSession();

    const result = await requireUserOrResponse();

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
  });

  it("returns the current user with a null response when the session is valid", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    userFindByIdMock.mockResolvedValue({
      _id: { toString: () => "user-1" },
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Doe",
    });
    const { requireUserOrResponse } = await loadSession();

    const result = await requireUserOrResponse();

    expect(result.response).toBeNull();
    expect(result.user).toEqual({
      id: "user-1",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Doe",
    });
  });
});
