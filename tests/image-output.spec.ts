/**
 * Focused tool-execution tests for the image tool's result handling.
 *
 * Every test drives `imageToolDefinition(ctx).execute()` through a fake
 * `openaiCodexAuth.responses` and a fake attachment store, so no network call
 * and no paid API request happens. Assertions cover the returned immutable
 * attachment, the single request per call, invalid upstream results, and the
 * removal of workspace `output_path` writes.
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { imageToolDefinition } from '../src/image-tool.ts'

/** A 1x1 opaque PNG, base64 encoded. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

const PNG_BYTES = Buffer.from(ONE_PIXEL_PNG, 'base64')

/**
 * Synthetic execution context. Callers pass `undefined` to prove the tool needs
 * no agent, session, or workspace header at all.
 */
function fakeExec(agent: unknown = { session: { header: { cwd: '/workspace/project' } } }): ToolRunContext {
  const controller = new AbortController()
  return {
    callId: 'call-image-1' as never,
    rootCallId: 'call-image-1' as never,
    token: Symbol('token') as never,
    name: 'image_gen',
    arguments: {},
    signal: controller.signal,
    deferContext: () => {},
    concludeTurn: () => {},
    ...agent === undefined ? {} : { agent: agent as never },
  }
}

interface Harness {
  definition: ToolDefinition
  responses: ReturnType<typeof vi.fn>
  saveImage: ReturnType<typeof vi.fn>
}

/** Build the tool over a fake auth service and attachment store. */
function harness(options: {
  events?: readonly unknown[]
  saveImage?: (input: { data: Buffer; mediaType: string; name: string }) => Promise<unknown>
} = {}): Harness {
  const responses = vi.fn(async () => options.events ?? [{
    type: 'response.completed',
    response: {
      output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG, output_format: 'png' }],
    },
  }])
  const saveImage = vi.fn(options.saveImage ?? (async (input: { data: Buffer; mediaType: string; name: string }) => ({
    attachmentId: 'att_1',
    mediaType: input.mediaType,
    bytes: input.data.length,
    width: 1,
    height: 1,
    name: input.name,
  })))
  const ctx = {
    openaiCodexAuth: { responses },
    attachments: { saveImage },
  } as unknown as Context
  return { definition: imageToolDefinition(ctx), responses, saveImage }
}

