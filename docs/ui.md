# UI Design — HeroUI Only

This document describes the target user interface for the personal expense tracker. Every screen is built exclusively from [HeroUI](https://www.heroui.com) components and HeroUI's own theming system (built on Tailwind CSS under the hood). There are **no custom UI components and no custom CSS** — no bespoke buttons, cards, modals, or one-off `className` styling beyond HeroUI's own `className`/`classNames` props for slot-level tweaks (e.g. `classNames={{ base: "max-w-md" }}`), and no chart libraries.

## 1. Principles

- **HeroUI-only.** Every visible element — layout containers, buttons, inputs, tables, feedback states — is a HeroUI component (`@heroui/react`). Where a layout needs plain grouping (e.g. a page wrapper), use HeroUI's `div`-free primitives where they exist (`Card`, `Divider`, `Spacer`) rather than raw styled `div`s.
- **Theming, not styling.** Visual identity (color, radius, typography scale) comes from HeroUI's theme config (`heroui()` Tailwind plugin + `tailwind.config` theme extension), not inline custom CSS. Light/dark mode is a HeroUI theme switch, wired to `next-themes` — the existing `ThemeToggle` component is replaced with HeroUI's theming pattern (a HeroUI `Switch` or `Button` bound to `useTheme()`).
- **Responsive by default.** HeroUI components are responsive out of the box (fluid widths, built-in breakpoint props like `Table`'s mobile-friendly layout). Layout composition uses HeroUI's grid-friendly components; breakpoint behavior is called out per screen in §8.
- **Accessible by default.** HeroUI is built on React Aria, so focus management, keyboard interaction, and ARIA semantics come for free. This doc's job is to not undermine that (correct labels, correct component choice, no icon-only buttons without `aria-label`). See §9 for the full checklist.
- **No charts.** Per the "HeroUI only" constraint, the dashboard represents spending data numerically — `Card`, `Progress`, `Chip`, `Table` — rather than pulling in a charting library. This is a deliberate trade-off: less visual at a glance, but zero non-HeroUI dependencies.

## 2. App Shell & Navigation

**Components:** `Navbar`, `NavbarBrand`, `NavbarContent`, `NavbarItem`, `NavbarMenuToggle`, `NavbarMenu`, `NavbarMenuItem`, `Avatar`, `Dropdown`/`DropdownMenu`, `Switch`, `Link`.

- A single top `Navbar` wraps every authenticated page via a shared layout (`app/(app)/layout.tsx`).
- Desktop (`md` and up): `NavbarContent` shows inline links — Dashboard, Expenses, Categories — plus a right-aligned cluster with the theme `Switch` and an `Avatar` that opens a `Dropdown` (Profile, Settings, Log out).
- Mobile (below `md`): the inline links collapse behind `NavbarMenuToggle` (hamburger), which opens HeroUI's built-in `NavbarMenu` as a full-width slide-down panel — this is HeroUI's native responsive pattern, not a custom drawer.
- Active route is indicated via `NavbarItem isActive`, which HeroUI styles through the theme (no manual conditional classes needed beyond passing the prop).
- Unauthenticated routes (`/login`, `/signup`) render without the `Navbar` — just a centered `Card` on a plain themed background.

## 3. Auth Pages (Login / Signup)

**Components:** `Card`, `CardHeader`, `CardBody`, `Form`, `Input`, `Checkbox`, `Button`, `Link`, `Divider`.

- Both pages replace the current custom `AuthLayout`/`FormField` components with a single centered HeroUI `Card` (`className="max-w-md w-full"` for width only — no custom styling of internals).
- `CardHeader` holds the page title (e.g. "Log in") and subtitle as plain `<p>`/HeroUI `Chip`-free text using HeroUI's typography tokens.
- Fields use HeroUI `Form` + `Input`, with `isRequired`, `type="email"` / `type="password"`, `isInvalid`, and `errorMessage` props driving validation display — this replaces the hand-rolled `FormField` component's error rendering entirely.
- Password fields use `Input`'s built-in `endContent` slot with a visibility-toggle `Button isIconOnly variant="light"` (eye/eye-off icon) — a supported HeroUI pattern, not a custom control.
- Submit is a full-width `Button color="primary" type="submit"`, with `isLoading` bound to the pending auth request state.
- Signup adds `firstName`/`lastName` `Input`s above email, and a `Checkbox` for "I agree to the terms" where relevant.
- Footer link ("Don't have an account? Sign up") uses HeroUI `Link` inside a plain paragraph.

## 4. Dashboard

**Components:** `Card`, `CardHeader`, `CardBody`, `Progress`, `Chip`, `Table`, `TableHeader`, `TableColumn`, `TableBody`, `TableRow`, `TableCell`, `Skeleton`, `Spacer`.

- Top row: three-across (stacking to one column on mobile) stat `Card`s — "Total this month", "Total this year", "Top category" — each showing a large numeral via `CardBody` text and a `Chip` for trend (e.g. `Chip color="success"` for down vs. last month).
- Category breakdown: a `Card` containing one row per category, each row pairing a `Progress` bar (value = % of monthly total) with a trailing amount — this is the numeric stand-in for a pie/bar chart, built entirely from `Progress` + `Chip`.
- Recent expenses: a `Table` (last 5–10 entries) with columns Date, Category (`Chip`), Description, Amount, and a `Link`/`Button` to "View all" → Expenses page.
- Loading states use HeroUI `Skeleton` wrapping each card/table while data fetches, instead of custom shimmer CSS.
- Empty state (no expenses yet): a `Card` with centered text and a `Button color="primary"` linking to "Add your first expense".

## 5. Expenses

**Components:** `Table` (with `TableColumn`/`TableRow`/`TableCell`), `Input` (search), `Select`/`SelectItem` (category filter), `DateRangePicker`, `Button`, `Modal`/`ModalContent`/`ModalHeader`/`ModalBody`/`ModalFooter`, `Form`, `NumberInput` (falls back to `Input type="number"` if unavailable in the installed version), `Chip`, `Pagination`, `Dropdown` (row actions).

- Toolbar row above the table: `Input` for free-text search, `Select` for category filter, `DateRangePicker` for a date range, and a `Button color="primary"` ("Add expense") right-aligned — wraps to multiple rows on mobile via flex-wrap behavior HeroUI's layout primitives already support.
- Table columns: Date, Category (`Chip` colored per category), Description, Amount (right-aligned, monospace via HeroUI's built-in `font-mono` utility on `TableCell` content), Actions.
- Actions column uses a `Dropdown` (kebab icon `Button isIconOnly variant="light"`) with `DropdownItem`s "Edit" and "Delete" — avoids two bare icon buttons cluttering small screens.
- `Pagination` below the table for large expense lists (HeroUI `Pagination` component, not custom page-number rendering).
- **Add/Edit**: a `Modal` (`ModalContent` render-prop form) containing a `Form` with Category `Select`, Amount `NumberInput`, Description `Input`, Date `DatePicker`. `ModalFooter` has `Button variant="light"` (Cancel) and `Button color="primary" type="submit"` (Save), with `isLoading` while submitting.
- **Delete**: a small confirmation `Modal` ("Delete this expense? This can't be undone.") with `Button color="danger"` to confirm — no native `window.confirm`.
- On mobile, the `Table` uses HeroUI's responsive `Table` layout (horizontal scroll within the table's own scroll container, provided by the component) rather than a custom card-list fallback, keeping the "HeroUI only" rule intact.

## 6. Categories

**Components:** `Table`, `Button`, `Modal`, `Form`, `Input`, `Chip`, `Popover` (delete confirm for a lightweight, low-risk action).

- A single `Table` listing each category with columns Name and Actions (Edit / Delete), plus an "Add category" `Button color="primary"` above the table.
- Add/Edit uses the same `Modal` + `Form` + `Input` pattern as Expenses, scoped to a single `name` field.
- Delete uses a `Popover` (triggered from the row's delete `Button`) with an inline "Are you sure?" + confirm `Button color="danger"` — cheaper than a full `Modal` for a single-field, low-consequence delete, still fully keyboard/focus-managed by HeroUI.
- The seeded defaults (Food, Transport, Housing, Utilities, Entertainment, Health, Shopping, Other) render identically to user-created categories — no visual distinction implies they're special, since users can rename/delete them.

## 7. Settings / Profile

**Components:** `Card`, `Tabs`/`Tab`, `Form`, `Input`, `Button`, `Switch`, `Divider`.

- A `Tabs` component splits Settings into "Profile" and "Security" panels within one `Card`.
- **Profile tab:** `Form` with `firstName`, `lastName`, `email` `Input`s and a `Button color="primary"` ("Save changes").
- **Security tab:** `Form` with current password, new password, confirm password `Input`s (type="password", with the same show/hide `endContent` pattern as auth pages) and a `Button color="primary"` ("Update password").
- **Appearance:** a `Switch` for light/dark theme, mirroring the navbar toggle for users who prefer it in Settings — same underlying theme state, just a second entry point.
- Destructive account actions (if any, e.g. "Delete account") go in a visually separated section below a `Divider`, using `Button color="danger" variant="flat"` to open a confirmation `Modal`.

## 8. Responsive Behavior Summary

| Breakpoint | Behavior |
|---|---|
| `< sm` (mobile) | `Navbar` collapses to hamburger + `NavbarMenu`; stat cards and toolbar controls stack to a single column; `Table`s scroll horizontally within their own container; `Modal`s render full-width with reduced padding (HeroUI's default mobile `Modal` sizing). |
| `sm`–`md` (tablet) | Stat cards go two-across; toolbar controls wrap to two rows as needed; `Navbar` may still use the collapsed menu depending on link count. |
| `md`+ (desktop) | Full inline `Navbar`; stat cards three-across; toolbar controls in a single row; `Table`s at full width without horizontal scroll under normal content. |

All breakpoint behavior comes from HeroUI's existing responsive component internals plus standard Tailwind responsive utility classes applied only to layout wrappers (grid/flex column counts) — never to restyle a HeroUI component's own internals.

## 9. Accessibility Checklist

- Every `Input`, `Select`, `DatePicker`, etc. has a visible `label` prop — no placeholder-as-label.
- Icon-only `Button`s (`isIconOnly`) always carry an explicit `aria-label` (e.g. "Show password", "Delete expense").
- Color is never the only signal: category `Chip`s pair color with the category name text; success/danger states pair color with an icon or text (e.g. "-12%" not just a green chip).
- All destructive actions (delete expense, delete category, delete account) require an explicit confirmation step (`Modal` or `Popover`) — never a single click with no undo path.
- Focus order follows visual/reading order in every `Form` and `Modal`; `Modal` traps focus and returns it to the triggering element on close (HeroUI default behavior — must not be overridden).
- Keyboard support is verified per page: full tab-through of the `Navbar`, all `Table` row actions, and every `Form`, including submitting forms with Enter and closing `Modal`s with Escape.
- Color contrast: use HeroUI's default theme tokens (already tuned for AA contrast) for both light and dark mode; any custom theme color overrides in `tailwind.config` must be checked against WCAG 2.1 AA (4.5:1 for text) before use.
- Loading (`isLoading`, `Skeleton`) and empty states are present on every data-bearing screen (Dashboard, Expenses, Categories) so screen reader users and slow connections never hit a blank page.
