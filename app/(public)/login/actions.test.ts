// Imported from @auth/core directly (rather than "next-auth") because
// next-auth's index re-exports from a module that imports "next/server",
// which fails to resolve under Vitest's Node ESM resolution outside of the
// Next.js build pipeline. @auth/core/errors is the actual home of AuthError.
import { AuthError } from "@auth/core/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInMock, checkRateLimitMock, headersMock } = vi.hoisted(() => {
  return {
    signInMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    headersMock: vi.fn(),
  };
});

vi.mock("@/auth", () => ({ signIn: signInMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
// actions.ts imports `AuthError` from "next-auth" directly. The real
// "next-auth" package index transitively imports "next/server", which fails
// to resolve under Vitest's Node ESM resolution outside the Next.js build
// pipeline, so it's mocked here to re-export the real @auth/core class
// (same class actions.ts's `instanceof AuthError` check needs) without
// pulling in the rest of the package.
vi.mock("next-auth", () => ({ AuthError }));

function headersWithForwardedFor(value: string | null) {
  headersMock.mockResolvedValue({
    get: (name: string) => (name === "x-forwarded-for" ? value : null),
  });
}

beforeEach(() => {
  vi.resetModules();
  signInMock.mockReset();
  checkRateLimitMock.mockReset();
  checkRateLimitMock.mockReturnValue(true);
  headersWithForwardedFor("203.0.113.5");
});

async function loadLogin() {
  const mod = await import("@/app/(public)/login/actions");
  return mod.login;
}

const validInput = { email: "user@example.com", password: "password1" };

describe("login", () => {
  it("returns field errors for invalid input without checking rate limits or signing in", async () => {
    const login = await loadLogin();

    const result = await login({ email: "not-an-email", password: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toBeDefined();
    }
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("rate limits by IP address parsed from x-forwarded-for", async () => {
    const login = await loadLogin();

    await login(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("login:ip:203.0.113.5", 20, 60_000);
  });

  it("takes only the first IP when x-forwarded-for has multiple entries", async () => {
    headersWithForwardedFor("203.0.113.5, 70.41.3.18");
    const login = await loadLogin();

    await login(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("login:ip:203.0.113.5", 20, 60_000);
  });

  it("falls back to 'unknown' when there is no x-forwarded-for header", async () => {
    headersWithForwardedFor(null);
    const login = await loadLogin();

    await login(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("login:ip:unknown", 20, 60_000);
  });

  it("also rate limits by normalized email", async () => {
    const login = await loadLogin();

    await login(validInput);

    expect(checkRateLimitMock).toHaveBeenCalledWith("login:email:user@example.com", 5, 60_000);
  });

  it("returns a generic rate-limit error and skips sign-in when the IP limit is exceeded", async () => {
    checkRateLimitMock.mockReturnValueOnce(false);
    const login = await loadLogin();

    const result = await login(validInput);

    expect(result).toEqual({
      success: false,
      error: "Too many attempts. Please try again in a minute.",
    });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns a generic rate-limit error when only the email limit is exceeded", async () => {
    checkRateLimitMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const login = await loadLogin();

    const result = await login(validInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Too many attempts. Please try again in a minute.");
    }
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("signs in with the parsed credentials and returns success", async () => {
    signInMock.mockResolvedValue(undefined);
    const login = await loadLogin();

    const result = await login(validInput);

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "user@example.com",
      password: "password1",
      redirect: false,
    });
    expect(result).toEqual({ success: true, data: null });
  });

  it("returns a generic 'invalid email or password' error when signIn throws an AuthError", async () => {
    signInMock.mockRejectedValue(new AuthError("CredentialsSignin"));
    const login = await loadLogin();

    const result = await login(validInput);

    expect(result).toEqual({ success: false, error: "Invalid email or password" });
  });

  it("returns a generic failure message and logs when signIn throws a non-AuthError", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signInMock.mockRejectedValue(new Error("network exploded"));
    const login = await loadLogin();

    const result = await login(validInput);

    expect(result).toEqual({
      success: false,
      error: "Something went wrong. Please try again.",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
