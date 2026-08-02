# Authentication & Authorization — NextAuth (Auth.js v5)

This document describes the target authentication architecture for the personal expense tracker. **NextAuth (Auth.js v5)** owns authentication, session issuance, and session security end-to-end. Application code never hand-rolls tokens, cookies, or password comparison — it only ever asks NextAuth "who is the current user?" and enforces per-user data access on top of that answer.

## 1. Library Choice & Why

- **Auth.js v5** (`next-auth@5`), not v4 — v5 is built for the App Router, exposing a single universal `auth()` function usable in Server Components, Server Actions, Route Handlers, and Proxy, rather than v4's split `getServerSession`/`getSession`/`withAuth` APIs.
- **No database adapter.** The existing `User` model (`models/User.ts`) already implements credentials auth directly (`passwordHash`, `comparePassword`). NextAuth's Credentials provider does not support Adapter-backed database sessions (this is an intentional NextAuth security restriction — Credentials bypasses the adapter's user-creation flow, so mixing it with adapter-managed sessions is disallowed). Sessions are therefore **JWT-based**, and the existing Mongoose `User` collection is queried directly inside the provider's `authorize()` callback — no parallel adapter-managed `users`/`sessions` collections are introduced.
- **Provider: Credentials only.** No OAuth providers are configured. This matches the current schema (no OAuth account-linking fields) and keeps the auth surface minimal.

## 2. Session Strategy

