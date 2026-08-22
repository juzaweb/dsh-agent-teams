# Walkthrough: Custom Model Selection for Captain and Members

Implemented full end-to-end custom LLM model selection support for both Captain and Member subagents in `dsh-agent-teams`.

## Key Changes

### 1. Data Model & Plugin Configuration
- Extended `Config` in [`src/index.ts`](file:///home/theanh/projects/dsh-agent-teams/src/index.ts) with `captainProvider`, `captainModel`, `captainReasoningEffort`, and `memberReasoningEffort`.
- Extended `TeamState` in [`src/types.ts`](file:///home/theanh/projects/dsh-agent-teams/src/types.ts) with `captainProvider`, `captainModel`, and `captainReasoningEffort`.
- Documented configuration examples in [`cordis.patch.yml`](file:///home/theanh/projects/dsh-agent-teams/cordis.patch.yml).

### 2. Runtime Model Resolution & Session Binding
- In [`src/members.ts`](file:///home/theanh/projects/dsh-agent-teams/src/members.ts):
  - Added `resolveCaptainLlmSelection` and `CaptainLlmSelectionRequest`.
  - Exported `modelSelection` helper for wrapping `ModelSelection`.
  - Updated `resolveMemberLlmSelection` to support `defaultProvider` and `defaultReasoningEffort`.
- In [`src/tools.ts`](file:///home/theanh/projects/dsh-agent-teams/src/tools.ts):
  - Updated `agent_teams_create` parameters to accept `captain_provider`, `captain_model`, `captain_reasoning_effort`.
  - Bound `installModelSelection` dynamically to `captain.ctx` on team creation.
  - Forwarded member defaults in `agent_teams_add_member`.

### 3. Slash Command & Gesture Boundary Flag Parsing
- In [`src/command.ts`](file:///home/theanh/projects/dsh-agent-teams/src/command.ts):
  - Added `parseAgentTeamsArgs` to parse command-line flags (`--captain-model`, `--member-model`, `--captain-provider`, `--member-provider`, `--model`, etc.).
  - Updated `buildActivationDirective` to format directives with specified model overrides.

### 4. State Snapshot & Web GUI Activity Panel
- In [`src/snapshot.ts`](file:///home/theanh/projects/dsh-agent-teams/src/snapshot.ts) and [`src/client/activity-monitor.ts`](file:///home/theanh/projects/dsh-agent-teams/src/client/activity-monitor.ts):
  - Added captain and member model fields to `TeamActivitySnapshot` and `TeamActivityMember`.
- In [`src/client/ActivityPanel.tsx`](file:///home/theanh/projects/dsh-agent-teams/src/client/ActivityPanel.tsx) & [`src/client/ActivityPanel.module.css`](file:///home/theanh/projects/dsh-agent-teams/src/client/ActivityPanel.module.css):
  - Added `.modelChip` styled badge rendering for Captain and Member cards.

### 5. Automated Tests & Verification
- Added test coverage in [`scripts/verify.mjs`](file:///home/theanh/projects/dsh-agent-teams/scripts/verify.mjs) for:
  - `resolveCaptainLlmSelection` (default snapshot, custom route, config defaults).
  - `parseAgentTeamsArgs` and flag token extraction.
  - `buildActivationDirective` formatting.
- Executed `pnpm typecheck`, `pnpm build`, and `pnpm verify` — all checks passed.

## Verification Results

```bash
$ pnpm typecheck
$ pnpm build
$ pnpm verify

dsh-agent-teams offline verification
  PASS  cordis.patch.yml name matches the published package name
  ...
  PASS  captain default route snapshots current session model and effort
  PASS  captain custom route uses target model default effort
  PASS  captain config default model and effort take effect
  PASS  parseAgentTeamsArgs extracts model flags and goal
  PASS  parseAgentTeamsArgs sets both captain and member model on --model
  PASS  buildActivationDirective includes captain and member model directives
  PASS  #20: spawn receives the resolved per-member provider and model
  PASS  fresh child request receives the resolved reasoning effort
  PASS  cold-resumed child restores provider, model, and reasoning from team.json
all checks passed
all lifecycle checks passed
all complex stress checks passed
DSH skill mirror is up to date.
```
