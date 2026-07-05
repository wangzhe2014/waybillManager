import type { ExceptionTicket } from '@/types'

type ActorProfile = {
  id?: string
  actorId?: string
  roles?: string[]
}

export function getTicketActionBlockReason(params: {
  ticket: Partial<ExceptionTicket>
  actor: ActorProfile
  action: 'approve' | 'reject' | 'resubmit' | 'fast_release' | 'execute'
  maxResubmitCount?: number
}): string

export function buildApprovalWorkbench(params: {
  tickets: ExceptionTicket[]
  actor: ActorProfile
}): {
  pendingRows: ExceptionTicket[]
  allPendingRows: ExceptionTicket[]
  executingRows: ExceptionTicket[]
  metrics: {
    mineCount: number
    approvableCount: number
    fastReleaseCount: number
  }
}
