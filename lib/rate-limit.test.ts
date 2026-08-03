import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request for a new key", () => {
    expect(checkRateLimit("key-a", 3, 1000)).toBe(true);
  });

  it("allows requests up to the limit", () => {
    const key = "key-b";
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
  });

  it("rejects requests beyond the limit within the window", () => {
    const key = "key-c";
    checkRateLimit(key, 2, 1000);
    checkRateLimit(key, 2, 1000);
    expect(checkRateLimit(key, 2, 1000)).toBe(false);
  });

  it("resets the count after the window elapses", () => {
    const key = "key-d";
    checkRateLimit(key, 1, 1000);
    expect(checkRateLimit(key, 1, 1000)).toBe(false);

    vi.setSystemTime(1001);
    expect(checkRateLimit(key, 1, 1000)).toBe(true);
  });

  it("tracks separate keys independently", () => {
    expect(checkRateLimit("key-e1", 1, 1000)).toBe(true);
    expect(checkRateLimit("key-e2", 1, 1000)).toBe(true);
    expect(checkRateLimit("key-e1", 1, 1000)).toBe(false);
    expect(checkRateLimit("key-e2", 1, 1000)).toBe(false);
  });

  it("treats the reset boundary itself as expired (inclusive reset)", () => {
    const key = "key-f";
    checkRateLimit(key, 1, 1000);
    checkRateLimit(key, 1, 1000);
    vi.setSystemTime(1000);
    expect(checkRateLimit(key, 1, 1000)).toBe(true);
  });
});
