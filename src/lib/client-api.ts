export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: 'no-store' }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Request failed.')
  return data as T
}
export function assetUrl(url: string) {
  return url.startsWith('/uploads/') ? url.replace('/uploads/', '/api/assets/') : url
}
