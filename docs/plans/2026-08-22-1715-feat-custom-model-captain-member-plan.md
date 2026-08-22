---
title: Custom LLM Model Selection for Captain and Members
date: 2026-08-22
type: feat
status: draft
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

## Goal Capsule

- Objective: Enable operators and developers to configure custom LLM providers, models, and reasoning efforts independently for the Captain agent and Member subagents across all activation surfaces (Plugin Config, Slash Command, and runtime Tools).
- Means: Introduce Captain model configuration fields to `Config`, extend `/agent-teams` command parsing and `agent_teams_create` tool parameters, couple `installModelSelection` directly to the Captain session, and persist resolved LLM routes in `TeamState` and the Web GUI Activity Panel.
- Product Authority: Covers Captain and Member model selection, configuration fallback hierarchy, and live execution runtime binding. Excludes host-level LLM provider provisioning and subagent spawner architecture.
- Open Blockers: None.

## Product Contract

### Summary

This feature allows users to select custom LLM models for both the Captain agent and individual Member subagents in `dsh-agent-teams`. It supports global defaults via plugin configuration (`captainModel`, `memberModel`), interactive goal overrides via the `/agent-teams` command and `agent_teams_create` tool, and per-member overrides via `agent_teams_add_member`. The Captain session dynamically adopts the chosen model at runtime, and durable snapshots surface the model configuration in the Activity Panel.

### Problem Frame

Currently, `dsh-agent-teams` provides limited model customization:
- Member subagents default to the Captain session's model unless overridden by `agent_teams_add_member` or `config.memberModel`.
- The Captain agent cannot be assigned a dedicated custom model or provider override independently of the parent session default.
- Users cannot specify a stronger model for complex captain orchestration (e.g. deep reasoning models) while assigning lighter, faster models for subagent tasks directly via plugin config or slash command.

### Target Users & Scenarios

- A1. **Team Operator / End User:** Launches multi-agent goals via `/agent-teams` and wants to specify custom models (e.g. high-reasoning for Captain, fast-coding for Members) per goal or profile.
- A2. **Agent Captain:** Creates the team and spawns member subagents with appropriate model tiers based on their task roles.
- A3. **Web GUI Observer:** Views team status in the Activity Panel and observes which model routes are assigned to the Captain and each member.

### Key Decisions

- KTD1. **session-settled: Direct Session Model Binding for Captain.** When a custom Captain model is specified, the Captain session immediately applies the model selection via `installModelSelection(captainCtx, ...)` rather than recording it as passive metadata only.
- KTD2. **session-settled: Multi-surface Configuration.** Custom models can be configured across three surfaces: Plugin Config (`config.yaml` / `cordis.patch.yml`), Slash Command (`/agent-teams --captain-model=... --member-model=...`), and runtime tools (`agent_teams_create`, `agent_teams_add_member`).
- KTD3. **Resolution Fallback Hierarchy.**
  - For Captain: Tool Argument (`agent_teams_create`) > Slash Command Flag (`/agent-teams`) > Plugin Config (`config.captainModel`) > Active Session Route.
  - For Member: Tool Argument (`agent_teams_add_member`) > Slash Command Flag / Team Default > Plugin Config (`config.memberModel`) > Captain's Resolved Route.
- KTD4. **Reasoning Effort Handling.** Reasoning effort is preserved only when the provider and model match the source route. A changed model/provider route automatically defaults to the target model's default reasoning effort unless explicitly overridden.

### Requirements

- R1. The plugin configuration schema must support `captainProvider`, `captainModel`, `captainReasoningEffort`, `memberProvider`, `memberModel`, and `memberReasoningEffort`.
- R2. The `agent_teams_create` tool must accept optional `captain_provider`, `captain_model`, and `captain_reasoning_effort` parameters.
- R3. When `agent_teams_create` resolves a custom Captain model, it must apply `installModelSelection` to the Captain agent's context and record `captainProvider`, `captainModel`, and `captainReasoningEffort` in the durable `TeamState`.
- R4. The `/agent-teams` command and gesture boundary must support flags or arguments specifying custom captain and member models (e.g. `--captain-model`, `--member-model`, `--model`).
- R5. The `agent_teams_add_member` tool must inherit `config.memberModel`/`config.memberProvider` as defaults when explicit tool arguments are omitted.
- R6. The `TeamState` data model, `assembleTeamSnapshot`, and client `ActivityPanel` must include the Captain's resolved model info alongside member models.
- R7. Backward compatibility must be preserved for existing team records lacking explicit Captain model metadata.

