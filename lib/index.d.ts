/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Choice presented by the plugin UI. */
export type ServiceTierSelection = 'normal' | 'priority';
/** OpenAI request value represented by a service-tier choice. */
export type OpenAIServiceTier = 'default' | 'priority';
/** Persisted OAuth credential. */
export interface OpenAICodexCredential {
    access: string;
    refresh: string;
    expires: number;
    accountId: string;
}
/** Plugin configuration. */
export interface Config {
    path?: string;
    preferencesPath?: string;
    dshHome?: string;
}
interface UsageWindow {
    usedPercent: number;
    windowSeconds?: number;
    resetAt?: number;
}
interface UsageSummary {
    planType?: string;
    primary?: UsageWindow;
    secondary?: UsageWindow;
    limitReached?: boolean;
    resetCredits?: number;
    fetchedAt: number;
}
interface WebSearchRequest {
    query: string;
    maxResults?: number;
}
interface WebSearchSource {
    url: string;
    title?: string;
    snippet?: string;
    publishedAt?: string;
}
interface WebSearchResult {
    content?: string;
    sources: WebSearchSource[];
    truncated: boolean;
}
interface WebSearchProvider {
    id: string;
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
export interface DeviceAuthorization {
    userCode: string;
    deviceAuthId: string;
    intervalMs: number;
    expiresInMs: number;
}
/** Strictly validate a stored or submitted service-tier choice. */
export declare function parseServiceTierSelection(value: unknown): ServiceTierSelection;
/** Map UI language to the value expected by OpenAI's Responses API. */
export declare function serviceTierRequestValue(selection: ServiceTierSelection): OpenAIServiceTier;
/** Validate and normalize OpenAI's device-authorization initiation response. */
export declare function normalizeDeviceAuthorization(value: unknown): DeviceAuthorization;
/** Reduce the OpenAI response to the stable fields displayed by the Web card. */
export declare function normalizeUsage(value: unknown): UsageSummary;
/** Convert OpenAI Responses streaming events into DSH's provider-neutral search result. */
export declare function normalizeWebSearchEvents(events: readonly unknown[]): WebSearchResult;
declare module '@deepseek-ai/cordis' {
    interface Context {
        openaiCodexAuth: OpenAICodexAuth;
        web: {
            registerSearchProvider(provider: WebSearchProvider): () => void;
        };
    }
}
/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
export declare class OpenAICodexAuth extends Service {
    static Config: z<Config>;
    static inject: string[];
    private readonly filename;
    private readonly preferencesFilename;
    private readonly csrf;
    private usageCache;
    private usageError;
    private loginFlow;
    private lastLoginError;
    constructor(ctx: Context, config: Config);
    /** Return a valid credential, refreshing and persisting it when near expiry. */
    credential(signal?: AbortSignal): Promise<OpenAICodexCredential | undefined>;
    /** Return a valid bearer token for DSH's built-in Codex provider. */
    bearerToken(signal?: AbortSignal): Promise<string | undefined>;
    /** Send one authenticated streaming request to the ChatGPT Codex Responses endpoint. */
    responses(body: Record<string, unknown>, signal: AbortSignal | undefined, maxBytes: number, operation: string): Promise<unknown[]>;
    private createLoginRequest;
    private finishLogin;
    private logout;
    private beginBrowserLogin;
    /** Begin OpenAI's device-code flow for SSH and other headless environments. */
    private beginDeviceLogin;
    private status;
    private fetchUsage;
    private searchWeb;
    private startControlServer;
    private controlRequest;
    private write;
    private writePreferences;
    private waitForCallback;
}
export default OpenAICodexAuth;
