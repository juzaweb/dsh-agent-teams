---
title: "Parallel Task Execution and Multi-Worker Scaling in AgentTeams"
created_at: "2026-08-22T19:01:00+07:00"
topic: "agent-teams-parallel-execution"
type: "feature"
artifact_contract: "ce-unified-plan/v1"
artifact_readiness: "implementation-ready"
product_contract_source: "ce-brainstorm"
execution: "code"
---

## Goal Capsule

- **Objective:** Enable multi-agent teams in `dsh-agent-teams` to execute independent tasks concurrently across multiple worker agents, reducing overall mission execution latency.
- **Means:** Enhance the Captain decomposition protocol in `src/brainstorm.ts` and documentation to intelligently spawn parallel workers (`engineer_1`, `engineer_2` or domain-specific workers like `test_engineer`), assign disjoint task boundaries, and leverage the event-driven scheduler.
- **Product Authority:** Pinned requirements in this document govern the protocol and assignment behaviors; low-level scheduler internals are in scope only as supporting guarantees.
- **Open Blockers:** None.

---

## Product Contract

### Summary

In `dsh-agent-teams`, task dependency graphs support parallel branching (e.g. `t1` branching into `t2`, `t3`, `t4`), but because Captain usage prompts historically instructed spawning only a single `engineer` member and assigning all implementation tasks to that same assignee, all ready parallel tasks executed sequentially on that single worker. This feature enriches the Captain protocol and task decomposition guidelines to spawn multiple specialized or numbered workers per wave, assign non-overlapping file scopes, and enforce safe concurrency caps (3–4 workers max per wave).

### Problem Frame

When a mission involves multiple independent tasks in a wave (such as writing tests for different controllers or creating independent components):
1. The DAG properly identifies that tasks are ready in parallel once prerequisite wave finishes.
2. However, single-assignee assignment bottlenecks the entire parallel wave on a single worker's turn lifecycle.
3. Users expect independent subtasks to run in parallel across multiple subagents.

### Key Decisions

- KTD1. session-settled:captain-protocol-enhancement **Captain Protocol & Decomposition Enhancement:** The primary mechanism for parallel execution is guiding the Captain agent during Phase 0 and Phase 3 to assess wave parallelism, spawn corresponding worker members, and assign distinct tasks.
- KTD2. session-settled:worker-naming-strategy **Dual Worker Naming Convention:** Captain will name workers by domain specialty (e.g. `test_engineer`, `ui_engineer`) when tasks differ in nature, or by numbered sequence (e.g. `engineer_1`, `engineer_2`) when parallel tasks share the same core role.
- KTD3. session-settled:file-disjointness-rule **Disjoint File Scope Rule:** Every parallel task specification must explicitly define distinct, non-overlapping target files to avoid merge conflicts and race conditions across concurrent subagents.
- KTD4. session-settled:concurrency-cap **Safe Wave Concurrency Cap:** Recommend a limit of 3–4 concurrent workers per wave to balance throughput against LLM API rate limits and host memory.

### Requirements

#### Worker Provisioning & Team Assembly
- R1. Captain protocol MUST instruct the Captain to identify independent, parallelizable subtasks during Phase 0 & Phase 3 decomposition.
- R2. When 2 or more independent tasks exist in a wave, Captain MUST spawn dedicated worker members corresponding to the parallel branches (up to the concurrency cap).
- R3. Worker naming MUST use domain-specific names (`test_engineer`, `feature_engineer`) or numbered suffixes (`engineer_1`, `engineer_2`).
- R4. Captain MUST NOT spawn more than 4 concurrent worker members for a single wave by default to prevent API throttling.

#### Task Decomposition & Assignment
- R5. Parallel tasks MUST have disjoint target file scopes clearly documented in their descriptions.
- R6. Captain MUST assign each parallel task to its dedicated worker member or leave tasks unassigned in the shared pool when worker pool members are homogenous.
- R7. Shared review and simplification gates (`reviewer`, `simplifier`) MUST depend on all parallel worker tasks in the wave completing before starting the review phase.

#### Guidance & Observability
- R8. Protocol prompt in `src/brainstorm.ts` MUST provide concrete multi-worker DAG decomposition examples showcasing parallel waves.
- R9. Documentation and developer guidelines MUST clearly explain the relationship between DAG task dependencies, worker member concurrency, and the scheduler dispatch mechanism.

### Key Flows

- F1. Parallel Wave Decomposition Flow
  - **Trigger:** Captain receives a mission requiring multiple independent tasks (e.g., unit tests for 3 distinct controllers).
  - **Actors:** Captain, Worker Agents (`engineer_1`, `engineer_2`, `engineer_3`), Reviewer.
  - **Steps:**
    1. Captain creates team and identifies 3 independent test creation tasks.
    2. Captain spawns `researcher`, `engineer_1`, `engineer_2`, `engineer_3`, and `reviewer`.
    3. Captain creates `t1` (Research, assignee: `researcher`, deps: `[]`).
    4. Captain creates `t2` (assignee: `engineer_1`, deps: `["t1"]`), `t3` (assignee: `engineer_2`, deps: `["t1"]`), `t4` (assignee: `engineer_3`, deps: `["t1"]`).
    5. Captain creates `t5` (Code Review, assignee: `reviewer`, deps: `["t2", "t3", "t4"]`).
    6. When `t1` completes, Scheduler concurrently kicks `engineer_1`, `engineer_2`, and `engineer_3`.
    7. All 3 workers execute simultaneously on disjoint files.
    8. Once all 3 finish, `t5` becomes ready and Reviewer audits the unified changes.
  - **Outcome:** Total execution time for the wave drops from `O(N)` sequential turns to `O(1)` concurrent turns.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7, R8.

