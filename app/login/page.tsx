"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const emailError =
    submitted && !EMAIL_PATTERN.test(email)
      ? "Enter a valid email address"
      : undefined;
  const passwordError =
    submitted && password.length === 0 ? "Password is required" : undefined;

  const isValid = EMAIL_PATTERN.test(email) && password.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    console.log("login", { email, password });
  }

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Enter your details to continue."
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
        <button
          type="submit"
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Log in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
