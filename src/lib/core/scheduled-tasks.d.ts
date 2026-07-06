export type ScheduledTaskConfig = {
  id: string
  name: string
  category: string
  path: string
  schedule: string
  scheduleText: string
  manualMethod: 'GET' | 'POST'
  enabled: boolean
  description: string
}

export const scheduledTaskConfigs: ScheduledTaskConfig[]
