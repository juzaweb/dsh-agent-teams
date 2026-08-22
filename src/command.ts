/**
 * The `/agent-teams` slash command and its plain-text gesture boundary.
 *
 * Two deterministic activation paths, mirroring the Harness skill pipeline
 * (`dsh-tool-skill` + the `ui-skill` client source):
 *
 * 1. **Host command** — `ctx.commands.register` publishes the closed-namespace
 *    `/agent-teams` command. The web GUI's slash menu (the Harness
 *    `ui-commands` client) lists it from the host catalog with the input
 *    hint; the argued line is claimed client-side and executed through
 *    `command.execute`. The handler replays that exact line as an ordinary
 *    user follow-up (`agent.followup`) so it remains visible in the chat; the
 *    gesture boundary then adds the deterministic activation message.
 * 2. **Gesture boundary** — a `agent/pre-step` listener recognizes a leading
 *    `/agent-teams` token in genuine user messages and injects the same
 *    activation message. This covers surfaces with no command adjudication
 *    (headless CLI, API, pasted text in plain composers) and also handles the
 *    exact user line replayed by the host command. Mid-sentence mentions stay
 *    ordinary prose; only `source.kind === 'user'` messages are scanned, so
 *    injected or external text cannot forge the gesture.
 *
 * @module dsh-agent-teams/command
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'

/** The slash command name (without the leading slash). */
export const AGENT_TEAMS_COMMAND = 'agent-teams'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /**
     * A deterministic `/agent-teams` activation injected after the visible
     * user-authored slash line.
     */
    'agent-teams-command': {
      readonly kind: 'agent-teams-command'
      /** The user-supplied goal text (absent when the gesture was bare). */
      readonly goal?: string
    }
  }
}

/**
 * A leading, whitespace-bounded `/agent-teams` token — the command grammar
 * shape the harness uses (`parseCommand`): `/` inside words, file paths and
 * mid-sentence mentions never match.
 */
const GESTURE = /^\/agent-teams(?=$|[\t\n\r ])/u

/** Parsed options from an /agent-teams slash command or gesture line. */
export interface ParsedAgentTeamsInput {
  /** The residual goal text. */
  goal: string
  /** Explicit captain LLM provider override. */
  captainProvider?: string
  /** Explicit captain LLM model override. */
  captainModel?: string
  /** Explicit captain reasoning effort override. */
  captainReasoningEffort?: string
  /** Explicit member LLM provider override. */
  memberProvider?: string
  /** Explicit member LLM model override. */
  memberModel?: string
  /** Explicit member reasoning effort override. */
  memberReasoningEffort?: string
}

/**
 * Parse flags from an `/agent-teams` command line (e.g. `--captain-model`, `--member-model`, `--model`).
 */
export function parseAgentTeamsArgs(raw: string): ParsedAgentTeamsInput {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  let captainProvider: string | undefined
  let captainModel: string | undefined
  let captainReasoningEffort: string | undefined
  let memberProvider: string | undefined
  let memberModel: string | undefined
  let memberReasoningEffort: string | undefined
  const remainingTokens: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token.startsWith('--captain-model=')) {
      captainModel = token.slice('--captain-model='.length)
    } else if (token === '--captain-model' || token === '-cm') {
      if (i + 1 < tokens.length) captainModel = tokens[++i]
    } else if (token.startsWith('--captain-provider=')) {
      captainProvider = token.slice('--captain-provider='.length)
    } else if (token === '--captain-provider') {
      if (i + 1 < tokens.length) captainProvider = tokens[++i]
    } else if (token.startsWith('--captain-effort=') || token.startsWith('--captain-reasoning=')) {
      captainReasoningEffort = token.split('=')[1]
    } else if (token === '--captain-effort' || token === '--captain-reasoning') {
      if (i + 1 < tokens.length) captainReasoningEffort = tokens[++i]
    } else if (token.startsWith('--member-model=')) {
      memberModel = token.slice('--member-model='.length)
    } else if (token === '--member-model' || token === '-mm') {
      if (i + 1 < tokens.length) memberModel = tokens[++i]
    } else if (token.startsWith('--member-provider=')) {
      memberProvider = token.slice('--member-provider='.length)
    } else if (token === '--member-provider') {
      if (i + 1 < tokens.length) memberProvider = tokens[++i]
    } else if (token.startsWith('--member-effort=') || token.startsWith('--member-reasoning=')) {
      memberReasoningEffort = token.split('=')[1]
    } else if (token === '--member-effort' || token === '--member-reasoning') {
      if (i + 1 < tokens.length) memberReasoningEffort = tokens[++i]
    } else if (token.startsWith('--model=')) {
      const m = token.slice('--model='.length)
      if (!captainModel) captainModel = m
      if (!memberModel) memberModel = m
    } else if (token === '--model' || token === '-m') {
      if (i + 1 < tokens.length) {
        const m = tokens[++i]
        if (!captainModel) captainModel = m
        if (!memberModel) memberModel = m
      }
    } else {
      remainingTokens.push(token)
    }
  }

  return {
    goal: remainingTokens.join(' ').trim(),
    captainProvider,
    captainModel,
    captainReasoningEffort,
    memberProvider,
    memberModel,
    memberReasoningEffort,
  }
}

