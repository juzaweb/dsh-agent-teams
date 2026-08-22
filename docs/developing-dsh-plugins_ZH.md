<p align="right">
  <a href="./developing-dsh-plugins.md">English</a> · <strong>简体中文</strong>
</p>

# 从零开发一个 DeepSeek Harness（DSH）插件

> 本文是 dsh-agent-teams 插件（host 工具 + 浏览器活动面板 + 对话流卡片）开发全过程的经验蒸馏。
> 覆盖 bundle 插件从骨架、host 面、client 面、构建安装到踩坑修复的完整流程，供 coding agent 直接照做。
> 参考实现：`dsh-agent-teams`（成品）、DSH 仓库 `packages/workflow/tool-workflow`（工具插件模板）、
> `packages/client/tsdown.client.ts`（client bundle 协议）、`packages/bundle/base|cordis.patch.yml`（host 组合）、
> `packages/client/modules/src/index.ts`（浏览器名册扫描）、`packages/client/ui-workflow-run`（对话流 UI 模板）。

## 0. 全景：一个 DSH bundle 插件是什么

一个可安装插件 = 一个 npm 包，同时扮演两个角色：

- **host 面**（Node）：包根的 `lib/index.js`，作为组合树里的一行插件挂载，注册工具、服务、HTTP 路由、会话事件。
- **client 面**（浏览器）：包子路径 `./client`（`lib/client.js`），被 `dsh-client-modules` 扫描进
  `window.__DSH_BOOT__` 名册，在浏览器里作为 cordis 插件跑 `apply(ctx)`，渲染 UI。

安装 = `dsh plugin --profile <profile> add <包路径或包名>`：pnpm 装进 profile，并把包加入
profile manifest 的 `dsh.profile.bundles` 层列表；bundle 的 `cordis.patch.yml` 作为补丁层把插件行插进组合树。
**plugin add 后需要重启该 profile**，因为 package manifest/bundles 层和 client package metadata 在进程内缓存；
但服务已启动后的用户 `cordis.patch.yml` 由 boot HMR 事务性重读，能够更新配置并挂载/移除 patch 行。

## 1. 插件形态与项目骨架

```
dsh-my-plugin/
├── package.json          # dsh.bundle + dsh.client + exports
├── cordis.patch.yml      # 向 host 组合插入插件行
├── tsconfig.json         # host 编译（排除 src/client）
├── tsconfig.client.json  # client 编译（jsx: react-jsx）
├── tsdown.config.ts      # client bundle 构建（复刻 tsdown.client.ts 协议）
├── src/
│   ├── index.ts          # host 入口：name/inject/Config/apply
│   ├── tools.ts          # 工具注册（可选，大插件拆文件）
│   ├── events.ts         # 会话事件写入（可选）
│   ├── event-types.ts    # 事件类型 + SessionEventMap 合并（零 import！）
│   ├── snapshot.ts       # host 侧数据组装（可选）
│   ├── state.ts          # 文件持久化（可选）
│   └── client/
│       ├── index.tsx     # 浏览器入口（必须是 .tsx 才能写 JSX！）
│       ├── XxxPanel.tsx  # UI 组件
│       ├── *.module.css
│       └── artwork.ts    # 共享纯逻辑（可选）
├── assets/               # 随包分发的静态资源（白名单路由服务）
└── scripts/verify.mjs    # 离线冒烟验证
```

### 1.1 package.json 要素（每个字段为什么存在）

```jsonc
{
  "name": "dsh-my-plugin",
  "type": "module",                          // ESM 全栈
  "main": "lib/index.js",                    // host 入口（tsc 产物）
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "assets", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // bundle 声明：patch 挂 host 行
    "client": { "inject": ["@deepseek-ai/dsh-client-runtime"], "platform": "web" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit"
  }
}
```

- `exports["./client"]` 是名册扫描的硬要求：`client-modules` 读 `exports["./client"]` 找浏览器 bundle
  （支持 string 或带 string `default` 的一层条件对象；`types` 不参与运行时解析），缺失直接拒绝该包。