### Key Flows

- F1. **Slash Command with Model Overrides**
  - **Trigger:** User enters `/agent-teams --captain-model deepseek-reasoner --member-model deepseek-chat Build a fullstack app`.
  - **Actors:** A1 (User), A2 (Captain).
  - **Steps:**
    1. Gesture boundary parses the command flags and passes the goal along with model directives to the session.
    2. Captain calls `agent_teams_create` with the specified Captain model settings.
    3. Captain session binds to `deepseek-reasoner`.
    4. Captain spawns members with `deepseek-chat` as the member default.
  - **Outcome:** Captain and members execute with their respective specified models.
  - **Covered by:** R1, R2, R3, R4, R5

- F2. **Plugin Config Profile Setup**
  - **Trigger:** Operator sets `captainModel: deepseek-reasoner` and `memberModel: deepseek-chat` in `cordis.patch.yml`.
  - **Actors:** A1 (Operator).
  - **Steps:**
    1. Plugin loads configuration on boot.
    2. Any new team created without explicit tool args uses `deepseek-reasoner` for Captain and `deepseek-chat` for members.
  - **Outcome:** Consistent team model defaults without typing flags in every prompt.
  - **Covered by:** R1, R2, R3, R5

### Scope Boundaries

- **In Scope:**
  - Configuration schema extensions in `src/index.ts` and `cordis.patch.yml`.
  - Tool parameter updates in `src/tools.ts` (`agent_teams_create`, `agent_teams_add_member`).
  - Model resolution and lifecycle management in `src/members.ts` and `src/state.ts`.
  - Slash command and gesture parsing in `src/command.ts`.
  - State snapshot and activity panel display in `src/snapshot.ts` and `src/client/ActivityPanel.tsx`.
- **Out of Scope:**
  - Dynamic switching of API keys or provider accounts at runtime.
  - Modifying external subagent providers (`subagent-spawn`, `subagent-fork`).

### Success Criteria

- SC1. A captain session initialized with a custom model successfully executes LLM calls using the resolved provider and model.
- SC2. Spawning members without arguments inherits `config.memberModel` or the captain's model accurately.
- SC3. Command `/agent-teams --captain-model ...` correctly sets the captain and member models.
- SC4. Web GUI Activity Panel displays the active model and reasoning effort for both Captain and all team members.
- SC5. All existing test suites, lifecycle verifications, and TypeScript typechecks pass without regression.

## Planning Contract

### Technical Design

#### 1. Configuration & Types Extension
- Extend `Config` interface and Schemastery schema in `src/index.ts`:
  - `captainProvider?: string`
  - `captainModel?: string`
  - `captainReasoningEffort?: string`
  - `memberReasoningEffort?: string`
- Update `ToolsConfig` in `src/tools.ts` to forward these configuration defaults.
- Update `TeamState` in `src/types.ts` to include:
  - `captainProvider?: string`
  - `captainModel?: string`
  - `captainReasoningEffort?: string`

#### 2. Captain Model Resolution & Session Binding
- In `src/members.ts`, create a helper `resolveCaptainLlmSelection(ctx, captain, request)` mirroring member resolution logic:
  - Validates requested provider/model/effort against `ctx.llm.resolveCallConfig`.
  - Preserves effort only on identical provider/model routes; switches to model default when route changes.
- In `src/tools.ts`:
  - Extend `agent_teams_create` parameters with `captain_provider`, `captain_model`, `captain_reasoning_effort`.
  - When `agent_teams_create` runs, resolve the selection (Tool arg > Config default > Captain current session config).
  - If a custom selection is resolved that differs from the default session, install `installModelSelection(captain.ctx, { current: modelSelection(selection), assembled: undefined })`.
  - Persist `captainProvider`, `captainModel`, and `captainReasoningEffort` into `TeamState`.
  - Update `agent_teams_delete` to clean up/dispose model selection listener if needed.

#### 3. Slash Command & Gesture Parsing
- In `src/command.ts`:
  - Extend flag parsing for `/agent-teams`:
    - `--captain-model=<model>` or `-cm <model>`
    - `--member-model=<model>` or `-mm <model>`
    - `--captain-provider=<provider>`
    - `--member-provider=<provider>`
    - `--reasoning-effort=<effort>`
  - Inject structured activation directive containing parsed flags so Captain uses them during `agent_teams_create` and `agent_teams_add_member`.

