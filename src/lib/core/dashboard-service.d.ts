import type { ExceptionTicket } from '@/types'

export function selectDashboardKeyTickets(
  tickets: ExceptionTicket[],
  options?: { limit?: number }
): ExceptionTicket[]

export function countDueSoonTickets(
  tickets: ExceptionTicket[],
  options?: { now?: string | Date; windowHours?: number }
): number

export function getDashboardTicketReason(
  ticket: Partial<ExceptionTicket>,
  options?: { now?: string | Date; windowHours?: number }
): string
