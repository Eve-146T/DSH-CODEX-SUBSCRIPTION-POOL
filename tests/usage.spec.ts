import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  availableResetCreditId,
  normalizeUsage,
  parseCredentialDocument,
  parseServiceTierSelection,
  serviceTierRequestValue,
} from '../src/index.ts'

const credential = {
  access: 'access-token',
  refresh: 'refresh-token',
  expires: 123456,
  accountId: 'account-one',
}

describe('multi-account credentials', () => {
  it('migrates the original single-account document without losing the active account', () => {
    expect(parseCredentialDocument(JSON.stringify({ version: 1, credential }), 'credentials.json')).toEqual({
      version: 2,
      activeAccountId: 'account-one',
      accounts: [credential],
    })
  })

  it('accepts a unique account pool and rejects an invalid active account', () => {
    const second = { ...credential, accountId: 'account-two' }
    expect(parseCredentialDocument(JSON.stringify({
      version: 2,
      activeAccountId: 'account-two',
      accounts: [credential, second],
    }), 'credentials.json').accounts).toHaveLength(2)
    expect(() => parseCredentialDocument(JSON.stringify({
      version: 2,
      activeAccountId: 'missing',
      accounts: [credential],
    }), 'credentials.json')).toThrow('invalid credential document')
  })

  it('exposes explicit account activation, removal, and reset-redemption routes', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(source).toContain("url.pathname === '/accounts/remove'")
    expect(source).toContain("url.pathname === '/accounts/activate'")
    expect(source).toContain("url.pathname === '/accounts/redeem'")
    expect(source).toContain('redeem_request_id: randomUUID()')
    expect(source).toContain("url.searchParams.get('add') === '1'")
  })
})

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

describe('reset credits', () => {
  it('selects an available credit across supported response shapes', () => {
    expect(availableResetCreditId({ credits: [
      { id: 'spent', status: 'consumed' },
      { credit_id: 'ready', status: 'available' },
    ] })).toBe('ready')
    expect(availableResetCreditId({ rate_limit_reset_credits: { items: [{ creditId: 'nested' }] } })).toBe('nested')
    expect(availableResetCreditId({ available_count: 1 })).toBeUndefined()
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
    expect(client).toContain('OPENAI_LOGO_PATH')
    expect(client).toContain('new MutationObserver(decorateNavLogo)')
    expect(client).toContain('installNavLogoObserver()')
    expect(client).toContain('prefetchStatus()')
    expect(client).toContain('useState(() => cachedStatus)')
    expect(client).toContain("className: 'codexConnectedDot'")
    expect(client).toContain("variant: 'outline', size: 'md'")
    expect(client).toContain("'Add another account'")
    expect(client).toContain("'Activate account'")
    expect(client).toContain("'/accounts/' + action")
    expect(client).toContain("className: 'codexAccountIdentity'")
    expect(client).toContain('.codexAccountMeta{display:flex;align-items:center')
    expect(client).toContain('align-items:center!important;justify-content:center!important')
    expect(client).toContain("'Show generated images in threads'")
    expect(client).toContain("usePreference('showGeneratedImages', true)")
    expect(client).toContain('if (!showGeneratedImages) return null')
    expect(client).toContain("usePreference('emailPrivacy', false)")
    expect(client).toContain("usePreference('hideUselessModels', true)")
    expect(client).toContain("className: 'codexMeterFill ' + health")
    expect(client).not.toContain("h('h2', { className: 'codexTitle' }")
    expect(client).not.toContain("className: 'codexIntro'")
    expect(client).not.toContain('This page uses a loopback bridge')
    expect(client).not.toContain('Service tier: provider default')
    expect(client).not.toContain('This plugin does not show a switch')
    expect(client).not.toContain('OpenAI Codex subscription')
    expect(client).not.toContain('Short-window limit')
    expect(client).not.toContain('codexBar')
  })
})
