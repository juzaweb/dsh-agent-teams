---
title: "Interactive Scope and Plan Confirmation Gate in Captain Protocol"
created_at: "2026-08-22T19:22:00+07:00"
topic: "captain-scope-confirmation-gate"
type: "feature"
artifact_contract: "ce-unified-plan/v1"
artifact_readiness: "implementation-ready"
product_contract_source: "ce-brainstorm"
execution: "code"
---

## Goal Capsule

- **Objective:** Introduce an interactive Scope & Plan Confirmation Gate into the Captain protocol so users can inspect, calibrate, and approve team composition, DAG tasks, and boundaries before multi-agent execution begins on Standard and Deep missions.
- **Means:** Update `src/brainstorm.ts` to separate Scoping Synthesis (Phase 2) and Plan Confirmation (Phase 2.5) from Team Assembly/Execution (Phase 3), gating autonomous dispatch behind user confirmation for non-Lightweight scopes.
- **Product Authority:** Scope Tier classifications (Lightweight vs Standard/Deep) strictly govern when the confirmation gate fires.
- **Open Blockers:** None.

---

## Product Contract

### Summary

Historically, `dsh-agent-teams` forced the Captain agent to immediately spawn all members and create all tasks in a single turn without pausing to present the plan or ask for user confirmation. This feature integrates the full Compound Engineering (`ce-brainstorm`) confirmation discipline into the Captain usage protocol: for Standard and Deep tier tasks, the Captain must synthesize the proposed scope, team structure, DAG dependencies, and out-of-scope boundaries, present them clearly to the user, and wait for confirmation before assembling the team and dispatching tasks. Lightweight tasks retain fast-path autonomous execution.

### Problem Frame

When Captain receives a substantial or multi-module request:
1. Captain previously jumped straight from prompt intake to `agent_teams_create`, `agent_teams_add_member`, and `agent_teams_create_task` in turn 1.
2. The user had zero visibility into the intended DAG structure, team roles, or trade-offs before background agents were spawned and started mutating the workspace.
3. If Captain misinterpreted requirements or chose an undesired architectural approach, the user could not steer or correct it until subagents had already done wasteful work.

### Key Decisions

- KTD1. session-settled:tier-based-confirmation **Scope-Tier Gated Confirmation:** Confirmation is governed strictly by Scope Tier:
  - *Lightweight* (single-file tweak, localized fix, low ambiguity): Fast-path autonomous execution without stopping.
  - *Standard & Deep* (multi-component, architectural, complex DAG): Captain MUST pause and present the Scoping Synthesis & Proposed Plan for explicit user confirmation before creating the team and dispatching tasks.
- KTD2. session-settled:synthesis-format **Structured Scoping Presentation:** For Standard/Deep tasks, the presentation must clearly state:
  1. Mission Objective & What is being built (1–3 sentences).
  2. Proposed Team Roster (roles, models, parallel worker sizing).
  3. Phased Task DAG (tasks, assignees, dependencies, and target file boundaries).
  4. Out of Scope & Key Trade-offs.
  5. One clear confirmation question asking the user to confirm or adjust.
- KTD3. session-settled:post-confirmation-assembly **Post-Confirmation Execution Discipline:** Once the user confirms, Captain transitions to Phase 3, executes `agent_teams_create`, `agent_teams_add_member`, and `agent_teams_create_task` in a single focused turn, and proceeds with execution.

### Requirements

#### Protocol & Scope Classification
- R1. Captain protocol MUST classify incoming mission requests into Scope Tiers (Lightweight, Standard, Deep) during Phase 0.
- R2. For Lightweight requests, Captain MUST proceed directly to Phase 3 team assembly and task execution without pausing.
- R3. For Standard and Deep requests, Captain MUST complete Phase 1 (Context Grounding) and Phase 2 (Approach Exploration & Scoping Synthesis), then pause at Phase 2.5 for user confirmation.

#### Confirmation Gate Presentation (Phase 2.5)
- R4. Captain MUST NOT call `agent_teams_create`, `agent_teams_add_member`, or `agent_teams_create_task` prior to receiving user approval on Standard/Deep tasks.
- R5. The confirmation presentation MUST include:
  - Summary of what is being built.
  - Team composition with specialized roles and parallel workers.
  - Task DAG breakdown including task subjects, assignees, prerequisite dependencies, and disjoint file scopes.
  - Key trade-offs and explicit Out-of-Scope items.
- R6. Captain MUST ask ONE clear question at the end of the turn asking the user to confirm the plan or provide adjustments.

#### Post-Confirmation Execution
- R7. When user approves or confirms the plan, Captain MUST consecutively create the team, add all specified members, and create all tasks in that same turn.
- R8. If user provides feedback or requests adjustments, Captain MUST incorporate the changes, present the revised plan, and re-confirm.

### Key Flows