- `session.strategy: "jwt"`. The session is a signed, `httpOnly` cookie containing a JWT — no server-side session store.
- The JWT payload carries the minimum needed to identify the user and authorize requests: `sub` (the User's Mongo `_id`, as a string), and `sessionVersion` (see below). It never carries `email`/name in a way that's treated as authoritative for authorization — those are display-only; the `sub` id is the only value ever used to scope data queries.
- **Revocation via `sessionVersion`:** a `sessionVersion: number` field is added to the `User` schema (default `0`). It's incremented whenever a password changes (or an admin/user explicitly triggers "log out of all devices"). The `jwt` callback re-reads `sessionVersion` from the database and compares it against the value embedded in the token; on mismatch, the callback returns `null`, which invalidates the token and forces re-authentication. This gives password-change revocation without standing up a full session table. Because this check runs on every `auth()` call, `lib/session.ts` (see §5) caches the DB read for the lifetime of a single request (via React `cache()`) so it costs one lookup per request, not one per `auth()` call-site.
- `session.maxAge` is set to a short-to-moderate window (e.g. 12 hours) with `updateAge` rolling refresh (e.g. 1 hour), so idle sessions expire but active users aren't logged out mid-use.
- Cookies use NextAuth's secure defaults: `httpOnly`, `sameSite: "lax"`, and the `__Secure-` cookie name prefix (`secure: true`) in production, which NextAuth applies automatically when `NEXTAUTH_URL`/`AUTH_URL` is `https://`.

## 3. File Layout

| File | Responsibility |
|---|---|
| `auth.ts` (project root) | NextAuth config: `Credentials` provider, `session` config, `callbacks.jwt`/`callbacks.session`, `pages` (custom `/login`). Exports `{ handlers, auth, signIn, signOut }`. |
| `app/api/auth/[...nextauth]/route.ts` | Re-exports `GET`/`POST` from `auth.ts`'s `handlers` — the only route NextAuth itself serves. |
| `proxy.ts` (project root) | Optimistic route protection (§4). Exports `auth` from `auth.ts` as the `proxy` function, per the Next.js 16 Proxy convention (Middleware was renamed to Proxy; same capability, `export { auth as proxy }`). |
| `lib/session.ts` | `requireUser()` — the single authoritative helper every protected Server Component/Action/Route Handler calls. Wraps `auth()`, redirects to `/login` (or throws, in Route Handlers) if there's no valid session, and returns a typed `{ id, email, firstName, lastName }`. |
| `app/signup/actions.ts` (or a Route Handler) | Custom registration flow — NextAuth does not perform sign-up (§6). |

## 4. Route Protection — Defense in Depth

All routes are protected by default; `/login`, `/signup`, `/api/auth/*`, and static assets are the only explicit exceptions. Protection is layered, because the Next.js 16 Proxy docs are explicit that **Proxy is not a full authorization solution** and that Server Functions (Server Actions) can silently fall outside a Proxy `matcher` if a route is refactored — so nothing may rely on Proxy alone.

**Layer 1 — Proxy (`proxy.ts`), optimistic UX redirect only.**
```
export const config = {
  matcher: [
    "/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)",
  ],
};
```
`proxy` calls `auth()` and, if there's no session, redirects to `/login?callbackUrl=<original path>`. This exists purely so unauthenticated users get redirected before any page renders — it is a UX optimization, not the security boundary.

**Layer 2 — every protected Server Component and layout.**
A single `app/(protected)/layout.tsx` wraps every real feature route (dashboard, expenses, categories, settings) and calls `requireUser()` at the top. This is the authoritative check for page rendering: even if Proxy is ever misconfigured, bypassed, or skipped (e.g. a prefetch request), no protected page renders without a verified session.

**Layer 3 — every Server Action and Route Handler.**
Every Server Action (`"use server"` functions used for mutations — create/update/delete expense, rename category, change password, etc.) and every Route Handler under `app/api/**` (other than `app/api/auth/**` itself) calls `requireUser()` as its first line, independent of whichever page called it. This directly follows the Next.js Proxy docs' warning: Server Functions are invoked as POST requests to the page they're defined on, so a Proxy matcher change can silently stop covering them — only an in-function check is reliable.

**Login/signup pages** are the explicit exception: they're public, but load-bearing logic there (rate limiting, generic error messages) still applies (§7).

## 5. `requireUser()` Helper

```ts
// lib/session.ts
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user; // { id, email, firstName, lastName }
});
```
Route Handlers use a sibling variant that returns a `401 Response` instead of redirecting (redirects don't make sense for a JSON API). Both variants funnel through the same `auth()` call and the same `sessionVersion` check in the `jwt` callback, so there is exactly one code path that decides "is this request authenticated."

## 6. Signup Flow (Outside NextAuth)

NextAuth only authenticates existing credentials — it has no concept of registration. Signup is a plain Server Action:

1. Validate input (email format, password strength) server-side — never trust client-side validation alone.
2. Check for an existing `User` with that email; return a generic error ("unable to create account") rather than "email already exists" (§7 — avoid account enumeration).
3. Create the `User` document (the existing Mongoose pre-save hook hashes the password into `passwordHash`; `sessionVersion` defaults to `0`).
4. Seed the user's default categories (Food, Transport, Housing, etc.), per the existing schema design.
5. Call NextAuth's `signIn("credentials", { email, password, redirect: false })` to immediately establish a session, then redirect to the dashboard — the user never has to log in separately right after signing up.

## 7. Per-User Data Isolation — Server & Database Level

The core guarantee: **a user can only ever read or write their own `Category`/`Expense` documents**, enforced at two levels.

### Server level (the primary enforcement point)

- All data access goes through a small data-access layer (`lib/data/expenses.ts`, `lib/data/categories.ts`), not raw Mongoose model calls scattered across Server Actions/Route Handlers.
- Every function in that layer **requires a `userId` parameter as its first argument**, and every Mongoose query/aggregation it builds includes `{ user: userId, ... }` in the filter — there is no function in the data-access layer that queries `Expense`/`Category` without a user filter.
- The `userId` passed in always comes from `requireUser()` (i.e., from the verified session), **never** from a client-supplied value — not a body field, not a query param, not a hidden form input, not a route param like `/expenses/[id]`. A request for `/expenses/[id]` looks up that expense scoped by `{ _id: id, user: session.user.id }`; if the id belongs to another user, the query returns nothing and the route responds `404` (not `403`, to avoid confirming the id's existence to an attacker).
- Code review convention: any new query against `Expense`/`Category` outside the data-access layer, or any data-access function missing a `userId` parameter, is treated as a security bug, not a style nit.

### Database level

- MongoDB has no built-in row-level security equivalent to Postgres RLS, so the database's role is to make the server-level convention cheap and hard to get wrong, not to independently re-derive authorization:
  - The compound indexes already defined in the schema design (`Expense: { user: 1, date: -1 }`, `Category: { user: 1, name: 1 }` unique) make every correctly-scoped query efficient, and the unique index additionally prevents one user's duplicate category name from ever colliding with another user's data.
  - The existing cross-document validator on `Expense.category` (confirms the referenced `Category.user` matches the `Expense.user` before save) is schema-level defense-in-depth: even if a bug in the server layer let a request submit a `category` id belonging to a different user, Mongoose rejects the write.
- Net effect: the **data-access layer is the actual authorization boundary**; the schema-level constraints and indexes are a second, independent line of defense that catches the specific failure mode of a mismatched category/expense pairing, not a general substitute for per-query filtering.

## 8. Security Best Practices Checklist

- **Secrets:** `AUTH_SECRET` (32+ random bytes) generated via `npx auth secret`, stored only in environment variables (`.env.local`, deployment platform secrets), never committed. Rotating it invalidates all existing JWTs immediately — the blunt-force equivalent of the `sessionVersion` mechanism.
- **Password hashing:** bcrypt at cost factor 12 (already implemented in `models/User.ts`), server-side only.
- **Generic auth errors:** login failures return the same message ("Invalid email or password") regardless of whether the email exists or the password was wrong — prevents account enumeration.
- **Rate limiting:** login and signup Server Actions/Route Handlers are rate-limited per IP and per email (e.g. a sliding-window limiter) to blunt credential-stuffing and brute-force attempts. This sits in front of NextAuth's `authorize()` call, not inside it.
- **Cookies:** `httpOnly`, `sameSite: lax`, `secure` in production (NextAuth defaults) — the session token is never readable from client-side JavaScript.
- **CSRF:** Auth.js's built-in CSRF token protects its own sign-in/sign-out flow; Server Actions get Next.js's built-in Server Action CSRF protection (origin-checked automatically). No custom CSRF handling is needed.
- **Transport:** the app is served over HTTPS in every non-local environment; `AUTH_URL`/`NEXTAUTH_URL` is set to the `https://` origin so NextAuth applies the `__Secure-` cookie prefix.
- **Session lifetime:** short `maxAge` with rolling `updateAge` (§2) bounds the damage window of a leaked token.
- **Least privilege in the JWT:** the token carries only `sub` and `sessionVersion` — no roles/permissions are embedded that would need separate invalidation logic; anything else needed for a request is re-fetched from the database via `userId`.

## 9. Explicitly Out of Scope

- OAuth providers (Google/GitHub, etc.) — would require User schema changes for account linking; not designed here.
- Email verification and password-reset token flows — separate design, deferred per the existing schema design doc.
- Multi-factor authentication.
- A dedicated session-management UI (e.g. "log out of all devices" button) — the `sessionVersion` mechanism supports it, but the UI itself is not designed here.
