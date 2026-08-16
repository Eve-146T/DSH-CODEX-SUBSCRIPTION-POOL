import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeDeviceAuthorization } from '../src/index.ts'

describe('device-code sign-in', () => {
  it('normalizes polling and expiry values safely', () => {
    expect(normalizeDeviceAuthorization({
      user_code: 'ABCD-EFGH',
      device_auth_id: 'device-1',
      interval: '5',
      expires_in: 600,
    })).toEqual({
      userCode: 'ABCD-EFGH',
      deviceAuthId: 'device-1',
      intervalMs: 5000,
      expiresInMs: 600_000,
    })

    expect(normalizeDeviceAuthorization({
      user_code: 'CODE',
      device_auth_id: 'device-2',
      interval: 0,
      expires_in: 1,
    })).toMatchObject({ intervalMs: 1000, expiresInMs: 60_000 })
  })

  it('rejects incomplete initiation responses', () => {
    expect(() => normalizeDeviceAuthorization({ user_code: 'CODE' }))
      .toThrow('incomplete device sign-in response')
  })

  it('exposes both the headless control route and the settings action', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    const client = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
    expect(source).toContain("url.pathname === '/start-device'")
    expect(source).toContain("const DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback'")
    expect(client).toContain("'Use device code'")
    expect(client).toContain("'Open sign-in page'")
  })
})
