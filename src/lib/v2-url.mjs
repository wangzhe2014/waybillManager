export function normalizeV2BaseUrl(baseUrl) {
  return String(baseUrl || '').replace('://localhost', '://127.0.0.1')
}
