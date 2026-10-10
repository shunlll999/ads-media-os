const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000'
export async function loginAdmin() {
  const r = await fetch(`${base}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    }),
  })
  const b = await r.json()
  if (!r.ok) throw Error(b.error)
  return { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' }
}
