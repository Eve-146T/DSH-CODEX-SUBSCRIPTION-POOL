/** OpenAI-hosted image generation tool for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "openai-codex-image";
export declare const inject: string[];
export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536';
export type ImageQuality = 'low' | 'medium' | 'high';
export interface GeneratedImage {
    data: string;
    format: 'png' | 'jpeg' | 'webp';
    revisedPrompt?: string;
}
/** Extract the first completed image from an OpenAI Responses event stream. */
export declare function normalizeImageGenerationEvents(events: readonly unknown[]): GeneratedImage;
/** Build the Responses request that forces the hosted image-generation tool. */
export declare function buildImageGenerationRequest(args: {
    prompt: string;
    size?: ImageSize;
    quality?: ImageQuality;
}): Record<string, unknown>;
export declare function imageToolDefinition(ctx: Context): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
