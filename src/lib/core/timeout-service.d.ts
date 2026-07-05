import type { ExceptionTicket } from '@/types'

export function processOverdueTicket(params: {
  ticket: ExceptionTicket
  now?: Date
}): {
  ticket: ExceptionTicket
  approvalRecord: Record<string, unknown>
} | null
