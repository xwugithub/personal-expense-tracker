# Security Practices

This document defines how secrets, environment variables, and sensitive data are handled in this project. It complements `docs/auth.md` (auth-specific security) and `docs/errors-and-validation.md` (what's safe to show/log for errors). The rules here are absolute, not situational — "just this once" is how secrets end up in git history.

## 1. Core Rules

1. **Never hardcode a secret, API token, or credential in source code.** Not in a `.ts`/`.tsx` file, not in a comment, not in a config file, not "temporarily for testing." Every secret is read from `process.env` at runtime, with no literal fallback value.
2. **Never commit an environment file containing real values.** `.env.local`, `.env`, `.env.production`, etc. are git-ignored (already configured — see §2). Only `.env.example`, containing placeholder values, is committed.
3. **Never expose sensitive data in client-side code.** If it would end up in a `"use client"` component's bundle, a server-to-client prop, or a JWT payload, it must not be a secret or raw sensitive data — see §5.
4. **Never log sensitive data.** Passwords, password hashes, full session tokens, and full request bodies for auth-related actions must never reach `console.log`/`console.error`/any logging service — see §6.

## 2. Environment Variable Management

### This app's environment variables

| Variable | Sensitivity | Purpose |
|---|---|---|
| `MONGODB_URI` | Secret | Database connection string (may embed DB credentials) |
| `AUTH_SECRET` | Secret | Signs/encrypts NextAuth JWTs (`docs/auth.md` §8) — rotating it invalidates every session |
| `AUTH_URL` | Not secret | The app's canonical origin; still environment-specific, kept in `.env` for consistency |

### `.env.local` vs. `.env.example`

- **`.env.local`** (and `.env`, `.env.production`, etc.) hold real values for a given environment. These are **never committed** — `.gitignore` already excludes `.env*` except `.env.example`. Verify this stays true any time `.gitignore` is touched.
- **`.env.example`** is committed and contains only placeholder values and comments explaining each variable's purpose (see the repo's `.env.example`) — never a real connection string, never a real generated secret. Anyone cloning the repo copies it to `.env.local` and fills in their own values.
- If a new environment variable is added for any feature, `.env.example` is updated in the same change — an undocumented required variable is a deployment landmine for the next person (or the next environment).

### The `NEXT_PUBLIC_` prefix is a one-way door

Next.js inlines any environment variable prefixed `NEXT_PUBLIC_` directly into the client-side JavaScript bundle at build time — it becomes fully public, readable by anyone who opens dev tools, regardless of how it's used. This project currently has **no `NEXT_PUBLIC_` variables**, and secrets (`MONGODB_URI`, `AUTH_SECRET`) must never be given that prefix. Before adding any `NEXT_PUBLIC_*` variable, confirm the value is genuinely meant to be public (e.g. a public analytics id) — if there's any doubt, it isn't public, and it belongs in a server-only variable instead.

### Where secrets may be read

Only server-side code may read secret environment variables: Server Components, Server Actions, Route Handlers, and modules under `lib/`/`models/` that only those contexts import (e.g. `lib/mongoose.ts` reading `MONGODB_URI`, `auth.ts` reading `AUTH_SECRET`). A module that reads `process.env.MONGODB_URI` or similar must never be imported, directly or transitively, from a file marked `"use client"` — if a bundler analyzer or code review ever flags a secret-reading module in the client bundle, that's a security bug, not a style nit.

## 3. No Hardcoded Secrets — Enforcement

