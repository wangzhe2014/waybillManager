export const roleOptions = [
  {
    key: 'operator',
    label: '操作员',
    actorId: 'operator-demo',
    roles: ['operator'],
  },
  {
    key: 'level1_approver',
    label: '一级审批人',
    actorId: 'approver-level1-demo',
    roles: ['level1_approver'],
  },
  {
    key: 'level2_approver',
    label: '二级审批人',
    actorId: 'approver-level2-demo',
    roles: ['level2_approver'],
  },
  {
    key: 'quality_manager',
    label: '品控主管',
    actorId: 'quality-manager-demo',
    roles: ['quality_manager'],
  },
  {
    key: 'executor',
    label: '执行专员',
    actorId: 'executor-demo',
    roles: ['executor'],
  },
]

export function getActorProfile(key) {
  return roleOptions.find((option) => option.key === key) || roleOptions[0]
}