describe('image tool execution', () => {
  it('returns only the immutable attachment and preserves the image bytes', async () => {
    const { definition, responses, saveImage } = harness()
    const result = await definition.execute({ prompt: 'A red cube' }, fakeExec()) as Record<string, unknown>

    expect(result).toMatchObject({
      attachmentId: 'att_1',
      mediaType: 'image/png',
      bytes: PNG_BYTES.length,
      width: 1,
      height: 1,
    })
    // No workspace path is ever reported any more.
    expect(result.savedPath).toBeUndefined()
    expect(result).not.toHaveProperty('savedPath')
    expect(responses).toHaveBeenCalledTimes(1)
    // The stored bytes must decode back to the exact PNG the service returned.
    const stored = saveImage.mock.calls[0]![0] as { data: Buffer; mediaType: string }
    expect(stored.mediaType).toBe('image/png')
    expect(Buffer.from(stored.data).equals(PNG_BYTES)).toBe(true)
  })

  it('advertises no output_path parameter and performs no filesystem writes', () => {
    const { definition } = harness()
    const parameters = definition.parameters as { properties?: Record<string, unknown> }
    expect(Object.keys(parameters.properties ?? {})).toEqual(['prompt', 'size', 'quality'])
    expect(parameters.properties).not.toHaveProperty('output_path')

    // The direct workspace write must stay removed: no fs/path import and no
    // session-header workspace lookup in the tool source.
    const source = readFileSync(fileURLToPath(new URL('../src/image-tool.ts', import.meta.url)), 'utf8')
    expect(source).not.toContain('node:fs')
    expect(source).not.toContain('node:path')
    expect(source).not.toContain('session.header')
    expect(source).not.toContain('writeFile')
    expect(source).not.toContain('mkdir')
  })

  it('executes without any agent session workspace', async () => {
    const { definition, saveImage } = harness()
    const result = await definition.execute({ prompt: 'No workspace' }, fakeExec(undefined)) as Record<string, unknown>
    expect(result.attachmentId).toBe('att_1')
    expect(saveImage).toHaveBeenCalledTimes(1)
  })

  it('rejects a manually passed output_path before any paid API call', async () => {
    const { definition, responses, saveImage } = harness()
    await expect(definition.execute(
      { prompt: 'A red cube', output_path: '/workspace/project/out.png' },
      fakeExec(),
    )).rejects.toThrow(/output_path is not supported.*attachment only/u)
    // Rejected during argument validation: nothing was requested or persisted.
    expect(responses).not.toHaveBeenCalled()
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('makes exactly one paid API call per tool invocation', async () => {
    const { definition, responses, saveImage } = harness()
    await definition.execute({ prompt: 'A blue sphere' }, fakeExec())
    expect(responses).toHaveBeenCalledTimes(1)
    expect(saveImage).toHaveBeenCalledTimes(1)

    await definition.execute({ prompt: 'A green cone' }, fakeExec())
    expect(responses).toHaveBeenCalledTimes(2)
    expect(saveImage).toHaveBeenCalledTimes(2)
  })

  it('does not request an image twice when the upstream result is invalid', async () => {
    const { definition, responses, saveImage } = harness({
      events: [{ type: 'response.completed', response: { output: [] } }],
    })
    await expect(definition.execute({ prompt: 'A lost image' }, fakeExec()))
      .rejects.toThrow('no completed image')
    // One request, never a retry, and nothing persisted.
    expect(responses).toHaveBeenCalledTimes(1)
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('rejects malformed upstream image data without persisting it', async () => {
    const { definition, responses, saveImage } = harness({
      events: [{
        type: 'response.completed',
        response: {
          output: [{ type: 'image_generation_call', result: 'not*base64!', output_format: 'png' }],
        },
      }],
    })
    await expect(definition.execute({ prompt: 'Corrupt bytes' }, fakeExec()))
      .rejects.toThrow('invalid image data')
    expect(responses).toHaveBeenCalledTimes(1)
    expect(saveImage).not.toHaveBeenCalled()
  })

  it('rejects invalid arguments before spending a paid API call', async () => {
    const { definition, responses } = harness()
    await expect(definition.execute({ prompt: '' }, fakeExec()))
      .rejects.toThrow('prompt must be a non-empty string')
    await expect(definition.execute({ prompt: 'x', size: '4096x4096' }, fakeExec()))
      .rejects.toThrow('unsupported size')
    expect(responses).not.toHaveBeenCalled()
  })

  it('keeps the conversation renderer and pending-call presentation', async () => {
    const { definition } = harness({
      events: [{
        type: 'response.output_item.done',
        item: {
          type: 'image_generation_call',
          result: ONE_PIXEL_PNG,
          output_format: 'png',
          revised_prompt: 'A red cube, studio lighting',
        },
      }],
    })
    const result = await definition.execute({ prompt: 'A red cube' }, fakeExec()) as Record<string, unknown>
    expect(result.revisedPrompt).toBe('A red cube, studio lighting')

    const rendered = definition.output.render({ prompt: 'A red cube' }, result as never)
    expect(rendered[0]).toMatchObject({ type: 'image' })
    expect(rendered[1]).toMatchObject({ type: 'text' })
    expect(JSON.stringify(rendered[1])).toContain('A red cube, studio lighting')

    expect(definition.presentCall?.({ prompt: 'A red cube' })).toMatchObject({
      title: 'Generate image',
      rawInput: 'A red cube',
    })
  })
})
