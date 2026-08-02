# Routing — Next.js App Router

This document defines how routing works in this app: file conventions, folder/route naming, and how route protection is enforced. It complements `docs/auth.md` (security architecture — read that for *why* the enforcement layers exist) and `docs/ui.md` (which screens exist). This doc is the *routing structure* those two designs sit on top of.

## 1. Principles

- **App Router only** (`app/` directory) — no `pages/` directory, ever. This is already the case in this repo.
- **Resource-based naming.** Route segments are named after the resource they represent, as plural nouns matching the domain model (`User`/`Category`/`Expense` from the schema design): `/expenses`, `/categories`, not `/expense-list` or `/manage-expenses`.
- **File-based, not config-based.** Routes and their behavior (layout, loading, error, metadata) are expressed through Next.js's special files, not a centralized route config object.
- **No parallel REST API layer.** Per `docs/auth.md`, all expense/category/profile mutations are Server Actions colocated with the page that uses them. The only Route Handler in the app is `app/api/auth/[...nextauth]/route.ts`, because that's NextAuth's own required convention — it is not a precedent for adding more REST endpoints. If a future need (public API, mobile client) requires HTTP endpoints, that's a separate design decision, not a default.
- **No URL-based modals.** Per `docs/ui.md`, add/edit expense and category dialogs are plain client-state `Modal`s opened from `/expenses` and `/categories` — they do not get their own route or use intercepting routes (`(.)folder`). This keeps the route tree flat and matches the app's actual need (no deep-linking requirement for a personal expense tracker's edit form).

## 2. File Conventions Used in This App

| File | Purpose | Used here for |
|---|---|---|
| `page.tsx` | The UI for a route segment, makes it publicly reachable | Every route in the table below |
| `layout.tsx` | Shared UI that wraps a segment and its children, preserves state across navigation | Root layout (fonts, theme provider); `(protected)/layout.tsx` (Navbar + auth check) |
| `loading.tsx` | Instant loading UI via an automatic Suspense boundary around the segment | Dashboard, Expenses, Categories — anywhere a Server Component awaits a Mongoose query |
| `error.tsx` | Client Component error boundary for a segment | Dashboard, Expenses, Categories — catches thrown errors from data fetching without crashing the whole app |
| `not-found.tsx` | Rendered when `notFound()` is called or a segment doesn't match | Root-level, for unknown paths |
| `route.ts` | Route Handler (HTTP methods as named exports) | Only `app/api/auth/[...nextauth]/route.ts` |
| `actions.ts` (convention, not a special file) | Colocated `"use server"` functions for a route's mutations | One per protected resource folder — see §6 |

## 3. Route Groups: Public vs. Protected

Two top-level route groups separate unauthenticated pages from the authenticated app shell. Route groups (`(name)`) don't affect the URL — they only affect layout nesting.

```
app/
├── layout.tsx                 # Root layout: <html>, fonts, ThemeProvider — no Navbar here
├── globals.css
├── (public)/
│   ├── login/
│   │   └── page.tsx            # /login
│   └── signup/
│       └── page.tsx            # /signup
└── (protected)/
    ├── layout.tsx               # Calls requireUser(), renders <Navbar>, wraps all children
    ├── page.tsx                 # / — redirects to /dashboard (or is the dashboard itself, see §4)
    ├── dashboard/
    │   ├── page.tsx             # /dashboard
    │   ├── loading.tsx
    │   └── error.tsx
    ├── expenses/
    │   ├── page.tsx             # /expenses
    │   ├── actions.ts           # createExpense, updateExpense, deleteExpense
    │   ├── loading.tsx
    │   └── error.tsx
    ├── categories/
    │   ├── page.tsx             # /categories
    │   ├── actions.ts           # createCategory, renameCategory, deleteCategory
    │   └── loading.tsx
    └── settings/
        ├── page.tsx             # /settings
        └── actions.ts           # updateProfile, updatePassword
```

Why a route group instead of putting `(protected)`'s content directly in `app/`: it lets the root layout stay auth-agnostic (just HTML shell/fonts/theme) while a single `(protected)/layout.tsx` is the one place that renders the `Navbar` and performs the authoritative `requireUser()` check for every resource page, without repeating that call in every `page.tsx`. `(public)/login` and `(public)/signup` sit outside that group entirely, so they never run the auth check or render the authenticated nav.

## 4. Route Map

