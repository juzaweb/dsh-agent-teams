<p align="right">
  <strong>English</strong> · <a href="./readme-writing-guide_ZH.md">简体中文</a>
</p>

## DSH Plugin README Writing Guidelines

> A chapter template and writing standard for coding agents when drafting README documentation for DeepSeek Harness plugins.
> Distilled from multiple iterations of the `dsh-agent-teams` production README (covering features, architecture, UI, tools, installation, configuration, usage, verification, and limits), aligned with the concise, tabular style of in-tree DSH packages (`packages/preset`, `packages/bundle`, `packages/client/ui-workflow-run`).

### 0. Language & Length Strategy

- **Standalone plugin projects** (user-facing, such as `dsh-agent-teams`): Provide bilingual documentation (`README.md` in English, `README_ZH.md` in Chinese) with technical terms, commands, and tool identifiers remaining consistent.
- **In-tree DSH packages** (`packages/*/README.md`): Primarily English, with a concise one-paragraph summary, structured sections, and clear tables. In-tree READMEs target maintainers and contributors rather than end-user tutorials.
- Both formats share identical section hierarchy; detail depth adjusts based on target audience.
- Length: Standalone plugin READMEs should ideally stay within 200–400 lines. Exceeding this indicates unnecessary internal implementation details (see §2).

### 1. Section Structure Template (Top-Level Headings)

| Order | Section | What to Include | What to Avoid |
|---|---|---|---|
| 1 | Introduction (under title) | One-sentence value proposition (what users can do after installing) + 3–5 core features (bold keywords) | Version history, roadmaps, acknowledgments |
| 2 | `## How It Works` | Capability seams table + one-line data flow + one-line state machine (see §2) | ASCII architecture diagrams, source code dumps |
| 3 | `## Web UI` (if applicable) | Panel structure, mount points, key interactions, data link | Individual CSS classes or raw animation parameters |
| 4 | `## Tool Reference` | Table: Tool name \| Purpose (one sentence with key semantics/boundaries) | Full raw JSON parameter schemas |
| 5 | `## Installation` | Commands + effective time (restart/HMR) + alternative methods | Build chain internals |
| 6 | `## Configuration` | Option table + concise YAML snippet | Code citations for every config field |
| 7 | `## Usage` | One paragraph + 1 copyable prompt example | Full verbose multi-turn chat transcripts |
| 8 | `## Verification` | Three tiers: 0 Real verification records / 1 Offline / 2 End-to-end (see §4) | Claiming unverified items as verified |
| 9 | `## Known Limitations` | Each item = Symptom + Root cause/Impact + Mitigation (see §5) | Self-criticism or unmitigated complaints |
| 10 | `## License` | License name | — |

### 2. How to Write "How It Works"

**Begin with a Capability Seams Table** (this is the architectural language of DSH plugins—everything is a plugin, capabilities are seams):

```markdown
`<plugin-name>` reuses DeepSeek Harness capability seams rather than reinventing them:

| DSH Capability | Plugin Usage |
|---|---|
| `ctx.tools` registry | Registers N `xxx_*` tools (same registration pathway as `tool-workflow`) |
| `ctx.subagents.startContinuable()` | Spawns members: durable continuable subagents |
| `ctx.systemPrompt.section()` | Registers the usage protocol prompt section |
| `ctx.httpServer.register()` | Serves panel data route `/plugins/xxx/state` |
| File system | Persists state under `<workspace>/.xxx/<id>/` |
```

- List **only capabilities actually used**, with a one-sentence "DSH Capability → Plugin Usage" mapping per row. This is the fastest way for readers to understand how the plugin integrates.
- Follow up with a **one-line data flow**: "Tool execution → Disk state (source of truth) → Host snapshot route → Browser polling render. Session log events recorded concurrently (for replay/audit)."
- Add a **one-line state machine**: "Task state machine: `pending → claimed → in_progress → completed | failed | cancelled`, with validated transitions."
- Reference file paths (e.g. `src/snapshot.ts`) rather than inlining source blocks.
- **Avoid**: Huge ASCII/plantuml diagrams, implementation detail dumps (locks, queues, retry loops), or re-explaining generic DSH concepts.

### 3. Installation & Configuration

**Installation commands must be copyable** (clear paths or commands):

