import { zh, type AgentTeamsLocaleKey } from './zh.ts'
import { en } from './en.ts'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

export { zh, en }
export type { AgentTeamsLocaleKey }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    agentTeams: AgentTeamsLocaleKey
  }
}

/**
 * Fallback translate function for environments or tests where the slots/locale
 * service is not mounted.
 */
export const defaultTranslate: TranslateNS<'agentTeams'> = (key, params) => {
  const isEn = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('en')
  const dict = isEn ? en : zh
  const template = (dict as Record<string, string>)[key] ?? (zh as Record<string, string>)[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match)
}
