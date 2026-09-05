/** Model identity, routing guidance, and OpenAI documentation for DSH agents. */
import type { Context } from '@deepseek-ai/cordis';
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm';
export declare const name = "openai-codex-model-awareness";
export declare const inject: string[];
/** Remove YAML frontmatter because DSH receives metadata separately. */
export declare function skillBody(source: string): string;
/** Load the vendored, upstream OpenAI Docs skill. */
export declare function bundledOpenAiDocsSkill(): string;
/** Adapt the upstream skill to the tools and filesystem policy of DSH. */
export declare function dshOpenAiDocsSkill(): string;
/** Render one durable runtime-context section from DSH's advertised catalog. */
export declare function renderModelAwareness(models: readonly LlmModelInfo[]): string;
/** Register change-only model context and the bundled official documentation skill. */
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
