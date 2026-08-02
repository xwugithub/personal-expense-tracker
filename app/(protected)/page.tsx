import { requireUser } from "@/lib/session";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        You&apos;re logged in as {user.email}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Expense tracking features aren&apos;t built yet — this page confirms
        the auth flow works end to end.
      </p>
    </div>
  );
}
