export function requestJsonWithRetry<T = unknown>(params: {
  url: string
  headers: Record<string, string>
  timeoutMs?: number
  maxRetries?: number
  fetchImpl?: typeof fetch
}): Promise<{
  response: Response
  payload: T | null
  attempts: number
}>