/**
 * The deterministic activation text. The system-prompt usage section owns
 * the full protocol; this message only switches it on for one concrete goal.
 * @param input - the user-supplied goal line or parsed input.
 */
export function buildActivationDirective(input: string | ParsedAgentTeamsInput): string {
  const parsed = typeof input === 'string' ? parseAgentTeamsArgs(input) : input
  const goalLine = parsed.goal === ''
    ? 'The goal was not given — ask the user what the team should accomplish.'
    : `Goal: ${parsed.goal}`
  const directives: string[] = [
    'The user invoked the `/agent-teams` command. Activate the AgentTeams protocol from your instructions now: you are the captain of a multi-agent team.',
    goalLine,
  ]
  if (parsed.captainProvider || parsed.captainModel || parsed.captainReasoningEffort) {
    directives.push(
      `Captain LLM route overrides: provider=${parsed.captainProvider ?? 'default'}, model=${parsed.captainModel ?? 'default'}${parsed.captainReasoningEffort ? `, reasoning_effort=${parsed.captainReasoningEffort}` : ''}. Pass these options when calling agent_teams_create.`,
    )
  }
  if (parsed.memberProvider || parsed.memberModel || parsed.memberReasoningEffort) {
    directives.push(
      `Member LLM route overrides: provider=${parsed.memberProvider ?? 'default'}, model=${parsed.memberModel ?? 'default'}${parsed.memberReasoningEffort ? `, reasoning_effort=${parsed.memberReasoningEffort}` : ''}. Use these as the default options when calling agent_teams_add_member.`,
    )
  }
  return directives.join('\n')
}

/**
 * The goal of the latest start-anchored `/agent-teams` gesture in genuine
 * user messages, or `undefined` when no message carries one. `''` means a
 * bare `/agent-teams` token with no goal.
 * @param messages - the step's claimed batch (user messages only scanned).
 */
export function invokedAgentTeamsGoal(messages: readonly UserMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.source.kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      const text = block.text.trimStart()
      if (!GESTURE.test(text)) continue
      return text.slice(AGENT_TEAMS_COMMAND.length + 1).trim()
    }
  }
  return undefined
}

/**
 * Register the closed-namespace `/agent-teams` host command. The handler
 * preserves the exact submitted slash line as an ordinary user follow-up;
 * the pre-step gesture boundary injects the activation directive and wakes
 * the captain deterministically. The registration rides the calling
 * context's fiber, so a disposed scope (HMR, plugin removal) unregisters the
 * command.
 * @param ctx - host context providing the `commands` registry.
 */
export function registerAgentTeamsCommand(ctx: Context): void {
  ctx.effect(() => ctx.commands.register({
    name: AGENT_TEAMS_COMMAND,
    description: 'run a goal with a multi-agent team (you become the captain)',
    input: { hint: '<goal — what the team should accomplish>' },
    handler(invocation: CommandInvocation): CommandResult {
      const goal = invocation.rawInput.trim()
      if (goal === '') {
        return {
          kind: 'error',
          text: `Usage: /${AGENT_TEAMS_COMMAND} <goal — what the team should accomplish>`,
        }
      }
      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: `/${AGENT_TEAMS_COMMAND}${invocation.rawInput}` }],
        source: { kind: 'user' },
      }))
      return {
        kind: 'success',
        text: `AgentTeams activated — the captain will assemble a team for: ${goal}`,
      }
    },
  }), 'agent-teams: slash command')
}

/**
 * Install the `agent/pre-step` gesture boundary: a claimed user message
 * starting with `/agent-teams` gains the deterministic activation message
 * appended after every other injection, closest to the model's answer.
 * @param ctx - host context providing the `agent/pre-step` waterfall.
 */
export function installAgentTeamsGestureBoundary(ctx: Context): void {
  ctx.on('agent/pre-step', async (
    { messages, signal },
    next,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const goal = invokedAgentTeamsGoal(messages)
    if (goal === undefined) return decision
    signal.throwIfAborted()
    const activation = createUserMessage({
      content: [{ type: 'text', text: buildActivationDirective(goal) }],
      source: {
        kind: 'agent-teams-command',
        ...goal === '' ? {} : { goal },
      },
    })
    return { kind: 'enter', messages: [...decision.messages, activation] }
  })
}
