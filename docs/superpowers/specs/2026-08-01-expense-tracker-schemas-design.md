# Expense Tracker MongoDB Schemas — Design

## Purpose

Define the Mongoose schemas backing authentication, expenses, and expense categories, with strict per-user data isolation. Builds on the connection scaffold in `lib/mongoose.ts` (see `2026-08-01-mongodb-connection-design.md`).

## Scope

- In scope: `User`, `Category`, `Expense` schemas/models, with typed Mongoose model exports.
- Out of scope: any dedicated schema for dashboard data or monthly summaries (see below), API routes/server actions that use these models, session/JWT storage, email verification or password-reset token schemas, multi-currency support, recurring expenses, payment method tracking.

## Dashboard data & monthly summaries

No dedicated schema. Both are computed on-the-fly via MongoDB aggregation pipelines over `Expense` (grouped/filtered by `user` and `date`, joined to `Category` as needed) at query time in a later API-layer task. This avoids cache-invalidation complexity and keeps summaries always consistent with the underlying expense data. The `Expense` schema's `{ user: 1, date: -1 }` index is chosen specifically to make these aggregations efficient.

## Per-user data isolation

- `Category` and `Expense` each require a `user: ObjectId` field (`ref: "User"`), indexed.
- Compound indexes:
  - `Category`: `{ user: 1, name: 1 }`, unique, case-insensitive via collation — prevents a user from creating a duplicate category name, while different users can each have their own "Food" category.
  - `Expense`: `{ user: 1, date: -1 }` — supports efficient per-user, date-ordered queries and range filters (dashboard/monthly-summary aggregations).
- Schema-level foreign keys alone cannot guarantee isolation at query time. Every query and aggregation built on top of these models in future work **must** explicitly filter by the authenticated user's id — this is a hard rule for the API layer, not something the schema can enforce by itself.

## `User` schema

Custom credentials auth (no third-party auth library).

Fields:
- `firstName: string` — required, trimmed
- `lastName: string` — required, trimmed
- `email: string` — required, unique index, lowercased, trimmed, format-validated
- `passwordHash: string` — required, `select: false` (excluded from query results by default)
- `timestamps: true` (`createdAt`, `updatedAt`)

Behavior:
- A pre-save hook hashes a plaintext `password` virtual field into `passwordHash` whenever it's set/modified (via bcrypt). Plaintext is never persisted or returned from any query.
- Instance method `comparePassword(candidate: string): Promise<boolean>` for login checks against `passwordHash`.

## `Category` schema

Fields:
- `user: ObjectId` — required, `ref: "User"`, indexed
- `name: string` — required, trimmed
- `timestamps: true`

Constraints:
- Unique compound index on `(user, name)` with a case-insensitive collation.

Default categories (Food, Transport, Housing, Utilities, Entertainment, Health, Shopping, Other) are seeded per-user at signup time. This is an application/service-layer concern (a seed list invoked after user creation), not part of the schema itself.

## `Expense` schema

Fields:
- `user: ObjectId` — required, `ref: "User"`, indexed
- `category: ObjectId` — required, `ref: "Category"`, indexed
- `amount: number` — required, must be `> 0`
- `description: string` — optional, trimmed
- `date: Date` — required, defaults to current time
- `timestamps: true`

Constraints:
- Compound index `{ user: 1, date: -1 }`.
- Cross-document ownership check: a custom async validator on the `category` path looks up the referenced `Category` document and confirms its `user` matches the expense's `user`. Mongoose cannot express "this ref must belong to the same user" as a declarative schema constraint, so this validator is the schema-level defense-in-depth measure, in addition to whatever the service/API layer checks before insert.

## TypeScript conventions

Each model file (`models/User.ts`, `models/Category.ts`, `models/Expense.ts`) exports:
- A lean TS interface describing the document shape (e.g. `IUser`).
- The `Schema<IUser, ...>` typed against that interface (and an interface for instance methods, e.g. `IUserMethods`, where applicable).
- A hot-reload-safe model export following the same pattern as `lib/mongoose.ts`: reuse `mongoose.models.<Name>` if already compiled, otherwise call `mongoose.model<...>(...)`.

## Verification

No test framework exists in this repo yet. Verification is:
- `npm run build` and `npm run lint` pass cleanly.
- A throwaway script creates a user, a category, and an expense against the local MongoDB instance to confirm indexes, uniqueness constraints, and the cross-reference validator behave as designed, then deletes the test data (not committed).

## Explicitly deferred

- Dashboard/MonthlySummary schemas (computed via aggregation instead).
- Email verification / password-reset token schemas.
- Session/JWT storage schema.
- Multi-currency, recurring expenses, payment method fields.
- API routes/server actions and any UI wiring that use these models.
