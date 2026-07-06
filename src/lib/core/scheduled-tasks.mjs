export const scheduledTaskConfigs = [
  {
    id: 'timeout-auto-flow',
    name: '超时自动流转',
    category: '审批流',
    path: '/api/timeouts/process',
    schedule: '*/5 * * * *',
    scheduleText: '每 5 分钟',
    manualMethod: 'POST',
    enabled: true,
    description: '扫描超时审批工单，待审批/一级超时自动升级二级，二级超时自动驳回并关闭。',
  },
]
