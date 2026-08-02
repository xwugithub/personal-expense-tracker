"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/auth";
import type { ActionResult } from "@/lib/actions";

const GENERIC_ERROR = "Invalid email or password";

export async function login(input: unknown): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (
    !checkRateLimit(`login:ip:${ip}`, 20, 60_000) ||
    !checkRateLimit(`login:email:${parsed.data.email}`, 5, 60_000)
  ) {
    return {
      success: false,
      error: "Too many attempts. Please try again in a minute.",
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { success: false, error: GENERIC_ERROR };
    }
    console.error("login failed", err);
    return { success: false, error: "Something went wrong. Please try again." };
  }

  return { success: true, data: null };
}
