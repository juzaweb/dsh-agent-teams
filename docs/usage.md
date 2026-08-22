<p align="right">
  <strong>English</strong> · <a href="./usage_ZH.md">简体中文</a>
</p>

# Usage Guide (Detailed)

This document contains comprehensive details on using `dsh-agent-teams`: how it works, Web UI behavior, tool reference, configuration, and known limitations. The main README keeps a concise overview and quick start.

## How It Works

`dsh-agent-teams` reuses DeepSeek Harness capability seams without requiring an external workflow engine:

| DSH Capability | AgentTeams Usage |
|---|---|
| `ctx.tools` registry | Registers 10 `agent_teams_*` tools (same registration pathway as `tool-workflow`) |
| `ctx.subagents.startContinuable()` | Creates members: durable continuable subagents with custom personas |
| `ctx.subagents.followup()` | Wakes recipient members (delivering messages into their next turn) |
| Persistent roster + `ctx.agents` | Roster stores durable member identity; `ctx.agents` provides live `running / idle / ready` activity state (independent of volatile subagent directory projections) |
| `agent/status` | Wakes idle members to automatically claim ready tasks from the shared pool |
| `ctx.systemPrompt.section()` | Registers the "AgentTeams Usage Protocol" prompt section |
| Web server route registration | Activity panel state route `/plugins/dsh-agent-teams/state` + static whale artwork delivery (`webServer`/`httpServer` dual-key compatible, see below) |
| File system | Team state persisted under `<workspace>/.agent-teams/<teamId>/` |

Data pipeline: Tool execution → Disk state (source of truth) → Host snapshot route → Browser floater polls every 1s; Session log simultaneously records `agent-teams/*` events (for audit, replay, and post-session review).

> **Beta Version Compatibility**: In npm `latest` (`0.0.1-rc.1`), the web server service key is `ctx.httpServer` / `ctx.workspace`, while in `next` (`rc.2`) it was renamed to `ctx.webServer` / `ctx.workspaceRegistry`. The plugin probes both keys (new key preferred, old key fallback, and listens to `internal/service` events for both), allowing route registration in both releases.

### Web UI

- **Top-right Activity Panel** (`shell.overlay` non-modal floater): Automatically expands once when team activity begins. By default, it docks at the right side of the conversation column, expanding in height with content up to the safe viewport limit before scrolling internally—avoiding empty whitespace filling the screen. The panel can be toggled into a floating window and moved freely, with left-edge resizing in docked mode and corner/bottom resizing in floating mode; manual vertical resizing fixes the height. Position, dimensions, and dock mode persist across page refreshes. The header collapse button folds the panel into a compact badge (team count + activity pulse). Each team displays its captain, segmented overall progress, status counts, collapsible member roster, and a compact task DAG. The DAG connects dependencies using SVG curved paths with hover/keyboard focus to preview full upstream/downstream chains, click to pin, and `Esc` to unpin. Selecting a node shows its assignee, unsatisfied dependencies, and downstream unlocks. Member rows display role artwork, personas, live status, and task chips, with click-to-open member subagent transcripts.
- **Whale Mascot Artwork**: DeepSeek whale illustrations (`assets/agent-teams/`, 8 roles + 6 actions) matched against role keywords. Action badges animate based on member activity (working float / idle breathing / unknown thinking), with unread notification halos, following `prefers-reduced-motion`.
- **Session Scoping**: The panel displays teams for the **current conversation** only (matched by captainSessionId); opening a new session automatically collapses the panel, and switching back restores it.
- **Conversation Card**: When a team is created, a lightweight card appears in the chat transcript with member avatars, click-to-open subagent sessions, and an "Activity Panel" button to re-summon a folded monitor.
- **Historical Review**: `agent_teams_delete` **archives** the team (`<stateRoot>/archive/<teamId>/`, preserving members, tasks, dependency graphs, and mailboxes). Ended members are marked as removed but remain addressable in the Harness subagent catalog for transcript history. Historical snapshots show the entire team in delivered/idle status. Re-opening an old captain session performs a cold discovery pass to restore the member tree and DAG even if conversation cards are absent.

### Team State Directory

```
<workspace>/.agent-teams/<teamId>/
├── team.json            # Team record: members, tasks (with dependencies), task sequence
└── inbox/
    ├── captain.jsonl    # Captain mailbox (members → captain)
    └── <member>.jsonl   # One mailbox per member (JSONL)
```

Task state machine: `pending → claimed → in_progress → completed | failed | cancelled`. Each execution carries a monotonic `attempt` number and unique `attemptId`. Reassignment revokes the old attempt, interrupts the old owner, and waits for quiescence before dispatching to a new owner, preventing stale results from overwriting newer work. Dependencies are validated before claiming, and members are restricted to one active unfinished task at a time.

## Tool Reference

| Tool | Purpose |
|---|---|
| `agent_teams_create` | Creates a team; the caller becomes the captain (one active team per captain) |
| `agent_teams_add_member` | Spawns a durable continuable member subagent with a role persona |
| `agent_teams_remove_member` | Safely removes a member: revokes attempt, reclaims unfinished tasks, quiesces execution, and reschedules |
| `agent_teams_create_task` | Creates a task with optional `dependencies` and `assignee` |
| `agent_teams_reassign_task` | Atomically retries or reassigns a task; `assignee=captain` safely takes over |
| `agent_teams_claim_task` | Claims a task (validates dependencies; captain can proxy-claim, members claim assigned/open tasks) |
| `agent_teams_update_task` | Advances a task with the current `attempt_id`; rejects stale attempts and terminal overrides |
| `agent_teams_send_message` | Peer-to-peer message: delivers directly to recipient's mailbox and wakes them (no captain relay; rejects spoofed `from`) |
| `agent_teams_status` | Comprehensive team overview: member activities, tasks, captain inbox, unread counts |
| `agent_teams_delete` | Shuts down the team: interrupts members and **archives** state on disk |

