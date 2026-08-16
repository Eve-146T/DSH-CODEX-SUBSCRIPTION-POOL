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

  it('gives the model task-oriented generation and workspace-save guidance', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/image-tool.ts', import.meta.url)), 'utf8')
    expect(source).toContain('Generate a new raster image for a project asset')
    expect(source).toContain("output_path: {")
    expect(source).toContain('inside the current session workspace')
    expect(source).toContain("open(path, 'wx', 0o644)")
    expect(source).not.toContain('through the signed-in ChatGPT/Codex subscription')
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
    expect(client).toContain('ctx.conversation.resolveImage')
    expect(client).toContain('function SparkleIcon()')
    expect(pkg.dependencies).not.toHaveProperty('@deepseek-ai/dsh-tools')
  })
})
