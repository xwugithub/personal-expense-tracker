# Errors & Validation

This document defines how this app validates input and handles errors, end to end. It complements `docs/routing.md` (where `actions.ts`/`error.tsx` live), `docs/auth.md` (auth-specific error messaging), and `docs/ui.md` (the HeroUI components used to display everything here).

## 1. Principles

- **Users never see technical details.** No stack traces, no raw error messages from Mongoose/MongoDB/NextAuth, no `error.message` from an unexpected exception. Every user-facing string is either a Zod validation message we wrote, or a hand-written safe string.
- **Every technical error is logged server-side, not shown.** `console.error` (or a future structured logger) captures the real error, and only the real error — the client gets a generic message.
- **Zod is the single source of truth for shape and validation.** One schema per input shape is written once and reused by both the client (instant feedback) and the server (the actual enforcement point) — never two independently-maintained validation implementations for the same field.
- **Client-side validation is UX, not security.** The server always re-validates with the same Zod schema regardless of what the client already checked, because a Server Action is a public endpoint (`docs/best-practice.md` §3.1) and a client-side check can be bypassed entirely.
- **All visible error/success messaging uses HeroUI.** Field-level errors use `Input`'s (and other form control's) built-in `isInvalid`/`errorMessage` props; anything not tied to a single field — submit failures, domain errors, success confirmations, unexpected-error fallbacks — uses the HeroUI `Alert` component. No custom-styled error `div`s anywhere.

## 2. Zod Schema Organization

Following `docs/routing.md`'s one-`actions.ts`-per-resource convention:

```
lib/
└── validation/
    └── common.ts          # shared primitives: email, password, money amount, etc.
app/(protected)/expenses/
├── schemas.ts             # createExpenseSchema, updateExpenseSchema — imports from lib/validation/common
└── actions.ts             # imports schemas.ts, used by both the Server Actions and the client form
app/(protected)/categories/
├── schemas.ts
└── actions.ts
app/(public)/signup/
├── schemas.ts
└── actions.ts             # (or a Server Action file colocated with the signup page)
```

**`lib/validation/common.ts`** — primitives reused across multiple resources' schemas, so the same rule (e.g. "what makes a valid email") is written once:

```typescript
import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const moneyAmountSchema = z.coerce
  .number({ message: "Enter a valid amount" })
  .positive("Amount must be greater than 0")
  .finite();
```

**A resource's `schemas.ts`** composes those primitives into the shapes that resource's actions need:

```typescript
// app/(protected)/expenses/schemas.ts
import { z } from "zod";
import { moneyAmountSchema } from "@/lib/validation/common";

export const createExpenseSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  amount: moneyAmountSchema,
  description: z.string().trim().max(500).optional(),
  date: z.coerce.date(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
```

`z.infer` gives the TypeScript type for free — the form's state type and the Server Action's parameter type both derive from the schema, so a schema change (e.g. adding a required field) surfaces as a type error everywhere it's used, not a silent gap.

## 3. Validation Flow: Client and Server

**Client (optional, for instant feedback only):** on submit, parse the form state with the same schema the Server Action uses, and map any `ZodError` issues to the relevant `Input`'s `isInvalid`/`errorMessage`. This mirrors the existing pattern in `app/login/page.tsx` (which currently hand-rolls an `EMAIL_PATTERN` regex and manual checks) — that hand-rolled logic should be replaced by parsing against the shared schema instead of maintaining a second, drifting copy of the same rule.

```tsx
"use client";
import { createExpenseSchema } from "./schemas";

function ExpenseForm() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = createExpenseSchema.safeParse(raw);
    if (!parsed.success) {
      setFieldErrors(flattenZodIssues(parsed.error));
      return; // don't even call the Server Action
    }
    const result = await createExpense(parsed.data);
    // handle result — see §5
  }
  // ...
}
```

**Server (always, non-optional):** the Server Action re-parses the same raw input with `schema.safeParse(...)` as its first real step (immediately after `requireUser()` per `docs/auth.md` §4) and never trusts that the client already validated:

```typescript
// app/(protected)/expenses/actions.ts
"use server";
import { requireUser } from "@/lib/session";
import { createExpenseSchema } from "./schemas";
import type { ActionResult } from "@/lib/actions";

export async function createExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // ... proceed with parsed.data, scoped to user.id (docs/auth.md §7)
}
```

## 4. Error Taxonomy

Three distinct kinds of failure, each handled differently — conflating them (e.g. showing a raw exception message in an `Alert`) is exactly what this document exists to prevent.

| Kind | Example | Where it's shown | How it's produced |
|---|---|---|---|
| **Field validation** | "Amount must be greater than 0" | Inline, `Input errorMessage` | A Zod schema's own message, surfaced via `safeParse` |
| **Expected domain error** | "A category with that name already exists", "Invalid email or password" | HeroUI `Alert` (danger) at the top of the form/page | Business logic explicitly checks a condition and returns a hand-written safe message |
| **Unexpected error** | A Mongoose connection drop, a bug, an unhandled exception | HeroUI `Alert` (danger), generic text only | Caught in a `try/catch` or a segment's `error.tsx`; the real error is logged, never surfaced |

Expected domain errors are not exceptions — they're a normal, anticipated outcome (e.g. "yes, that category name is taken") and are returned as data, not thrown. Unexpected errors are genuinely exceptional and are caught, logged, and translated to a generic message.

## 5. Server Action Result Shape

All Server Actions that can fail return a shared discriminated union rather than throwing, so an expected failure is just a state update on the client, not an exception-handling path:

