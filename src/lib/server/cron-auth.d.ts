export function validateCronRequest(params: {
  headers: {
    get(name: string): string | null
  }
  secret?: string
}): {
  ok: boolean
  mode: 'unprotected' | 'secret'
}
