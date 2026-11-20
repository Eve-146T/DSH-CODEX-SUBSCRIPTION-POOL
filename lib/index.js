var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol';
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
const DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
const DEVICE_AUTH_URL = 'https://auth.openai.com/codex/device';
const DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
/** A closed OAuth window sends no callback, so a browser sign-in must stop waiting on its own. */
const BROWSER_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_FILENAME = 'openai-codex-auth.json';
const DEFAULT_PREFERENCES_FILENAME = 'openai-codex-preferences.json';
const TOKEN_REF = credentialRef('DSH_OPENAI_CODEX_TOKEN');
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits';
const RESET_CONSUME_URL = `${RESET_CREDITS_URL}/consume`;
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const CODEX_WEBSOCKET_BETA = 'responses_websockets=2026-02-06';
const SEARCH_MODEL = 'gpt-5.4-mini';
const SEARCH_PROVIDER_ID = 'openai-codex';
const USAGE_CACHE_MS = 30_000;
const MAX_SEARCH_RESPONSE_BYTES = 4 * 1024 * 1024;
function base64Url(value) {
    return value.toString('base64url');
}
function tokenPayload(access) {
    const parts = access.split('.');
    if (parts.length !== 3)
        throw new Error('OpenAI returned an invalid access token');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload === null || typeof payload !== 'object')
        throw new Error('OpenAI returned an invalid access token');
    return payload;
}
function accountId(access) {
    const auth = tokenPayload(access)['https://api.openai.com/auth'];
    const id = auth !== null && typeof auth === 'object'
        ? auth.chatgpt_account_id
        : undefined;
    if (typeof id !== 'string' || id.length === 0)
        throw new Error('OpenAI token has no ChatGPT account id');
    return id;
}
function accountProfile(access) {
    try {
        const raw = tokenPayload(access)['https://api.openai.com/profile'];
        if (raw === null || typeof raw !== 'object')
            return {};
        const profile = raw;
        const email = typeof profile.email === 'string' && profile.email.length <= 320 && !/[\r\n]/u.test(profile.email)
            ? profile.email
            : undefined;
        const name = typeof profile.name === 'string' && profile.name.length <= 200 && !/[\r\n]/u.test(profile.name)
            ? profile.name
            : undefined;
        return {
            ...email === undefined ? {} : { email },
            ...name === undefined ? {} : { name },
        };
    }
    catch {
        return {};
    }
}
function isCredential(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const credential = value;
    return typeof credential.access === 'string' && typeof credential.refresh === 'string'
        && typeof credential.expires === 'number' && Number.isFinite(credential.expires)
        && typeof credential.accountId === 'string' && credential.accountId.length > 0;
}
/** Parse both the original one-account file and the current multi-account file. */
export function parseCredentialDocument(text, filename) {
    const value = JSON.parse(text);
    if (value.version === 1 && isCredential(value.credential)) {
        return { version: 2, activeAccountId: value.credential.accountId, accounts: [value.credential] };
    }
    if (value.version === 2 && typeof value.activeAccountId === 'string' && Array.isArray(value.accounts)
        && value.accounts.length > 0 && value.accounts.every(isCredential)
        && value.accounts.some(credential => credential.accountId === value.activeAccountId)
        && new Set(value.accounts.map(credential => credential.accountId)).size === value.accounts.length) {
        return { version: 2, activeAccountId: value.activeAccountId, accounts: value.accounts };
    }
    {
        throw new Error(`openai-codex-auth: invalid credential document ${filename}`);
    }
}
/** Strictly validate a stored or submitted service-tier choice. */
export function parseServiceTierSelection(value) {
    if (value === 'normal' || value === 'priority')
        return value;
    throw new Error('Service tier must be "normal" or "priority".');
}
/** Map UI language to the value expected by OpenAI's Responses API. */
export function serviceTierRequestValue(selection) {
    return selection === 'priority' ? 'priority' : 'default';
}
function parsePreferences(text, filename) {
    const value = JSON.parse(text);
    if (value.version !== 1)
        throw new Error(`openai-codex-auth: invalid preferences document ${filename}`);
    return { version: 1, serviceTier: parseServiceTierSelection(value.serviceTier) };
}
async function readPreferences(filename) {
    try {
        return parsePreferences(await readFile(filename, 'utf8'), filename);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { version: 1, serviceTier: 'normal' };
        throw error;
    }
}
async function readCredentialDocument(filename) {
    try {
        return parseCredentialDocument(await readFile(filename, 'utf8'), filename);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
async function tokenRequest(body, signal) {
    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        ...signal === undefined ? {} : { signal },
    });
    if (!response.ok) {
        throw new Error(`OpenAI token request failed (HTTP ${response.status}). Sign in again if authorization expired.`);
    }
    const value = await response.json();
    if (value === null || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string'
        || typeof value.expires_in !== 'number')
        throw new Error('OpenAI token response is incomplete');
    return {
        access: value.access_token,
        refresh: value.refresh_token,
        expires: Date.now() + value.expires_in * 1000,
        accountId: accountId(value.access_token),
    };
}
function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
/** Validate and normalize OpenAI's device-authorization initiation response. */
export function normalizeDeviceAuthorization(value) {
    if (value === null || typeof value !== 'object') {
        throw new Error('OpenAI returned an incomplete device sign-in response.');
    }
    const row = value;
    if (typeof row.user_code !== 'string' || row.user_code.length === 0
        || typeof row.device_auth_id !== 'string' || row.device_auth_id.length === 0) {
        throw new Error('OpenAI returned an incomplete device sign-in response.');
    }
    const rawInterval = typeof row.interval === 'number'
        ? row.interval
        : typeof row.interval === 'string' ? Number.parseInt(row.interval, 10) : 5;
    const intervalSeconds = Math.min(30, Math.max(1, Number.isFinite(rawInterval) ? rawInterval : 5));
    const rawExpiry = typeof row.expires_in === 'number' && Number.isFinite(row.expires_in)
        ? row.expires_in
        : 15 * 60;
    return {
        userCode: row.user_code,
        deviceAuthId: row.device_auth_id,
        intervalMs: intervalSeconds * 1000,
        expiresInMs: Math.max(60, rawExpiry) * 1000,
    };
}
function usageWindow(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const row = value;
    const usedPercent = optionalNumber(row.used_percent ?? row.usedPercent);
    if (usedPercent === undefined)
        return undefined;
    const windowSeconds = optionalNumber(row.limit_window_seconds ?? row.windowDurationSecs);
    const resetAt = optionalNumber(row.reset_at ?? row.resetsAt);
    return {
        usedPercent: Math.max(0, Math.min(100, usedPercent)),
        ...windowSeconds === undefined ? {} : { windowSeconds },
        ...resetAt === undefined ? {} : { resetAt },
    };
}
/** Select the first available reset-credit id from currently observed API shapes. */
export function availableResetCreditId(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const root = value;
    const nested = root.rate_limit_reset_credits !== null && typeof root.rate_limit_reset_credits === 'object'
        ? root.rate_limit_reset_credits
        : undefined;
    const rows = [root.credits, root.items, root.data, nested?.credits, nested?.items]
        .find(Array.isArray);
    if (rows === undefined)
        return undefined;
    for (const item of rows) {
        if (item === null || typeof item !== 'object')
            continue;
        const row = item;
        const status = typeof row.status === 'string' ? row.status.toLowerCase() : 'available';
        if (status !== 'available' && status !== 'active')
            continue;
        const id = row.credit_id ?? row.creditId ?? row.id;
        if (typeof id === 'string' && id.length > 0)
            return id;
    }
    return undefined;
}
/** Reduce the OpenAI response to the stable fields displayed by the Web card. */
export function normalizeUsage(value) {
    const root = value !== null && typeof value === 'object' ? value : {};
    const limits = root.rate_limit !== null && typeof root.rate_limit === 'object'
        ? root.rate_limit
        : root.rateLimits !== null && typeof root.rateLimits === 'object'
            ? root.rateLimits
            : {};
    const credits = root.rate_limit_reset_credits !== null && typeof root.rate_limit_reset_credits === 'object'
        ? root.rate_limit_reset_credits
        : undefined;
    const planType = typeof root.plan_type === 'string'
        ? root.plan_type
        : typeof root.planType === 'string' ? root.planType : undefined;
    const primary = usageWindow(limits.primary_window ?? limits.primary);
    const secondary = usageWindow(limits.secondary_window ?? limits.secondary);
    const limitReached = typeof limits.limit_reached === 'boolean'
        ? limits.limit_reached
        : typeof limits.limitReached === 'boolean' ? limits.limitReached : undefined;
    const resetCredits = optionalNumber(credits?.available_count ?? credits?.availableCount);
    return {
        ...planType === undefined ? {} : { planType },
        ...primary === undefined ? {} : { primary },
        ...secondary === undefined ? {} : { secondary },
        ...limitReached === undefined ? {} : { limitReached },
        ...resetCredits === undefined ? {} : { resetCredits },
        fetchedAt: Date.now(),
    };
}
function httpUrl(value) {
    if (typeof value !== 'string' || value.length === 0)
        return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
    }
    catch {
        return undefined;
    }
}
/** Convert OpenAI Responses streaming events into DSH's provider-neutral search result. */
export function normalizeWebSearchEvents(events) {
    const answer = [];
    const cited = [];
    const discovered = [];
    for (const value of events) {
        if (value === null || typeof value !== 'object')
            continue;
        const event = value;
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string')
            answer.push(event.delta);
        if (event.type === 'response.output_text.annotation.added'
            && event.annotation !== null && typeof event.annotation === 'object') {
            const annotation = event.annotation;
            const url = httpUrl(annotation.url);
            if (annotation.type === 'url_citation' && url !== undefined) {
                cited.push({ url, ...typeof annotation.title === 'string' && annotation.title.length > 0
                        ? { title: annotation.title } : {} });
            }
        }
        if (event.type === 'response.output_item.done' && event.item !== null && typeof event.item === 'object') {
            const item = event.item;
            const action = item.action !== null && typeof item.action === 'object'
                ? item.action : undefined;
            if (item.type !== 'web_search_call' || !Array.isArray(action?.sources))
                continue;
            for (const source of action.sources) {
                if (source === null || typeof source !== 'object')
                    continue;
                const url = httpUrl(source.url);
                if (url !== undefined)
                    discovered.push({ url });
            }
        }
    }
    const seen = new Set();
    const sources = [...cited, ...discovered].filter((source) => {
        if (seen.has(source.url))
            return false;
        seen.add(source.url);
        return true;
    });
    if (sources.length === 0)
        throw new Error('OpenAI returned no web-search sources.');
    const content = answer.join('').trim();
    return { ...content.length > 0 ? { content } : {}, sources, truncated: false };
}
async function readSseEvents(response, maxBytes, operation) {
    if (response.body === null)
        throw new Error(`OpenAI returned an empty ${operation} stream.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    let buffer = '';
    let bytes = 0;
    const parseFrame = (frame) => {
        const data = frame.split(/\r?\n/u)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('\n');
        if (data.length === 0 || data === '[DONE]')
            return;
        try {
            events.push(JSON.parse(data));
        }
        catch { /* Ignore non-JSON keepalive frames. */ }
    };
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
            await reader.cancel(`OpenAI ${operation} response exceeded the safety limit.`);
            throw new Error(`OpenAI ${operation} response exceeded the safety limit.`);
        }
        buffer += decoder.decode(value, { stream: true });
        for (;;) {
            const separator = /\r?\n\r?\n/u.exec(buffer);
            if (separator === null || separator.index === undefined)
                break;
            parseFrame(buffer.slice(0, separator.index));
            buffer = buffer.slice(separator.index + separator[0].length);
        }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0)
        parseFrame(buffer);
    return events;
}
/** Convert the authenticated Codex Responses endpoint to its WebSocket form. */
export function codexWebSocketUrl(endpoint = CODEX_RESPONSES_URL) {
    const url = new URL(endpoint);
    if (url.protocol === 'https:')
        url.protocol = 'wss:';
    else if (url.protocol === 'http:')
        url.protocol = 'ws:';
    else
        throw new Error(`OpenAI WebSocket endpoint must use HTTP(S), got ${url.protocol}`);
    return url.toString();
}
function completedResponseEvent(value) {
    return value !== null && typeof value === 'object'
        && ['response.completed', 'response.failed', 'response.incomplete', 'response.cancelled']
            .includes(value.type);
}
/** Decode a single JSON event sent by the Codex Responses WebSocket. */
export function parseCodexWebSocketEvent(value) {
    const text = Buffer.isBuffer(value)
        ? value.toString('utf8')
        : value instanceof ArrayBuffer
            ? Buffer.from(value).toString('utf8')
            : Buffer.concat(value).toString('utf8');
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
async function readWebSocketEvents(url, headers, body, signal, maxBytes, operation) {
    if (signal?.aborted)
        throw signal.reason ?? new Error(`OpenAI ${operation} was cancelled.`);
    return new Promise((resolveEvents, rejectEvents) => {
        const socket = new WebSocket(url, { headers, maxPayload: maxBytes });
        const events = [];
        let bytes = 0;
        let settled = false;
        const cleanup = () => { signal?.removeEventListener('abort', cancelled); };
        const settle = (error) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
                socket.terminate();
            if (error === undefined)
                resolveEvents(events);
            else
                rejectEvents(error);
        };
        const cancelled = () => settle(signal?.reason ?? new Error(`OpenAI ${operation} was cancelled.`));
        signal?.addEventListener('abort', cancelled, { once: true });
        socket.once('error', error => settle(error));
        socket.once('unexpected-response', (_request, response) => {
            settle(new Error(`OpenAI Codex ${operation} WebSocket failed (HTTP ${response.statusCode ?? 'unknown'})`));
        });
        socket.once('open', () => {
            try {
                socket.send(JSON.stringify({ type: 'response.create', ...body }));
            }
            catch (error) {
                settle(error);
            }
        });
        socket.on('message', (data) => {
            bytes += Buffer.isBuffer(data)
                ? data.byteLength
                : data instanceof ArrayBuffer ? data.byteLength : data.reduce((total, chunk) => total + chunk.byteLength, 0);
            if (bytes > maxBytes) {
                settle(new Error(`OpenAI ${operation} response exceeded the safety limit.`));
                return;
            }
            const event = parseCodexWebSocketEvent(data);
            if (event === undefined)
                return;
            events.push(event);
            if (completedResponseEvent(event))
                settle();
        });
        socket.once('close', (code, reason) => {
            if (!settled)
                settle(new Error(`OpenAI Codex ${operation} WebSocket closed before completion (${code}): ${reason.toString()}`));
        });
    });
}
function delay(ms, signal) {
    return new Promise((resolveDelay, rejectDelay) => {
        if (signal.aborted) {
            rejectDelay(signal.reason ?? new Error('OpenAI login cancelled'));
            return;
        }
        const timer = setTimeout(done, ms);
        function done() {
            signal.removeEventListener('abort', aborted);
            resolveDelay();
        }
        function aborted() {
            clearTimeout(timer);
            rejectDelay(signal.reason ?? new Error('OpenAI login cancelled'));
        }
        signal.addEventListener('abort', aborted, { once: true });
    });
}
/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
let OpenAICodexAuth = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _account_decorators;
    return class OpenAICodexAuth extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _account_decorators = [Remote];
            __esDecorate(this, null, _account_decorators, { kind: "method", name: "account", static: false, private: false, access: { has: obj => "account" in obj, get: obj => obj.account }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static Config = z.object({ path: z.string(), preferencesPath: z.string(), dshHome: z.string() });
        static inject = ['credentials', 'web', 'llm'];
        filename = __runInitializers(this, _instanceExtraInitializers);
        preferencesFilename;
        publicationFailed = false;
        usageCache = new Map();
        usageErrors = new Map();
        loginFlow;
        lastLoginError;
        constructor(ctx, config) {
            super(ctx, 'openaiCodexAuth');
            const dshHome = resolveDshHome(config.dshHome);
            this.filename = resolve(config.path ?? join(dshHome, DEFAULT_FILENAME));
            this.preferencesFilename = resolve(config.preferencesPath ?? join(dshHome, DEFAULT_PREFERENCES_FILENAME));
            ctx.effect(async () => {
                await this.bearerToken();
                return () => { };
            });
            const auth = this;
            ctx.on('llm/stream', async function* (options, next) {
                if (options.provider === 'openai-codex') {
                    const token = await auth.bearerToken(options.signal);
                    if (token === undefined)
                        throw new Error('Sign in with OpenAI before using Codex.');
                }
                yield* next();
            });
            ctx.effect(() => () => { this.loginFlow?.abort.abort(); });
            ctx.effect(() => ctx.web.registerSearchProvider({
                id: SEARCH_PROVIDER_ID,
                available: () => true,
                search: (request, signal) => this.searchWeb(request, signal),
            }));
        }
        /** Return a valid credential, refreshing and persisting it when near expiry. */
        async credential(signal, requestedAccountId) {
            return withFileLock(this.filename, async () => {
                const document = await readCredentialDocument(this.filename);
                if (document === undefined)
                    return undefined;
                const selectedAccountId = requestedAccountId ?? document.activeAccountId;
                const current = document.accounts.find(account => account.accountId === selectedAccountId);
                if (current === undefined)
                    return undefined;
                if (this.publicationFailed)
                    throw new Error('Codex account state is unavailable. Select an account again before retrying.');
                if (current.expires > Date.now() + 60_000) {
                    if (current.accountId === document.activeAccountId) {
                        try {
                            const stored = await this.ctx.credentials.resolve(TOKEN_REF);
                            if (stored?.value !== current.access)
                                await this.ctx.credentials.set(TOKEN_REF, current.access);
                        }
                        catch (error) {
                            this.publicationFailed = true;
                            throw error;
                        }
                    }
                    return current;
                }
                const next = await this.refreshCredential(current, signal);
                const nextDocument = {
                    ...document,
                    activeAccountId: document.activeAccountId === current.accountId ? next.accountId : document.activeAccountId,
                    accounts: document.accounts.map(account => account.accountId === current.accountId ? next : account),
                };
                // A rotated refresh token must survive a later failure publishing the selected bearer token.
                try {
                    await this.write(nextDocument);
                }
                catch (error) {
                    this.publicationFailed = true;
                    throw error;
                }
                if (nextDocument.activeAccountId === next.accountId)
                    await this.publish(nextDocument, nextDocument);
                return next;
            });
        }
        /** Return a valid bearer token for DSH's built-in Codex provider. */
        async bearerToken(signal) {
            return (await this.credential(signal))?.access;
        }
        /** Send one authenticated Responses request, preferring WebSocket transport with SSE fallback. */
        async responses(body, signal, maxBytes, operation) {
            const credential = await this.credential(signal);
            if (credential === undefined)
                throw new Error(`Sign in with OpenAI before using ${operation}.`);
            const sharedHeaders = {
                authorization: `Bearer ${credential.access}`,
                'chatgpt-account-id': credential.accountId,
                originator: 'deepseek-harness',
                'user-agent': 'deepseek-harness-openai-codex-auth/0.5',
            };
            try {
                return await readWebSocketEvents(codexWebSocketUrl(), {
                    ...sharedHeaders,
                    'openai-beta': CODEX_WEBSOCKET_BETA,
                }, body, signal, maxBytes, operation);
            }
            catch (error) {
                if (signal?.aborted)
                    throw error;
                this.ctx.logger.warn(`openai-codex-auth: ${operation} WebSocket failed; retrying with SSE: ${String(error)}`);
            }
            const response = await fetch(CODEX_RESPONSES_URL, {
                method: 'POST',
                headers: {
                    accept: 'text/event-stream',
                    ...sharedHeaders,
                    'content-type': 'application/json',
                    'openai-beta': 'responses=experimental',
                },
                body: JSON.stringify(body),
                ...signal === undefined ? {} : { signal },
            });
            if (!response.ok) {
                const detail = (await response.text()).slice(0, 1000);
                throw new Error(`OpenAI Codex ${operation} failed (HTTP ${response.status})${detail.length > 0 ? `: ${detail}` : ''}`);
            }
            return readSseEvents(response, maxBytes, operation);
        }
        createLoginRequest(signal, addAnother) {
            const verifier = base64Url(randomBytes(32));
            const challenge = base64Url(createHash('sha256').update(verifier).digest());
            const state = randomBytes(16).toString('hex');
            const url = new URL(AUTHORIZE_URL);
            for (const [key, value] of Object.entries({
                response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
                scope: 'openid profile email offline_access', code_challenge: challenge,
                code_challenge_method: 'S256', state, id_token_add_organizations: 'true',
                codex_cli_simplified_flow: 'true', originator: 'deepseek-harness',
            }))
                url.searchParams.set(key, value);
            if (addAnother)
                url.searchParams.set('prompt', 'login');
            return { url: url.toString(), code: this.waitForCallback(state, signal), verifier };
        }
        async finishLogin(authorizationCode, verifier, signal, redirectUri = REDIRECT_URI) {
            const credential = await tokenRequest(new URLSearchParams({
                grant_type: 'authorization_code', client_id: CLIENT_ID, code: authorizationCode,
                code_verifier: verifier, redirect_uri: redirectUri,
            }), signal);
            await withFileLock(this.filename, async () => {
                const document = await readCredentialDocument(this.filename);
                const accounts = document?.accounts.filter(account => account.accountId !== credential.accountId) ?? [];
                accounts.push(credential);
                await this.publish({ version: 2, activeAccountId: credential.accountId, accounts }, document);
            });
            this.usageCache.delete(credential.accountId);
            this.usageErrors.delete(credential.accountId);
        }
        async logout(accountId) {
            await withFileLock(this.filename, async () => {
                const document = await readCredentialDocument(this.filename);
                if (document === undefined)
                    return;
                if (!document.accounts.some(account => account.accountId === accountId)) {
                    throw new Error('OpenAI account was not found.');
                }
                const accounts = document.accounts.filter(account => account.accountId !== accountId);
                if (accounts.length === 0) {
                    await this.publish(undefined, document);
                    return;
                }
                const activeAccountId = document.activeAccountId === accountId
                    ? accounts[0].accountId
                    : document.activeAccountId;
                await this.publish({ version: 2, activeAccountId, accounts }, document);
            });
            this.usageCache.delete(accountId);
            this.usageErrors.delete(accountId);
        }
        async activate(accountId) {
            await withFileLock(this.filename, async () => {
                const document = await readCredentialDocument(this.filename);
                const account = document?.accounts.find(candidate => candidate.accountId === accountId);
                if (document === undefined || account === undefined)
                    throw new Error('OpenAI account was not found.');
                const current = account.expires > Date.now() + 60_000 ? account : await this.refreshCredential(account);
                const refreshed = {
                    ...document,
                    accounts: document.accounts.map(candidate => candidate.accountId === accountId ? current : candidate),
                };
                if (current !== account) {
                    try {
                        await this.write(refreshed);
                    }
                    catch (error) {
                        this.publicationFailed = true;
                        throw error;
                    }
                }
                await this.publish({ ...refreshed, activeAccountId: current.accountId }, refreshed);
            });
        }
        beginBrowserLogin(addAnother) {
            if (this.loginFlow !== undefined)
                return this.loginFlow;
            const abort = new AbortController();
            const { url, code, verifier } = this.createLoginRequest(abort.signal, addAnother);
            this.lastLoginError = undefined;
            const completion = code
                .then(authorizationCode => this.finishLogin(authorizationCode, verifier, abort.signal))
                .catch((_error) => {
                // A cancelled flow is an owner action, not a failure worth showing on the card.
                if (!abort.signal.aborted)
                    this.lastLoginError = 'OpenAI sign-in failed. Start sign-in again.';
            })
                .finally(() => {
                if (this.loginFlow?.abort === abort)
                    this.loginFlow = undefined;
            });
            const flow = { kind: 'browser', url, completion, abort };
            this.loginFlow = flow;
            return flow;
        }
        /** Begin OpenAI's device-code flow for SSH and other headless environments. */
        async beginDeviceLogin() {
            if (this.loginFlow !== undefined) {
                if (this.loginFlow.kind === 'device' && this.loginFlow.userCode !== undefined) {
                    return this.loginFlow;
                }
                throw new Error('Another OpenAI sign-in is already in progress.');
            }
            const abort = new AbortController();
            const initiation = await fetch(DEVICE_CODE_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'user-agent': 'deepseek-harness-openai-codex-auth/0.5' },
                body: JSON.stringify({ client_id: CLIENT_ID }),
                signal: abort.signal,
            });
            if (!initiation.ok)
                throw new Error(`OpenAI device sign-in could not start (HTTP ${initiation.status}).`);
            const authorization = normalizeDeviceAuthorization(await initiation.json());
            const { userCode, deviceAuthId, intervalMs } = authorization;
            const deadline = Date.now() + authorization.expiresInMs;
            const completion = (async () => {
                for (;;) {
                    if (Date.now() >= deadline)
                        throw new Error('OpenAI device sign-in expired. Start it again.');
                    const poll = await fetch(DEVICE_TOKEN_URL, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'user-agent': 'deepseek-harness-openai-codex-auth/0.5' },
                        body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
                        signal: abort.signal,
                    });
                    if (poll.ok) {
                        const token = await poll.json();
                        if (typeof token.authorization_code !== 'string' || typeof token.code_verifier !== 'string') {
                            throw new Error('OpenAI returned an incomplete device authorization.');
                        }
                        await this.finishLogin(token.authorization_code, token.code_verifier, abort.signal, DEVICE_REDIRECT_URI);
                        return;
                    }
                    if (poll.status !== 403 && poll.status !== 404) {
                        throw new Error(`OpenAI device sign-in failed while waiting (HTTP ${poll.status}).`);
                    }
                    await delay(intervalMs, abort.signal);
                }
            })()
                .catch((error) => {
                if (!abort.signal.aborted)
                    this.lastLoginError = 'OpenAI device sign-in failed. Request a new device code.';
            })
                .finally(() => {
                if (this.loginFlow?.abort === abort)
                    this.loginFlow = undefined;
            });
            const flow = {
                kind: 'device', url: DEVICE_AUTH_URL, userCode, completion, abort,
            };
            this.lastLoginError = undefined;
            this.loginFlow = flow;
            return flow;
        }
        async status(refresh) {
            const preferences = await readPreferences(this.preferencesFilename);
            const serviceTier = {
                selection: preferences.serviceTier,
                requestValue: serviceTierRequestValue(preferences.serviceTier),
                forwardingSupported: false,
            };
            let document = await readCredentialDocument(this.filename);
            if (document === undefined) {
                return {
                    loggedIn: false, loginPending: this.loginFlow !== undefined, loginError: this.lastLoginError,
                    serviceTier, accountStateUnavailable: this.publicationFailed,
                };
            }
            await Promise.all(document.accounts.map(async (account) => {
                try {
                    const current = await this.credential(undefined, account.accountId);
                    if (current === undefined)
                        return;
                    const cached = this.usageCache.get(account.accountId);
                    if (refresh || cached === undefined || Date.now() - cached.fetchedAt > USAGE_CACHE_MS) {
                        this.usageCache.set(account.accountId, await this.fetchUsage(current));
                    }
                    this.usageErrors.delete(account.accountId);
                }
                catch (error) {
                    this.usageErrors.set(account.accountId, 'Could not refresh this account or load its quota. Retry or sign in again.');
                }
            }));
            document = await readCredentialDocument(this.filename) ?? document;
            return {
                loggedIn: true,
                loginPending: this.loginFlow !== undefined,
                loginError: this.lastLoginError,
                activeAccountId: this.publicationFailed ? undefined : document.activeAccountId,
                accounts: document.accounts.map(account => ({
                    ...accountProfile(account.access),
                    accountId: account.accountId,
                    active: !this.publicationFailed && account.accountId === document.activeAccountId,
                    expiresAt: account.expires,
                    usage: this.usageCache.get(account.accountId),
                    usageError: this.usageErrors.get(account.accountId),
                })),
                serviceTier,
                accountStateUnavailable: this.publicationFailed,
            };
        }
        async fetchUsage(credential) {
            const response = await fetch(USAGE_URL, {
                headers: {
                    accept: 'application/json',
                    authorization: `Bearer ${credential.access}`,
                    'chatgpt-account-id': credential.accountId,
                    'user-agent': 'dsh-openai-codex-auth/0.5',
                },
            });
            if (!response.ok)
                throw new Error(`Codex usage request failed (HTTP ${response.status})`);
            return normalizeUsage(await response.json());
        }
        async redeemReset(accountId) {
            const credential = await this.credential(undefined, accountId);
            if (credential === undefined)
                throw new Error('OpenAI account was not found.');
            const headers = {
                accept: 'application/json',
                authorization: `Bearer ${credential.access}`,
                'chatgpt-account-id': credential.accountId,
                'openai-beta': 'codex-1',
                originator: 'DeepSeek Harness',
                'user-agent': 'dsh-openai-codex-auth/0.5',
            };
            const creditResponse = await fetch(RESET_CREDITS_URL, { headers });
            if (!creditResponse.ok)
                throw new Error(`Could not load reset credits (HTTP ${creditResponse.status}).`);
            const creditId = availableResetCreditId(await creditResponse.json());
            const response = await fetch(RESET_CONSUME_URL, {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({
                    redeem_request_id: randomUUID(),
                    ...creditId === undefined ? {} : { credit_id: creditId },
                }),
            });
            if (!response.ok)
                throw new Error(`Could not redeem the usage reset (HTTP ${response.status}).`);
            this.usageCache.delete(accountId);
            this.usageErrors.delete(accountId);
        }
        async searchWeb(request, signal) {
            const events = await this.responses({
                model: SEARCH_MODEL,
                store: false,
                stream: true,
                instructions: 'Use web search. Give a concise answer supported by the returned sources.',
                input: [{ role: 'user', content: [{ type: 'input_text', text: request.query }] }],
                tools: [{ type: 'web_search' }],
                tool_choice: 'auto',
                include: ['web_search_call.action.sources'],
                service_tier: 'default',
            }, signal, MAX_SEARCH_RESPONSE_BYTES, 'web search');
            return normalizeWebSearchEvents(events);
        }
        /** Owner-only account operations over DSH's authenticated Remote transport. No token leaves the host. */
        async account(action, input) {
            if (principalOf(this.ctx.invocation) !== undefined) {
                throw new RemoteError('codex/forbidden', 'Only the DSH owner can manage Codex accounts.', {});
            }
            if (typeof action !== 'string' || input === null || typeof input !== 'object' || Array.isArray(input)) {
                throw new RemoteError('codex/invalid-request', 'Invalid Codex account request.', {});
            }
            const row = input;
            if (!['status', 'models', 'start', 'start-device', 'cancel-login', 'remove', 'activate', 'redeem', 'service-tier'].includes(action)) {
                throw new RemoteError('codex/invalid-request', 'Unknown Codex account action.', {});
            }
            if (['remove', 'activate', 'redeem'].includes(action)
                && (typeof row.accountId !== 'string' || row.accountId.length === 0 || row.accountId.length > 256)) {
                throw new RemoteError('codex/invalid-request', 'Choose a saved Codex account.', {});
            }
            try {
                if (action === 'models')
                    return {
                        models: (await this.ctx.llm.listModels('openai-codex')).map(model => ({ id: model.id, name: model.name })),
                    };
                if (action === 'status')
                    return await this.status(row.refresh === true);
                if (action === 'start')
                    return { url: this.beginBrowserLogin(row.add === true).url };
                if (action === 'cancel-login') {
                    // The owner closed the OAuth window; abort whatever sign-in is pending so the card stops waiting.
                    const flow = this.loginFlow;
                    if (flow !== undefined) {
                        flow.abort.abort();
                        await flow.completion;
                        if (this.loginFlow === flow)
                            this.loginFlow = undefined;
                    }
                    this.lastLoginError = undefined;
                    return { ok: true };
                }
                if (action === 'start-device') {
                    const flow = await this.beginDeviceLogin();
                    return { url: flow.url, userCode: flow.userCode };
                }
                if (action === 'service-tier') {
                    await this.writePreferences(parseServiceTierSelection(row.selection));
                }
                else {
                    const id = row.accountId;
                    if (action === 'remove')
                        await this.logout(id);
                    else if (action === 'activate')
                        await this.activate(id);
                    else
                        await this.redeemReset(id);
                }
                return { ok: true };
            }
            catch (error) {
                // Provider and filesystem errors can carry token or path details; the owner gets a safe action hint.
                throw new RemoteError('codex/operation-failed', 'Codex account operation failed. Refresh status and retry, or sign in again if the account expired.', {}, { cause: error });
            }
        }
        async refreshCredential(current, signal) {
            const next = await tokenRequest(new URLSearchParams({
                grant_type: 'refresh_token', refresh_token: current.refresh, client_id: CLIENT_ID,
            }), signal);
            if (next.accountId !== current.accountId)
                throw new Error('OpenAI refresh changed the account identity. Sign in again.');
            return next;
        }
        /** Caller holds the credential-file lock. Failed publication restores both stores or blocks model use. */
        async publish(next, previous) {
            const store = async (document) => {
                const token = document?.accounts.find(account => account.accountId === document.activeAccountId)?.access;
                if (token === undefined)
                    await this.ctx.credentials.unset(TOKEN_REF);
                else
                    await this.ctx.credentials.set(TOKEN_REF, token);
                if (document !== undefined)
                    await this.write(document);
                else {
                    try {
                        await unlink(this.filename);
                    }
                    catch (error) {
                        if (error.code !== 'ENOENT')
                            throw error;
                    }
                }
            };
            this.publicationFailed = true;
            try {
                await store(next);
                this.publicationFailed = false;
            }
            catch (error) {
                try {
                    await store(previous);
                    this.publicationFailed = false;
                }
                catch (restoreError) {
                    this.ctx.logger.error('Codex account state could not be restored. Model use is blocked; select an account again or restart DSH.');
                    throw new AggregateError([error, restoreError], 'Codex account selection failed and could not be restored.');
                }
                throw error;
            }
        }
        write(document) {
            return writeFileAtomic(this.filename, `${JSON.stringify(document, null, 2)}\n`, {
                mode: 0o600, dirMode: 0o700,
            });
        }
        writePreferences(serviceTier) {
            return writeFileAtomic(this.preferencesFilename, `${JSON.stringify({ version: 1, serviceTier }, null, 2)}\n`, {
                mode: 0o600, dirMode: 0o700,
            });
        }
        waitForCallback(state, signal) {
            return new Promise((resolve, reject) => {
                let settled = false;
                const server = createServer((request, response) => {
                    const url = new URL(request.url ?? '', REDIRECT_URI);
                    if (url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
                        response.writeHead(400).end('Invalid OpenAI OAuth callback.');
                        return;
                    }
                    const code = url.searchParams.get('code');
                    if (code === null) {
                        response.writeHead(400).end('Missing authorization code.');
                        return;
                    }
                    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('OpenAI login complete. You may close this window.');
                    settled = true;
                    signal.removeEventListener('abort', abort);
                    clearTimeout(timer);
                    server.close();
                    resolve(code);
                });
                // A closed OAuth window sends no callback; stop waiting instead of blocking sign-in forever.
                const timer = setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    signal.removeEventListener('abort', abort);
                    server.close();
                    reject(new Error('OpenAI login timed out. Start sign-in again.'));
                }, BROWSER_LOGIN_TIMEOUT_MS);
                const abort = () => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    server.close();
                    reject(new Error('OpenAI login cancelled'));
                };
                signal.addEventListener('abort', abort, { once: true });
                server.listen(1455, '127.0.0.1').on('error', (error) => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    signal.removeEventListener('abort', abort);
                    reject(error);
                });
            });
        }
    };
})();
export { OpenAICodexAuth };
export default OpenAICodexAuth;