```typescript
// lib/actions.ts
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error?: string; fieldErrors?: Record<string, string[] | undefined> };
```

- `fieldErrors` is set for validation failures (§4, row 1) and rendered per-field.
- `error` is set for domain errors (§4, row 2) and unexpected-error fallbacks (§4, row 3) alike — always a safe, pre-written string, rendered in an `Alert`.
- **Exception:** Next.js's own `redirect()` and `notFound()` work by throwing a special internal value that Next.js's router catches — never wrap a Server Action's call to `redirect()`/`notFound()` in a `try/catch` that would swallow it. Only wrap the actual business logic:

```typescript
"use server";

export async function updateProfile(input: unknown): Promise<ActionResult<null>> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await updateUserProfile(user.id, parsed.data); // may throw on unexpected DB failure
  } catch (err) {
    console.error("updateProfile failed", err); // full detail, server-side only
    return { success: false, error: "Something went wrong. Please try again." };
  }

  return { success: true, data: null };
}
```

On the client, the caller renders based on the discriminant:

```tsx
const result = await updateProfile(parsed.data);
if (!result.success) {
  if (result.fieldErrors) setFieldErrors(result.fieldErrors);
  if (result.error) setAlert({ color: "danger", message: result.error });
  return;
}
setAlert({ color: "success", message: "Profile updated." });
```

## 6. Route Handler Errors

The only Route Handler in the app, `app/api/auth/[...nextauth]/route.ts`, delegates entirely to NextAuth's own request handling — it does not need custom error handling here. NextAuth's Credentials `authorize()` callback (`docs/auth.md` §2) already returns `null` on invalid credentials rather than throwing, which NextAuth surfaces as a generic "Invalid email or password" on the login page — consistent with §4's "expected domain error" row, not a leaked exception.

## 7. Segment Error Boundaries (`error.tsx`)

Per `docs/routing.md` §7, `dashboard/`, `expenses/`, and `categories/` each have an `error.tsx` — a Client Component Next.js automatically wraps around that segment. It catches anything an Server Component's data fetching throws (e.g. a Mongoose aggregation failure) that a Server Action's own `try/catch` wouldn't cover, since these are render-time errors, not action-invocation errors.

```tsx
"use client";
import { useEffect } from "react";
import { Alert, Button } from "@heroui/react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Segment error", error.digest, error);
  }, [error]);

  return (
    <Alert
      color="danger"
      title="Something went wrong"
      description="We couldn't load this page. Please try again."
      endContent={<Button size="sm" variant="flat" onPress={reset}>Retry</Button>}
    />
  );
}
```

- `error.message`/`error.stack` are logged (`console.error`), never rendered — the fallback text is always the same hand-written string, regardless of what actually failed.
- `error.digest` (a Next.js-generated correlation id for errors during server rendering) may be shown in small print if useful for support requests, since it's an opaque id, not technical detail.
- The `reset()` callback is HeroUI `Button`'s `onPress`, giving the user a way to retry without a full page reload.
- **`app/global-error.tsx`** (root-level, catches errors in the root layout itself) follows the same pattern but must render its own `<html>`/`<body>`, per Next.js's special-case convention for that one file — it replaces the entire root layout when active.

## 8. Alert Usage Conventions

- **Color mapping:** `color="danger"` for errors (validation summaries, domain errors, unexpected-error fallbacks), `color="success"` for confirmations (e.g. "Expense added"), `color="warning"` for non-blocking cautions (e.g. "You're approaching your monthly budget"). Never rely on color alone — each `Alert` also has a clear `title`/`description` text, per the accessibility checklist in `docs/ui.md` §9.
- **Placement:** at the top of the form or page section the message relates to — not a global toast stack, since this app doesn't have a cross-page notification system designed (per `docs/ui.md`, everything is scoped to the page/modal the action happened in).
- **Lifecycle:** validation and domain-error `Alert`s stay visible until the next successful submit attempt (they don't auto-dismiss, since the user needs time to read and correct); success `Alert`s may auto-clear after a few seconds or on next navigation.
- **Accessibility:** HeroUI's `Alert` renders with the appropriate ARIA role by default — don't override it. Focus is not force-moved to the `Alert` on appearance (per `docs/ui.md`'s no-surprise-focus-shifts principle), but it must be reachable via normal tab order if it contains an action (like the `error.tsx` retry `Button` above).

## 9. End-to-End Example: Creating an Expense

1. User submits the "Add expense" modal (`docs/ui.md` §5) with amount `-5`.
2. Client-side `safeParse` against `createExpenseSchema` fails on `moneyAmountSchema`'s `.positive()` check → `Input errorMessage` shows "Amount must be greater than 0" under the Amount field. The Server Action is never called.
3. User corrects the amount, but picks a `categoryId` that (unbeknownst to the client) was just deleted by another tab. `createExpense` re-parses successfully (the id is a valid string), but the business logic's ownership/existence check fails → returns `{ success: false, error: "That category no longer exists. Please choose another." }` → rendered as a danger `Alert` at the top of the modal. This is a domain error, not a validation error, because the input was syntactically valid — the failure is about current data state.
4. User picks a valid category and resubmits. A transient MongoDB connection error occurs inside `createExpense`'s `try/catch` → the real error is logged via `console.error`, and `{ success: false, error: "Something went wrong. Please try again." }` is returned → the same danger `Alert` shows the generic fallback text, with no indication of what actually failed.
5. User retries once more; it succeeds → `{ success: true, data: { id } }` → the modal closes and a success `Alert` ("Expense added.") shows briefly on the Expenses page.
