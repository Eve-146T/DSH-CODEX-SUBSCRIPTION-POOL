import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { OpenAICodexAuth } from '../lib/index.js'
import { imageToolDefinition } from '../lib/image-tool.js'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII='
const wire = vi.hoisted(() => ({ headers: [] as Record<string, string>[] }))
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  class Socket extends EventEmitter {
    static OPEN = 1
    static CONNECTING = 0
    readyState = 0
    constructor(_url: string, options: { headers: Record<string, string> }) {
      super()
      wire.headers.push({ ...options.headers })
      queueMicrotask(() => { this.readyState = 1; this.emit('open') })
    }
    send(_body: string) {
      queueMicrotask(() => {
        this.emit('message', Buffer.from(JSON.stringify({ type: 'response.output_item.done', item: {
          type: 'web_search_call', action: { sources: [{ url: 'https://example.test/' }] },
        } })))
        this.emit('message', Buffer.from(JSON.stringify({ type: 'response.completed', response: { output: [
          { type: 'image_generation_call', result: png, output_format: 'png' },
        ] } })))
      })
    }
    terminate() { this.readyState = 3 }
  }
  return { default: Socket }
})

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  wire.headers.length = 0
})
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'codex-responses-test-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const path = join(home, 'accounts.json')
  await writeFile(path, JSON.stringify({ version: 2, activeAccountId: 'A', accounts: ['A', 'B'].map(id => ({
    accountId: id, access: `fake-access-${id}`, refresh: `fake-refresh-${id}`, expires: Date.now() + 3600_000,
  })) }))
  const ctx = new Context()
  const values = new Map<string, string>()
  ctx.provide('credentials', {
    resolve: async (key: string) => values.has(key) ? { value: values.get(key), source: 'test' } : undefined,
    set: async (key: string, value: string) => { values.set(key, value) },
    unset: async (key: string) => { values.delete(key) },
  })
  ctx.provide('llm', {})
  let search!: WebSearchProvider
  ctx.provide('web', { registerSearchProvider(provider: WebSearchProvider) { search = provider; return () => {} } })
  const saveImage = vi.fn(async (input: { data: Uint8Array }) => ({
    attachmentId: AttachmentId('generated-image'), mediaType: 'image/png', bytes: input.data.byteLength, width: 1, height: 1,
  }))
  ctx.provide('attachments', { saveImage })
  const plugin = ctx.plugin(OpenAICodexAuth, { path, preferencesPath: join(home, 'preferences.json') })
  await plugin.await()
  cleanups.push(() => plugin.dispose())
  await ctx.openaiCodexAuth.credential()
  return { ctx, search, saveImage }
}

describe('shared account identity for direct Responses tools', () => {
  it('uses the selected account for search and image generation', async () => {
    const f = await fixture()
    expect((await f.search.search({ query: 'test query' })).sources).toEqual([{ url: 'https://example.test/' }])
    await f.ctx.openaiCodexAuth.account('activate', { accountId: 'B' })
    const tool = imageToolDefinition(f.ctx)
    const exec = { signal: new AbortController().signal } as ToolRunContext
    await tool.execute({ prompt: 'test image' }, exec)
    expect(wire.headers.map(headers => headers.authorization)).toEqual(['Bearer fake-access-A', 'Bearer fake-access-B'])
    expect(wire.headers.map(headers => headers['chatgpt-account-id'])).toEqual(['A', 'B'])
    expect(f.saveImage).toHaveBeenCalledOnce()
    expect(Buffer.from(f.saveImage.mock.calls[0]![0].data).equals(Buffer.from(png, 'base64'))).toBe(true)
  })
})
