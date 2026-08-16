/** OpenAI-hosted image generation tool for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentIdType, ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { defineTool } from '@deepseek-ai/dsh-tools'

const IMAGE_MODEL = 'gpt-5.6-sol'
const MAX_IMAGE_RESPONSE_BYTES = 64 * 1024 * 1024

export const name = 'openai-codex-image'
export const inject = ['tools', 'attachments', 'openaiCodexAuth']

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536'
export type ImageQuality = 'low' | 'medium' | 'high'
type GeneratedImageMediaType = Exclude<ImageMediaType, 'image/gif'>

export interface GeneratedImage {
  data: string
  format: 'png' | 'jpeg' | 'webp'
  revisedPrompt?: string
}

function generatedImage(value: unknown): GeneratedImage | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const item = value as Record<string, unknown>
  if (item.type !== 'image_generation_call' || typeof item.result !== 'string' || item.result.length === 0) {
    return undefined
  }
  const rawFormat = typeof item.output_format === 'string' ? item.output_format.toLowerCase() : 'png'
  const format = rawFormat === 'webp' ? 'webp' : rawFormat === 'jpeg' || rawFormat === 'jpg' ? 'jpeg' : 'png'
  return {
    data: item.result,
    format,
    ...typeof item.revised_prompt === 'string' && item.revised_prompt.length > 0
      ? { revisedPrompt: item.revised_prompt }
      : {},
  }
}

/** Extract the first completed image from an OpenAI Responses event stream. */
export function normalizeImageGenerationEvents(events: readonly unknown[]): GeneratedImage {
  for (const value of events) {
    if (value === null || typeof value !== 'object') continue
    const event = value as Record<string, unknown>
    if (event.type === 'response.output_item.done') {
      const result = generatedImage(event.item)
      if (result !== undefined) return result
    }
    if (event.type === 'response.completed' && event.response !== null && typeof event.response === 'object') {
      const output = (event.response as Record<string, unknown>).output
      if (!Array.isArray(output)) continue
      for (const item of output) {
        const result = generatedImage(item)
        if (result !== undefined) return result
      }
    }
  }
  throw new Error('OpenAI returned no completed image.')
}

/** Build the Responses request that forces the hosted image-generation tool. */
export function buildImageGenerationRequest(args: {
  prompt: string
  size?: ImageSize
  quality?: ImageQuality
}): Record<string, unknown> {
  return {
    model: IMAGE_MODEL,
    store: false,
    stream: true,
    instructions: 'Generate the requested image. Return the image result only.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: args.prompt }] }],
    tools: [{
      type: 'image_generation',
      action: 'generate',
      size: args.size ?? '1024x1024',
      quality: args.quality ?? 'medium',
      background: 'opaque',
      output_format: 'png',
    }],
    tool_choice: { type: 'image_generation' },
    service_tier: 'default',
  }
}

function decodeImage(value: string): Buffer {
  const compact = value.replace(/\s+/gu, '')
  if (compact.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(compact) || compact.length % 4 === 1) {
    throw new Error('OpenAI returned invalid image data.')
  }
  const data = Buffer.from(compact, 'base64')
  if (data.length === 0) throw new Error('OpenAI returned an empty image.')
  return data
}

export function imageToolDefinition(ctx: Context) {
  return defineTool({
    name: 'image_gen',
    description:
      'Generate an image with OpenAI through the signed-in ChatGPT/Codex subscription. Use this when the user asks to create, draw, render, or generate an image.',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: 'A clear, detailed description of the image to generate.',
      },
      size: {
        type: 'string',
        enum: ['1024x1024', '1536x1024', '1024x1536'],
        description: 'The output dimensions. Defaults to 1024x1024.',
      },
      quality: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'The rendering quality. Defaults to medium.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', required: true },
          mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
          bytes: { type: 'integer', required: true },
          width: { type: 'integer', required: true },
          height: { type: 'integer', required: true },
          name: { type: 'string' },
          revisedPrompt: { type: 'string' },
        },
      },
      render: (_args, image) => [{
        type: 'image',
        attachment: {
          attachmentId: image.attachmentId as AttachmentIdType,
          mediaType: image.mediaType,
          bytes: image.bytes,
          width: image.width,
          height: image.height,
          ...image.name === undefined ? {} : { name: image.name },
        },
      }, {
        type: 'text',
        text: image.revisedPrompt === undefined
          ? 'Generated image.'
          : `Generated image. Revised prompt: ${image.revisedPrompt}`,
      }],
    },
    timeoutMs: 300_000,
    async execute(args, exec) {
      const events = await ctx.openaiCodexAuth.responses(
        buildImageGenerationRequest(args),
        exec.signal,
        MAX_IMAGE_RESPONSE_BYTES,
        'image generation',
      )
      const result = normalizeImageGenerationEvents(events)
      const mediaType: GeneratedImageMediaType = result.format === 'webp'
        ? 'image/webp'
        : result.format === 'jpeg' ? 'image/jpeg' : 'image/png'
      const extension = result.format === 'jpeg' ? 'jpg' : result.format
      const ref = await ctx.attachments.saveImage({
        data: decodeImage(result.data),
        mediaType,
        name: `openai-image-${Date.now()}.${extension}`,
      })
      return {
        ...ref,
        mediaType,
        ...result.revisedPrompt === undefined ? {} : { revisedPrompt: result.revisedPrompt },
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Generate image',
      kind: 'other',
      rawInput: args.prompt,
    }),
  })
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(imageToolDefinition(ctx)))
}

export default { name, inject, apply }
