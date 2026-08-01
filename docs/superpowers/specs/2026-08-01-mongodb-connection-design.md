# MongoDB/Mongoose Connection Scaffold — Design

## Purpose

Set up the database connection and integration structure for MongoDB via Mongoose, so future work (models, API routes) has a single, typed, reusable way to connect. This pass is connection infrastructure only — no schemas or models are created here.

## Scope

- In scope: Mongoose dependency, a cached connection helper, env var configuration, typing for the connection cache.
- Out of scope: any Mongoose schema/model (e.g. User, Expense), API routes or server actions that use the connection, tests (no test framework exists in this repo yet).

## MongoDB target

Local MongoDB instance, connected via a `MONGODB_URI` env var (e.g. `mongodb://localhost:27017/expense-tracker`). The user manages starting/running MongoDB itself; this scaffold only consumes the URI.

## File structure

- `lib/mongoose.ts` — the connection module, exporting `connectToDatabase(): Promise<Mongoose>`.
- `.env.local` — created locally by the user (already covered by `.env*` in `.gitignore`), holding the real `MONGODB_URI`.
- `.env.example` — committed, documents the required `MONGODB_URI` var with a local-Mongo example value.

## Connection pattern & typing

Next.js recompiles modules on every request in dev, which would otherwise spawn a new Mongoose connection per file save/hot-reload. The standard fix: cache the connection (and any in-flight connect promise) on `globalThis`, keyed under a project-specific property, so it survives module reloads.

Typing: a module-scoped interface describes the cache shape, e.g.

```ts
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}
```

This is attached to `globalThis` via a narrow augmentation (not `any`), so `connectToDatabase()` and any future caller get full type information on the returned `Mongoose` instance.

`connectToDatabase()` behavior:
1. If `global` cache already has a resolved `conn`, return it immediately.
2. If a connection attempt is already in flight (`promise` set but not yet resolved), await and return that same promise (prevents duplicate concurrent connection attempts).
3. Otherwise, read `process.env.MONGODB_URI`. If unset, throw a descriptive error immediately (at call time, not at module import time, so builds/lint that never call this function aren't affected).
4. Call `mongoose.connect(uri)`, cache the resulting promise, await it, cache the resolved connection, and return it.

## Dependencies

- Add `mongoose` to `package.json` dependencies. No separate `@types/mongoose` package is needed — Mongoose ships its own TypeScript types.

## Error handling

- Missing `MONGODB_URI`: throw a clear, actionable error message at call time.
- Connection failures during `mongoose.connect()`: propagate to the caller unmodified (no retry/backoff logic, since nothing calls this yet and premature retry logic would be speculative).

## Verification

There is no test framework configured in this repo, and no model exists yet to round-trip data against. Verification for this pass is:
- `npm run build` and `npm run lint` pass cleanly.
- If the user has a local MongoDB instance running, a throwaway script can confirm `connectToDatabase()` actually connects, then be deleted (not committed).

## Explicitly deferred

- Any Mongoose schema or model definition.
- Any API route, server action, or UI code that calls `connectToDatabase()`.
- Connection pooling/timeout tuning beyond Mongoose's defaults.
