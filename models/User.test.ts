import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { User } from "@/models/User";

function buildUser(overrides: Partial<Record<string, unknown>> = {}) {
  return new User({
    firstName: "Alice",
    lastName: "Doe",
    email: "alice@example.com",
    ...overrides,
  });
}

describe("User schema validation", () => {
  it("requires firstName, lastName, email, and passwordHash", async () => {
    const user = new User({});
    await expect(user.validate()).rejects.toThrow();

    const err = await user.validate().catch((e) => e);
    expect(err.errors.firstName).toBeDefined();
    expect(err.errors.lastName).toBeDefined();
    expect(err.errors.email).toBeDefined();
    expect(err.errors.passwordHash).toBeDefined();
  });

  it("rejects a malformed email", async () => {
    const user = buildUser({ email: "not-an-email", passwordHash: "hash" });
    const err = await user.validate().catch((e) => e);
    expect(err.errors.email).toBeDefined();
  });

  it("trims and lowercases the email", () => {
    const user = buildUser({ email: "  ALICE@Example.com  ", passwordHash: "hash" });
    expect(user.email).toBe("alice@example.com");
  });

  it("trims firstName and lastName", () => {
    const user = buildUser({
      firstName: "  Alice  ",
      lastName: "  Doe  ",
      passwordHash: "hash",
    });
    expect(user.firstName).toBe("Alice");
    expect(user.lastName).toBe("Doe");
  });

  it("defaults sessionVersion to 0", () => {
    const user = buildUser({ passwordHash: "hash" });
    expect(user.sessionVersion).toBe(0);
  });

  it("passes validation when all required fields are present", async () => {
    const user = buildUser({ passwordHash: "hash" });
    await expect(user.validate()).resolves.toBeUndefined();
  });
});

describe("password hashing (pre-validate hook)", () => {
  it("hashes the plaintext password assigned via the virtual", async () => {
    const user = buildUser();
    user.password = "supersecret1";

    await user.validate();

    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe("supersecret1");
    expect(user.passwordHash.startsWith("$2")).toBe(true);
    await expect(bcrypt.compare("supersecret1", user.passwordHash)).resolves.toBe(true);
  });

  it("does not overwrite an existing passwordHash when the virtual is untouched", async () => {
    const user = buildUser({ passwordHash: "$2b$12$existinghashvalueplaceholder" });

    await user.validate();

    expect(user.passwordHash).toBe("$2b$12$existinghashvalueplaceholder");
  });

  it("produces a different hash each time (unique salt)", async () => {
    const userA = buildUser({ email: "a@example.com" });
    userA.password = "samepassword1";
    const userB = buildUser({ email: "b@example.com" });
    userB.password = "samepassword1";

    await userA.validate();
    await userB.validate();

    expect(userA.passwordHash).not.toBe(userB.passwordHash);
  });
});

describe("comparePassword", () => {
  it("resolves true for the correct password", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    const user = buildUser({ passwordHash });

    await expect(user.comparePassword("correct-horse")).resolves.toBe(true);
  });

  it("resolves false for an incorrect password", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    const user = buildUser({ passwordHash });

    await expect(user.comparePassword("wrong-password")).resolves.toBe(false);
  });

  it("resolves false for an empty candidate password", async () => {
    const passwordHash = await bcrypt.hash("correct-horse", 4);
    const user = buildUser({ passwordHash });

    await expect(user.comparePassword("")).resolves.toBe(false);
  });
});
