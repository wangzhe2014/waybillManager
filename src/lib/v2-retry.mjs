export async function requestJsonWithRetry({
  url,
  headers,
  timeoutMs = 3000,
  maxRetries = 2,
  fetchImpl = fetch,
}) {
  let lastError
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers,
      })
      const payload = await response.json().catch(() => null)

      if (response.status >= 500 && attempt <= maxRetries + 1) {
        lastError = new Error(`V2 HTTP ${response.status}`)
        if (attempt <= maxRetries) continue
      }

      return {
        response,
        payload,
        attempts: attempt,
      }
    } catch (error) {
      lastError = error
      if (attempt > maxRetries) throw error
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError || new Error('V2 request failed')
}
