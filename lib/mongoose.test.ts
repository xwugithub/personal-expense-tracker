import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock } = vi.hoisted(() => {
  return {
    connectMock: vi.fn(),
  };
});

vi.mock("mongoose", () => ({
  default: { connect: connectMock },
}));

const ORIGINAL_MONGODB_URI = process.env.MONGODB_URI;

beforeEach(() => {
  vi.resetModules();
  connectMock.mockReset();
  delete (global as { mongooseCache?: unknown }).mongooseCache;
});

afterEach(() => {
  if (ORIGINAL_MONGODB_URI === undefined) {
    delete process.env.MONGODB_URI;
  } else {
    process.env.MONGODB_URI = ORIGINAL_MONGODB_URI;
  }
});

async function loadMongoose() {
  return import("@/lib/mongoose");
}

describe("connectToDatabase", () => {
  it("throws when MONGODB_URI is not set", async () => {
    delete process.env.MONGODB_URI;
    const { connectToDatabase } = await loadMongoose();

    await expect(connectToDatabase()).rejects.toThrow("MONGODB_URI is not set");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("connects and caches the connection across calls", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    const fakeConnection = { fake: true };
    connectMock.mockResolvedValue(fakeConnection);
    const { connectToDatabase } = await loadMongoose();

    const first = await connectToDatabase();
    const second = await connectToDatabase();

    expect(first).toBe(fakeConnection);
    expect(second).toBe(fakeConnection);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith("mongodb://localhost:27017/test");
  });

  it("clears the cached promise on connection failure so a later call can retry", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    connectMock.mockRejectedValueOnce(new Error("connection refused"));
    const { connectToDatabase } = await loadMongoose();

    await expect(connectToDatabase()).rejects.toThrow("connection refused");

    const fakeConnection = { fake: true };
    connectMock.mockResolvedValueOnce(fakeConnection);
    await expect(connectToDatabase()).resolves.toBe(fakeConnection);
    expect(connectMock).toHaveBeenCalledTimes(2);
  });
});
