# React & Next.js Best Practices

Adapted from Vercel's [React Best Practices guide](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md) (v1.0.0) for this project specifically: a Next.js 16.2 App Router app using React 19, Mongoose/MongoDB (no Prisma/Drizzle), NextAuth-based auth (see `docs/auth.md`), and Tailwind CSS v4 — no separate UI/data-fetching libraries installed yet (no SWR, no React Compiler configured in `next.config.ts`). Every rule below is renumbered to match the source so it can be cross-referenced.

This is a code-level companion to `docs/ai-workflow.md` (process) and `docs/auth.md` (security architecture) — §3.1 below is the same requirement `docs/auth.md` §4 already mandates; it's repeated here because it's also a *performance/correctness* rule, not just a security one.

## Project-Specific Notes Before the Rules

- **"Middleware" is "Proxy" here.** Next.js 16 renamed Middleware to Proxy (`proxy.ts`, not `middleware.ts`). Anywhere the source says "middleware," read "Proxy" and see `docs/auth.md` §4 for how this project uses it (optimistic redirect only, never the authorization boundary).
- **No React Compiler yet.** `next.config.ts` doesn't enable it, so manual `memo()`/`useMemo()`/`useCallback()` guidance in §5–§6 applies as written. If the compiler is adopted later, re-audit those call sites — many become redundant.
- **Data layer is Mongoose, not an ORM with a query builder.** Wherever the source shows Prisma/Drizzle-style calls, this project's equivalent is a Mongoose model (`models/User.ts`, `models/Category.ts`, `models/Expense.ts`) accessed through `lib/mongoose.ts`'s cached `connectToDatabase()`.
- **No client data-fetching library installed.** §4 (SWR) is aspirational: if/when the dashboard needs client-side polling or optimistic UI (e.g. live balance updates without a full page reload), add SWR then and follow §4.3 — don't hand-roll `useEffect` + `fetch` polling in the meantime.

---

## 1. Eliminating Waterfalls — CRITICAL

Sequential `await`s each cost a full round trip. This matters most in this app's Server Actions and Route Handlers (expense CRUD, dashboard aggregation, auth).

- **1.1 Check cheap conditions before async flags.** If a branch needs both a synchronous check and an `await`ed flag, test the synchronous one first. E.g. in an expense-delete action, check `if (!expenseId) return` before awaiting `requireUser()`.
- **1.2 Defer `await` until needed.** Don't fetch the current user's categories in a Server Action before checking whether the request even needs them (e.g. a "skip" or early-validation path).
- **1.3 Dependency-based parallelization.** For requests with partial dependencies (e.g. dashboard needs the user, then both their categories and their expenses), start independent work immediately and only chain what truly depends on a prior result.
- **1.4 Prevent waterfall chains in Route Handlers.** In `app/api/**/route.ts`, start `requireUser()` and any independent config/lookup concurrently rather than sequentially:
  ```typescript
  export async function GET(request: Request) {
    const userPromise = requireUser();
    const categoriesPromise = getDefaultCategories(); // independent of auth
    const user = await userPromise;
    const [categories, expenses] = await Promise.all([
      categoriesPromise,
      getExpensesForUser(user.id),
    ]);
    return Response.json({ categories, expenses });
  }
  ```
- **1.5 `Promise.all()` for independent operations.** The dashboard's "total this month," "total this year," and "top category" stats (per `docs/ui.md` §4) are independent Mongoose aggregations — fetch them with `Promise.all`, not sequential `await`s.
- **1.6 Strategic Suspense boundaries.** Wrap the dashboard's category-breakdown and recent-expenses sections in independent `<Suspense>` boundaries so the page shell (nav, stat card skeletons) paints before the aggregation queries resolve, instead of blocking the whole page on `await`.

## 2. Bundle Size Optimization — CRITICAL