- `dsh.bundle.patch` 让 `dsh plugin add` 的 reconcile 认出这是 bundle 并加入 bundles 层。
- `dsh.client` 是当前源码的权威 client manifest；`platform` 必须是 `"web"`。包元数据和负结论按名称缓存，
  因此新增/删除 client 声明、修正 export 后必须重启 host。旧部署若不同，先核对其源码再做兼容声明。
- `peerDependencies`：host 侧依赖（`@deepseek-ai/dsh-tools`、`dsh-session`、`dsh-subagent`…）+ 浏览器侧
  （`@deepseek-ai/dsh-client-runtime`、`dsh-client-ui-slots`、`react`）全部 peer，运行时从 profile 的
  `node_modules`（healProfilesModuleFallback 扁平目录）解析，不重复安装。
- `files` 必须含 `lib`、`cordis.patch.yml`；有静态资源加 `assets/...`。

### 1.2 cordis.patch.yml：一行插件进组合

```yaml
# bundle 补丁：顶层 YAML 数组，insert 追加组合行
- insert:
    - id: my-plugin            # 行 id（全局唯一）
      name: dsh-my-plugin      # 包名（client-modules 按它解析 package.json）
      config:                  # 可选：传入插件的 Config
        someOption: value
```

要点：`name` 必须等于包名（名册扫描 `require.resolve('<name>/package.json')`）；行挂在 host 组合，
工具注册进全局 `tools` 注册表，因此该 profile 下所有会话可用，不需要 realm。

### 1.3 tsconfig：host 与 client 必须两个 program

```jsonc
// tsconfig.json —— host
{
  "compilerOptions": {
    "module": "NodeNext", "moduleResolution": "NodeNext",
    "lib": ["ES2022"], "strict": true, "noUncheckedIndexedAccess": true,
    "declaration": true, "declarationDir": "lib/types", "outDir": "lib", "rootDir": "src",
    "allowImportingTsExtensions": true, "rewriteRelativeImportExtensions": true,  // TS 5.7+，.ts 导入重写为 .js
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/client"]     // host program 绝不编译 client
}
```

```jsonc
// tsconfig.client.json —— client（extends host，覆盖）
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",          // 必须
    "types": []                  // 浏览器环境无 node 类型
  },
  "include": ["src/client", "src/event-types.ts", "src/css-modules.d.ts"],
  "exclude": []
}
```

为什么必须拆（详见 3.1）：host 侧 `dsh-session` 的 index 声明 `Context.sessions: SessionStore`，
浏览器侧 `dsh-client-runtime` 声明 `Context.sessions: ISessions`——同名成员类型冲突，同一 program
内二者必居其一（skipLibCheck 吞掉冲突后取先声明者）。拆开后 host program 只见 host 声明、
client program 只见浏览器声明，互不污染。

## 2. host 侧开发

### 2.1 函数插件四要素

DSH 的函数插件是命名导出 `name/inject/Config/apply`（无 default export）：

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// 声明合并 only：让 ctx.subagents / ctx.systemPrompt 等类型可见（见 2.3）
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'

export const name = 'my-plugin'
export const inject = ['tools', 'subagents', 'systemPrompt', 'agents']

export interface Config { stateDir?: string }
export const Config: z<Config> = z.object({ stateDir: z.string().default('.agent-teams') })