| Route | Group | Auth | Purpose |
|---|---|---|---|
| `/login` | `(public)` | Public | Sign in — redirects to `/dashboard` if already authenticated |
| `/signup` | `(public)` | Public | Registration (§6 of `docs/auth.md`) |
| `/` | `(protected)` | Required | Redirects to `/dashboard` |
| `/dashboard` | `(protected)` | Required | Spending summary (`docs/ui.md` §4) |
| `/expenses` | `(protected)` | Required | List/search/filter + add/edit/delete via modal (`docs/ui.md` §5) |
| `/categories` | `(protected)` | Required | List + add/rename/delete via modal (`docs/ui.md` §6) |
| `/settings` | `(protected)` | Required | Profile + security tabs (`docs/ui.md` §7) |
| `/api/auth/*` | — | N/A (auth infrastructure) | NextAuth's own Route Handler |

No `[id]` dynamic segments exist yet: every resource page is a list-plus-modal view, not a per-item detail page, per `docs/ui.md`. If a future feature needs a per-expense detail view (e.g. an audit trail), it would be added as `expenses/[expenseId]/page.tsx` — camelCase, descriptive param name (`expenseId`, not the generic `id`), matching the resource it identifies.

## 5. Naming Conventions

- **Folder segments:** lowercase, plural nouns for resources (`expenses`, `categories`), matching the Mongoose model names in lowercase-plural form.
- **Multi-word segments:** kebab-case (e.g. a hypothetical `expenses/recurring-rules` — not `recurringRules` or `recurring_rules`).
- **Dynamic segment params:** descriptive, not generic — `[expenseId]`, not `[id]`, so that when multiple dynamic segments nest (e.g. a hypothetical `categories/[categoryId]/expenses/[expenseId]`) they're unambiguous.
- **Route groups:** lowercase, purpose-named (`(public)`, `(protected)`), not resource-named — they describe a cross-cutting layout concern, not a resource.
- **Private folders** (`_components`, `_lib` prefix) for colocated, non-route folders inside a route segment if a resource folder grows helper components/utilities that shouldn't be reachable as routes themselves (the underscore prefix opts a folder out of routing).

## 6. Route Protection

Protection is layered — this section summarizes the routing-relevant pieces; full rationale is in `docs/auth.md` §4.

1. **Proxy (`proxy.ts`), optimistic only.** Matches everything except `(public)` routes, `/api/auth/*`, and static assets; redirects to `/login` if there's no session. This is a UX nicety — it makes unauthenticated users bounce before a protected page even starts rendering — but it is explicitly **not** the security boundary (Next.js 16's own Proxy docs warn against relying on it for authorization, and Server Actions in particular can be invoked directly, bypassing any route-level check).
2. **`(protected)/layout.tsx`, authoritative for pages.** Calls `requireUser()` (see `docs/auth.md` §5) before rendering `children`. Every `page.tsx` under `(protected)` is therefore guaranteed a verified session by the time it runs — no individual page needs to repeat the check for rendering purposes.
3. **Each `actions.ts`, authoritative for mutations.** Every exported Server Action calls `requireUser()` as its first line, independent of whichever page invoked it — this is what actually stops an unauthenticated or cross-user request, since Server Actions don't go through `proxy.ts`'s page-render path the same way.

Net effect for routing specifically: adding a new resource route means (a) put it under `(protected)/`, (b) put its mutations in a colocated `actions.ts` that starts with `requireUser()` — the layout handles the render-time check automatically, but nothing exempts a new Server Action from checking itself.

## 7. Loading, Error, and Not-Found UI

- Every data-fetching route segment under `(protected)` (`dashboard`, `expenses`, `categories`) has a `loading.tsx` — a HeroUI `Skeleton`-based fallback per `docs/ui.md`, automatically wrapped around the segment's `page.tsx` by Next.js via Suspense. No manual `<Suspense>` needed at this level; reserve manual `<Suspense>` boundaries for splitting a single page into independently-loading sections (see `docs/best-practice.md` §1.6).
- Every such segment also has an `error.tsx` (a Client Component) so a failed Mongoose query or aggregation shows a scoped error state instead of crashing the whole app.
- A root-level `not-found.tsx` handles unmatched paths; resource pages that look up a specific document by id (once any exist) call `notFound()` when the document isn't found *or* doesn't belong to the current user (`docs/auth.md` §7 — a mismatched owner returns 404, not 403, to avoid confirming the id's existence).

## 8. Metadata

Each `page.tsx` exports a static `metadata` object (or `generateMetadata()` if the title needs to be dynamic, e.g. showing a category name) with at least a `title`, following the pattern `"<Page> · Expense Tracker"` (e.g. `"Dashboard · Expense Tracker"`). The root layout sets the default/fallback title and description via Next.js's title template support (`title: { template: "%s · Expense Tracker", default: "Expense Tracker" }`), so individual pages only need to supply their own segment.
