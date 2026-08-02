# Authentication Implementation — Scoping & Delta Design

This spec scopes the NextAuth credential-based login/signup implementation task. The full target architecture is already documented in `docs/auth.md` (session strategy, route protection, per-user data isolation, security checklist), `docs/routing.md` (route groups), `docs/errors-and-validation.md` (validation/error patterns), and `docs/security.md` (secrets handling). This doc does not restate that architecture — it records the scope decisions needed to implement it now, given the project's current state (no dashboard/expenses/categories pages exist yet, HeroUI/Zod aren't adopted app-wide).

## Scope Decisions

1. **UI library: keep the existing Tailwind components.** `AuthLayout`/`FormField`/`ThemeToggle` stay as-is. `docs/ui.md`'s HeroUI migration is a separate, later task covering the whole app — not bundled into auth.
2. **Route groups: restructure now.** Move `app/login` → `app/(public)/login`, `app/signup` → `app/(public)/signup`, and add `app/(protected)/layout.tsx` per `docs/routing.md` §3, even though no protected feature pages exist yet.
3. **Rate limiting: simple in-memory limiter now.** A module-scoped sliding-window limiter in `lib/rate-limit.ts`. Known limitation (documented inline, not a blocker): resets on cold start and isn't shared across serverless instances. Upstash Redis (or similar) is the noted upgrade path, not built now.
4. **Protected placeholder page.** `app/(protected)/page.tsx` is a minimal "You're logged in as {email}" page with a sign-out button — it exists to prove the route-protection boundary works, not as a real feature. It gets replaced once `dashboard` (or similar) is built.

## File Layout

```
app/
├── layout.tsx                        # unchanged
├── (public)/
│   ├── login/page.tsx                # moved from app/login/
│   └── signup/page.tsx               # moved from app/signup/
└── (protected)/
    ├── layout.tsx                    # requireUser() + sign-out button
    └── page.tsx                      # placeholder home

app/components/                       # AuthLayout, FormField, ThemeToggle — unchanged, unmoved
app/api/auth/[...nextauth]/route.ts   # export { GET, POST } from "@/auth"
auth.ts                               # NextAuth config (Credentials provider, jwt/session callbacks)
proxy.ts                              # optimistic redirect (Next.js 16 Proxy convention)
lib/session.ts                        # requireUser() (redirect variant) + requireUserOrResponse() (401 variant)
lib/rate-limit.ts                     # in-memory sliding-window limiter
lib/validation/auth.ts                # Zod: loginSchema, signupSchema
app/(public)/signup/actions.ts        # signup Server Action
app/(public)/login/actions.ts         # login Server Action
lib/actions.ts                        # shared ActionResult<T> type
```

`middleware.ts` does not apply — this Next.js version (16) uses `proxy.ts` per `AGENTS.md`.

## Data Model

- `models/User.ts` gains `sessionVersion: { type: Number, default: 0 }` per `docs/auth.md` §2 (session revocation on password change).

## Flows

**Login:** client submits → `login` Server Action rate-limits (per-IP, per-email) → `loginSchema.safeParse` → `signIn("credentials", { email, password, redirect: false })` → on failure, generic `{ success: false, error: "Invalid email or password" }` regardless of which check failed; on success, client redirects to `callbackUrl` or `/`.

**Signup:** `signup` Server Action rate-limits → `signupSchema.safeParse` → check existing email (generic "unable to create account" error, no enumeration) → create `User` (existing pre-save hook hashes password) → seed default categories from `DEFAULT_CATEGORY_NAMES` (`models/Category.ts`) → `signIn("credentials", ..., { redirect: false })` to establish a session immediately → client redirects to `/`.

**JWT payload:** `sub` (user id) + `sessionVersion` only. The `jwt` callback re-reads `sessionVersion` from the DB (via a `React.cache`-wrapped lookup, one read per request) and returns `null` on mismatch, invalidating the token.

## Errors & Validation

- `lib/validation/auth.ts` is the single source of truth for login/signup input shape, per `docs/errors-and-validation.md` §2. The existing hand-rolled `EMAIL_PATTERN`/manual checks in the login/signup pages are replaced with client-side `safeParse` against these schemas; results render through the existing `FormField` `error` prop. Form-level (non-field) errors render via a plain styled paragraph (no HeroUI `Alert` — out of scope per the UI decision above).
- Server Actions return `ActionResult<T>` (`docs/errors-and-validation.md` §5). Unexpected errors are `console.error`-logged server-side and translated to a generic client-facing message — never a raw exception message.

## Security

- `lib/rate-limit.ts`: in-memory `Map<key, {count, resetAt}>`, e.g. 5 attempts/60s per email, 20/min per IP. Applied in front of both Server Actions, not inside NextAuth's `authorize()`.
- No secrets or plaintext passwords are ever logged (`docs/security.md` §6) — Server Actions log only outcome/metadata on failure, never the parsed input.
- No new environment variables — `.env.example` already documents `AUTH_SECRET`/`AUTH_URL`.

## Explicitly Out of Scope (unchanged from `docs/auth.md` §9)

OAuth providers, email verification, password reset, MFA, a session-management ("log out of all devices") UI, and the app-wide HeroUI migration.

## Dependencies to Add

- `next-auth@5.0.0-beta.32` (or latest `5.0.0-beta.x` at implementation time)
- `zod` as an explicit `package.json` dependency (currently only present transitively in `node_modules`, not declared)
