import { describe, expect, it } from "vitest";
import {
  emailSchema,
  loginSchema,
  nameSchema,
  passwordSchema,
  signupSchema,
} from "@/lib/validation/auth";

describe("emailSchema", () => {
  it("accepts a valid email", () => {
    const result = emailSchema.safeParse("user@example.com");
    expect(result.success).toBe(true);
  });

  it("trims and lowercases the email", () => {
    const result = emailSchema.safeParse("  USER@Example.COM  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("user@example.com");
    }
  });

  it("rejects a malformed email", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = emailSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts a password with 8 or more characters", () => {
    expect(passwordSchema.safeParse("password").success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = passwordSchema.safeParse("short1");
    expect(result.success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("trims whitespace", () => {
    const result = nameSchema.safeParse("  Alice  ");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Alice");
    }
  });

  it("rejects an empty string", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(nameSchema.safeParse("   ").success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty password even though it has no minimum length", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "anything",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("signupSchema", () => {
  const validInput = {
    firstName: "Alice",
    lastName: "Doe",
    email: "alice@example.com",
    password: "password123",
    confirmPassword: "password123",
  };

  it("accepts valid matching input", () => {
    expect(signupSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({
      ...validInput,
      confirmPassword: "different123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flattened = result.error.flatten().fieldErrors;
      expect(flattened.confirmPassword).toBeDefined();
    }
  });

  it("rejects a password under 8 characters", () => {
    const result = signupSchema.safeParse({
      ...validInput,
      password: "short1",
      confirmPassword: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty first name", () => {
    const result = signupSchema.safeParse({ ...validInput, firstName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty last name", () => {
    const result = signupSchema.safeParse({ ...validInput, lastName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = signupSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
