<p align="right">
  <strong>English</strong> · <a href="./verification-guide_ZH.md">简体中文</a>
</p>

## Verifying DSH Plugin Readiness (Practical Methodology)

> Distilled from the complete verification process of `dsh-agent-teams` (multi-agent coordination + Web UI activity panel).
> All commands have been executed in practice; every pitfall is documented at its corresponding step. Principle: **Do not touch running production instances; run tests on isolated profiles, dedicated ports, and temporary directories, and clean up afterward.**

### Verification Pyramid Overview

Four tiers from bottom to top; each tier must pass before proceeding to the next:

1. **Offline**: Dual-program typecheck + build + smoke scripts (pure logic, temp directories, self-cleaning)
2. **Composition**: `dsh --profile <scratch> --dump-config` verifying the bundle patch composes into the configuration tree (no boot, no instance mutations)
3. **Real End-to-End**: Dedicated headless profile + genuine LLM tasks + persistence and event auditing
4. **GUI**: Dedicated web instance + ego-browser driving real browsers (roster → routes → DOM probes → screenshots)

---

### 1. Offline Verification

#### 1.1 Dual-Program Typecheck

DSH plugins typically combine **host logic** (Node: tools, routes) and **browser components** (React components, Conversation Nodes). These import conflicting type declarations (most notably: host `dsh-session` declares `Context.sessions: SessionStore`, whereas browser runtime declares `Context.sessions: ISessions`). **They must be separated into two independent tsc programs**:

```jsonc
// tsconfig.json (host): include src, exclude ["src/client"]
// tsconfig.client.json: extends ./tsconfig.json + jsx react-jsx + lib DOM + types []
//     include ["src/client", "src/event-types.ts", "src/css-modules.d.ts"]
```

```sh
tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit   # Both must report 0 errors
```

Pitfalls:
- **`.ts` files do not parse JSX**: Client entry points containing JSX must be named `index.tsx` (an `index.ts` file parses `<Component` as a less-than comparison and fails with `TS1005 '>' expected`, regardless of jsx compiler options).
- **`declare module` augmentation requires module loading**: Augmenting `SessionEventMap` in `declare module '@deepseek-ai/dsh-session/types'` requires the target module to be loaded into the program—add `import type {} from '...'` at the top (type imports load module declarations and are erased from emitted output).
- **Narrowing lost in nested closures**: Using `match.event.data.x` inside a `.map((m) => ...)` callback loses discriminated union narrowing—extract `const x = match.event.data.x` after the guard before using it inside closures.
- **Type resolution targets**: Symlinks under `profiles/node_modules/@deepseek-ai/*` can become stale. Link `node_modules/@deepseek-ai/<pkg>` directly to **source package directories in the checkout** (`lib/types` containing canonical types).

#### 1.2 Build (tsc + tsdown client bundle)

```jsonc
// package.json scripts
"build": "tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown",
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit",
"verify": "node scripts/verify.mjs"
```

- `tsc` outputs `lib/` (host ESM executable) and `lib/types/` (declarations).
- `tsdown` bundles `lib/client/index.js` into the browser bundle `lib/client.js` (protocol: CJS closure-factory, `window.__ModuleLoader__.load({ id, factory })`; externalizing platform modules `react` and `@deepseek-ai/dsh-client-*`; CSS Modules compiled via `lightningcss` and injected into `<style data-plugin>`).
- Post-build smoke check: `node -e "import('./lib/index.js').then(m => console.log(Object.keys(m)))"` should display `name/inject/Config/apply`.

#### 1.3 Smoke Scripts (scripts/verify.mjs)

Zero external dependencies, self-cleaning temporary directories, and fast deterministic execution:

