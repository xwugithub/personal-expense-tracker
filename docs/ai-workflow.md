# AI-Assisted Development Workflow

This document defines how AI-assisted coding (Claude Code or any equivalent tool) must operate in this project. The core rule: **no code is written until a plan has been proposed and explicitly approved.**

## 1. Core Principle

For any non-trivial change (see §2), the AI proposes a technical plan first and waits for the user to approve it before writing, editing, or generating any code. Jumping straight to implementation — even when the request seems simple or the "obvious" solution seems clear — is not allowed. Assumptions about scope, approach, or design are surfaced as questions or explicit callouts in the plan, not resolved silently.

## 2. When the Gate Applies

**Requires a plan and approval:**
- Anything that adds or changes application logic, architecture, data models/schemas, API surfaces, or dependencies.
- New features, refactors, bug fixes that touch behavior, and any change to authentication/authorization or data-access patterns.
- Anything where more than one reasonable approach exists.

**Exempt (may be done directly, no plan required):**
- Pure typo fixes, formatting/whitespace changes, comment edits.
- Documentation-only edits that don't describe a not-yet-built design decision.
- Trivial, unambiguous one-line fixes with no behavioral ambiguity (e.g. fixing an obviously wrong import path).

When in doubt about whether something qualifies as trivial, treat it as non-trivial and go through the gate — the cost of an unnecessary plan is much lower than the cost of unreviewed logic changes.

## 3. What a Plan Must Contain

A plan is not a one-line summary — it must give the user enough to actually evaluate the approach before code exists. At minimum:

1. **Problem / goal** — what is being solved and why, in plain terms.
2. **Proposed architecture** — the shape of the solution: what components/modules/files are involved, how they relate, and how data flows through them.
3. **Implementation steps** — a concrete, ordered breakdown of the work (which files get created/changed, in what order, and what each step accomplishes). Steps should be specific enough that "approve" means approving actual file-level changes, not a vague direction.
4. **Scope and non-goals** — what is explicitly out of scope, so approval covers a bounded piece of work, not an open-ended one.
5. **Verification plan** — how the change will be checked once implemented (tests to add/run, `npm run build`/`npm run lint`, manual steps) — see §7.
6. **Trade-offs, if any** — when more than one reasonable approach exists, the alternatives considered and why the proposed one was chosen.

For larger or ambiguous requests, this is preceded by clarifying questions (one at a time) to pin down purpose, constraints, and success criteria before the plan is drafted — proposing a plan against an unclear goal just produces a plan that has to be redone.

## 4. Where Plans Live

Approved plans for non-trivial work are written to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and committed, following the convention already established in this repo (e.g. the MongoDB connection and Mongoose schema design docs). This keeps the record of *why* a design was chosen alongside the code it produced, not just in conversation history that isn't durable.

## 5. Approval Mechanism

- The plan is presented in full — not abbreviated — before any code is touched.
- Work begins only after an explicit, unambiguous approval (e.g. "yes, go ahead," "approved," "looks good, proceed"). Silence, a reply to an unrelated point, or a question about the plan does not count as approval.
- If the user requests changes to the plan, the AI revises and re-presents the relevant section(s) before proceeding — it does not treat a partial comment as blanket approval for the rest of the plan.
- If the user explicitly asks for a faster, lower-ceremony pass on a specific task ("skip the plan for this one"), that instruction is honored for that task only — it is not treated as a standing waiver for future work.

## 6. Mid-Implementation Changes

If, during implementation, the approved plan turns out to be wrong or insufficient in a way that changes the architecture or scope, the AI stops, explains what changed and why, and re-proposes the affected part of the plan for approval before continuing. Small, mechanical deviations that don't change the approved design (e.g. a slightly different variable name) don't require re-approval; anything that changes what a reviewer would need to re-evaluate does.

## 7. Post-Implementation Verification

Before declaring a change complete:
- Relevant checks are run and shown to pass: `npm run build`, `npm run lint`, and any test suite that applies to the change.
- For UI changes, the feature is actually exercised (dev server + browser), not just type-checked.
- Claims of "done," "fixed," or "passing" are backed by command output the user can see — not asserted without having run anything.

## 8. Out of Scope

- This document governs the *process* around AI-assisted changes, not code style or architecture conventions themselves (see `CLAUDE.md`/`AGENTS.md` for those).
- It does not define a review/approval process for human-authored code — only for AI-proposed changes.