- **Code review convention:** any literal-looking credential, key, or token in a diff (a long random-looking string, a `mongodb://` or `mongodb+srv://` URI with embedded credentials, anything matching common key formats) is treated as a blocking issue, not a nit — the same bar as `docs/ai-workflow.md`'s security-relevant changes.
- **Automated scanning:** run a secret-scanning tool (e.g. `gitleaks`, or GitHub's own secret scanning on the remote) periodically and before any release, to catch what review misses.
- **No secrets in scripts either.** One-off scripts (e.g. the throwaway verification script mentioned in the schema design doc) must also read from `process.env`, never embed a real connection string or credential inline, even temporarily.

## 4. If a Secret Is Ever Committed

Deleting the file in a new commit does **not** remove the secret — it's still in git history and, if the repo has ever been pushed, potentially already indexed/cached externally. If this happens:

1. **Rotate the leaked secret immediately** (generate a new `AUTH_SECRET`, rotate the database user's password/connection string, etc.) — treat the old value as permanently compromised the moment it was committed, regardless of whether the repo is public or private.
2. Only after rotation, clean the git history if needed (`git filter-repo` or equivalent) — this is cleanup, not the fix. Rotation is the fix.
3. Update `.env.local` in every environment (local machines, Vercel project settings) with the new value.

## 5. Avoiding Client-Side Exposure

- **RSC boundary discipline** (per `docs/best-practice.md` §3.6): when a Server Component passes data to a Client Component, pass only the fields the client actually needs. A `User` document's `passwordHash` must never be passed as a prop, even accidentally via `{...user}` spreading — the Mongoose schema already sets `passwordHash: { select: false }` so it isn't returned by default queries, but code that explicitly `.select("+passwordHash")` for a comparison must still strip it before the value goes anywhere near a Client Component or a response payload.
- **Minimal JWT payload** (per `docs/auth.md` §2): the session JWT carries only `sub` (user id) and `sessionVersion` — no email, no role flags, no anything that isn't strictly needed for identifying the session, since JWT payloads are base64-encoded, not encrypted, and readable by anyone with the cookie (though not forgeable without `AUTH_SECRET`).
- **No secrets in the DOM.** Never render a secret value into a data attribute, hidden input, or inline script for "convenience" — if a Client Component needs a value derived from a secret (e.g. a signed upload URL), generate that derived value server-side and pass only the derived, time-limited artifact, never the secret itself.
- **Source maps in production:** avoid shipping source maps that reveal server-side file structure or logic to the public unless explicitly needed for error-tracking tooling, and if they are enabled, ensure the tooling's access is authenticated, not publicly served.

## 6. Avoiding Exposure in Logs

- **Never log request bodies for auth actions.** Login/signup Server Actions must never log the parsed input verbatim (it contains the plaintext password) — log only non-sensitive metadata (e.g. "login attempt for redacted email domain," a timestamp, an outcome).
- **Never log full error objects that might embed sensitive context.** Per `docs/errors-and-validation.md` §7, `console.error` logs the error for debugging, but any logging wrapper added later (e.g. a structured logger sending to an external service) must redact known-sensitive fields (`password`, `passwordHash`, `token`, `secret`, `authorization` headers, cookies) before shipping a log line off-box.
- **Never log the session token or cookie value.** Logging "user X made request Y" is fine; logging the raw `Cookie` header or JWT string is not — a leaked log line would be as good as a stolen session.
- **Database query logs:** if Mongoose debug logging (`mongoose.set('debug', true)`) is ever enabled for troubleshooting, it must be off in production — it logs full query documents, which for this app's data includes expense amounts/descriptions per user, not itself a "secret" but still unnecessary exposure of user data in logs.

## 7. Secret Storage & Deployment (Vercel)

- **Environment variables live in Vercel's Environment Variables UI (or `vercel env` CLI), not in the repo.** Vercel encrypts them at rest and injects them into the build/runtime environment; they are never visible in the deployed bundle unless explicitly prefixed `NEXT_PUBLIC_` (§2).
- **Scope variables per environment.** Vercel separates **Production**, **Preview**, and **Development** environment variable values. Production secrets (the real `MONGODB_URI`, the real `AUTH_SECRET`) are scoped to Production only — Preview deployments (which run on every PR, potentially visible to more people, including external contributors on a public repo) get their own separate values (e.g. a staging database, a distinct `AUTH_SECRET`), never a copy of production credentials.
- **`AUTH_URL` per environment:** Production uses the real `https://` domain; Preview deployments typically rely on Vercel's automatic `VERCEL_URL`-based handling or a Preview-specific value — never hardcode the production URL into a Preview environment's config.
- **Least-privilege database credentials:** the `MONGODB_URI` used in production should point to a database user scoped to only this app's database, not an administrator account — so that if the connection string ever leaks, the blast radius is one database, not the whole cluster.
- **HTTPS is non-negotiable in every deployed environment** — Vercel provides this by default; never disable it or accept plain HTTP for a deployed environment, since NextAuth's secure cookie behavior (`docs/auth.md` §2) depends on the origin being `https://`.
- **Rotate on team changes.** When someone with deployment/environment-variable access leaves the project, rotate `AUTH_SECRET` and any database credentials they could have viewed — access to the Vercel project is access to the secrets.

## 8. Dependency & Supply Chain Hygiene

- Keep dependencies (`next`, `next-auth`, `mongoose`, `bcryptjs`, `zod`, etc.) reasonably current — security fixes in a dependency don't help if the app is pinned to an old, vulnerable version.
- Run `npm audit` periodically and treat high/critical findings as action items, not noise to ignore.
- Be deliberate about adding new dependencies, especially ones with install/postinstall scripts — a compromised or malicious package is a direct path to secret exfiltration (it runs with the same filesystem/environment access as the app itself during install or build).

## 9. Checklist

- [ ] No literal secret values anywhere in tracked source, scripts, or comments.
- [ ] `.env.local`/`.env` are git-ignored; only `.env.example` (placeholders only) is committed.
- [ ] Every new environment variable is added to `.env.example` with a comment explaining its purpose.
- [ ] No secret-reading module is imported into a `"use client"` file.
- [ ] No `NEXT_PUBLIC_`-prefixed variable holds a secret.
- [ ] No Server Action/Route Handler logs a password, token, session cookie, or full auth-related request body.
- [ ] Production and Preview environments have distinct secrets in Vercel, not shared values.
- [ ] Any secret that is ever accidentally committed is rotated immediately, not just removed from the latest commit.
