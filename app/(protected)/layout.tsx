import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { signOutAction } from "./actions";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <span className="text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          Expense Tracker
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
