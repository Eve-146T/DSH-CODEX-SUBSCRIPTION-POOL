import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildImageGenerationRequest,
  normalizeImageGenerationEvents,
} from '../src/image-tool.ts'

describe('image generation protocol', () => {
  it('builds a forced hosted image-generation request', () => {
    expect(buildImageGenerationRequest({
      prompt: 'A tiny lighthouse on a stormy sea',
      size: '1536x1024',
      quality: 'high',
    })).toMatchObject({
      model: 'gpt-5.6-sol',
      store: false,
      stream: true,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'A tiny lighthouse on a stormy sea' }] }],
      tools: [{
        type: 'image_generation',
        action: 'generate',
        size: '1536x1024',
        quality: 'high',
        background: 'opaque',
        output_format: 'png',
      }],
      tool_choice: { type: 'image_generation' },
    })
  })

  it('gives the model task-oriented generation guidance without filesystem writes', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/image-tool.ts', import.meta.url)), 'utf8')
    expect(source).toContain('Generate a new raster image for a project asset')
    expect(source).not.toContain('through the signed-in ChatGPT/Codex subscription')
    // Image results are immutable attachments: no workspace path is written and
    // no direct filesystem or session-header access survives.
    expect(source).not.toContain('node:fs')
    expect(source).not.toContain('node:path')
    expect(source).not.toContain('session.header')
    expect(source).not.toContain('savedPath')
    expect(source).not.toContain('"output_path"')
    expect(source).not.toContain('output_path: {')
  })

  it('reads completed image calls from both Responses event shapes', () => {
    expect(normalizeImageGenerationEvents([{
      type: 'response.output_item.done',
      item: {
        type: 'image_generation_call',
        result: 'aGVsbG8=',
        output_format: 'png',
        revised_prompt: 'A refined prompt',
      },
    }])).toEqual({
      data: 'aGVsbG8=',
      format: 'png',
      revisedPrompt: 'A refined prompt',
    })

    expect(normalizeImageGenerationEvents([{
      type: 'response.completed',
      response: {
        output: [{ type: 'image_generation_call', result: 'd29ybGQ=', output_format: 'webp' }],
      },
    }])).toEqual({ data: 'd29ybGQ=', format: 'webp' })
  })

  it('fails clearly when OpenAI returns no image', () => {
    expect(() => normalizeImageGenerationEvents([{ type: 'response.completed', response: { output: [] } }]))
      .toThrow('no completed image')
  })

  it('bundles the tool and its native conversation renderer', () => {
    const client = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
    const patch = readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')) as {
      exports: Record<string, unknown>
      dependencies: Record<string, string>
    }
    expect(pkg.exports).toHaveProperty('./image-tool')
    expect(patch).toContain('name: dsh-openai-codex-auth/image-tool')
    expect(client).toContain("key: 'image_gen'")
    // The current public renderer seam is the `tool.call.toolview` slot, whose
    // `inject(sessionId)` supplies `resolveImage`; `ctx.conversation.resolveImage`
    // does not exist in DSH 0.2.2-rc.3.
    expect(client).toContain("name: 'tool.call.toolview'")
    expect(client).toContain('resolveImage:')
    expect(client).toContain('function SparkleIcon()')
    expect(client).toContain("usePreference('showGeneratedImages', true)")
    expect(client).toContain('if (!showGeneratedImages) return null')
    expect(pkg.dependencies).not.toHaveProperty('@deepseek-ai/dsh-tools')
  })
})