- **2.1 Avoid barrel file imports.** When icon libraries or component kits are added (e.g. for `docs/ui.md`'s planned HeroUI adoption), rely on Next.js's automatic barrel-import transform (works out of the box for supported packages in 13.5+) rather than manually deep-importing — but verify each added dependency actually gets the transform (check `optimizePackageImports` in `next.config.ts` if not automatic).
- **2.2 Conditional module loading.** Not currently applicable — no large optional feature modules exist yet. Apply when one is added (e.g. a CSV export feature only some users enable).
- **2.3 Defer non-critical third-party libraries.** If analytics/error-tracking is added to `app/layout.tsx`, load it via `next/dynamic` with `{ ssr: false }` after hydration, not as a blocking top-level import.
- **2.4 Dynamic imports for heavy components.** If a rich date-range picker or a heavy client component is added to the Expenses page (`docs/ui.md` §5), lazy-load it with `next/dynamic` rather than bundling it into the initial page chunk.
- **2.5 Prefer statically analyzable paths.** Keep `lib/data/*.ts` module selection explicit (e.g. an object literal mapping category keys to modules) rather than building import paths from a runtime string — this also affects Next.js's output file tracing, which matters for a small self-hosted app's deploy size.
- **2.6 Preload based on user intent.** For the "Add expense" modal (`docs/ui.md` §5), preload its component chunk `onMouseEnter`/`onFocus` of the trigger button if it's ever split into a dynamic import.

## 3. Server-Side Performance — HIGH

- **3.1 Authenticate Server Actions like API routes.** Every Server Action in this app (create/update/delete expense, rename/delete category, change password) calls `requireUser()` as its first line — full detail and rationale in `docs/auth.md` §4. This is non-negotiable even though the app also has Proxy-level and layout-level checks: Server Actions are directly invokable and must not depend on those other layers.
- **3.2 Avoid duplicate serialization in RSC props.** When a Server Component passes an expense list to a Client Component, pass the array once; do any sorting/filtering (e.g. re-sorting by amount) inside the Client Component, not as a second derived array computed server-side and passed alongside the original.
- **3.3 Avoid shared module state for request data.** Never store the authenticated user or request-scoped data in a module-level `let`. `requireUser()` (see `docs/auth.md` §5) is built on `auth()` + React's `cache()`, which is per-request by design — it must stay that way; nobody should add a `let currentUser` anywhere in `lib/`.
- **3.4 Cross-request LRU caching.** Not currently needed — this app has no per-request-expensive, cross-request-shared computation (the schema design's dashboard aggregations are cheap, indexed Mongoose queries). Revisit if a future feature adds expensive cross-user computation (e.g. category-name autocomplete against a large shared list).
- **3.5 Hoist static I/O to module level.** `lib/mongoose.ts`'s cached `connectToDatabase()` (module-level `mongooseCache` reused via `global.mongooseCache ??= ...`) is exactly this pattern already applied correctly — the connection promise is created once, not per request. Follow the same pattern for any other static resource (e.g. a seeded default-category list) instead of recomputing it per request.
- **3.6 Minimize serialization at RSC boundaries.** When a dashboard Server Component fetches a full `Expense` document (all Mongoose fields, including `_id`, timestamps, Mongoose internals) but a Client Component only needs `{ amount, category, date }`, pass only that shape — project the data down before crossing the boundary, not the full lean/hydrated document.
- **3.7 Parallel data fetching with component composition.** Structure the dashboard (`docs/ui.md` §4) as sibling async Server Components (`<StatCards />`, `<CategoryBreakdown />`, `<RecentExpenses />`) under a synchronous `<Page>`, not as one top-level `await` that blocks composing the rest of the tree.
- **3.8 Parallel nested data fetching.** If a future feature needs, per-expense, an author/attachment lookup (e.g. a shared-expense feature), chain each item's dependent fetch inside its own `Promise.all` entry so one slow item doesn't block the rest — don't do `Promise.all(fetchAll())` followed by a second `Promise.all(fetchDependent())` pass.
- **3.9 Per-request deduplication with `React.cache()`.** `requireUser()`/`getCurrentUser()`-style helpers (per `docs/auth.md` §5) must be wrapped in `cache()` so calling them from a layout, a page, and a nested Server Component within the same request hits the database once, not three times.
- **3.10 Use `after()` for non-blocking operations.** Any future audit logging (e.g. logging "expense deleted" for a security trail) should use `after()` inside the Server Action so the response isn't held up waiting on a log write.

## 4. Client-Side Data Fetching — MEDIUM-HIGH

*(Aspirational for this repo — no client data-fetching library is installed yet; apply these if/when one is added.)*

- **4.1 Deduplicate global event listeners.** If a global keyboard shortcut (e.g. "n" to open "Add expense") is added, register one shared listener, not one per mounted component instance.
- **4.2 Passive event listeners for scrolling.** Any scroll/touch listener added to the Expenses table (e.g. infinite scroll) must use `{ passive: true }` unless it calls `preventDefault()`.
- **4.3 Use SWR for automatic deduplication.** If the dashboard adds client-side polling or manual refresh, use SWR (`useSWR`) rather than a hand-rolled `useEffect` + `fetch`, so multiple components requesting the same endpoint share one in-flight request.
- **4.4 Version and minimize localStorage data.** The theme preference (`ThemeToggle`) is the one piece of client-persisted state in this app today. If it's persisted to `localStorage` (rather than only cookies via `next-themes`), key it as `theme:v1` and wrap reads/writes in `try/catch` (private browsing throws).

## 5. Re-render Optimization — MEDIUM

- **5.1 Calculate derived state during rendering.** In the expense form, a computed "amount after category default" or similar derived value must be computed inline during render, not mirrored into its own `useState` updated by a `useEffect`.
- **5.2 Defer state reads to usage point.** Don't subscribe to `useSearchParams()` in a component that only reads a query param inside a click handler (e.g. a "share filtered view" button) — read `window.location.search` on demand instead.
- **5.3 Don't wrap simple primitive expressions in `useMemo`.** A boolean like `isLoading = expensesLoading || categoriesLoading` doesn't need `useMemo`.
- **5.4 Don't define components inside components.** No component (e.g. a row renderer for the Expenses table) should be defined inside another component's body to "access" a closure variable — pass it as a prop instead. This is the single most common re-render/remount bug source and must be caught in review.
- **5.5 Extract memoized-component default values to constants.** If a memoized `ExpenseRow` component has an optional `onSelect = () => {}` default, hoist that no-op to a module-level `const NOOP = () => {}` so the default doesn't break memoization.
- **5.6 Extract to memoized components.** Split expensive per-row computation (e.g. currency formatting across a long expense list) into a `memo()`-wrapped `ExpenseRow` so a parent-level loading-state change doesn't force recomputation of every row.
- **5.7 Narrow effect dependencies.** Depend on `user.id`, not `user`, in effects that only need the id — a profile edit shouldn't re-trigger effects keyed only on identity.
- **5.8 Put interaction logic in event handlers.** A "submit expense" action (analytics ping, toast, redirect) belongs in the form's submit handler, not modeled as `submitted` state read by an effect.
- **5.9 Split combined hook computations.** If the Expenses page filters by category and sorts by date, compute the filtered list and the sorted list in separate `useMemo`s with separate dependency arrays, so changing sort order doesn't re-run the filter.
- **5.10 Subscribe to derived state.** Use a `useMediaQuery('(max-width: 767px)')`-style boolean for the responsive nav (`docs/ui.md` §2/§8), not a continuously-updating window-width number.
- **5.11 Use functional `setState` updates.** Any client-side optimistic update to an expense list (add/remove before the Server Action resolves) must use the functional form (`setExpenses(curr => ...)`) to avoid stale-closure bugs.
- **5.12 Use lazy state initialization.** If a client component parses a persisted filter state from `localStorage` on mount, use `useState(() => ...)`, not `useState(JSON.parse(...))`, so the parse only runs once.
- **5.13 Use transitions for non-urgent updates.** A live "filtering as you type" search box on the Expenses page should wrap the filtered-results update in `startTransition` so the input itself never lags.
- **5.14 Use `useDeferredValue` for expensive derived renders.** Combine with 5.13 for the same search box if filtering a large expense list becomes noticeably slow — defer the query used for filtering, not the input's displayed value.
- **5.15 Use `useRef` for transient values.** A drag-to-reorder or scroll-position tracker (if ever added) should use a ref, not state, since intermediate values don't need to trigger renders.

## 6. Rendering Performance — MEDIUM

- **6.1 Animate SVG wrapper instead of SVG element.** Any custom spinner/icon animation should animate a wrapping `<div>`, not the `<svg>` itself, for hardware acceleration.
- **6.2 CSS `content-visibility` for long lists.** Apply `content-visibility: auto` to expense-table rows once lists get long (a heavy expense history), so off-screen rows skip layout/paint.
- **6.3 Hoist static JSX elements.** A static "no expenses yet" empty-state block (`docs/ui.md` §4) can be hoisted to a module-level constant if it's reused verbatim across renders.
- **6.4 Optimize SVG precision.** Any custom SVG icon assets added to `public/` should be run through SVGO (`--precision=1`) rather than shipped at full path precision.
- **6.5 Prevent hydration mismatch without flickering.** The existing `ThemeToggle` (`app/components/ThemeToggle.tsx`) must apply the persisted theme via an inline synchronous script (or `next-themes`, which does this internally) before hydration — never a `useEffect` that flips the class post-hydration, which causes a visible flash.
- **6.6 Suppress expected hydration mismatches.** If a "created X minutes ago" relative timestamp is added to the expense list, wrap it in `suppressHydrationWarning` — don't let real bugs hide behind this, use it only for genuinely expected server/client differences like locale-formatted dates.
- **6.7 Use `<Activity>` for show/hide.** If the "Add expense" modal or a heavy filter panel toggles frequently and its internal state (partially-filled form) should survive being hidden, wrap it in `<Activity mode={isOpen ? 'visible' : 'hidden'}>` instead of conditionally unmounting it.
- **6.8 Use `defer`/`async` on script tags.** Any third-party script (analytics, error tracking) added to `app/layout.tsx` must use `next/script` with an explicit `strategy` (`afterInteractive` or `lazyOnload`), never a bare blocking `<script>` tag.
- **6.9 Use explicit conditional rendering.** A "0 expenses this month" badge must use `count > 0 ? <Badge/> : null`, not `count && <Badge/>` — the latter renders a literal `0` when the count is zero.
- **6.10 Use React DOM resource hints.** If the app calls an external service (e.g. a currency-conversion API), `preconnect()` to it from the root layout so the connection is warm before the first client-side call.
- **6.11 Use `useTransition` over manual loading states.** Prefer `useTransition`'s `isPending` for search/filter UI over a hand-rolled `isLoading` boolean plus manual `setIsLoading(true/false)` bracketing.

## 7. JavaScript Performance — LOW-MEDIUM

Applies to any client-side or Server Action logic that processes expense/category arrays:

- **7.1 Avoid layout thrashing.** Don't interleave DOM style writes with layout reads (`offsetWidth`, `getBoundingClientRect()`) in any custom scroll/resize logic; batch writes, then read once, or prefer CSS classes/Tailwind utilities entirely.
- **7.2 Build index maps for repeated lookups.** When joining expenses to categories client-side (e.g. rendering a category name per row), build a `Map<categoryId, Category>` once rather than calling `.find()` per row.
- **7.3 Cache property access in loops.** Hoist repeated nested property reads (e.g. `settings.display.currency`) out of a per-row formatting loop.
- **7.4 Cache repeated function calls.** If a formatting function (e.g. slugifying a category name) runs across a repeated list, memoize results in a module-level `Map`.
- **7.5 Cache Storage API calls.** Wrap any `localStorage`/`document.cookie` reads (theme, persisted filters) in an in-memory cache, invalidated on the `storage` event or tab visibility change.
- **7.6 Combine multiple array iterations.** When computing several category-breakdown groupings from the same expense array, do it in a single `for` loop rather than several `.filter()` passes.
- **7.7 Defer non-critical work with `requestIdleCallback`.** Client-side analytics pings on expense actions (add/edit/delete) should be scheduled via `requestIdleCallback`, not run synchronously in the click handler.
- **7.8 Early length check for array comparisons.** When diffing an edited expense list against its original to show an "unsaved changes" indicator, compare `.length` before any deep/sorted comparison.
- **7.9 Early return from functions.** Validation helpers (e.g. expense form validation) should return on the first failing field, not continue checking remaining fields after the result is already determined.
- **7.10 Hoist RegExp creation.** The existing `EMAIL_PATTERN` regex in `models/User.ts` and `app/login/page.tsx` is already correctly hoisted to module scope — keep following that pattern for any new validation regex; never construct one inline inside a render function or a hot loop.
- **7.11 Use `flatMap` to map and filter in one pass.** Prefer `expenses.flatMap(e => e.amount > 0 ? [e] : [])` over `.map().filter(Boolean)` chains when building a filtered/transformed list.
- **7.12 Use a loop for min/max instead of sort.** Finding the largest single expense or the most recent expense date should be a single `for` loop, not a full `.sort()` just to read one end of the array.
- **7.13 Use Set/Map for O(1) lookups.** Checking "is this category id one of the user's existing categories" against a list should use a `Set`, not repeated `.includes()`.
- **7.14 Use `toSorted()` instead of `sort()`.** Any client-side re-sort of an expenses/categories array passed in as props must use `.toSorted()` (or `[...arr].sort()` as a fallback) — never mutate the prop array in place with `.sort()`.

## 8. Advanced Patterns — LOW

- **8.1 Don't put Effect Events in dependency arrays.** If `useEffectEvent` is used for a stable callback inside an effect (e.g. a debounced-search effect calling a passed-in `onSearch`), the Effect Event itself is excluded from the dependency array — only genuinely reactive values (like the search query) belong there.
- **8.2 Initialize app once, not per mount.** Any one-time app initialization (e.g. reading a persisted auth-adjacent flag on load) uses a module-level guard (`let didInit = false`), not a bare `useEffect(() => {...}, [])` in a component that could remount.
- **8.3 Store event handlers in refs.** A `useWindowEvent`-style custom hook (if added for global shortcuts or resize handling) should keep its subscription stable across re-renders by storing the latest handler in a ref (or via `useEffectEvent`), rather than re-subscribing whenever the handler prop changes.
- **8.4 `useEffectEvent` for stable callback refs.** Prefer `useEffectEvent` (where available in the installed React 19.2 version) over the manual ref pattern in 8.3 when a component needs "always call the latest callback" semantics without re-running the surrounding effect.

---

## Source

Adapted from: [vercel-labs/agent-skills — react-best-practices/AGENTS.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/AGENTS.md) (v1.0.0, Vercel Engineering, January 2026). Consult the original for full incorrect/correct code samples behind each rule number.
