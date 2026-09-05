import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const PROVIDER = 'openai-codex';
const OPENAI_DOCS_SKILL_URL = 'https://github.com/openai/skills/tree/main/skills/.curated/openai-docs';
const OPENAI_DOCS_SKILL_FILE = fileURLToPath(new URL('../skills/openai-docs/SKILL.md', import.meta.url));
const OPENAI_DOCS_SKILL_DIR = fileURLToPath(new URL('../skills/openai-docs/', import.meta.url));
const DSH_SKILL_PREAMBLE = [
    '## DeepSeek Harness integration',
    '',
    'These DSH-specific rules override conflicting workflow steps below:',
    '- Never use `/tmp`. Do not run a manual helper unless an explicitly allowed non-temporary cache directory is available.',
    '- Do not install or change Codex MCP configuration from DSH.',
    '- When OpenAI Docs MCP tools are not exposed, use available web search restricted to official OpenAI domains.',
].join('\n');
const FAMILY = [
    {
        id: 'gpt-5.6-sol',
        summary: 'frontier capability for complex professional work, reasoning, and coding',
    },
    {
        id: 'gpt-5.6-terra',
        summary: 'balanced intelligence and cost',
    },
    {
        id: 'gpt-5.6-luna',
        summary: 'efficient, cost-sensitive, high-volume work',
    },
];
export const name = 'openai-codex-model-awareness';
export const inject = ['llm', 'systemPrompt', 'skills'];
/** Remove YAML frontmatter because DSH receives metadata separately. */
export function skillBody(source) {
    if (!source.startsWith('---\n'))
        return source.trim();
    const end = source.indexOf('\n---\n', 4);
    return (end < 0 ? source : source.slice(end + 5)).trim();
}
/** Load the vendored, upstream OpenAI Docs skill. */
export function bundledOpenAiDocsSkill() {
    return skillBody(readFileSync(OPENAI_DOCS_SKILL_FILE, 'utf8'));
}
/** Adapt the upstream skill to the tools and filesystem policy of DSH. */
export function dshOpenAiDocsSkill() {
    return `${DSH_SKILL_PREAMBLE}\n\n${bundledOpenAiDocsSkill()}`;
}
function advertisedIds(models) {
    const ids = models
        .filter(model => model.provider === PROVIDER)
        .map(model => model.id.trim())
        .filter(Boolean);
    return [...new Set(ids)];
}
/** Render one durable runtime-context section from DSH's advertised catalog. */
export function renderModelAwareness(models) {
    const advertised = advertisedIds(models);
    const targets = advertised.length > 0 ? advertised : FAMILY.map(model => model.id);
    const family = FAMILY.map(({ id, summary }) => `- ${id}: ${summary}.`).join('\n');
    return [
        'OpenAI Codex model context:',
        `- This agent's active route is {{provider}}/{{model}}.`,
        `- The ${PROVIDER} adapter currently advertises these workflow targets: ${targets.join(', ')}.`,
        '- The advertised catalog is advisory; do not infer that an unlisted provider/model route is impossible.',
        '- gpt-5.6 is an alias for gpt-5.6-sol.',
        family,
        '- workflow agent() calls may select a target with provider and model.',
        '- subagent, subagent_fork, and ralph expose no per-call model argument in this profile; they use their configured or inherited target.',
        '- Use the openai-docs skill for current OpenAI model details instead of guessing.',
    ].join('\n');
}
/** Register change-only model context and the bundled official documentation skill. */
export function apply(ctx) {
    let models = [];
    let refreshGeneration = 0;
    const refresh = async () => {
        const generation = ++refreshGeneration;
        try {
            const next = await ctx.llm.listModels(PROVIDER);
            if (generation === refreshGeneration)
                models = next;
        }
        catch (error) {
            ctx.logger.warn(`openai-codex-model-awareness: could not refresh model catalog: ${String(error)}`);
        }
    };
    ctx.systemPrompt.context({
        name: 'openai-codex:model-awareness',
        order: 40,
        text: () => renderModelAwareness(models),
    });
    ctx.skills.register({
        name: 'openai-docs',
        description: 'Use for current, authoritative OpenAI API, model, and Codex guidance with official sources.',
        whenToUse: 'Use for OpenAI model selection, capabilities, migration, prompting, API behavior, or Codex self-knowledge.',
        source: 'bundled',
        provider: 'dsh-openai-codex-auth',
        resourceBase: { kind: 'directory', path: OPENAI_DOCS_SKILL_DIR },
        content: dshOpenAiDocsSkill(),
        metadata: { upstream: OPENAI_DOCS_SKILL_URL },
    });
    ctx.on('llm/adapters-updated', () => { void refresh(); });
    ctx.effect(async () => {
        await refresh();
        return () => { refreshGeneration += 1; };
    });
}
export default { name, inject, apply };
