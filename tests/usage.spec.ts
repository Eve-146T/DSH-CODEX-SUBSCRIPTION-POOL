import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  normalizeUsage,
  parseServiceTierSelection,
  serviceTierRequestValue,
} from '../src/index.ts'

describe('normalizeUsage', () => {
  it('projects the Codex rate-limit response used by the settings card', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    expect(normalizeUsage({
      plan_type: 'plus',
      rate_limit: {
        limit_reached: false,
        primary_window: { used_percent: 42, limit_window_seconds: 18_000, reset_at: 2000 },
        secondary_window: { used_percent: 73, limit_window_seconds: 604_800, reset_at: 3000 },
      },
      rate_limit_reset_credits: { available_count: 2 },
    })).toEqual({
      planType: 'plus',
      primary: { usedPercent: 42, windowSeconds: 18_000, resetAt: 2000 },
      secondary: { usedPercent: 73, windowSeconds: 604_800, resetAt: 3000 },
      limitReached: false,
      resetCredits: 2,
      fetchedAt: 1234,
    })
    vi.restoreAllMocks()
  })

  it('clamps malformed percentages and tolerates absent windows', () => {
    expect(normalizeUsage({ rate_limit: { primary_window: { used_percent: 120 } } }).primary)
      .toEqual({ usedPercent: 100 })
  })
})

describe('service tier preference', () => {
  it('maps the two UI choices to exact OpenAI request values', () => {
    expect(serviceTierRequestValue(parseServiceTierSelection('normal'))).toBe('default')
    expect(serviceTierRequestValue(parseServiceTierSelection('priority'))).toBe('priority')
  })

  it.each([undefined, null, '', 'default', 'flex', 'auto', 'Priority', 1, {}])(
    'rejects unsupported or malformed choice %j',
    (value) => { expect(() => parseServiceTierSelection(value)).toThrow('must be "normal" or "priority"') },
  )
})

describe('settings UI integration', () => {
  it('uses DSH design tokens and omits internal implementation notices', () => {
    const client = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
    expect(client).toContain('var(--dsw-alias-label-primary)')
    expect(client).toContain("require('@deepseek-ai/dsh-client-ui-primitives')")
    expect(client).toContain('IconRefreshOutline16')
    expect(client).toContain('OPENAI_LOGO_PATH')
    expect(client).not.toContain('This page uses a loopback bridge')
    expect(client).not.toContain('Service tier: provider default')
    expect(client).not.toContain('This plugin does not show a switch')
    expect(client).not.toContain('OpenAI Codex subscription')
    expect(client).not.toContain('Short-window limit')
    expect(client).not.toContain('codexBar')
  })
})
