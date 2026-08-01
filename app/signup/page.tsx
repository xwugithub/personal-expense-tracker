"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const firstNameError =
    submitted && firstName.trim().length === 0
      ? "First name is required"
      : undefined;
  const lastNameError =
    submitted && lastName.trim().length === 0
      ? "Last name is required"
      : undefined;
  const emailError =
    submitted && !EMAIL_PATTERN.test(email)
      ? "Enter a valid email address"
      : undefined;
  const passwordError =
    submitted && password.length < 8
      ? "Password must be at least 8 characters"
      : undefined;
  const confirmPasswordError =
    submitted && confirmPassword !== password
      ? "Passwords do not match"
      : undefined;

  const isValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    EMAIL_PATTERN.test(email) &&
    password.length >= 8 &&
    confirmPassword === password;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValid) return;
    console.log("signup", { firstName, lastName, email, password });
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="Start tracking your expenses in minutes."
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            id="firstName"
            label="First name"
            type="text"
            autoComplete="given-name"
            placeholder="Jane"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={firstNameError}
          />
          <FormField
            id="lastName"
            label="Last name"
            type="text"
            autoComplete="family-name"
            placeholder="Doe"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={lastNameError}
          />
        </div>
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
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
        <FormField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmPasswordError}
        />
        <button
          type="submit"
          className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Sign up
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-black underline-offset-4 hover:underline dark:text-zinc-50"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
