import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT } from 'jose'
import pg from 'pg'
import { loginAdmin } from './auth-helpers.js'

const base = process.env.GATEWAY_TEST_URL ?? 'http://127.0.0.1:4000',
  prefix = `cmsqa-${crypto.randomUUID()}`
const admin = await loginAdmin()
async function req(path, body, headers = admin, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(`${base}/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, data: await r.json() }
}
test('JWT identity, all role boundaries, CMS persistence, account revocation, isolated drafts and audit', async () => {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    users = [],
    password = 'CMS-testing-long-password!'
  const settings = (await req('/cms/settings')).data.data
  try {
    assert.equal(
      (await req('/projects', undefined, { 'x-api-key': process.env.GATEWAY_API_KEY })).status,
      401,
    )
    assert.equal(
      (
        await req('/auth/me', undefined, {
          ...admin,
          Authorization: `${admin.Authorization}tampered`,
        })
      ).status,
      401,
    )
    const expired = await new SignJWT({ version: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(crypto.randomUUID())
      .setJti(crypto.randomUUID())
      .setIssuer('media-os-gateway')
      .setAudience('media-os')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET))
    assert.equal(
      (await req('/projects', undefined, { Authorization: `Bearer ${expired}` })).status,
      401,
    )
    const me = (await req('/auth/me')).data.user
    const beforeUsers = (await req('/auth/users')).data.data
    if (beforeUsers.filter((u) => u.active && u.role === 'admin').length === 1)
      assert.equal(
        (await req(`/auth/users/${me.id}`, { active: false }, admin, 'PATCH')).status,
        409,
      )
    const sessions = {}
    for (const role of ['editor', 'operator', 'commercial', 'viewer']) {
      const user = await req('/auth/users', {
        email: `${prefix}-${role}@example.test`,
        name: role,
        password,
        role,
      })
      assert.equal(user.status, 201)
      assert.equal('passwordHash' in user.data, false)
      users.push(user.data.id)
      const login = await req('/auth/login', { email: user.data.email, password }, {})
      assert.equal(login.status, 200)
      sessions[role] = {
        Authorization: `Bearer ${login.data.token}`,
        'Content-Type': 'application/json',
      }
      assert.equal((await req('/projects', undefined, sessions[role])).status, 200)
      assert.equal((await req('/auth/users', undefined, sessions[role])).status, 403)
      assert.equal((await req('/AUTH/users', undefined, sessions[role])).status, 403)
      assert.equal((await req('/CMS/audit', undefined, sessions[role])).status, 403)
    }
    for (const role of ['editor', 'operator', 'commercial', 'viewer']) {
      for (const [kind, reader, writer] of [
        ['audience', ['editor', 'operator'], 'editor'],
        ['sources', ['editor', 'operator'], 'editor'],
        ['issues', ['editor', 'operator', 'commercial', 'viewer'], 'operator'],
        ['proposals', ['commercial'], 'commercial'],
        ['invoices', ['commercial'], 'commercial'],
        ['reports', ['commercial'], 'commercial'],
      ]) {
        assert.equal(
          (await req(`/workspace/${kind}`, undefined, sessions[role])).status,
          reader.includes(role) ? 200 : 403,
        )
        for (const method of ['POST', 'PATCH'])
          assert.equal(
            (
              await req(
                `/workspace/${kind}${method === 'PATCH' ? '/missing-qa' : ''}`,
                {},
                sessions[role],
                method,
              )
            ).status,
            role === writer ? 400 : 403,
          )
        assert.equal(
          (await req(`/workspace/${kind}/missing-qa`, undefined, sessions[role], 'DELETE')).status,
          role === writer ? 404 : 403,
        )
      }
      assert.equal(
        (await req('/programmatic/deals/missing-qa', undefined, sessions[role], 'DELETE')).status,
        role === 'operator' ? 404 : 403,
      )
      assert.equal(
        (await req('/campaigns/missing-qa', {}, sessions[role], 'PATCH')).status,
        role === 'operator' ? 400 : 403,
      )
      assert.equal(
        (await req('/cms/records/screens/missing-qa', undefined, sessions[role], 'DELETE')).status,
        ['editor', 'operator'].includes(role) ? 404 : 403,
      )
    }
    assert.equal(
      (await req('/cms/settings/overview', { ...settings.overview, source: 'real' }, admin, 'PUT'))
        .status,
      400,
    )
    for (const role of ['operator', 'commercial', 'viewer'])
      assert.equal(
        (await req('/cms/settings/overview', settings.overview, sessions[role], 'PUT')).status,
        403,
      )
    const overview = {
      ...settings.overview,
      network: { ...settings.overview.network, availableUnits: 777 },
    }
    assert.equal(
      (await req('/cms/settings/overview', overview, sessions.editor, 'PUT')).status,
      200,
    )
    assert.equal((await req('/cms/settings')).data.data.overview.network.availableUnits, 777)
    assert.equal((await req('/media', {}, sessions.operator)).status, 403)
    assert.equal((await req('/programmatic/deals', {}, sessions.editor)).status, 403)
    assert.equal((await req('/programmatic/commercial/target', {}, sessions.operator)).status, 403)
    assert.equal(
      (await req('/programmatic/commercial/target', {}, sessions.commercial)).status,
      400,
    )
    assert.equal((await req('/programmatic/deals', {}, sessions.operator)).status, 400)
    assert.equal(
      (await req(`/cms/records/inventory/${prefix}`, undefined, sessions.viewer, 'DELETE')).status,
      403,
    )
    for (const role of ['editor', 'operator', 'viewer']) {
      assert.equal((await req('/programmatic/commercial', undefined, sessions[role])).status, 403)
      assert.equal((await req('/PROGRAMMATIC/commercial', undefined, sessions[role])).status, 403)
    }
    assert.equal(
      (await req('/programmatic/commercial', undefined, sessions.commercial)).status,
      200,
    )
    assert.equal((await req('/cms/records/screens', undefined, sessions.editor)).status, 200)
    for (const role of ['operator', 'commercial', 'viewer']) {
      assert.equal((await req('/cms/records/screens', undefined, sessions[role])).status, 403)
      assert.equal((await req('/export', undefined, sessions[role])).status, 403)
    }
    assert.equal(
      (await req('/programmatic/connections/disconnect', {}, sessions.operator)).status,
      400,
    )
    for (const role of ['editor', 'commercial', 'viewer'])
      assert.equal(
        (await req('/programmatic/connections/disconnect', { name: 'SSP' }, sessions[role])).status,
        403,
      )
    const draft = { name: prefix, budget: 4321 }
    assert.equal((await req('/cms/draft', draft, sessions.viewer, 'PUT')).status, 200)
    assert.equal((await req('/cms/draft', undefined, sessions.viewer)).data.data.name, prefix)
    assert.equal((await req('/cms/draft', undefined, sessions.editor)).data.data, null)
    assert.equal((await req('/auth/logout', {}, sessions.viewer)).status, 200)
    assert.equal((await req('/auth/me', undefined, sessions.viewer)).status, 401)
    const operator = users[1]
    assert.equal(
      (await req(`/auth/users/${operator}`, { role: 'viewer' }, admin, 'PATCH')).status,
      200,
    )
    assert.equal((await req('/auth/me', undefined, sessions.operator)).status, 401)
    const viewer = users[3]
    assert.equal(
      (await req(`/auth/users/${viewer}`, { active: false }, admin, 'PATCH')).status,
      200,
    )
    assert.equal(
      (await req('/auth/login', { email: `${prefix}-viewer@example.test`, password }, {})).status,
      401,
    )
    assert.equal(
      (await req('/cms/audit')).data.data.some((a) => a.action === 'setting.save'),
      true,
    )
    const saved = await req(
      `/cms/records/inventory/${prefix}`,
      {
        id: prefix,
        name: prefix,
        area: 'QA',
        type: 'Digital',
        dataSource: 'mock',
        price: 100,
        latitude: 13,
        longitude: 100,
        availableFrom: '2026-11-01',
        availableTo: '2026-11-30',
      },
      sessions.editor,
      'PUT',
    )
    assert.equal(saved.status, 200)
    assert.equal((await req(`/media/${prefix}`)).data.name, prefix)
    assert.equal(
      (await req(`/cms/records/inventory/${prefix}`, undefined, sessions.viewer, 'DELETE')).status,
      401,
    )
    assert.equal(
      (await req(`/cms/records/inventory/${prefix}`, undefined, sessions.editor, 'DELETE')).status,
      200,
    )
    assert.equal((await req(`/media/${prefix}`)).status, 404)
  } finally {
    await req('/cms/settings/overview', settings.overview, admin, 'PUT')
    await db.query('DELETE FROM inventory WHERE id=$1', [prefix])
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users])
    await db.query('DELETE FROM audit_logs WHERE user_id=ANY($1::text[]) OR resource LIKE $2', [
      users,
      `%${prefix}%`,
    ])
    await db.query("UPDATE workspace_settings SET payload=payload-$1 WHERE key='seedTombstones'", [
      `inventory/${prefix}`,
    ])
    await db.end()
  }
})
