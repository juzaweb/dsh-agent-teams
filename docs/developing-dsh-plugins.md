<p align="right">
  <strong>English</strong> · <a href="./developing-dsh-plugins_ZH.md">简体中文</a>
</p>

# Developing a DeepSeek Harness (DSH) Plugin from Scratch

> A practical guide distilled from the end-to-end development of `dsh-agent-teams` (host tools + browser activity panel + conversation card).
> Covers the full lifecycle of a DSH bundle plugin: structure, host plane, client plane, building, installation, troubleshooting, and verification.
> References: `dsh-agent-teams` (production implementation), DSH repository `packages/workflow/tool-workflow` (tool plugin template), `packages/client/tsdown.client.ts` (client bundle protocol), `packages/bundle/base|cordis.patch.yml` (host composition), `packages/client/modules/src/index.ts` (browser roster discovery), `packages/client/ui-workflow-run` (conversation UI template).

## 0. Overview: Anatomy of a DSH Bundle Plugin

An installable plugin is an npm package fulfilling two roles simultaneously:

- **Host Plane** (Node.js): Package root `lib/index.js`, mounted as a plugin row in the Cordis composition tree, registering tools, services, HTTP endpoints, and session lifecycle events.
- **Client Plane** (Browser): Subpath `./client` (`lib/client.js`), scanned by `dsh-client-modules` into the `window.__DSH_BOOT__` roster, executing as a Cordis plugin in the browser to render UI via `apply(ctx)`.

Installation: `dsh plugin --profile <profile> add <package>` installs the package into the profile with pnpm and adds it to `dsh.profile.bundles`. The bundle's `cordis.patch.yml` inserts the plugin row into the composition tree. **Restarting the profile after `plugin add` is required** because manifests and metadata are cached in-memory.

## 1. Plugin Structure & Project Scaffolding

```
dsh-my-plugin/
├── package.json          # dsh.bundle + dsh.client + exports
├── cordis.patch.yml      # Host composition patch inserting plugin row
├── tsconfig.json         # Host TypeScript program (excludes src/client)
├── tsconfig.client.json  # Client TypeScript program (jsx: react-jsx)
├── tsdown.config.ts      # Client bundle config (replicates tsdown.client.ts protocol)
├── src/
│   ├── index.ts          # Host entry: name/inject/Config/apply
│   ├── tools.ts          # Tool registration (modularized)
│   ├── events.ts         # Session event recording (optional)
│   ├── event-types.ts    # Event types + SessionEventMap merging (zero imports!)
│   ├── snapshot.ts       # Host-side data aggregation (optional)
│   ├── state.ts          # Filesystem persistence (optional)
│   └── client/
│       ├── index.tsx     # Browser entry (.tsx required for JSX!)
│       ├── XxxPanel.tsx  # UI components
│       ├── *.module.css
│       └── artwork.ts    # Pure client helper logic
├── assets/               # Static assets distributed with bundle
└── scripts/verify.mjs    # Offline smoke verification
```

### 1.1 package.json Configuration

```jsonc
{
  "name": "dsh-my-plugin",
  "type": "module",
  "main": "lib/index.js",                    // Host entry (tsc output)
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "assets", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit"
  }
}
```

- `exports["./client"]`: Mandatory for browser bundle discovery (`client-modules` searches for `exports["./client"]`).
- `dsh.bundle.patch`: Informs `dsh plugin add` to treat the package as a bundle and reconcile it into `bundles`.
- `dsh.client`: Canonical client manifest; `platform` must be `"web"`.
- `peerDependencies`: Platform dependencies (`@deepseek-ai/dsh-tools`, `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-client-runtime`, `react`, etc.) should be peer dependencies to resolve from the hosting profile.

### 1.2 cordis.patch.yml: Inserting Host Composition Rows