export function apply(ctx: Context, config: Config): void {
  // 注册工具、prompt section、HTTP 路由……全部在 apply 里
}
```

> **内测版本兼容（webServer/httpServer）**：npm `latest`（`0.0.1-rc.1`）的 Web 服务键是 `ctx.httpServer`（`HttpServerService`），后续 `next`（`rc.2`）重命名为 `ctx.webServer`（`WebServer`）；工作区键同理 `workspace` → `workspaceRegistry`。过渡期不要硬绑定单一键名：`ctx.get('webServer') ?? ctx.get('httpServer')`（新键优先、旧键回退），`internal/service` 事件同时监听两组键再补注册。路由注册形状（`register({kind, path, handler})` 返回 disposer）两个版本一致。

- `inject` 声明依赖的服务；`ctx.<name>` 只有在 inject 里声明的服务才可用。
- `Config` 用 `@deepseek-ai/schemastery` 的 `z.object` 描述，Loader 负责默认值。
- `import type {} from '<包>'` 是**声明合并触发器**：DSH 各包通过 `declare module '@deepseek-ai/cordis'`
  扩展 `Context`，必须把该包加载进 program 才能看见对应成员。

### 2.2 工具注册（defineTool，模板：tool-workflow）

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'my_tool',
  description: '……模型看到的完整契约……',
  parameters: {
    arg: { type: 'string', required: true, description: '……' },
    status: { type: 'string', enum: ['a', 'b'], description: '……' },  // enum 让类型推断精确
  },
  output: {
    schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean', required: true } } },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  },
  async execute(args, exec) {
    const caller = exec.agent            // 调用者 Agent（父会话归属、cwd、session）
    if (!caller) throw new Error('requires a calling agent')
    // ……业务逻辑，返回符合 output.schema 的 JSON 值……
    return { ok: true }
  },
}))
```

关键经验：
- `parameters` 是 DSL 属性描述对象（每个 key 一个 schema）；`output.schema` 是普通 JSON Schema。
- `exec.agent` 是调用者的 Agent：`agent.session.header.cwd` 是工作区（团队状态落盘位置）、
  `agent.session` 是可 append 事件的会话、`agent.id` 是会话 id。子代理编排（`subagents.startContinuable`
  等）都要求传 `parent: exec.agent`。
- 工具的 `description` 就是模型契约，写清楚"何时用/怎么用"；配合 `ctx.systemPrompt.section()`
  注册使用策略（tool-workflow 的做法：`order: 115` 附近）。

### 2.3 服务注入与"fail-loud 时机"

```ts
// 挂载时校验要小心：provider 注册是兄弟插件行的 effect（Loader 并发激活），
// 可能晚于你的 apply。不要在 apply 里校验 provider 存在——移到第一次真正使用的地方。
const provider = ctx.subagents.getProvider(config.memberProvider)   // ← 在 spawn 时做，不在 apply 做
```

`inject` 只等**服务**（service 已提供），不等**provider 注册**（同服务下的另一行插件的 effect）。
任何"依赖兄弟插件行为"的校验都必须延迟到首次使用（最早可解析点），否则并发激活下随机失败
（见踩坑 5.1）。

### 2.4 HTTP 路由（活动面板数据通道）

```ts
import { readFile } from 'node:fs/promises'

// 过渡期双键：新键优先、旧键回退（见 2.1 版本兼容说明）
const web = (ctx.get('webServer') ?? ctx.get('httpServer')) as WebRouteHost
ctx.effect(() => web.register({
  kind: 'exact',                       // 或 'prefix'
  path: '/plugins/my-plugin/state',
  handler: async (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ... }))
  },
}), 'my-plugin: state route')
```

- `register` 返回 disposer，必须包在 `ctx.effect(..., 'label')` 里（HMR 安全）。
- 服务可能在插件 apply 之后才绑定：首次注册失败时挂 `ctx.on('internal/service', name => ...)` 补注册。
- 静态资源路由务必做**白名单**（防路径穿越）：`decodeURIComponent` 要包 try（畸形编码 404 而非 400），
  用 `split('/').pop()` 剥离路径后查 Set，再 `join`。
- 客户端轮询是外部插件可用的朴素数据通道；使用 `cache: 'no-store'`、in-flight 防重叠、响应形状校验、
  unmount/cancelled 防护，并在 host 暂时重启或请求失败时保留最后一份成功快照。

### 2.5 状态持久化（文件 + 进程内锁）