#### 4. State Snapshot & UI Visibility
- In `src/snapshot.ts`:
  - Extend `TeamActivitySnapshot` to include:
    - `captainProvider?: string`
    - `captainModel?: string`
    - `captainReasoningEffort?: string`
  - In `TeamActivityMember`, include `model?: string` and `reasoningEffort?: string`.
- In `src/client/ActivityPanel.tsx` & `src/client/activity-model.ts`:
  - Display the Captain's model badge / chip in the team header or lead section.
  - Display member model badges in member cards/rows with tooltip showing provider and reasoning effort.

### Assumptions & Risks

- **Assumption:** `installModelSelection` works symmetrically on top-level Agent contexts (`captain.ctx`) and subagent child contexts (`childCtx`).
- **Mitigation:** Test `installModelSelection` on captain session in `scripts/lifecycle-verify.mjs` to verify prompt assembly and request routing correctly take effect on subsequent steps.

## Implementation Units

### U1. Configuration Schema & Bundle Patch Extensions
- **Goal:** Add Captain and Member LLM configuration properties to plugin config and manifest.
- **Files:** `src/index.ts`, `cordis.patch.yml`, `src/types.ts`.
- **Details:**
  - Add `captainProvider`, `captainModel`, `captainReasoningEffort`, `memberReasoningEffort` to `Config` interface and Schemastery schema.
  - Add `captainProvider`, `captainModel`, `captainReasoningEffort` to `TeamState` in `src/types.ts`.
  - Forward these options in `apply()` to `ToolsConfig`.

### U2. Captain Model Resolution & Runtime Session Binding
- **Goal:** Implement model resolution and live session binding for Captain in `agent_teams_create`.
- **Files:** `src/members.ts`, `src/tools.ts`.
- **Details:**
  - Add `resolveCaptainLlmSelection` in `src/members.ts`.
  - Add `captain_provider`, `captain_model`, `captain_reasoning_effort` parameters to `agent_teams_create` in `src/tools.ts`.
  - Bind `installModelSelection` to `captain.ctx` when custom route is resolved.
  - Save resolved captain route into `state.json` via `createTeamDir`.

### U3. Slash Command & Gesture Boundary Model Flag Parsing
- **Goal:** Allow users to pass model flags in `/agent-teams` commands.
- **Files:** `src/command.ts`.
- **Details:**
  - Implement regex / tokenizer parser in `src/command.ts` to extract `--captain-model`, `--member-model`, etc.
  - Formulate activation directive with extracted directives.

### U4. State Snapshot & Activity Panel Model Visibility
- **Goal:** Surface Captain and Member model information in snapshot and Activity Panel UI.
- **Files:** `src/snapshot.ts`, `src/client/ActivityPanel.tsx`, `src/client/activity-monitor.ts`.
- **Details:**
  - Assemble `captainModel`, `captainProvider`, `captainReasoningEffort` into `TeamActivitySnapshot`.
  - Render model badges in `ActivityPanel.tsx`.

### U5. Test Suite & Lifecycle Verification
- **Goal:** Validate model resolution, fallback order, and session binding in test scripts.
- **Files:** `scripts/verify.mjs`, `scripts/lifecycle-verify.mjs`.
- **Details:**
  - Add test cases for `resolveCaptainLlmSelection`, `agent_teams_create` with model overrides, and slash command flag parsing.
  - Run `pnpm build`, `pnpm typecheck`, `pnpm verify`.

## Verification Contract

### Automated Verification
```bash
# Typecheck
pnpm typecheck

# Build library and client bundles
pnpm build

# Run all test suites
pnpm verify
```

### Manual Verification
1. Run a test session with `dsh` and execute `/agent-teams --captain-model test-model --member-model worker-model Test Goal`.
2. Inspect created `team.json` under `.agent-teams/<team-id>/` to verify `captainModel` and `captainProvider` are saved.
3. Verify member subagents spawned inherit `worker-model`.
4. Open the Web GUI Activity Panel and confirm model chips display next to Captain and members.

## Definition of Done

- [ ] All configuration fields (`captainModel`, `memberModel`, etc.) are recognized and typed.
- [ ] `agent_teams_create` dynamically binds the Captain session to the custom model.
- [ ] `/agent-teams` parses command-line model flags.
- [ ] Activity Panel displays Captain and Member model badges.
- [ ] `pnpm typecheck`, `pnpm build`, and `pnpm verify` pass cleanly.