```js
#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { /* pure functions under test */ } from '../lib/state.js'

let failures = 0
function check(label, condition, detail = '') {
  if (condition) console.log(`  PASS  ${label}`)
  else { failures += 1; console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
}

// 1) Pure rules: state transitions, dependency gating, key sanitization
// 2) File persistence: mkdtemp temp root → createTeamDir/readTeam/mailbox roundtrip →
//    archive/delete → finally { rm(stateRoot, { recursive: true, force: true }) }
// 3) Projections: import from lib/ (task stages, relationship chains, cycle-safety)
// 4) Browser fold logic: verify deterministic state folds without React runtime

if (failures > 0) { console.error(`\n${failures} check(s) FAILED`); process.exit(1) }
console.log('\nall checks passed')
```

#### 1.4 Composition Check: dump-config (Offline, No Boot)

Validate bundle patch composition using a **dedicated scratch profile**:

```sh
mkdir -p ~/.dsh/profiles/agent-teams-check/node_modules
ln -sfn /absolute/path/to/plugin ~/.dsh/profiles/agent-teams-check/node_modules/<pkg>
cat > ~/.dsh/profiles/agent-teams-check/package.json <<'EOF'
{ "name": "dsh-profile-check", "private": true, "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "<pkg>"] } } }
EOF
printf '[]\n' > ~/.dsh/profiles/agent-teams-check/cordis.patch.yml

dsh --profile agent-teams-check --dump-config | grep -A 4 "id: agent-teams"
```

- `--dump-config` runs **offline composition** (`composeEntries` applying patch layers) without booting services.
- The output should clearly show `- id: <plugin-row>` with its config.

---

### 2. Real End-to-End Verification (Isolated Profile + Genuine LLM)

#### 2.1 Install into Isolated Profile

```sh
dsh plugin --profile headless add /absolute/path/to/plugin
dsh --profile headless --dump-config   # Confirm plugin row is mounted
```

Testing on real execution often reveals **mount timing nuances**: under concurrent activation by the Loader, sibling effects (like provider registrations in `subagent-spawn`) might settle after `apply`. **Defer fail-loud checks to first usage** (e.g. `ctx.subagents.getProvider(name)` during the first spawn call).

#### 2.2 Task Execution Design

```sh
mkdir -p /tmp/agent-teams-e2e && cd /tmp/agent-teams-e2e
dsh --profile headless "Use AgentTeams to complete a small task: create a team named 'Title-Review', add 2 members (alice for research, bob for drafting), create 2 tasks (t2 depends on t1) assigned to them, wake them to complete the work, and summarize results. Keep tasks concise."
```

Design principles:
- **Keep tasks small**: Explicitly instruct members to do simple work to keep execution under 1–3 minutes.
- **Explicitly name protocol steps**: Request the team creation, task assignment, dependency wiring, and deletion steps.
- **Run in isolated working directories**: (e.g. `/tmp/...`).
- **Validate success**: Output contains complete execution narrative and verified event log streams.

#### 2.3 Persistence & Event Auditing

```sh
# State directory audit
ls -la /tmp/agent-teams-e2e/.agent-teams/

# Session directories
ls -lt ~/.dsh/sessions/--private-tmp-agent-teams-e2e--/

# Decompress and count event stream
zstdcat ~/.dsh/sessions/<ws>/session-<id>/session.jsonl.zstd \
  | grep -o '"type":"agent-teams/[^"]*"' | sort | uniq -c
# Expected: team-created ×1, member-added ×2, task-created ×2, task-updated ×N,
#           message-sent ×N, team-deleted ×1
```

---

### 3. GUI Verification (ego-browser + Dedicated Web Instance)

#### 3.1 Start Dedicated Web Instance

```sh
# Clean profile setup
npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh plugin --profile agent-teams-beta add @deepseek-ai/dsh-base
npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh plugin --profile agent-teams-beta add @deepseek-ai/dsh-web-app
npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh plugin --profile agent-teams-beta add /abs/path/to/dsh-agent-teams

# Launch on dedicated port (managed background process)
npx -p @deepseek-ai/dsh@0.0.1-rc.1 dsh --profile agent-teams-beta --host 127.0.0.1 --port 3081
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3081/
```

