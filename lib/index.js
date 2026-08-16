/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
const DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
const DEVICE_AUTH_URL = 'https://auth.openai.com/codex/device';
const DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const DEFAULT_FILENAME = 'openai-codex-auth.json';
const DEFAULT_PREFERENCES_FILENAME = 'openai-codex-preferences.json';
const TOKEN_REF = credentialRef('DSH_OPENAI_CODEX_TOKEN');
const CONTROL_PORT = 1456;
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const SEARCH_MODEL = 'gpt-5.4-mini';
const SEARCH_PROVIDER_ID = 'openai-codex';
const USAGE_CACHE_MS = 30_000;
const MAX_CONTROL_BODY_BYTES = 4 * 1024;
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
/** Read one small JSON request without allowing an unbounded loopback payload. */
async function readControlJson(request) {
    const chunks = [];
    let bytes = 0;
    for await (const raw of request) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        bytes += chunk.byteLength;
        if (bytes > MAX_CONTROL_BODY_BYTES)
            throw new Error('Request body is too large.');
        chunks.push(chunk);
    }
    if (chunks.length === 0)
        throw new Error('Request body is missing.');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
        throw new Error(`OpenAI token request failed (HTTP ${response.status}): ${await response.text()}`);
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
function isLocalOrigin(origin) {
    if (origin === undefined)
        return false;
    try {
        const hostname = new URL(origin).hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    }
    catch {
        return false;
    }
}
/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
export class OpenAICodexAuth extends Service {
    static Config = z.object({ path: z.string(), preferencesPath: z.string(), dshHome: z.string() });
    static inject = ['credentials', 'web'];
    filename;
    preferencesFilename;
    csrf = base64Url(randomBytes(24));
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
            const token = await this.bearerToken();
            if (token !== undefined)
                await ctx.credentials.set(TOKEN_REF, token);
            return () => { };
        });
        ctx.effect(() => {
            const timer = setInterval(() => { void this.bearerToken().catch(() => { }); }, 60_000);
            return () => { clearInterval(timer); };
        });
        ctx.effect(() => this.startControlServer());
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
            if (current.expires > Date.now() + 60_000)
                return current;
            const next = await tokenRequest(new URLSearchParams({
                grant_type: 'refresh_token', refresh_token: current.refresh, client_id: CLIENT_ID,
            }), signal);
            const nextDocument = {
                ...document,
                activeAccountId: document.activeAccountId === current.accountId ? next.accountId : document.activeAccountId,
                accounts: document.accounts.map(account => account.accountId === current.accountId ? next : account),
            };
            await this.write(nextDocument);
            if (nextDocument.activeAccountId === next.accountId)
                await this.ctx.credentials.set(TOKEN_REF, next.access);
            return next;
        });
    }
    /** Return a valid bearer token for DSH's built-in Codex provider. */
    async bearerToken(signal) {
        return (await this.credential(signal))?.access;
    }
    /** Send one authenticated streaming request to the ChatGPT Codex Responses endpoint. */
    async responses(body, signal, maxBytes, operation) {
        const credential = await this.credential(signal);
        if (credential === undefined)
            throw new Error(`Sign in with OpenAI before using ${operation}.`);
        const response = await fetch(CODEX_RESPONSES_URL, {
            method: 'POST',
            headers: {
                accept: 'text/event-stream',
                authorization: `Bearer ${credential.access}`,
                'chatgpt-account-id': credential.accountId,
                'content-type': 'application/json',
                'openai-beta': 'responses=experimental',
                originator: 'deepseek-harness',
                'user-agent': 'deepseek-harness-openai-codex-auth/0.5',
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
            await this.write({ version: 2, activeAccountId: credential.accountId, accounts });
        });
        await this.ctx.credentials.set(TOKEN_REF, credential.access);
        this.usageCache.delete(credential.accountId);
        this.usageErrors.delete(credential.accountId);
    }
    async logout(accountId) {
        let nextActive;
        await withFileLock(this.filename, async () => {
            const document = await readCredentialDocument(this.filename);
            if (document === undefined)
                return;
            if (!document.accounts.some(account => account.accountId === accountId)) {
                throw new Error('OpenAI account was not found.');
            }
            const accounts = document.accounts.filter(account => account.accountId !== accountId);
            if (accounts.length === 0) {
                try {
                    await unlink(this.filename);
                }
                catch (error) {
                    if (error.code !== 'ENOENT')
                        throw error;
                }
                return;
            }
            const activeAccountId = document.activeAccountId === accountId
                ? accounts[0].accountId
                : document.activeAccountId;
            nextActive = accounts.find(account => account.accountId === activeAccountId) ?? accounts[0];
            await this.write({ version: 2, activeAccountId: nextActive.accountId, accounts });
        });
        if (nextActive === undefined)
            await this.ctx.credentials.unset(TOKEN_REF);
        else
            await this.ctx.credentials.set(TOKEN_REF, nextActive.access);
        this.usageCache.delete(accountId);
        this.usageErrors.delete(accountId);
    }
    async activate(accountId) {
        const active = await withFileLock(this.filename, async () => {
            const document = await readCredentialDocument(this.filename);
            const account = document?.accounts.find(candidate => candidate.accountId === accountId);
            if (document === undefined || account === undefined)
                throw new Error('OpenAI account was not found.');
            await this.write({ ...document, activeAccountId: accountId });
            return account;
        });
        const current = await this.credential(undefined, accountId) ?? active;
        await this.ctx.credentials.set(TOKEN_REF, current.access);
    }
    beginBrowserLogin(addAnother) {
        if (this.loginFlow !== undefined)
            return this.loginFlow;
        const abort = new AbortController();
        const { url, code, verifier } = this.createLoginRequest(abort.signal, addAnother);
        this.lastLoginError = undefined;
        const completion = code
            .then(authorizationCode => this.finishLogin(authorizationCode, verifier, abort.signal))
            .catch((error) => { this.lastLoginError = error instanceof Error ? error.message : String(error); })
            .finally(() => { this.loginFlow = undefined; });
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
                this.lastLoginError = error instanceof Error ? error.message : String(error);
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
                serviceTier, csrf: this.csrf,
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
                this.usageErrors.set(account.accountId, error instanceof Error ? error.message : String(error));
            }
        }));
        document = await readCredentialDocument(this.filename) ?? document;
        return {
            loggedIn: true,
            loginPending: this.loginFlow !== undefined,
            activeAccountId: document.activeAccountId,
            accounts: document.accounts.map(account => ({
                ...accountProfile(account.access),
                accountId: account.accountId,
                active: account.accountId === document.activeAccountId,
                expiresAt: account.expires,
                usage: this.usageCache.get(account.accountId),
                usageError: this.usageErrors.get(account.accountId),
            })),
            serviceTier,
            csrf: this.csrf,
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
    startControlServer() {
        return new Promise((resolveStart, rejectStart) => {
            const server = createServer((request, response) => { void this.controlRequest(request, response); });
            server.once('error', rejectStart);
            server.listen(CONTROL_PORT, '127.0.0.1', () => {
                server.removeListener('error', rejectStart);
                resolveStart(() => {
                    this.loginFlow?.abort.abort();
                    server.close();
                });
            });
        });
    }
    async controlRequest(request, response) {
        const origin = request.headers.origin;
        const localOrigin = isLocalOrigin(origin);
        const headers = {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            vary: 'Origin',
            ...localOrigin ? { 'access-control-allow-origin': origin } : {},
        };
        const send = (status, value) => {
            response.writeHead(status, headers).end(JSON.stringify(value));
        };
        try {
            const url = new URL(request.url ?? '/', `http://127.0.0.1:${CONTROL_PORT}`);
            if (request.method === 'OPTIONS' && localOrigin) {
                response.writeHead(204, {
                    ...headers,
                    'access-control-allow-methods': 'GET, POST, OPTIONS',
                    'access-control-allow-headers': 'content-type, x-dsh-csrf',
                }).end();
                return;
            }
            if (url.pathname === '/start' && request.method === 'GET') {
                const flow = this.beginBrowserLogin(url.searchParams.get('add') === '1');
                response.writeHead(302, { location: flow.url, 'cache-control': 'no-store' }).end();
                return;
            }
            if (url.pathname === '/start-device' && request.method === 'GET') {
                if (origin !== undefined && !localOrigin) {
                    send(403, { error: 'This endpoint only accepts a local DSH Web origin or a local CLI request.' });
                    return;
                }
                const flow = await this.beginDeviceLogin();
                send(200, { url: flow.url, userCode: flow.userCode });
                return;
            }
            if (!localOrigin) {
                send(403, { error: 'This endpoint only accepts a local DSH Web origin.' });
                return;
            }
            if (url.pathname === '/status' && request.method === 'GET') {
                send(200, await this.status(url.searchParams.get('refresh') === '1'));
                return;
            }
            if ((url.pathname === '/accounts/remove' || url.pathname === '/accounts/activate') && request.method === 'POST') {
                if (request.headers['x-dsh-csrf'] !== this.csrf) {
                    send(403, { error: 'Invalid CSRF token.' });
                    return;
                }
                if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
                    send(415, { error: 'Content-Type must be application/json.' });
                    return;
                }
                let body;
                try {
                    body = await readControlJson(request);
                }
                catch (error) {
                    send(400, { error: error instanceof Error ? error.message : String(error) });
                    return;
                }
                const accountId = body !== null && typeof body === 'object'
                    ? body.accountId
                    : undefined;
                if (typeof accountId !== 'string' || accountId.length === 0) {
                    send(400, { error: 'accountId must be a non-empty string.' });
                    return;
                }
                if (url.pathname === '/accounts/remove')
                    await this.logout(accountId);
                else
                    await this.activate(accountId);
                send(200, { ok: true });
                return;
            }
            if (url.pathname === '/service-tier-preference' && request.method === 'POST') {
                if (request.headers['x-dsh-csrf'] !== this.csrf) {
                    send(403, { error: 'Invalid CSRF token.' });
                    return;
                }
                if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
                    send(415, { error: 'Content-Type must be application/json.' });
                    return;
                }
                let body;
                try {
                    body = await readControlJson(request);
                }
                catch (error) {
                    send(400, { error: error instanceof Error ? error.message : String(error) });
                    return;
                }
                const row = body !== null && typeof body === 'object' ? body : {};
                let selection;
                try {
                    selection = parseServiceTierSelection(row.selection);
                }
                catch (error) {
                    send(400, { error: error instanceof Error ? error.message : String(error) });
                    return;
                }
                await this.writePreferences(selection);
                send(200, {
                    selection,
                    requestValue: serviceTierRequestValue(selection),
                    forwardingSupported: false,
                });
                return;
            }
            send(404, { error: 'Not found' });
        }
        catch (error) {
            send(500, { error: error instanceof Error ? error.message : String(error) });
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
                server.close();
                resolve(code);
            });
            const abort = () => {
                if (settled)
                    return;
                settled = true;
                server.close();
                reject(new Error('OpenAI login cancelled'));
            };
            signal.addEventListener('abort', abort, { once: true });
            server.listen(1455, '127.0.0.1').on('error', (error) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', abort);
                reject(error);
            });
        });
    }
}
export default OpenAICodexAuth;
