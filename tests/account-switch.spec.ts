import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PeerId, PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import { OpenAICodexAuth } from '../lib/index.js'

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  vi.unstubAllGlobals()
})
function token(id: string) {
  return ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: id },
  })).toString('base64url'), 'fake'].join('.')
}
function credential(id: string, expires = Date.now() + 3600_000) {
  return { accountId: id, access: token(id), refresh: `fake-refresh-${id}`, expires }
}
async function fixture(accounts = [credential('A'), credential('B')], drainStartup = true) {
  const home = await mkdtemp(join(tmpdir(), 'codex-pool-test-'))
  disposers.push(() => rm(home, { recursive: true, force: true }))
  const path = join(home, 'accounts.json')
  await writeFile(path, JSON.stringify({ version: 2, activeAccountId: 'A', accounts }))
  const ctx = new Context()
  const values = new Map<string, string>()
  const credentials = {
    resolve: vi.fn(async (key: string) => values.has(key) ? { value: values.get(key), source: 'test' } : undefined),
    set: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
    unset: vi.fn(async (key: string) => { values.delete(key) }),
    readRecord: vi.fn(async () => undefined),
    listRecords: vi.fn(async () => []),
  }
  ctx.provide('credentials', credentials)
  ctx.provide('web', { registerSearchProvider: () => () => {} })
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  disposers.push(() => llm.dispose())
  const adapter = ctx.plugin(piAi, { providers: { 'openai-codex': { apiKeyEnv: 'DSH_OPENAI_CODEX_TOKEN', transport: 'sse' } } })
  await adapter.await()
  disposers.push(() => adapter.dispose())
  const plugin = ctx.plugin(OpenAICodexAuth, { path, preferencesPath: join(home, 'preferences.json') })
  await plugin.await()
  disposers.push(() => plugin.dispose())
  const auth = ctx.openaiCodexAuth
  // Drain the startup publication under the same file lock before injecting failures.
  if (drainStartup) await auth.credential()
  return { ctx, auth, plugin, home, credentials, values, path, read: async () => JSON.parse(await readFile(path, 'utf8')) }
}
function modelResponse() {
  const item = { id: 'test-message', type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: 'OK', annotations: [] }] }
  const response = { id: 'test-response', status: 'completed', output: [item],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
  const events = [
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
    { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}
async function model(ctx: Context) {
  const chunks = []
  for await (const chunk of ctx.llm.stream({ provider: 'openai-codex', model: 'gpt-6.1-sol',
    messages: [createUserMessage({ content: [{ type: 'text', text: 'Reply briefly.' }], source: { kind: 'user' } })] })) {
    if (chunk.type === 'finish' && chunk.reason.kind === 'error') throw new Error(JSON.stringify(chunk.reason.failure))
    chunks.push(chunk)
  }
  return chunks
}

describe('manual account selection through the shipped adapter', () => {
  it('routes ordinary model requests A → B → A without OAuth, including cold startup', async () => {
    const f = await fixture(undefined, false)
    const used: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      used.push(new Headers(init.headers).get('authorization')!)
      return modelResponse()
    }))
    await model(f.ctx)
    await f.auth.account('activate', { accountId: 'B' })
    await model(f.ctx)
    await f.auth.account('activate', { accountId: 'A' })
    await model(f.ctx)
    expect(used).toEqual([`Bearer ${token('A')}`, `Bearer ${token('B')}`, `Bearer ${token('A')}`])
    expect((await f.read()).activeAccountId).toBe('A')
    expect((await f.read()).accounts).toHaveLength(2)
  })

  it('keeps A selected after a quota error until the owner explicitly selects B', async () => {
    const f = await fixture()
    const used: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const bearer = new Headers(init.headers).get('authorization')!
      used.push(bearer)
      if (bearer === `Bearer ${token('A')}`) return Response.json({
        error: { type: 'usage_limit_reached', message: 'Synthetic account quota reached' },
      }, { status: 429, headers: { 'retry-after': '0' } })
      return modelResponse()
    }))
    await expect(model(f.ctx)).rejects.toThrow()
    expect((await f.read()).activeAccountId).toBe('A')
    expect(used.every(value => value === `Bearer ${token('A')}`)).toBe(true)
    await f.auth.account('activate', { accountId: 'B' })
    await model(f.ctx)
    expect(used.at(-1)).toBe(`Bearer ${token('B')}`)
  })

  it('does not publish a target whose refresh fails', async () => {
    const f = await fixture([credential('A'), credential('B', 0)])
    vi.stubGlobal('fetch', vi.fn(async () => new Response('provider details must stay private', { status: 401 })))
    await expect(f.auth.account('activate', { accountId: 'B' })).rejects.toMatchObject({ code: 'codex/operation-failed' })
    expect((await f.read()).activeAccountId).toBe('A')
    expect(f.values.get('DSH_OPENAI_CODEX_TOKEN')).toBe(token('A'))
  })

  it('refreshes the target before publishing selection and persists it', async () => {
    const f = await fixture([credential('A'), credential('B', 0)])
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: token('B'), refresh_token: 'new-fake-refresh-B', expires_in: 3600,
    })))
    await f.auth.account('activate', { accountId: 'B' })
    expect((await f.read()).activeAccountId).toBe('B')
    expect((await f.read()).accounts[1].refresh).toBe('new-fake-refresh-B')
    expect(f.values.get('DSH_OPENAI_CODEX_TOKEN')).toBe(token('B'))
  })

  it('restores both stores after credential publication fails', async () => {
    const f = await fixture()
    f.credentials.set.mockRejectedValueOnce(new Error('synthetic store failure'))
    await expect(f.auth.account('activate', { accountId: 'B' })).rejects.toMatchObject({ code: 'codex/operation-failed' })
    expect((await f.read()).activeAccountId).toBe('A')
    expect(f.values.get('DSH_OPENAI_CODEX_TOKEN')).toBe(token('A'))
  })

  it('keeps a running model request on A and admits subsequent requests with B', async () => {
    const f = await fixture()
    let release!: () => void
    let admitted!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { admitted = resolve })
    const used: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      used.push(new Headers(init.headers).get('authorization')!)
      if (used.length === 1) { admitted(); await gate }
      return modelResponse()
    }))
    const running = model(f.ctx)
    await Promise.race([started, running.then(() => { throw new Error('Model request finished before admission') })])
    try {
      await f.auth.account('activate', { accountId: 'B' })
    } finally { release() }
    await running
    await model(f.ctx)
    expect(used).toEqual([`Bearer ${token('A')}`, `Bearer ${token('B')}`])
  })

  it('preserves a rotated target grant if selecting it cannot publish the bearer token', async () => {
    const f = await fixture([credential('A'), credential('B', 0)])
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      access_token: token('B'), refresh_token: 'rotated-fake-refresh-B', expires_in: 3600,
    })))
    f.credentials.set.mockRejectedValueOnce(new Error('synthetic store failure'))
    await expect(f.auth.account('activate', { accountId: 'B' })).rejects.toMatchObject({ code: 'codex/operation-failed' })
    const saved = await f.read()
    expect(saved.activeAccountId).toBe('A')
    expect(saved.accounts[1].refresh).toBe('rotated-fake-refresh-B')
    expect(f.values.get('DSH_OPENAI_CODEX_TOKEN')).toBe(token('A'))
  })

  it('retains the selected account and both grants after a service restart', async () => {
    const f = await fixture()
    await f.auth.account('activate', { accountId: 'B' })
    await f.plugin.dispose()
    const restarted = f.ctx.plugin(OpenAICodexAuth, { path: f.path, preferencesPath: join(f.home, 'preferences.json') })
    await restarted.await()
    disposers.push(() => restarted.dispose())
    expect((await f.ctx.openaiCodexAuth.credential())?.accountId).toBe('B')
    expect((await f.read()).accounts).toHaveLength(2)
    await f.ctx.openaiCodexAuth.account('activate', { accountId: 'A' })
    expect((await f.read()).activeAccountId).toBe('A')
  })

  it('serializes overlapping selections using the existing credential-file lock', async () => {
    const f = await fixture([credential('A'), credential('B', 0)])
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const refreshing = new Promise<void>(resolve => { entered = resolve })
    vi.stubGlobal('fetch', vi.fn(async () => {
      entered()
      await gate
      return Response.json({ access_token: token('B'), refresh_token: 'rotated-fake-refresh-B', expires_in: 3600 })
    }))
    const first = f.auth.account('activate', { accountId: 'B' })
    await Promise.race([refreshing, first.then(() => { throw new Error('Selection skipped refresh') })])
    const second = f.auth.account('activate', { accountId: 'A' })
    release()
    await Promise.all([first, second])
    expect((await f.read()).activeAccountId).toBe('A')
    expect(f.values.get('DSH_OPENAI_CODEX_TOKEN')).toBe(token('A'))
  })

  it('blocks requests visibly if publication and restoration both fail', async () => {
    const f = await fixture()
    f.credentials.set.mockRejectedValue(new Error('synthetic store failure'))
    await expect(f.auth.account('activate', { accountId: 'B' })).rejects.toMatchObject({ code: 'codex/operation-failed' })
    await expect(f.auth.credential()).rejects.toThrow('account state is unavailable')
    const status = await f.auth.account('status', {})
    expect(status.accountStateUnavailable).toBe(true)
    expect(status.activeAccountId).toBeUndefined()
    expect(status.accounts).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: 'A', active: false })]))
    f.credentials.set.mockImplementation(async (key, value) => { f.values.set(key, value) })
    await f.auth.account('activate', { accountId: 'A' })
    expect((await f.auth.credential())?.accountId).toBe('A')
  })

  it('does not expose tokens through account status', async () => {
    const f = await fixture()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})))
    const status = JSON.stringify(await f.auth.account('status', {}))
    expect(status).not.toContain(token('A'))
    expect(status).not.toContain('fake-refresh')
    expect(status).not.toContain('csrf')
  })

  it('dispatches the compiled account method through the current Typert gateway', async () => {
    const f = await fixture()
    const registry = f.ctx.plugin(TypertRegistry)
    await registry.await()
    disposers.push(() => registry.dispose())
    f.ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
    const gateway = f.ctx.plugin(Gateway, {})
    await gateway.await()
    disposers.push(() => gateway.dispose())
    const peer: PeerScope = {
      id: brandString<PeerId>('pool-test-owner'), ctx: f.ctx, principal: { kind: 'owner' },
      signal: new AbortController().signal, interactions: 'none', dispose: async () => {},
    }
    expect(await f.ctx.typertGateway.invoke({ namespace: 'openaiCodexAuth', method: 'account',
      args: { action: 'activate', input: { accountId: 'B' } }, peer })).toEqual({ ok: true })
    expect((await f.read()).activeAccountId).toBe('B')
  })

  it('clears a pending browser sign-in when the owner cancels it', async () => {
    const f = await fixture()
    const started = await f.auth.account('start', { add: true })
    expect(typeof started.url).toBe('string')
    // Whether the loopback listener bound in this sandbox or not, cancelling must clear every wait state.
    expect(await f.auth.account('cancel-login', {})).toEqual({ ok: true })
    const status = await f.auth.account('status', {})
    expect(status.loginPending).toBe(false)
    expect(status.loginError).toBeUndefined()
    // Cancelling twice is harmless: the card can retry without a stuck state.
    expect(await f.auth.account('cancel-login', {})).toEqual({ ok: true })
    expect((await f.auth.account('status', {})).loginPending).toBe(false)
  })

  it('denies non-owner Remote callers before reading or changing accounts', async () => {
    const f = await fixture()
    const caller = f.ctx.extend({ invocation: { peer: { principal: { kind: 'api-client', id: 'untrusted' } } } })
    await expect(caller.openaiCodexAuth.account('remove', { accountId: 'A' }))
      .rejects.toMatchObject({ code: 'codex/forbidden' })
    expect((await f.read()).accounts).toHaveLength(2)
  })
})
