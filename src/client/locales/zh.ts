/**
 * Simplified Chinese dictionary for the agentTeams namespace (key-set source of truth).
 */
export const zh = {
  // Card
  'card.memberCount': '{count} 名成员',
  'card.openPanel': '打开活动面板',
  'card.panelTitle': '活动面板',

  // Task Status Labels
  'task.status.pending': '待领取',
  'task.status.claimed': '已认领',
  'task.status.in_progress': '进行中',
  'task.status.completed': '已完成',
  'task.status.failed': '失败',
  'task.status.cancelled': '已取消',
  'task.unclaimed': '待认领',

  // Collapsed Badge
  'badge.label': 'AgentTeams 活动，{count} 个团队',

  // Member State Labels
  'member.state.working': '工作中',
  'member.state.failed': '有失败',
  'member.state.waiting': '等待',
  'member.state.completed': '已交付',
  'member.state.left': '已离队',
  'member.state.removed': '已移除',
  'member.state.ready': '待执行',
  'member.state.unassigned': '待派工',

  // Member Status Descriptions
  'member.status.runningTask': '正在执行 {id}',
  'member.status.processingAssigned': '正在处理已派任务',
  'member.status.waitingTaskWithAssignee': '等待 {id} · {assignee}',
  'member.status.waitingDependency': '等待前置任务',
  'member.status.waitingDispatch': '等待队长派工',
  'member.status.tasksDelivered': '任务已交付',
  'member.status.waitingResume': '待继续执行',
  'member.status.unknown': '状态未知',

  // Team & Progress Summaries
  'team.status.waitingBreakdown': '等待队长拆解任务',
  'team.status.allDelivered': '全部 {count} 项任务已交付',
  'team.status.blockedWithRunning': '{tasks}{more} 等待前置，其余已开工',
  'team.status.moreCount': ' 等 {count} 项',
  'team.status.running': '{tasks} 正在执行',
  'team.status.ready': '{tasks} 已就绪待开工',
  'team.status.blocked': '{tasks} 等待前置',
  'team.status.waitingNext': '等待下一轮调度',

  'progress.ariaLabel': '团队总进度',
  'progress.title': '总进度',
  'progress.running': '■ 进行中 {count}',
  'progress.blocked': '■ 等待依赖 {count}',
  'progress.completed': '■ 已交付 {count}',

  // DAG & Dependency Map
  'dag.ariaLabel': '任务依赖链',
  'dag.parallelTasks': '并行任务',
  'dag.dependencies': '任务依赖',
  'dag.parallelHint': '无前后依赖 · 点击查看详情',
  'dag.hoverHint': '悬停高亮依赖链 · 点击固定',
  'dag.pinnedHint': '{id} 已固定 · Esc 取消',
  'dag.runningAriaLabel': '运行中',
  'dag.detail.completed': '已完成并交付',
  'dag.detail.noDeps': '无前置，可立即开工',
  'dag.detail.depsReady': '前置已就绪，可开工',
  'dag.detail.waitingDeps': '等待 {deps}',
  'dag.detail.noDependents': '无下游任务',
  'dag.detail.unlocks': '完成后解锁 {tasks}',

  // Team Section & Captain Delegation
  'team.historicPill': '已结束',
  'team.stats.members': '{count} 成员',
  'team.stats.tasksCompleted': '{completed}/{total} 完成',
  'team.stats.messages': '{count} 消息',
  'captain.delegationAriaLabel': '队长派工关系',
  'captain.title': '队长',
  'captain.role': '拆解 · 派发 · 汇总',
  'captain.summary': '已派发 {tasks} 项任务给 {members} 名成员',
  'captain.state.executing': '{count} 人执行中',
  'captain.state.allCollected': '已收齐',
  'captain.state.waitingReport': '等待回报',

  'roster.toggleTitle': '成员 {count}',
  'roster.collapse': '收起',
  'roster.expand': '展开',
  'roster.empty': '暂无成员，等待队长组建团队',
  'roster.dispatchedByCaptain': '队长派发',
  'roster.noTasks': '暂无任务',

  // Panel Header & Controls
  'panel.ariaLabel': 'AgentTeams 活动面板',
  'panel.title': 'AgentTeams 活动',
  'panel.dockFloating': '切换为浮动面板',
  'panel.dockRight': '停靠到右侧',
  'panel.collapse': '收起活动面板',
  'panel.empty': '暂无团队活动',
  'panel.archivedHeader': '已结束 · 历史归档',
}

export type AgentTeamsLocaleKey = keyof typeof zh