- Align CLI versions with bundle dependencies to prevent missing service errors.
- Ensure dual compatibility for server keys (`httpServer` vs `webServer`).

#### 3.2 Roster & Route Probing

```sh
# Verify browser roster contains the plugin
curl -s http://127.0.0.1:3081/ | python3 -c "
import sys, json, re
html = sys.stdin.read()
m = re.search(r'window.__DSH_BOOT__ = (.*?)</script>', html, re.S)
g = json.loads(m.group(1))
print(any('agent-teams' in e['id'] for e in g.get('entries', [])))
"

# Probe client bundle and custom routes
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3081/plugins/<pkg>/client.js
curl -s http://127.0.0.1:3081/plugins/<pkg>/state
curl -s "http://127.0.0.1:3081/plugins/<pkg>/state?archived=1"
```

#### 3.3 DOM Probing (ego-browser)

```js
const task = await useOrCreateTaskSpace('agent-teams webui test')
await openOrReuseTab('http://127.0.0.1:3081', { wait: true, timeout: 30 })

const probe = await js(String.raw`(() => {
  const panel = document.querySelector('[data-agent-teams-activity]')
  if (!panel) return { panel: false }
  return {
    panel: true,
    teamName: panel.querySelector('[class*="teamName"]')?.textContent ?? '',
    delegationMap: !!panel.querySelector('[data-delegation-map]'),
    dependencyMap: !!panel.querySelector('[data-dependency-map]'),
    focusedTasks: [...panel.querySelectorAll('[data-task-id][data-focused="true"]')].map(n => n.getAttribute('data-task-id')),
    pinnedTasks: [...panel.querySelectorAll('[data-task-id][aria-pressed="true"]')].map(n => n.getAttribute('data-task-id')),
    artLoaded: [...panel.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
    mainShift: getComputedStyle(document.querySelector('[data-phase="active"]')).paddingRight,
  }
})()`)
cliLog(JSON.stringify(probe, null, 1))
```

#### 3.4 Screenshot Archival

```js
await captureScreenshot('/tmp/agent-teams-panel.png')
```

Capture key milestones (in-progress execution, terminal delivery, archive review) to pair DOM assertions with visual confirmation.

---

### 4. Verification Discipline

- **Never touch user-specified running instances**: Verify on dedicated scratch profiles and ports.
- **Run the full test chain**: typecheck → build → verify → diff check.
- **Track background processes**: Launch with managed task IDs and shut down cleanly upon test completion.
- Commit only as requested by the user.

---

### 5. Verification Checklist Template

```markdown
## Verification Checklist: <plugin-name>

### Build & Offline
- [ ] pnpm typecheck        # Host + client dual programs report 0 errors
- [ ] pnpm build             # lib/ and lib/client.js generated
- [ ] node -e "import('./lib/index.js')..."  # Exports name/inject/Config/apply
- [ ] pnpm verify            # Smoke suites PASS (pure rules, persistence, projections)
- [ ] dsh --profile agent-teams-check --dump-config | grep "id: <plugin>"   # Composition valid

### Real End-to-End (Isolated Headless Profile)
- [ ] dsh plugin --profile headless add /abs/path/<pkg>
- [ ] dsh --profile headless "<task requiring plugin flow>"
- [ ] Output includes complete execution narrative
- [ ] State directory persisted properly
- [ ] Session event stream matches protocol steps

### GUI (Dedicated Web Instance + Browser Automation)
- [ ] Instance starts cleanly on dedicated port
- [ ] window.__DSH_BOOT__ roster contains plugin
- [ ] Client bundle and state routes return 200
- [ ] Panel and card elements pass DOM probe assertions
- [ ] Interactive workflows (navigation, pinning, archiving) verified
- [ ] Screenshots captured for key states

### Cleanup
- [ ] Dedicated instances stopped cleanly
- [ ] Temporary task spaces and test directories cleaned up
- [ ] Running user instances untouched
```