```ts
// 团队状态 = workspace 下 .agent-teams/<teamId>/team.json + inbox/*.jsonl
// 用 node:fs/promises 直接读写（插件自有簿记，不走沙箱 fs 服务；fs 服务无删除 API）
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

- 读-改-写必须串行化：同一进程内用 promise 链互斥（key 建议含 workspace，避免跨 workspace 同名串行）。
- 事件/模型可能绕过工具仪式（直接写文件），面板类 UI 应以磁盘为真相源（host 快照），
  而不是事件重放（事件用于对话流节点与审计）。

### 2.6 会话事件写入（对话流 UI 的数据源）

```ts
// event-types.ts —— 事件类型 + SessionEventMap 合并，必须零 import！
export interface AgentTeamsTeamCreatedData { readonly teamId: string; readonly name: string }
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap { 'my-plugin/team-created': AgentTeamsTeamCreatedData }
}
```

```ts
// events.ts —— 写入
import type { Session, SessionEventMap } from '@deepseek-ai/dsh-session/types'
session.append(type, data)   // type 必须已并入 SessionEventMap
```

- `SessionEventMap` 是 merge-extensible：`declare module '@deepseek-ai/dsh-session/types'` 合并即可，
  浏览器端 Conversation Node 会按 `seq` 确定性重放这些事件。
- **event-types.ts 必须零 import**：它同时被 host 与 client 两个 program 加载；一旦 import 了
  host 侧包（如 `dsh-session` 的 index），client program 的声明合并就被污染（见 3.1/5.3）。
- append 目标：把事件写进"队长会话"（而非调用者），成员操作也统一落回队长会话，保证单一监控面；
  队长不可达时回退调用者会话。`session.append` 会抛，包一层 try/warn 降级。

## 3. client 侧开发

### 3.1 为什么必须拆两个 tsc program

`dsh-session`（host）的 index 声明 `Context.sessions: SessionStore`；`dsh-client-runtime`（浏览器）
声明 `Context.sessions: ISessions`。二者都是 `declare module '@deepseek-ai/cordis' { interface Context }`
同名成员，同一 program 内必然冲突（skipLibCheck 吞错后取先声明者，表现为 `ctx.sessions.open`
"Property 'open' does not exist on type 'SessionStore'"）。

拆开后的规则：

- host program：`include: ["src"]`，`exclude: ["src/client"]`；只链接 host 包类型。
- client program：`include: ["src/client", "src/event-types.ts", ...]`；**不能编译任何 import 了
  host 侧 index 的文件**（这就是 event-types 零 import 的原因；client 文件只 import 浏览器侧包和
  event-types 的类型）。
- `declare module '@deepseek-ai/dsh-session/types'` 的合并只需 `dsh-session/types` 子路径被加载
  （子路径文件不包含 host 的 Context 合并，安全）。

### 3.2 扩展名坑：`.tsx` 才能写 JSX

TS 只在 `.tsx` 文件里解析 JSX。插件入口一旦包含 `root.render(<XxxPanel .../>)`，
文件必须是 `src/client/index.tsx`（输出仍是 `lib/client/index.js`）。写成 `.ts` 会得到
成串的 `TS1005 '>' expected`，与配置无关，纯扩展名问题（见踩坑 5.4）。

### 3.3 client bundle 协议（tsdown，复刻 tsdown.client.ts）

浏览器加载的不是源码，而是 `/plugins/<id>/client.js`——一个 **CJS closure-factory**：

```js
window.__ModuleLoader__.load({
  id: "dsh-my-plugin",
  factory: (require) => { /* ... */ return module.exports }
})
```

`tsdown.config.ts` 关键配置（对齐 `0.1.0-rc.8` 仓库 `packages/client/tsdown.client.ts` 的 `clientConfig`）：

```ts
export default {
  name: 'dsh-my-plugin/client',
  entry: { client: 'lib/client/index.js' },   // tsc client program 产物
  outDir: 'lib', format: 'cjs', platform: 'browser',
  dts: false, sourcemap: true, clean: false,
  deps: {
    neverBundle: (id) => CLIENT_EXTERNALS.includes(id),
    alwaysBundle: (id) => !CLIENT_EXTERNALS.includes(id),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [
    // purity gate：@deepseek-ai 非 external/非内联安全包的值导入直接 build error
    { name: 'purity', resolveId(source) { /* @deepseek-ai 检查 */ } },
    // CSS Modules 内联：lightningcss 编译 + <style data-plugin> 注入 + class map
    { name: 'css-modules', resolveId(source, importer) { /* .module.css → 虚拟 id */ },
      async load(virtualId) { /* transform + 注入逻辑 */ } },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-my-plugin", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
```

- `CLIENT_EXTERNALS` = `PLATFORM_MODULES` + `PRELOADED_CLIENT_EXTERNALS`；rc.8 的后者包含
  `@deepseek-ai/dsh-client-runtime/client`。平台列表会演进，应从目标 checkout 复制。
- 浏览器端只能 import 平台模块、类型和允许的 inline-safe 包；跨插件值协作走 cordis service。
- `dsh.client.inject` 是 package graph 元数据；等待 slot 用 `ctx.slots.inject()`，等待 service 用 `export const inject`。
- 依赖 `tsdown@0.22` + `lightningcss`，pnpm 安装即可。

### 3.4 选择正确的 UI 接缝：slot 优先，body portal 兜底

先读当前 `packages/client/ui-*/src/client/contract/slots.ts`。DeepSeek Harness `0.1.0-rc.8`
提供 frame 级 `shell.overlay`；能落入语义正确 slot 就优先注册：

```tsx
// src/client/index.tsx (rc.8+)
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

#### 3.4.1 浮层与主工作区协作

宽屏停靠浮层会遮住 transcript/composer 时，让对话列礼让空间，但保持侧边栏不动：

```tsx
useEffect(() => {
  const root = document.documentElement
  if (open) root.setAttribute('data-my-plugin-panel-open', '')
  else root.removeAttribute('data-my-plugin-panel-open')
  return () => { root.removeAttribute('data-my-plugin-panel-open') }
}, [open])
```

```css
:global(html) {
  --my-panel-width: 388px;
  --my-panel-shift: calc(var(--my-panel-width) + 18px + 14px);
}
:global(html[data-my-plugin-panel-open]) :global([data-phase='active']) {
  box-sizing: border-box;
  padding-right: var(--my-panel-shift);
}
:global([data-phase='active']) {
  transition: padding-right 360ms cubic-bezier(.22, 1, .36, 1);
}
@media (max-width: 960px) {
  :global(html[data-my-plugin-panel-open]) :global([data-phase='active']) { padding-right: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :global([data-phase='active']) { transition: none; }
}
```

#### 3.4.2 关系 UI 与无障碍

- captain→member 派工与 task dependency stage 同时用连线、文字和状态表达，不能只靠颜色。
- 把 stage grouping、上下游 chain 提取为纯函数：自然排序 id、非有限 depth 回退 0、遍历 cycle-safe。
- hover 只做 preview；click 单独 pin，`aria-pressed` 只落在 pin 源节点，二次 click 或 `Escape` 取消。
- icon-only button 有 `aria-label`，section 有 label，装饰图 `alt="" aria-hidden`，交互有 `:focus-visible`，动画覆盖 `prefers-reduced-motion`。

### 3.5 对话流节点（Conversation Node，模板：ui-workflow-run）

对话流内嵌 UI = 注册一个 Conversation Node（浏览器端 cordis）：

```ts
// agent-teams-card-definition.ts
import type { ChatConversationViewNode, ConversationNodeContext,
  ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-session/types'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap { 'my-plugin': MyCardData }
}

export const myDefinition: ConversationNodeDefinition<MyState> = {
  kind: 'my-plugin',
  target: 'chat',
  match: (event) => { /* 从事件里提取稳定业务 id + start/update 角色 */ },
  start: (ctx, match) => { /* 首个事件建 state */ },
  update: (ctx, match) => { /* 按 seq 递增折叠 state */ },
  buildViewNode: (ctx) => ({ /* 投影最终数据 */ }),
}
```

```tsx
// index.tsx 注册
ctx.conversationEvents.register(myDefinition)
ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
  name: 'conversation.chat.node', key: 'my-plugin',
  inject: () => ({ openSession: (id) => ctx.sessions.open(id) }),
}, MyCardComponent))
```

## 4. 构建与安装

### 4.1 构建链

```sh
pnpm build   # tsc host → tsc client → tsdown（client.js）
```

- tsc 需要 **5.7+**：`rewriteRelativeImportExtensions` 让源码里的 `./x.ts` 导入在产物里重写为 `.js`。
- tsdown 输出 `lib/client.js`（CJS closure-factory）+ sourcemap；host 侧 tsc 产物直接可用。

### 4.2 开发期类型链接（在 DSH checkout 之外开发时）

```sh
mkdir -p node_modules/@deepseek-ai
ln -sfn /path/to/DSH/vendor/cordis           node_modules/@deepseek-ai/cordis
ln -sfn /path/to/DSH/packages/core/session   node_modules/@deepseek-ai/dsh-session
ln -sfn /path/to/DSH/packages/core/tools     node_modules/@deepseek-ai/dsh-tools
```

### 4.3 安装到 profile

```sh
pnpm build
npx -p @deepseek-ai/dsh dsh plugin --profile web add /absolute/path/to/dsh-agent-teams
```

### 4.4 离线验证（不启动服务）

```sh
node scripts/verify.mjs   # 纯逻辑 + 文件持久化冒烟（临时目录自清理）
dsh --profile <scratch> --dump-config   # 验证组合树里出现插件行（离线，不 boot）
```

## 5. 踩坑清单（按开发顺序，全部实战遇到）

### 5.1 provider 注册晚于插件 mount
- **现象**：首次启动报 `no subagent provider "spawn" is registered`。
- **根因**：`subagent-spawn` 行的 provider 注册是兄弟插件 effect，Loader 并发激活下可能晚于 `apply`。
- **解决**：在首次 `spawnMember` 时 `getProvider` 校验并抛可操作错误。

### 5.2 浏览器名册不收录插件（manifest / export / bundle）
- **现象**：`window.__DSH_BOOT__` 没有条目。
- **当前契约**：`client-modules` 读取 `package.json.dsh.client`，要求 `platform: "web"`、合法的 `exports["./client"]` 和真实 bundle。
- **缓存边界**：包元数据不自动过期；修正 manifest/export 后重启 host。

### 5.3 `declare module` 合并不生效（TS2664）
- **现象**：`match(event)` 的 `event.type` union 里没有你的事件。
- **根因**：纯 `declare module` 文件零 import 时目标模块未被加载进 program。
- **解决**：在合并文件顶部加 `import type {} from '<目标模块>'`。

### 5.4 JSX 报成串语法错误
- **现象**：`TS1005 '>' expected`。
- **根因**：入口文件是 `index.ts` 而不是 `.tsx`。
- **解决**：含 JSX 的文件一律 `.tsx`（`src/client/index.tsx`）。

### 5.5 嵌套闭包内判别联合窄化失效
- **现象**：`Property 'field' does not exist`。
- **根因**：参数窄化在嵌套箭头函数内不保留。
- **解决**：先 `const field = match.event.data.field` 提取到局部变量再用。

### 5.6 tsc emit 报 TS5096/TS5023
- **现象**：`unknown option rewriteRelativeImportExtensions`。
- **根因**：TypeScript 版本 < 5.7。
- **解决**：升级 `typescript@^5.9`。

### 5.7 tsdown CSS 报 ENOENT
- **现象**：`ENOENT: no such file or directory, open './Xxx.module.css'`。
- **根因**：tsc 产物在 `lib/client/`，但 css 源在 `src/client/`。
- **解决**：resolveId 找不到 emitted 路径时将 `/lib/` 替换为 `/src/` 再查。

### 5.8 其他实战备忘
- **轮询竞态**：使用 in-flight 标志防重叠。
- **响应形状校验**：使用 `Array.isArray(body.teams)` 防异常闪烁。
- **导航即收起**：点击跳转子会话时同步 `setOpen(false)`。
- **删除即归档**：复盘数据删除时归档，另开 `?archived=1` 查询。
- **会话跟随**：按 `SessionListState.current + captainSessionId` 过滤。

## 6. 验证金字塔（从快到慢）

1. `pnpm typecheck` → 2. `pnpm build` → 3. `node scripts/verify.mjs` → 4. `dsh --profile <scratch> --dump-config` → 5. headless 真实任务 → 6. 独立 web 实例 → 7. ego-browser GUI 端到端。
