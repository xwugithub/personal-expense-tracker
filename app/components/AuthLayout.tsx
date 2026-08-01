import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";

export default function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50"
            >
              Expense Tracker
            </Link>
            <ThemeToggle />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            {title}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {subtitle}
          </p>
        </div>
        <div className="rounded-2xl border border-black/[.08] bg-white p-8 shadow-sm dark:border-white/[.145] dark:bg-[#111111]">
          {children}
        </div>
      </div>
    </div>
  );
}
