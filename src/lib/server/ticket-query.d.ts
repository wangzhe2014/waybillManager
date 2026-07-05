import type { ExceptionTicket } from '@/types'

export type TicketQueryParams = {
  status?: string
  waybillNo?: string
  exceptionType?: string
  approver?: string
  page?: string | number | null
  pageSize?: string | number | null
}

export type TicketQueryResult = {
  tickets: ExceptionTicket[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function queryTickets(
  tickets: ExceptionTicket[],
  params?: TicketQueryParams
): TicketQueryResult

export function queryParamsFromSearch(searchParams: URLSearchParams): TicketQueryParams
