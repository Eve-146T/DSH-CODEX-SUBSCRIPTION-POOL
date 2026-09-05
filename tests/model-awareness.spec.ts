import { describe, expect, it } from 'vitest'
import {
  bundledOpenAiDocsSkill,
  dshOpenAiDocsSkill,
  renderModelAwareness,
  skillBody,
} from '../src/model-awareness.ts'

describe('model awareness', () => {
  it('identifies the active route and explains model routing', () => {
    const text = renderModelAwareness([
      { provider: 'openai-codex', id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { provider: 'openai-codex', id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { provider: 'other', id: 'not-routable-here', name: 'Other' },
      { provider: 'openai-codex', id: 'gpt-5.6-luna', name: 'duplicate' },
    ])

    expect(text).toContain("active route is {{provider}}/{{model}}")
    expect(text).toContain('gpt-5.6-luna, gpt-5.6-sol')
    expect(text).not.toContain('not-routable-here')
    expect(text).toContain('gpt-5.6-sol: frontier capability')
    expect(text).toContain('gpt-5.6-terra: balanced intelligence and cost')
    expect(text).toContain('gpt-5.6-luna: efficient')
    expect(text).toContain('workflow agent() calls may select a target')
    expect(text).toContain('subagent, subagent_fork, and ralph expose no per-call model argument')
    expect(text).toContain('openai-docs skill')
  })

  it('uses the current family as a startup fallback before catalog discovery', () => {
    const text = renderModelAwareness([])
    expect(text).toContain('gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna')
  })

  it('removes skill frontmatter and loads the vendored official skill', () => {
    expect(skillBody('---\nname: test\n---\n\nInstructions.')).toBe('Instructions.')
    const skill = bundledOpenAiDocsSkill()
    expect(skill).toContain('# OpenAI Docs')
    expect(skill).toContain('developers.openai.com')
    expect(skill).not.toMatch(/^---/u)

    const adapted = dshOpenAiDocsSkill()
    expect(adapted).toContain('Never use `/tmp`')
    expect(adapted).toContain('Do not install or change Codex MCP configuration from DSH')
    expect(adapted).toContain(skill)
  })
})
