"use server";

import { headers } from "next/headers";
import { signIn } from "@/auth";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";
import { Category, DEFAULT_CATEGORY_NAMES } from "@/models/Category";
import { checkRateLimit } from "@/lib/rate-limit";
import { signupSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/actions";

const GENERIC_ERROR = "Unable to create account.";

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

export async function signup(input: unknown): Promise<ActionResult<null>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (
    !checkRateLimit(`signup:ip:${ip}`, 10, 60_000) ||
    !checkRateLimit(`signup:email:${parsed.data.email}`, 3, 60_000)
  ) {
    return {
      success: false,
      error: "Too many attempts. Please try again in a minute.",
    };
  }

  const { firstName, lastName, email, password } = parsed.data;

  try {
    await connectToDatabase();

    const existing = await User.findOne({ email }).select("_id");
    if (existing) {
      return { success: false, error: GENERIC_ERROR };
    }

    const user = new User({ firstName, lastName, email });
    user.password = password;
    await user.save();

    await Category.insertMany(
      DEFAULT_CATEGORY_NAMES.map((name) => ({ user: user._id, name })),
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { success: false, error: GENERIC_ERROR };
    }
    console.error("signup failed", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (err) {
    console.error("post-signup sign-in failed", err);
    return {
      success: false,
      error: "Account created. Please log in.",
    };
  }

  return { success: true, data: null };
}