```yaml
- insert:
    - id: my-plugin            # Globally unique row ID
      name: dsh-my-plugin      # Resolvable package name
      config:                  # Optional plugin configuration
        someOption: value
```

### 1.3 TypeScript Dual-Program Architecture

```jsonc
// tsconfig.json (Host Program)
{
  "compilerOptions": {
    "module": "NodeNext", "moduleResolution": "NodeNext",
    "lib": ["ES2022"], "strict": true, "noUncheckedIndexedAccess": true,
    "declaration": true, "declarationDir": "lib/types", "outDir": "lib", "rootDir": "src",
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true,
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/client"]
}
```

```jsonc
// tsconfig.client.json (Client Program)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": []
  },
  "include": ["src/client", "src/event-types.ts", "src/css-modules.d.ts"],
  "exclude": []
}
```

**Why dual programs are mandatory**: Host `dsh-session` declares `Context.sessions: SessionStore`, whereas client `dsh-client-runtime` declares `Context.sessions: ISessions`. In a single TypeScript program, these conflicting declarations collide. Splitting into two programs cleanly isolates host and client typings.

## 2. Host Plane Development

### 2.1 Plugin Structure

A functional Cordis plugin exports `name`, `inject`, `Config`, and `apply`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'my-plugin'
export const inject = ['tools', 'subagents', 'systemPrompt', 'agents']

export interface Config { stateDir?: string }
export const Config: z<Config> = z.object({ stateDir: z.string().default('.agent-teams') })

export function apply(ctx: Context, config: Config): void {
  // Register tools, system prompts, HTTP routes
}
```

### 2.2 Tool Registration

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'my_tool',
  description: 'Description visible to LLM',
  parameters: {
    arg: { type: 'string', required: true, description: 'Parameter description' },
    status: { type: 'string', enum: ['a', 'b'], description: 'Enum status' },
  },
  output: {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args, exec) {
    const caller = exec.agent
    if (!caller) throw new Error('requires a calling agent')
    return { ok: true }
  },
}))
```

### 2.3 HTTP Routes (State & Static Assets)

```ts
const web = (ctx.get('webServer') ?? ctx.get('httpServer')) as WebRouteHost
ctx.effect(() => web.register({
  kind: 'exact',
  path: '/plugins/my-plugin/state',
  handler: async (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ... }))
  },
}), 'my-plugin: state route')
```

- Always wrap registrations in `ctx.effect(..., 'label')` for HMR disposal.
- Guard asset paths with an explicit allowlist to prevent directory traversal.

### 2.4 State Persistence & In-Process Locks

```ts
const locks = new Map<string, Promise<unknown>>()
export async function withTeamLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  locks.set(key, previous.then(() => gate))
  await previous
  try { return await fn() } finally { release() }
}
```

### 2.5 Session Events (`event-types.ts`)

```ts
// event-types.ts — MUST HAVE ZERO IMPORTS!
export interface AgentTeamsTeamCreatedData { readonly teamId: string; readonly name: string }
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap { 'my-plugin/team-created': AgentTeamsTeamCreatedData }
}
```

## 3. Client Plane Development

### 3.1 Client Bundle Protocol (tsdown)

The browser loads `/plugins/<id>/client.js` as a **CJS closure-factory**:

```js
window.__ModuleLoader__.load({
  id: "dsh-my-plugin",
  factory: (require) => { /* ... */ return module.exports }
})
```

`tsdown.config.ts`:

```ts
export default {
  name: 'dsh-my-plugin/client',
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib', format: 'cjs', platform: 'browser',
  dts: false, sourcemap: true, clean: false,
  deps: {
    neverBundle: (id) => CLIENT_EXTERNALS.includes(id),
    alwaysBundle: (id) => !CLIENT_EXTERNALS.includes(id),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    { name: 'purity', resolveId(source) { /* External checks */ } },
    { name: 'css-modules', resolveId(source, importer) { /* CSS Modules inline injection */ },
      async load(virtualId) { /* LightningCSS transform */ } },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-my-plugin", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
```