```markdown
```sh
cd /path/to/<plugin>
pnpm build            # Produces lib/
dsh plugin --profile web add /absolute/path/to/<plugin>
```
```

- Explain in one sentence what occurs (`dsh plugin` installs into the profile and adds to `dsh.profile.bundles`; the bundle patch mounts the plugin row).
- **Explicitly state effective time**: "> Note: `dsh plugin` updates the profile manifest; **restart the DSH instance** to load the plugin."
- Structure configuration with a **table + YAML snippet**:

```markdown
| Field | Default | Description |
|---|---|---|
| `stateDir` | `.agent-teams` | State directory name under workspace |
| `memberProvider` | `spawn` | Subagent runtime provider |
| `memberMaxDepth` | `1` | Subagent delegation depth limit (`0` = disabled) |
```

- **Place compatibility notes in blockquotes** (Reusable Pattern #4):

```markdown
> Compatibility Note: This plugin discovers browser bundles via package.json `dsh.client` and
> `exports["./client"]`. If targeting a different DSH release, verify its client-modules behavior first.
```

### 4. Verification Section Standards (Three Tiers)

The verification section establishes plugin reliability and must be **tiered and honest about verified status**:

| Tier | Heading | Content | Prerequisite |
|---|---|---|---|
| 0 | `### 0. Verified on Dedicated Instance` | Verified checklist (model, command, artifacts), **each being an executed fact** | Actually executed |
| 1 | `### 1. Offline Verification (No services required)` | Copyable build, smoke test, and composition check commands | None |
| 2 | `### 2. End-to-End Verification (Requires restart)` | Step-by-step GUI / headless verification steps for users | At user's convenience |

- **Tier 0 Checklist Items**:
  - Headless profile e2e: `dsh --profile headless "..."` (real LLM driving full workflow)
  - Persistence & log audit: Session log contains expected event stream (event names and counts: `team-created ×1, member-added ×2...`)
  - UI loading pipeline: Browser bundle discovery, `GET /plugins/xxx/client.js → 200`, data route payload validation
  - GUI e2e: Real browser automated actions (auto-expansion, updates, collapse), with screenshots
- **Command Formatting**: Direct copyable snippets (`cd /path/...` prefix, comments with expected output).
- **Principle**: Tier 0 records real facts; Tier 1 allows developer self-check; Tier 2 guides user reproduction.

### 5. How to Write Known Limitations

- Each limitation = **Symptom + Root cause/Impact + Mitigation**, expressed in a single bullet. Example:
  - "Members only act when woken by messages; there is no constant background polling. If the captain goes offline, messages remain queued in mailboxes until resumed." (Symptom → Impact → Mitigation)
  - "Member LLMs might not always strictly follow tool rituals (e.g. completing work without calling `update_task`). The UI reflects disk state, and the captain reconciles via `agent_teams_status`."
- **Why this matters**: Limitations define the negative space of the contract—answering questions upfront ("Why isn't the task marked finished yet?") and preventing intentional trade-offs from being misidentified as bugs.
- List **real architectural limits**: design choices (file persistence, 1 team per captain), platform requirements (`shell.overlay`, responsive concessions), and model behavior boundaries.

### 6. Five Reusable Patterns (Distilled from `dsh-agent-teams`)

1. **Start with Capability Seams**: Explain architecture using a "DSH Capability | Plugin Usage" table.
2. **Make Commands Copyable**: Use absolute paths or clean commands with comments indicating expected outputs.
3. **Isolate Compatibility in Blockquotes** (`> Compatibility Note: ...`): Keep environment-specific notes cleanly separated from main documentation.
4. **Compress State Machines & Data Flow**: Express pipelines in concise single-line representations.
5. **Lead Verification with Real Facts**: Structure verification clearly (Tier 0 Real Verification → Tier 1 Offline → Tier 2 User E2E).

### 7. Completion Checklist

- [ ] Introduction answers what users can accomplish after installing
- [ ] How It Works starts with a capability seams table, with 1-line data flow and state machine
- [ ] Installation commands are copyable and clearly state when changes take effect (restart)
- [ ] Configuration includes a field/default/description table
- [ ] Verification is divided into three tiers with factual Tier 0 records
- [ ] Every known limitation includes a clear mitigation path
- [ ] No raw source code dumps, huge diagrams, or internal implementation clutter
