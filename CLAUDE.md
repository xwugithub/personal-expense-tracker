# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project state

This is a Next.js app scaffolded with `create-next-app` for a personal expense tracker. No expense-tracking functionality has been built yet — `app/` currently only contains the default starter `layout.tsx` and `page.tsx`. There is no database, API layer, or test framework configured yet.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config via `eslint.config.mjs`, using `eslint-config-next`'s `core-web-vitals` and `typescript` rule sets)

There is no test command configured in `package.json` yet.

## Important: this Next.js version is newer than your training data

Dependencies: Next.js 16.2.12, React 19.2.4. Per `AGENTS.md`, Next.js bundles its own docs at `node_modules/next/dist/docs/` — check the relevant page there before relying on remembered Next.js APIs/conventions, since this major version has breaking changes not reflected in training data. One confirmed example: **Middleware has been renamed to Proxy** — the convention is now a root-level `proxy.ts` (not `middleware.ts`), same capabilities.

## Architecture

- App Router only (`app/` directory), TypeScript, path alias `@/*` → project root (`tsconfig.json`).
- Styling: Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.*` — config lives in `app/globals.css` using `@theme inline`).
- Fonts: `next/font/google` (Geist / Geist Mono), wired up in `app/layout.tsx` as CSS variables.
- `next.config.ts` is currently empty (default config).