### 3.2 UI Integration via Slots

```tsx
// src/client/index.tsx
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'

export const inject = ['slots', 'sessions']

export function apply(ctx: ClientContext): void {
  const Panel = () => <ActivityPanel openSession={(id: SessionId) => { ctx.sessions.open(id) }} />
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'my-plugin-panel',
    order: 80,
  }, Panel))
}
```

### 3.3 Conversation Cards (Conversation Node)

```ts
// agent-teams-card-definition.ts
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap { 'my-plugin': MyCardData }
}

export const myDefinition: ConversationNodeDefinition<MyState> = {
  kind: 'my-plugin',
  target: 'chat',
  match: (event) => { /* Match event */ },
  start: (ctx, match) => { /* Init state */ },
  update: (ctx, match) => { /* Fold event by seq */ },
  buildViewNode: (ctx) => ({ /* Project card view data */ }),
}
```

```tsx
// index.tsx
ctx.conversationEvents.register(myDefinition)
ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
  name: 'conversation.chat.node', key: 'my-plugin',
  inject: () => ({ openSession: (id) => ctx.sessions.open(id) }),
}, MyCardComponent))
```

## 4. Build, Installation & Verification

### 4.1 Build Pipeline

```sh
pnpm build   # tsc host → tsc client → tsdown
```

### 4.2 Profile Installation

```sh
dsh plugin --profile web add /absolute/path/to/dsh-agent-teams
```

### 4.3 Offline Verification

```sh
node scripts/verify.mjs
dsh --profile <scratch> --dump-config
```

## 5. Practical Pitfalls & Solutions

### 5.1 Provider Registration Timing
- **Symptom**: `no subagent provider "spawn" is registered` on startup.
- **Cause**: Sibling provider registration happens asynchronously under concurrent activation.
- **Fix**: Validate provider existence during first `spawnMember` invocation rather than inside `apply`.

### 5.2 Browser Roster Discovery
- **Symptom**: Plugin missing in `window.__DSH_BOOT__`.
- **Cause**: Missing `dsh.client` in package.json or invalid `exports["./client"]`.
- **Fix**: Verify package.json exports and ensure `lib/client.js` is generated.

### 5.3 Augmentation Not Loaded (TS2664)
- **Symptom**: Custom events missing from `event.type` union.
- **Cause**: Target module was never imported into the program.
- **Fix**: Add `import type {} from '<target-package>'` at the top of the declaration file.

### 5.4 JSX Extension Parsing
- **Symptom**: Syntax errors parsing JSX in TypeScript.
- **Cause**: File named `.ts` instead of `.tsx`.
- **Fix**: Ensure all files containing JSX use the `.tsx` extension.

### 5.5 Discriminated Union Loss in Closures
- **Symptom**: `Property 'x' does not exist` inside callbacks.
- **Cause**: Type narrowing does not propagate into nested closures.
- **Fix**: Assign narrowed properties to local const variables before entering callbacks.

### 5.6 TypeScript 5.7+ Import Rewriting
- **Symptom**: `unknown option rewriteRelativeImportExtensions`.
- **Cause**: Outdated TypeScript version (<5.7).
- **Fix**: Upgrade to `typescript@^5.9`.

### 5.7 CSS Module Resolution in tsdown
- **Symptom**: `ENOENT: no such file or directory, open './Xxx.module.css'`.
- **Cause**: tsc emits files to `lib/client/`, but CSS files remain in `src/client/`.
- **Fix**: Add fallback resolution mapping `/lib/` to `/src/` during CSS module loading.

## 6. Verification Hierarchy

1. `pnpm typecheck` → 2. `pnpm build` → 3. `node scripts/verify.mjs` → 4. `dsh --profile <scratch> --dump-config` → 5. Headless real execution → 6. Dedicated web instance → 7. ego-browser GUI automation.
