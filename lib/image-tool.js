const IMAGE_MODEL = 'gpt-5.6-sol';
const MAX_IMAGE_RESPONSE_BYTES = 64 * 1024 * 1024;
export const name = 'openai-codex-image';
export const inject = ['tools', 'attachments', 'openaiCodexAuth'];
function generatedImage(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const item = value;
    if (item.type !== 'image_generation_call' || typeof item.result !== 'string' || item.result.length === 0) {
        return undefined;
    }
    const rawFormat = typeof item.output_format === 'string' ? item.output_format.toLowerCase() : 'png';
    const format = rawFormat === 'webp' ? 'webp' : rawFormat === 'jpeg' || rawFormat === 'jpg' ? 'jpeg' : 'png';
    return {
        data: item.result,
        format,
        ...typeof item.revised_prompt === 'string' && item.revised_prompt.length > 0
            ? { revisedPrompt: item.revised_prompt }
            : {},
    };
}
/** Extract the first completed image from an OpenAI Responses event stream. */
export function normalizeImageGenerationEvents(events) {
    for (const value of events) {
        if (value === null || typeof value !== 'object')
            continue;
        const event = value;
        if (event.type === 'response.output_item.done') {
            const result = generatedImage(event.item);
            if (result !== undefined)
                return result;
        }
        if (event.type === 'response.completed' && event.response !== null && typeof event.response === 'object') {
            const output = event.response.output;
            if (!Array.isArray(output))
                continue;
            for (const item of output) {
                const result = generatedImage(item);
                if (result !== undefined)
                    return result;
            }
        }
    }
    throw new Error('OpenAI returned no completed image.');
}
/** Build the Responses request that forces the hosted image-generation tool. */
export function buildImageGenerationRequest(args) {
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
    };
}
function decodeImage(value) {
    const compact = value.replace(/\s+/gu, '');
    if (compact.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(compact) || compact.length % 4 === 1) {
        throw new Error('OpenAI returned invalid image data.');
    }
    const data = Buffer.from(compact, 'base64');
    if (data.length === 0)
        throw new Error('OpenAI returned an empty image.');
    return data;
}
function imageGenerationArgs(value) {
    if (value === null || typeof value !== 'object')
        throw new Error('invalid arguments: expected an object');
    const args = value;
    if (typeof args.prompt !== 'string' || args.prompt.trim().length === 0) {
        throw new Error('invalid arguments: prompt must be a non-empty string');
    }
    const sizes = ['1024x1024', '1536x1024', '1024x1536'];
    const qualities = ['low', 'medium', 'high'];
    if (args.size !== undefined && !sizes.includes(args.size))
        throw new Error('invalid arguments: unsupported size');
    if (args.quality !== undefined && !qualities.includes(args.quality))
        throw new Error('invalid arguments: unsupported quality');
    if (args.output_path !== undefined) {
        throw new Error('invalid arguments: output_path is not supported by this DSH version; the generated image is returned as an attachment only');
    }
    return args;
}
export function imageToolDefinition(ctx) {
    return {
        name: 'image_gen',
        description: 'Generate a new raster image for a project asset, mockup, illustration, photo, texture, or other bitmap visual. Returns a conversation attachment, not a workspace file. Use this for image creation, not for SVG or other code-native graphics.',
        parameters: {
            type: 'object',
            required: ['prompt'],
            properties: {
                prompt: {
                    type: 'string',
                    minLength: 1,
                    description: 'Describe the scene, subject, style, composition, lighting, exact text, constraints, and anything to avoid.',
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
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
                properties: {
                    attachmentId: { type: 'string' },
                    mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] },
                    bytes: { type: 'integer' },
                    width: { type: 'integer' },
                    height: { type: 'integer' },
                    name: { type: 'string' },
                    revisedPrompt: { type: 'string' },
                },
            },
            render: (_args, value) => {
                const image = value;
                return [{
                        type: 'image',
                        attachment: {
                            attachmentId: image.attachmentId,
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
                            : `Generated image. Revised prompt: ${String(image.revisedPrompt)}`,
                    }];
            },
        },
        timeoutMs: 300_000,
        async execute(rawArgs, exec) {
            const args = imageGenerationArgs(rawArgs);
            const events = await ctx.openaiCodexAuth.responses(buildImageGenerationRequest(args), exec.signal, MAX_IMAGE_RESPONSE_BYTES, 'image generation');
            const result = normalizeImageGenerationEvents(events);
            const mediaType = result.format === 'webp'
                ? 'image/webp'
                : result.format === 'jpeg' ? 'image/jpeg' : 'image/png';
            const extension = result.format === 'jpeg' ? 'jpg' : result.format;
            const image = decodeImage(result.data);
            const ref = await ctx.attachments.saveImage({
                data: image,
                mediaType,
                name: `openai-image-${Date.now()}.${extension}`,
            });
            return {
                ...ref,
                mediaType,
                ...result.revisedPrompt === undefined ? {} : { revisedPrompt: result.revisedPrompt },
            };
        },
        presentCall: (rawArgs) => {
            let args;
            try {
                args = imageGenerationArgs(rawArgs);
            }
            catch {
                return undefined;
            }
            return {
                card: 'generic',
                title: 'Generate image',
                kind: 'other',
                rawInput: args.prompt,
            };
        },
    };
}
export function apply(ctx) {
    ctx.effect(() => ctx.tools.register(imageToolDefinition(ctx)));
}
export default { name, inject, apply };