- F1. Standard/Deep Mission with Plan Confirmation
  - **Trigger:** User asks AgentTeams to implement a multi-module feature or test suite.
  - **Actors:** User, Captain, Worker Subagents.
  - **Steps:**
    1. Captain scans context, evaluates approaches, and classifies as Standard/Deep scope.
    2. Captain formulates the 3-bucket synthesis, proposed team roster, and phased DAG.
    3. Captain outputs the Scoping & Plan synthesis and asks the user for confirmation. (Turn ends).
    4. User reviews the DAG and replies "Looks great, proceed" (or suggests adjustments).
    5. Captain receives confirmation, creates team, adds members, creates tasks with dependencies, and triggers the scheduler.
    6. Subagents execute tasks according to the confirmed DAG.
  - **Outcome:** User has complete control and visibility before subagents begin executing.
  - **Covered by:** R1, R3, R4, R5, R6, R7, R8.

- F2. Lightweight Fast-Path Execution
  - **Trigger:** User asks AgentTeams to fix a simple localized bug or make a minor single-file update.
  - **Actors:** User, Captain, Worker Subagent.
  - **Steps:**
    1. Captain classifies scope as Lightweight.
    2. Captain immediately creates team, adds worker member and reviewer, creates tasks, and dispatches.
  - **Outcome:** Zero latency overhead for trivial or straightforward tasks.
  - **Covered by:** R1, R2.

### Scope Boundaries

- **In Scope:**
  - Updates to `buildCaptainUsageProtocol` in `src/brainstorm.ts` (Phase 0, Phase 2, Phase 2.5, Phase 3).
  - Updates to documentation in `docs/usage.md` and `docs/usage_ZH.md`.
- **Out of Scope:**
  - Backend tool changes (tools remain the same, only protocol sequence changes).
  - CLI bypass flags (controlled strictly by scope tier per settled decision).

### Acceptance Examples

- AE1. Standard Scope Confirmation Presentation
  - **Given:** A request touching multiple files or modules.
  - **When:** Captain executes initial turn.
  - **Then:** Captain outputs the scoping breakdown, team roster, and task DAG, and ends turn with a confirmation question with 0 `agent_teams_*` tool calls made.

---

## Planning Contract

### High-Level Technical Design

We restructure the Captain prompt protocol in `src/brainstorm.ts`:
1. **Phase 0 (Intake & Tier Classification)**:
   - Evaluates the Scope Tier first.
   - If *Lightweight*: Fast-path directly to Phase 3 (consecutive `agent_teams_create` + `add_member` + `create_task`).
   - If *Standard / Deep*: Directs the model through Phase 1 (Grounding), Phase 2 (Approaches & Synthesis), and pauses at Phase 2.5 (Confirmation Gate).
2. **Phase 2.5 (Interactive Scope & Plan Confirmation Gate - NEW)**:
   - Instructs the Captain to present the structured plan (Objective, Team Roster, Task DAG with dependencies and file scopes, Out of Scope).
   - Instructs the Captain to end turn with a single confirmation question without calling any `agent_teams_*` creation tools.
3. **Phase 3 (Post-Confirmation Team Assembly & Dispatch)**:
   - When confirmation is received, Captain immediately executes the team assembly tools in that turn.
   - If user requests adjustments, Captain refines the plan, re-presents, and re-confirms.

---

## Implementation Units

### U1. Update Captain Usage Protocol in src/brainstorm.ts
- **Goal:** Incorporate Phase 2.5 Confirmation Gate into `buildCaptainUsageProtocol` in `src/brainstorm.ts`.
- **Target Files:** `src/brainstorm.ts`
- **Details:**
  - Refactor Phase 0 to classify tier before tool calls.
  - Add Phase 2.5: Interactive Scope & Plan Confirmation Gate.
  - Adjust Phase 3 to execute team creation upon confirmation for Standard/Deep tasks or immediately for Lightweight tasks.
- **Verification:** TypeScript typechecking and compilation.

### U2. Update Documentation & Usage Guides
- **Goal:** Document the Confirmation Gate in `docs/usage.md` and `docs/usage_ZH.md`.
- **Target Files:** `docs/usage.md`, `docs/usage_ZH.md`
- **Details:**
  - Add explanation of Scope Tiers and the Plan Confirmation step.
- **Verification:** Markdown formatting.

### U3. Local Verification & Stress Suite
- **Goal:** Verify build and test suite pass cleanly.
- **Verification:** `pnpm run build && pnpm run typecheck && pnpm run verify`.

---

## Verification Contract

| Check | Command | Expected Outcome |
|---|---|---|
| Typecheck & Build | `pnpm run build` | Zero TypeScript errors, clean bundle |
| Test Suite | `pnpm run verify` | 100% tests passing across all suites |

---

## Definition of Done

- [ ] `src/brainstorm.ts` updated with Phase 2.5 Confirmation Gate.
- [ ] `docs/usage.md` and `docs/usage_ZH.md` updated with confirmation gate behavior.
- [ ] `pnpm run build && pnpm run typecheck && pnpm run verify` pass with 0 errors.
