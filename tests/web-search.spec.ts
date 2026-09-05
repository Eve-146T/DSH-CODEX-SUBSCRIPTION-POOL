import { describe, expect, it } from 'vitest'
import {
  codexWebSocketUrl,
  normalizeWebSearchEvents,
  parseCodexWebSocketEvent,
} from '../src/index.ts'

describe('normalizeWebSearchEvents', () => {
  it('uses the authenticated Responses endpoint over WebSocket', () => {
    expect(codexWebSocketUrl()).toBe('wss://chatgpt.com/backend-api/codex/responses')
    expect(codexWebSocketUrl('http://localhost:3080/codex/responses')).toBe('ws://localhost:3080/codex/responses')
  })

  it('parses JSON WebSocket events and ignores keepalives', () => {
    expect(parseCodexWebSocketEvent(Buffer.from('{"type":"response.completed"}')))
      .toEqual({ type: 'response.completed' })
    expect(parseCodexWebSocketEvent(Buffer.from('keepalive'))).toBeUndefined()
  })

  it('prefers cited sources, retains discovered URLs, and joins answer deltas', () => {
    expect(normalizeWebSearchEvents([
      { type: 'response.output_text.delta', delta: 'A short ' },
      { type: 'response.output_item.done', item: { type: 'web_search_call', action: { sources: [
        { type: 'url', url: 'https://example.com/' },
        { type: 'url', url: 'javascript:alert(1)' },
      ] } } },
      { type: 'response.output_text.delta', delta: 'answer.' },
      { type: 'response.output_text.annotation.added', annotation: {
        type: 'url_citation', title: 'Official source', url: 'https://official.example/docs',
      } },
      { type: 'response.output_item.done', item: { type: 'web_search_call', action: { sources: [
        { type: 'url', url: 'https://example.com/' },
      ] } } },
    ])).toEqual({
      content: 'A short answer.',
      sources: [
        { title: 'Official source', url: 'https://official.example/docs' },
        { url: 'https://example.com/' },
      ],
      truncated: false,
    })
  })

  it('fails instead of pretending prose-only output is a search result', () => {
    expect(() => normalizeWebSearchEvents([
      { type: 'response.output_text.delta', delta: 'No search happened.' },
    ])).toThrow('no web-search sources')
  })
})