### Scope Boundaries

- **In Scope:**
  - Updates to `buildCaptainUsageProtocol` in `src/brainstorm.ts`.
  - Guidelines and concrete multi-worker examples in Phase 0, Phase 3, and Phase 4 sections of the protocol.
  - File collision prevention guidelines in task creation prompt.
- **Out of Scope (Deferred):**
  - Automatic kernel-level autoscaling in `scheduler.ts` (scheduling already supports concurrent dispatch if multiple members exist).
  - Git branch/worktree isolation per subagent (handled by file disjointness convention).

### Acceptance Examples

- AE1. Parallel Wave Scheduling
  - **Given:** A team with 3 idle worker members (`engineer_1`, `engineer_2`, `engineer_3`) and 3 pending tasks (`t2`, `t3`, `t4`) whose dependencies (`t1`) are satisfied.
  - **When:** Scheduler evaluates ready tasks via `kickTeam`.
  - **Then:** All 3 members transition to `working` concurrently, and each receives their respective task ticket.

---

## Planning Contract

### High-Level Technical Design

The core execution engine in `dsh-agent-teams` (`src/scheduler.ts`) already implements atomic task claiming and concurrent member wakeups via `kickTeam(workspace, teamId)`. When multiple members are idle and multiple tasks are pending with satisfied dependencies, `kickTeam` iterates through all available members and dispatches ready tasks simultaneously.

The bottleneck was entirely in the prompt protocol layer: `buildCaptainUsageProtocol` in `src/brainstorm.ts` only instructed Captain to add a single `engineer` member and statically wire single-assignee sequential chains. By upgrading the prompt to teach the Captain about:
1. Concurrency-aware team provisioning (multi-worker spawning based on wave breadth).
2. Parallel DAG branch decomposition (mapping independent tasks to distinct assignees).
3. File-scope isolation (mandating non-overlapping target files per parallel worker).
4. Multi-dependency convergence (wiring review gates to depend on all parallel task IDs `["t2", "t3", "t4"]`).

We achieve fully parallel subagent execution without breaking backward compatibility or complicating the state lock engine.

### Assumptions & Risks

- **LLM Rate Limits:** Spawning too many concurrent subagents can hit API concurrency/token limits. Mitigated by recommending a cap of 3–4 concurrent workers per wave.
- **File Overwrites:** Concurrent workers modifying the same files will cause race conditions. Mitigated by strict file disjointness instructions in the prompt protocol.

---

## Implementation Units

### U1. Enhance Captain Usage Protocol in src/brainstorm.ts
- **Goal:** Update `buildCaptainUsageProtocol` in `src/brainstorm.ts` with comprehensive guidelines for multi-worker parallel execution, naming conventions, disjoint file scopes, and updated DAG examples.
- **Target Files:** `src/brainstorm.ts`
- **Details:**
  - Update `PHASE 0`: Emphasize determining wave concurrency during initial team assembly.
  - Update `PHASE 3`:
    - Add rule for spawning multiple specialized or numbered workers (`engineer_1`, `engineer_2`, etc.) when tasks in a wave are independent.
    - Add rule for strict file disjointness in parallel task descriptions.
    - Update the Phased DAG Task Decomposition example to demonstrate parallel branching:
      - `Wave 1`: `t1` (Research) -> `[]`
      - `Wave 2 (Parallel)`: `t2` (`engineer_1`, deps: `["t1"]`), `t3` (`engineer_2`, deps: `["t1"]`), `t4` (`engineer_3`, deps: `["t1"]`)
      - `Wave 3`: `t5` (`simplifier` or `engineer_1`, deps: `["t2", "t3", "t4"]`)
      - `Wave 4`: `t6` (`reviewer`, deps: `["t5"]`)
      - `Wave 5`: `t7` (`captain`, deps: `["t6"]`)
  - Update `PHASE 4`: Add guidance for monitoring parallel workers and verifying all parallel deliverables before review gates.
- **Verification:** Unit tests and TypeScript compilation pass.

### U2. Update Documentation & Usage Guides
- **Goal:** Document the parallel task execution pattern and multi-worker team sizing guidelines in `docs/usage.md` and `README.md`.
- **Target Files:** `docs/usage.md`, `README.md`
- **Details:**
  - Explain how AgentTeams executes parallel DAG branches concurrently when multiple worker agents exist.
  - Provide best practices for avoiding file conflicts and managing concurrency limits.
- **Verification:** Markdown formatting and link validity check.

---

## Verification Contract

| Check | Command | Expected Outcome |
|---|---|---|
| Typecheck & Build | `pnpm run build` | Zero TypeScript errors, clean bundle emission |
| Test Suite | `pnpm test` | All existing unit/integration tests pass |

---

## Definition of Done

- [x] Product Contract and Planning Contract fully articulated with no open blocking questions.
- [ ] `buildCaptainUsageProtocol` in `src/brainstorm.ts` contains parallel multi-worker spawning, file disjointness, and parallel DAG examples.
- [ ] Usage documentation describes parallel execution and best practices.
- [ ] `pnpm run build` succeeds cleanly.
