// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'

const { act } = React
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function mountCard(rejectSelection = false, modelsGate?: Promise<void>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let active = 'A'
  const calls: { action: string; input: Record<string, unknown> }[] = []
  const rpc = { call: vi.fn(async (channel, endpoint, payload) => {
    expect(channel).toBe('/api')
    expect(endpoint).toBe('openaiCodexAuth/account')
    const { action, input } = payload.args
    calls.push({ action, input })
    if (action === 'models') {
      if (modelsGate) await modelsGate
      return { ok: true, value: { models: [] } }
    }
    if (action === 'activate') {
      if (rejectSelection) return { ok: false, error: { code: 'codex/operation-failed', message: 'Could not select this account.' } }
      active = input.accountId
      return { ok: true, value: { ok: true } }
    }
    if (action === 'status') return { ok: true, value: {
      loggedIn: true, loginPending: false, activeAccountId: active,
      accounts: ['A', 'B'].map(id => ({ accountId: id, email: `${id}@example.test`, active: id === active, usage: {} })),
    } }
    throw new Error(`Unexpected action ${action}`)
  }) }
  type ClientPlugin = { inject: string[]; apply(ctx: Context): void }
  let client: ClientPlugin | undefined
  const loader = { load(module: { factory(require: (name: string) => unknown): ClientPlugin }) {
    client = module.factory((name: string) => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return {
        Button({ variant: _variant, size: _size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) { return React.createElement('button', props) },
      }
      throw new Error(`Unexpected client dependency ${name}`)
    })
  } }
  Object.defineProperty(window, '__ModuleLoader__', { configurable: true, value: loader })
  const source = readFileSync(new NodeURL('../client.js', import.meta.url), 'utf8')
  new Function('window', source)(window)
  expect(client).toBeDefined()
  const entries: { options: Record<string, unknown>; component: React.ComponentType }[] = []
  const dictionaries = new Map<string, Record<string, string>>()
  const ctx = new Context()
  ctx.provide('connection', { rpc })
  ctx.provide('sessions', { binding: () => undefined })
  ctx.provide('remote.session', {})
  ctx.provide('locale', {
    register(ns: string, values: { en: Record<string, string> }) { dictionaries.set(ns, values.en); return () => dictionaries.delete(ns) },
    bind(ns: string) { return (key: string) => dictionaries.get(ns)?.[key] ?? key },
  })
  ctx.provide('slots', {
    inject(_name: string, callback: () => unknown) { return callback() },
    register(options: Record<string, unknown>, component: React.ComponentType) { entries.push({ options, component }); return () => {} },
  })
  const plugin = ctx.plugin(client!)
  await plugin.await()
  cleanups.push(() => plugin.dispose())
  const entry = entries.find(entry => entry.options.name === 'settings.section')!
  expect(entry).toBeDefined()
  const element = document.createElement('div')
  document.body.append(element)
  const root: Root = createRoot(element)
  cleanups.push(async () => { await act(async () => root.unmount()) })
  await act(async () => { root.render(React.createElement(entry.component)) })
  return { element, calls, plugin, rpc, active: () => active }
}

function activateButton(element: Element, index: number) {
  const row = element.querySelectorAll('.codexAccountGroup')[index]!
  return [...row.querySelectorAll('button')].find(button => button.textContent === 'Activate account')!
}

describe('account card on the current DSH transport', () => {
  it('selects B without initiating OAuth and retains both visible accounts', async () => {
    const f = await mountCard()
    expect(f.element.querySelectorAll('.codexAccountGroup')).toHaveLength(2)
    await act(async () => { activateButton(f.element, 1).click() })
    expect(f.active()).toBe('B')
    expect(f.element.querySelectorAll('.codexAccountGroup')).toHaveLength(2)
    expect(f.element.querySelectorAll('.codexAccountGroup')[1]!.textContent).toContain('Active account')
    expect(f.calls.filter(call => call.action === 'activate')).toEqual([{ action: 'activate', input: { accountId: 'B' } }])
    expect(f.calls.some(call => call.action === 'start' || call.action === 'start-device')).toBe(false)
  })

  it('keeps A and both account cards visible when selection fails', async () => {
    const f = await mountCard(true)
    await act(async () => { activateButton(f.element, 1).click() })
    expect(f.active()).toBe('A')
    expect(f.element.querySelectorAll('.codexAccountGroup')).toHaveLength(2)
    expect(f.element.querySelector('[role="alert"]')?.textContent).toContain('Could not select this account.')
  })

  it('does not recreate catalog UI when a request finishes after plugin removal', async () => {
    const provider = document.createElement('li')
    provider.innerHTML = '<span>openai-codex</span>'
    document.body.append(provider)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const f = await mountCard(false, gate)
    expect(document.querySelector('[data-codex-model-catalog]')).not.toBeNull()
    await f.plugin.dispose()
    await act(async () => { release() })
    expect(document.querySelector('[data-codex-model-catalog]')).toBeNull()
  })

  it('cleans up styles and observers when the client plugin is removed', async () => {
    const f = await mountCard()
    expect(document.querySelector('style[data-plugin="dsh-openai-codex-auth"]')).not.toBeNull()
    await f.plugin.dispose()
    expect(document.querySelector('style[data-plugin="dsh-openai-codex-auth"]')).toBeNull()
  })
})
