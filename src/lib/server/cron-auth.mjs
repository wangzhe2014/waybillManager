export function validateCronRequest({ headers, secret }) {
  const configuredSecret = String(secret || '').trim()
  if (!configuredSecret) {
    return { ok: true, mode: 'unprotected' }
  }

  const authorization = headers.get('authorization') || ''
  const cronSecret = headers.get('x-cron-secret') || ''
  const bearerToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  if (bearerToken === configuredSecret || cronSecret === configuredSecret) {
    return { ok: true, mode: 'secret' }
  }

  return { ok: false, mode: 'secret' }
}
