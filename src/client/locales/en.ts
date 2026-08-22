import type { AgentTeamsLocaleKey } from './zh.ts'

/**
 * English dictionary for the agentTeams namespace (checked complete against the zh key set).
 */
export const en: Record<AgentTeamsLocaleKey, string> = {
  // Card
  'card.memberCount': '{count} members',
  'card.openPanel': 'Open activity panel',
  'card.panelTitle': 'Activity Panel',

  // Task Status Labels
  'task.status.pending': 'Pending',
  'task.status.claimed': 'Claimed',
  'task.status.in_progress': 'In Progress',
  'task.status.completed': 'Completed',
  'task.status.failed': 'Failed',
  'task.status.cancelled': 'Cancelled',
  'task.unclaimed': 'Unclaimed',

  // Collapsed Badge
  'badge.label': 'AgentTeams activity, {count} teams',

  // Member State Labels
  'member.state.working': 'Working',
  'member.state.failed': 'Has Failures',
  'member.state.waiting': 'Waiting',
  'member.state.completed': 'Delivered',
  'member.state.left': 'Left Team',
  'member.state.removed': 'Removed',
  'member.state.ready': 'Queued',
  'member.state.unassigned': 'Unassigned',

  // Member Status Descriptions
  'member.status.runningTask': 'Running {id}',
  'member.status.processingAssigned': 'Processing assigned task',
  'member.status.waitingTaskWithAssignee': 'Waiting for {id} · {assignee}',
  'member.status.waitingDependency': 'Waiting for dependencies',
  'member.status.waitingDispatch': 'Waiting for captain assignment',
  'member.status.tasksDelivered': 'Tasks delivered',
  'member.status.waitingResume': 'Waiting to resume',
  'member.status.unknown': 'Status unknown',

  // Team & Progress Summaries
  'team.status.waitingBreakdown': 'Waiting for captain to break down tasks',
  'team.status.allDelivered': 'All {count} tasks delivered',
  'team.status.blockedWithRunning': '{tasks}{more} waiting for dependencies, others started',
  'team.status.moreCount': ' and {count} more',
  'team.status.running': '{tasks} running',
  'team.status.ready': '{tasks} ready to start',
  'team.status.blocked': '{tasks} waiting for dependencies',
  'team.status.waitingNext': 'Waiting for next schedule',

  'progress.ariaLabel': 'Team overall progress',
  'progress.title': 'Overall Progress',
  'progress.running': '■ In progress {count}',
  'progress.blocked': '■ Waiting {count}',
  'progress.completed': '■ Delivered {count}',

  // DAG & Dependency Map
  'dag.ariaLabel': 'Task dependency chain',
  'dag.parallelTasks': 'Parallel Tasks',
  'dag.dependencies': 'Task Dependencies',
  'dag.parallelHint': 'No dependencies · Click for details',
  'dag.hoverHint': 'Hover to highlight chain · Click to pin',
  'dag.pinnedHint': '{id} pinned · Esc to cancel',
  'dag.runningAriaLabel': 'Running',
  'dag.detail.completed': 'Completed and delivered',
  'dag.detail.noDeps': 'No dependencies, ready to start',
  'dag.detail.depsReady': 'Dependencies ready to start',
  'dag.detail.waitingDeps': 'Waiting for {deps}',
  'dag.detail.noDependents': 'No downstream tasks',
  'dag.detail.unlocks': 'Unlocks {tasks} upon completion',

  // Team Section & Captain Delegation
  'team.historicPill': 'Ended',
  'team.stats.members': '{count} members',
  'team.stats.tasksCompleted': '{completed}/{total} completed',
  'team.stats.messages': '{count} messages',
  'captain.delegationAriaLabel': 'Captain delegation',
  'captain.title': 'Captain',
  'captain.role': 'Decompose · Dispatch · Aggregate',
  'captain.summary': 'Dispatched {tasks} tasks to {members} members',
  'captain.state.executing': '{count} running',
  'captain.state.allCollected': 'All collected',
  'captain.state.waitingReport': 'Waiting for reports',

  'roster.toggleTitle': 'Members {count}',
  'roster.collapse': 'Collapse',
  'roster.expand': 'Expand',
  'roster.empty': 'No members yet, waiting for captain to assemble team',
  'roster.dispatchedByCaptain': 'Dispatched',
  'roster.noTasks': 'No tasks',

  // Panel Header & Controls
  'panel.ariaLabel': 'AgentTeams Activity Panel',
  'panel.title': 'AgentTeams Activity',
  'panel.dockFloating': 'Switch to floating window',
  'panel.dockRight': 'Dock to right',
  'panel.collapse': 'Collapse activity panel',
  'panel.empty': 'No active teams',
  'panel.archivedHeader': 'Ended · History Archive',
}
