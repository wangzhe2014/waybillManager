import type { ExceptionTicket } from '@/types'

export function approveTicket(params: {
  ticket: ExceptionTicket
  actor: { id: string; roles?: string[] }
  decision: 'approved' | 'rejected'
  opinion: string
  expectedVersion: number
  idempotencyKey: string
}): {
  ticket: ExceptionTicket
  approvalRecord: Record<string, unknown>
}

export function resubmitRejectedTicket(params: {
  ticket: ExceptionTicket
  actor: { id: string; roles?: string[] }
  reason: string
  maxResubmitCount?: number
}): {
  ticket: ExceptionTicket
  event: Record<string, unknown>
}

export function fastReleaseQualityTicket(params: {
  ticket: ExceptionTicket
  actor: { id: string; roles?: string[] }
  reason: string
}): {
  ticket: ExceptionTicket
  batchStatus: string
  approvalRecord: Record<string, unknown>
}
