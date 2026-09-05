import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const implementation = client.match(/function isAllowedCodexModel\(value\) \{[\s\S]*?\n    \}/)?.[0]
if (!implementation) throw new Error('Model filter missing from client bundle')
const allowed = new Function(implementation + '; return isAllowedCodexModel')() as (value: unknown) => boolean

describe('Codex model filter', () => {
  it.each(['gpt-6-astra', 'GPT-6 / Astra', 'openai-codex/gpt-6-astra', 'Astra', 'gpt_6_astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.3-codex-spark'])('keeps %s visible', model => {
    expect(allowed(model)).toBe(true)
  })
  it.each(['gpt-5.5', 'gpt-60', 'gpt-6.1', 'astral', '', null])('rejects unrelated entry %s', model => {
    expect(allowed(model)).toBe(false)
  })
})
