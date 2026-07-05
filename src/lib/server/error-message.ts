export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ['message', 'error', 'details', 'hint', 'code']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return fallback
}
