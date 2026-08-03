import { beforeEach, describe, expect, it, vi } from "vitest";

// The real `auth` export from "@/auth" is NextAuth's higher-order function:
// `auth(callback)` authenticates the incoming request, attaches `req.auth`,
// then invokes `callback`. Mocking it as the identity function lets us call
// `proxy.default` directly with a fake request and exercise the callback's
// own redirect logic in isolation.
const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn((callback: (req: unknown) => unknown) => callback),
}));

vi.mock("@/auth", () => ({ auth: authMock }));

beforeEach(() => {
  vi.resetModules();
  authMock.mockClear();
});

function buildRequest(url: string, authed = false) {
  const nextUrl = new URL(url);
  return {
    auth: authed ? { user: { id: "user-1" } } : null,
    nextUrl,
    url,
  };
}

async function loadProxy() {
  return import("@/proxy");
}

describe("proxy default export", () => {
  it("wraps its callback with auth()", async () => {
    await loadProxy();
    expect(authMock).toHaveBeenCalledTimes(1);
    expect(authMock).toHaveBeenCalledWith(expect.any(Function));
  });

  it("redirects to /login with the original path and query as callbackUrl when unauthenticated", async () => {
    const { default: proxy } = await loadProxy();
    const req = buildRequest("https://example.com/dashboard?tab=expenses");

    const result = proxy(req as never) as Response;

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(307);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe("/dashboard?tab=expenses");
  });

  it("redirects to /login with just the pathname when there is no query string", async () => {
    const { default: proxy } = await loadProxy();
    const req = buildRequest("https://example.com/settings");

    const result = proxy(req as never) as Response;

    const location = new URL(result.headers.get("location")!);
    expect(location.searchParams.get("callbackUrl")).toBe("/settings");
  });

  it("does not redirect (returns undefined) when the request is authenticated", async () => {
    const { default: proxy } = await loadProxy();
    const req = buildRequest("https://example.com/dashboard", true);

    const result = proxy(req as never);

    expect(result).toBeUndefined();
  });
});

describe("proxy config", () => {
  it("excludes auth API routes, login, signup, and static assets from the matcher", async () => {
    const { config } = await loadProxy();

    expect(config.matcher).toEqual([
      "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});