`agent_teams_add_member` requires no model parameters by default: members inherit the captain's current LLM provider/model and snapshot the captain's current reasoning effort. When a specific role requires a different model, optional `provider` + `model` parameters can be supplied (omitting provider keeps the captain's provider). Changing provider or model automatically uses the target model's default reasoning effort; explicit `reasoning_effort` can be passed if requested. No interactive modal or popup interrupts execution.

## Configuration

Override in your profile's `cordis.patch.yml`:

```yaml
- id: agent-teams
  config:
    stateDir: .agent-teams        # State directory name under workspace
    memberProvider: spawn         # Subagent runtime provider (spawn / fork), not LLM provider
    memberModel: deepseek-v4      # Optional: member model override
    memberMaxDepth: 1             # Member delegation depth cap (0 = disabled)
    maxMembers: 8                 # Team size cap
```

Precedence: Member explicit `provider` + `model` / `model` → `memberModel` → Captain current route. Same-route members inherit captain reasoning effort; cross-route members use target model default effort. Explicit `reasoning_effort` overrides defaults and is validated prior to spawn. Active configuration is written to `team.json` for status queries and cold recovery.

## Usage Protocol

The system prompt guides the model through the teamwork protocol: Classify Scope → Context Grounding & Synthesis → Interactive Confirmation (Standard/Deep) → Assemble Team & Create Tasks → Scheduler dispatches ready tasks to idle members → Captain monitors and guides → Multi-lens Code Review → Report results to user and `agent_teams_delete`. Members message each other directly without bottlenecking on the captain. If a member becomes idle/ready after an interruption while still owning an open task on disk, the scheduler revokes the stale capability, issues a fresh attempt, and wakes the member again.

### Scope Tiers & Interactive Plan Confirmation

- **Lightweight (Fast-path)**: For localized bugfixes or single-file tweaks, Captain proceeds directly to team creation and task execution in turn 1 without pausing.
- **Standard & Deep (Confirmation Gated)**: For multi-component features, architectural changes, or complex DAGs, Captain presents the Scoping Synthesis, proposed Team Roster, and Task DAG (with dependencies and file scopes), pausing for explicit user approval before spawning members or creating tasks.

### Parallel Task Execution & Multi-Worker Scaling

- **Concurrent Dispatch**: The event-driven scheduler simultaneously claims and dispatches ready tasks to all currently available `idle` members. When multiple tasks in a DAG wave have satisfied dependencies, they will run in parallel provided multiple worker members exist.
- **Worker Sizing & Naming**: When a mission contains multiple independent subtasks in a wave (e.g. creating tests across separate modules), the Captain should spawn dedicated workers (`engineer_1`, `engineer_2`, `engineer_3` or domain-specific names `test_engineer`, `ui_engineer`) rather than assigning all tasks to a single worker. A concurrency cap of 3–4 workers per wave is recommended to avoid LLM API rate limits.
- **Disjoint File Scopes**: For parallel tasks running concurrently, each task's description must explicitly designate non-overlapping target files and directories to eliminate write collisions and merge conflicts.
- **Quality Gates Convergence**: Convergence tasks such as Code Simplification (`simplifier`) and Code Review (`reviewer`) must depend on all upstream parallel task IDs (e.g. `dependencies: ["t2", "t3", "t4"]`) before beginning their audits.

## Known Limitations

- Task scheduling is event-driven rather than background polling; if the captain goes offline, members cannot be resumed until the captain restarts or queries status.
- One active team per captain session (consistent with Claude Code AgentTeams).
- Member personas replace the deployment default persona; members retain the full toolset (bash, fs, web, etc.).
- Team state uses filesystem-level persistence; concurrent multi-process access to the same team is not guaranteed (single DSH processes serialize writes with locks).
- The activity panel reads disk state directly, independent of the session event stream. It performs cold discovery on session switch/restart, and polls every 1s only while teams are active or conversation cards require it.
- The top-right floater mounts into DeepSeek Harness `0.1.0-rc.8` `shell.overlay`; wide viewports yield conversation column width, floating mode stays non-modal, and compact screens fallback to an inset overlay with fixed controls.
- Member models might not always invoke strict tool lifecycle rituals (e.g. finishing without `agent_teams_update_task`)—the panel reflects disk reality, and the captain reconciles via `agent_teams_status` and files.

## Verification

- Offline & Lifecycle: `pnpm build && pnpm typecheck && pnpm verify`. Includes comprehensive stress matrices across 8 members and a 31-node DAG (extending to 38 tasks): concurrent takeovers/removals, 50 stale writes, cold restart of 4 open tasks, 7-way claim races, 40 terminal overrides, 42-message bursts, and archive shutdown. Composition check: `dsh --profile agent-teams-check --dump-config`.
- Real End-to-End: `dsh plugin --profile headless add <path>` then `dsh --profile headless "Use AgentTeams to ..."` and inspect `.agent-teams/` files and session logs.
- GUI: Dedicated instance + ego-browser (see `verification-guide.md`).
