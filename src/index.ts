/** Native OpenAI Codex OAuth login for DeepSeek Harness. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const DEVICE_CODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode'
const DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token'
const DEVICE_AUTH_URL = 'https://auth.openai.com/codex/device'
const DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const DEFAULT_FILENAME = 'openai-codex-auth.json'
const DEFAULT_PREFERENCES_FILENAME = 'openai-codex-preferences.json'
const TOKEN_REF = credentialRef('DSH_OPENAI_CODEX_TOKEN')
const CONTROL_PORT = 1456
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const SEARCH_MODEL = 'gpt-5.4-mini'
const SEARCH_PROVIDER_ID = 'openai-codex'
const USAGE_CACHE_MS = 30_000
const MAX_CONTROL_BODY_BYTES = 4 * 1024
const MAX_SEARCH_RESPONSE_BYTES = 4 * 1024 * 1024

/** Choice presented by the plugin UI. */
export type ServiceTierSelection = 'normal' | 'priority'

/** OpenAI request value represented by a service-tier choice. */
export type OpenAIServiceTier = 'default' | 'priority'

/** Persisted OAuth credential. */
export interface OpenAICodexCredential {
  access: string
  refresh: string
  expires: number
  accountId: string
}

/** Plugin configuration. */
export interface Config { path?: string; preferencesPath?: string; dshHome?: string }

interface CredentialDocument { version: 1; credential: OpenAICodexCredential }
interface PreferencesDocument { version: 1; serviceTier: ServiceTierSelection }

interface UsageWindow {
  usedPercent: number
  windowSeconds?: number
  resetAt?: number
}

interface UsageSummary {
  planType?: string
  primary?: UsageWindow
  secondary?: UsageWindow
  limitReached?: boolean
  resetCredits?: number
  fetchedAt: number
}

interface LoginFlow {
  kind: 'browser' | 'device'
  url: string
  completion: Promise<void>
  abort: AbortController
  userCode?: string
}

interface WebSearchRequest { query: string; maxResults?: number }
interface WebSearchSource { url: string; title?: string; snippet?: string; publishedAt?: string }
interface WebSearchResult { content?: string; sources: WebSearchSource[]; truncated: boolean }
interface WebSearchProvider {
  id: string
  available(): boolean
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
}

export interface DeviceAuthorization {
  userCode: string
  deviceAuthId: string
  intervalMs: number
  expiresInMs: number
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

function accountId(access: string): string {
  const parts = access.split('.')
  if (parts.length !== 3) throw new Error('OpenAI returned an invalid access token')
  const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
    'https://api.openai.com/auth'?: { chatgpt_account_id?: unknown }
  }
  const id = payload['https://api.openai.com/auth']?.chatgpt_account_id
  if (typeof id !== 'string' || id.length === 0) throw new Error('OpenAI token has no ChatGPT account id')
  return id
}

function parseCredential(text: string, filename: string): OpenAICodexCredential {
  const value = JSON.parse(text) as Partial<CredentialDocument>
  const credential = value.credential
  if (value.version !== 1 || credential === undefined
    || typeof credential.access !== 'string' || typeof credential.refresh !== 'string'
    || typeof credential.expires !== 'number' || typeof credential.accountId !== 'string') {
    throw new Error(`openai-codex-auth: invalid credential document ${filename}`)
  }
  return credential
}

/** Strictly validate a stored or submitted service-tier choice. */
export function parseServiceTierSelection(value: unknown): ServiceTierSelection {
  if (value === 'normal' || value === 'priority') return value
  throw new Error('Service tier must be "normal" or "priority".')
}

/** Map UI language to the value expected by OpenAI's Responses API. */
export function serviceTierRequestValue(selection: ServiceTierSelection): OpenAIServiceTier {
  return selection === 'priority' ? 'priority' : 'default'
}

function parsePreferences(text: string, filename: string): PreferencesDocument {
  const value = JSON.parse(text) as Partial<PreferencesDocument>
  if (value.version !== 1) throw new Error(`openai-codex-auth: invalid preferences document ${filename}`)
  return { version: 1, serviceTier: parseServiceTierSelection(value.serviceTier) }
}

async function readPreferences(filename: string): Promise<PreferencesDocument> {
  try {
    return parsePreferences(await readFile(filename, 'utf8'), filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, serviceTier: 'normal' }
    throw error
  }
}

/** Read one small JSON request without allowing an unbounded loopback payload. */
async function readControlJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    bytes += chunk.byteLength
    if (bytes > MAX_CONTROL_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) throw new Error('Request body is missing.')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

async function readCredential(filename: string): Promise<OpenAICodexCredential | undefined> {
  try {
    return parseCredential(await readFile(filename, 'utf8'), filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function tokenRequest(body: URLSearchParams, signal?: AbortSignal): Promise<OpenAICodexCredential> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    ...signal === undefined ? {} : { signal },
  })
  if (!response.ok) {
    throw new Error(`OpenAI token request failed (HTTP ${response.status}): ${await response.text()}`)
  }
  const value = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown } | null
  if (value === null || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string'
    || typeof value.expires_in !== 'number') throw new Error('OpenAI token response is incomplete')
  return {
    access: value.access_token,
    refresh: value.refresh_token,
    expires: Date.now() + value.expires_in * 1000,
    accountId: accountId(value.access_token),
  }
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Validate and normalize OpenAI's device-authorization initiation response. */
export function normalizeDeviceAuthorization(value: unknown): DeviceAuthorization {
  if (value === null || typeof value !== 'object') {
    throw new Error('OpenAI returned an incomplete device sign-in response.')
  }
  const row = value as Record<string, unknown>
  if (typeof row.user_code !== 'string' || row.user_code.length === 0
    || typeof row.device_auth_id !== 'string' || row.device_auth_id.length === 0) {
    throw new Error('OpenAI returned an incomplete device sign-in response.')
  }
  const rawInterval = typeof row.interval === 'number'
    ? row.interval
    : typeof row.interval === 'string' ? Number.parseInt(row.interval, 10) : 5
  const intervalSeconds = Math.min(30, Math.max(1, Number.isFinite(rawInterval) ? rawInterval : 5))
  const rawExpiry = typeof row.expires_in === 'number' && Number.isFinite(row.expires_in)
    ? row.expires_in
    : 15 * 60
  return {
    userCode: row.user_code,
    deviceAuthId: row.device_auth_id,
    intervalMs: intervalSeconds * 1000,
    expiresInMs: Math.max(60, rawExpiry) * 1000,
  }
}

function usageWindow(value: unknown): UsageWindow | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const usedPercent = optionalNumber(row.used_percent ?? row.usedPercent)
  if (usedPercent === undefined) return undefined
  const windowSeconds = optionalNumber(row.limit_window_seconds ?? row.windowDurationSecs)
  const resetAt = optionalNumber(row.reset_at ?? row.resetsAt)
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    ...windowSeconds === undefined ? {} : { windowSeconds },
    ...resetAt === undefined ? {} : { resetAt },
  }
}

/** Reduce the OpenAI response to the stable fields displayed by the Web card. */
export function normalizeUsage(value: unknown): UsageSummary {
  const root = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const limits = root.rate_limit !== null && typeof root.rate_limit === 'object'
    ? root.rate_limit as Record<string, unknown>
    : root.rateLimits !== null && typeof root.rateLimits === 'object'
      ? root.rateLimits as Record<string, unknown>
      : {}
  const credits = root.rate_limit_reset_credits !== null && typeof root.rate_limit_reset_credits === 'object'
    ? root.rate_limit_reset_credits as Record<string, unknown>
    : undefined
  const planType = typeof root.plan_type === 'string'
    ? root.plan_type
    : typeof root.planType === 'string' ? root.planType : undefined
  const primary = usageWindow(limits.primary_window ?? limits.primary)
  const secondary = usageWindow(limits.secondary_window ?? limits.secondary)
  const limitReached = typeof limits.limit_reached === 'boolean'
    ? limits.limit_reached
    : typeof limits.limitReached === 'boolean' ? limits.limitReached : undefined
  const resetCredits = optionalNumber(credits?.available_count ?? credits?.availableCount)
  return {
    ...planType === undefined ? {} : { planType },
    ...primary === undefined ? {} : { primary },
    ...secondary === undefined ? {} : { secondary },
    ...limitReached === undefined ? {} : { limitReached },
    ...resetCredits === undefined ? {} : { resetCredits },
    fetchedAt: Date.now(),
  }
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch { return undefined }
}

/** Convert OpenAI Responses streaming events into DSH's provider-neutral search result. */
export function normalizeWebSearchEvents(events: readonly unknown[]): WebSearchResult {
  const answer: string[] = []
  const cited: WebSearchSource[] = []
  const discovered: WebSearchSource[] = []
  for (const value of events) {
    if (value === null || typeof value !== 'object') continue
    const event = value as Record<string, unknown>
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') answer.push(event.delta)
    if (event.type === 'response.output_text.annotation.added'
      && event.annotation !== null && typeof event.annotation === 'object') {
      const annotation = event.annotation as Record<string, unknown>
      const url = httpUrl(annotation.url)
      if (annotation.type === 'url_citation' && url !== undefined) {
        cited.push({ url, ...typeof annotation.title === 'string' && annotation.title.length > 0
          ? { title: annotation.title } : {} })
      }
    }
    if (event.type === 'response.output_item.done' && event.item !== null && typeof event.item === 'object') {
      const item = event.item as Record<string, unknown>
      const action = item.action !== null && typeof item.action === 'object'
        ? item.action as Record<string, unknown> : undefined
      if (item.type !== 'web_search_call' || !Array.isArray(action?.sources)) continue
      for (const source of action.sources) {
        if (source === null || typeof source !== 'object') continue
        const url = httpUrl((source as Record<string, unknown>).url)
        if (url !== undefined) discovered.push({ url })
      }
    }
  }
  const seen = new Set<string>()
  const sources = [...cited, ...discovered].filter((source) => {
    if (seen.has(source.url)) return false
    seen.add(source.url)
    return true
  })
  if (sources.length === 0) throw new Error('OpenAI returned no web-search sources.')
  const content = answer.join('').trim()
  return { ...content.length > 0 ? { content } : {}, sources, truncated: false }
}

async function readSseEvents(response: Response, maxBytes: number, operation: string): Promise<unknown[]> {
  if (response.body === null) throw new Error(`OpenAI returned an empty ${operation} stream.`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events: unknown[] = []
  let buffer = ''
  let bytes = 0
  const parseFrame = (frame: string): void => {
    const data = frame.split(/\r?\n/u)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data.length === 0 || data === '[DONE]') return
    try { events.push(JSON.parse(data) as unknown) } catch { /* Ignore non-JSON keepalive frames. */ }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel(`OpenAI ${operation} response exceeded the safety limit.`)
      throw new Error(`OpenAI ${operation} response exceeded the safety limit.`)
    }
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const separator = /\r?\n\r?\n/u.exec(buffer)
      if (separator === null || separator.index === undefined) break
      parseFrame(buffer.slice(0, separator.index))
      buffer = buffer.slice(separator.index + separator[0].length)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim().length > 0) parseFrame(buffer)
  return events
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, rejectDelay) => {
    if (signal.aborted) { rejectDelay(signal.reason ?? new Error('OpenAI login cancelled')); return }
    const timer = setTimeout(done, ms)
    function done(): void {
      signal.removeEventListener('abort', aborted)
      resolveDelay()
    }
    function aborted(): void {
      clearTimeout(timer)
      rejectDelay(signal.reason ?? new Error('OpenAI login cancelled'))
    }
    signal.addEventListener('abort', aborted, { once: true })
  })
}

function isLocalOrigin(origin: string | undefined): origin is string {
  if (origin === undefined) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch { return false }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    openaiCodexAuth: OpenAICodexAuth
    web: { registerSearchProvider(provider: WebSearchProvider): () => void }
  }
}

/** DSH service providing login, logout, and automatically refreshed bearer tokens. */
export class OpenAICodexAuth extends Service {
  static Config: z<Config> = z.object({ path: z.string(), preferencesPath: z.string(), dshHome: z.string() })
  static inject = ['credentials', 'web']
  private readonly filename: string
  private readonly preferencesFilename: string
  private readonly csrf = base64Url(randomBytes(24))
  private usageCache: UsageSummary | undefined
  private usageError: string | undefined
  private loginFlow: LoginFlow | undefined
  private lastLoginError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'openaiCodexAuth')
    const dshHome = resolveDshHome(config.dshHome)
    this.filename = resolve(config.path ?? join(dshHome, DEFAULT_FILENAME))
    this.preferencesFilename = resolve(config.preferencesPath ?? join(dshHome, DEFAULT_PREFERENCES_FILENAME))
    ctx.effect(async () => {
      const token = await this.bearerToken()
      if (token !== undefined) await ctx.credentials.set(TOKEN_REF, token)
      return () => {}
    })
    ctx.effect(() => {
      const timer = setInterval(() => { void this.bearerToken().catch(() => {}) }, 60_000)
      return () => { clearInterval(timer) }
    })
    ctx.effect(() => this.startControlServer())
    ctx.effect(() => ctx.web.registerSearchProvider({
      id: SEARCH_PROVIDER_ID,
      available: () => true,
      search: (request, signal) => this.searchWeb(request, signal),
    }))
  }

  /** Return a valid credential, refreshing and persisting it when near expiry. */
  async credential(signal?: AbortSignal): Promise<OpenAICodexCredential | undefined> {
    return withFileLock(this.filename, async () => {
      const current = await readCredential(this.filename)
      if (current === undefined) return undefined
      if (current.expires > Date.now() + 60_000) return current
      const next = await tokenRequest(new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: current.refresh, client_id: CLIENT_ID,
      }), signal)
      await this.write(next)
      await this.ctx.credentials.set(TOKEN_REF, next.access)
      return next
    })
  }

  /** Return a valid bearer token for DSH's built-in Codex provider. */
  async bearerToken(signal?: AbortSignal): Promise<string | undefined> {
    return (await this.credential(signal))?.access
  }

  /** Send one authenticated streaming request to the ChatGPT Codex Responses endpoint. */
  async responses(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    maxBytes: number,
    operation: string,
  ): Promise<unknown[]> {
    const credential = await this.credential(signal)
    if (credential === undefined) throw new Error(`Sign in with OpenAI before using ${operation}.`)
    const response = await fetch(CODEX_RESPONSES_URL, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${credential.access}`,
        'chatgpt-account-id': credential.accountId,
        'content-type': 'application/json',
        'openai-beta': 'responses=experimental',
        originator: 'deepseek-harness',
        'user-agent': 'deepseek-harness-openai-codex-auth/0.4',
      },
      body: JSON.stringify(body),
      ...signal === undefined ? {} : { signal },
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000)
      throw new Error(`OpenAI Codex ${operation} failed (HTTP ${response.status})${detail.length > 0 ? `: ${detail}` : ''}`)
    }
    return readSseEvents(response, maxBytes, operation)
  }

  private createLoginRequest(signal: AbortSignal): { url: string; code: Promise<string>; verifier: string } {
    const verifier = base64Url(randomBytes(32))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = randomBytes(16).toString('hex')
    const url = new URL(AUTHORIZE_URL)
    for (const [key, value] of Object.entries({
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access', code_challenge: challenge,
      code_challenge_method: 'S256', state, id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true', originator: 'deepseek-harness',
    })) url.searchParams.set(key, value)
    return { url: url.toString(), code: this.waitForCallback(state, signal), verifier }
  }

  private async finishLogin(
    authorizationCode: string,
    verifier: string,
    signal?: AbortSignal,
    redirectUri: string = REDIRECT_URI,
  ): Promise<void> {
    const credential = await tokenRequest(new URLSearchParams({
      grant_type: 'authorization_code', client_id: CLIENT_ID, code: authorizationCode,
      code_verifier: verifier, redirect_uri: redirectUri,
    }), signal)
    await withFileLock(this.filename, () => this.write(credential))
    await this.ctx.credentials.set(TOKEN_REF, credential.access)
    this.usageCache = undefined
    this.usageError = undefined
  }


  private async logout(): Promise<void> {
    await withFileLock(this.filename, async () => {
      try { await unlink(this.filename) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
    await this.ctx.credentials.unset(TOKEN_REF)
    this.usageCache = undefined
    this.usageError = undefined
  }

  private beginBrowserLogin(): LoginFlow {
    if (this.loginFlow !== undefined) return this.loginFlow
    const abort = new AbortController()
    const { url, code, verifier } = this.createLoginRequest(abort.signal)
    this.lastLoginError = undefined
    const completion = code
      .then(authorizationCode => this.finishLogin(authorizationCode, verifier, abort.signal))
      .catch((error: unknown) => { this.lastLoginError = error instanceof Error ? error.message : String(error) })
      .finally(() => { this.loginFlow = undefined })
    const flow: LoginFlow = { kind: 'browser', url, completion, abort }
    this.loginFlow = flow
    return flow
  }

  /** Begin OpenAI's device-code flow for SSH and other headless environments. */
  private async beginDeviceLogin(): Promise<LoginFlow & { userCode: string }> {
    if (this.loginFlow !== undefined) {
      if (this.loginFlow.kind === 'device' && this.loginFlow.userCode !== undefined) {
        return this.loginFlow as LoginFlow & { userCode: string }
      }
      throw new Error('Another OpenAI sign-in is already in progress.')
    }
    if (await readCredential(this.filename) !== undefined) {
      throw new Error('OpenAI is already connected. Sign out before starting another sign-in.')
    }
    const abort = new AbortController()
    const initiation = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'deepseek-harness-openai-codex-auth/0.4' },
      body: JSON.stringify({ client_id: CLIENT_ID }),
      signal: abort.signal,
    })
    if (!initiation.ok) throw new Error(`OpenAI device sign-in could not start (HTTP ${initiation.status}).`)
    const authorization = normalizeDeviceAuthorization(await initiation.json())
    const { userCode, deviceAuthId, intervalMs } = authorization
    const deadline = Date.now() + authorization.expiresInMs
    const completion = (async (): Promise<void> => {
      for (;;) {
        if (Date.now() >= deadline) throw new Error('OpenAI device sign-in expired. Start it again.')
        const poll = await fetch(DEVICE_TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'deepseek-harness-openai-codex-auth/0.4' },
          body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
          signal: abort.signal,
        })
        if (poll.ok) {
          const token = await poll.json() as Record<string, unknown>
          if (typeof token.authorization_code !== 'string' || typeof token.code_verifier !== 'string') {
            throw new Error('OpenAI returned an incomplete device authorization.')
          }
          await this.finishLogin(token.authorization_code, token.code_verifier, abort.signal, DEVICE_REDIRECT_URI)
          return
        }
        if (poll.status !== 403 && poll.status !== 404) {
          throw new Error(`OpenAI device sign-in failed while waiting (HTTP ${poll.status}).`)
        }
        await delay(intervalMs, abort.signal)
      }
    })()
      .catch((error: unknown) => {
        if (!abort.signal.aborted) this.lastLoginError = error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        if (this.loginFlow?.abort === abort) this.loginFlow = undefined
      })
    const flow: LoginFlow & { userCode: string } = {
      kind: 'device', url: DEVICE_AUTH_URL, userCode, completion, abort,
    }
    this.lastLoginError = undefined
    this.loginFlow = flow
    return flow
  }

  private async status(refresh: boolean): Promise<Record<string, unknown>> {
    const preferences = await readPreferences(this.preferencesFilename)
    const serviceTier = {
      selection: preferences.serviceTier,
      requestValue: serviceTierRequestValue(preferences.serviceTier),
      forwardingSupported: false,
    }
    let credential = await readCredential(this.filename)
    if (credential === undefined) {
      return {
        loggedIn: false, loginPending: this.loginFlow !== undefined, loginError: this.lastLoginError,
        serviceTier, csrf: this.csrf,
      }
    }
    try {
      await this.bearerToken()
      credential = await readCredential(this.filename) ?? credential
    } catch (error) {
      this.usageError = error instanceof Error ? error.message : String(error)
    }
    if (refresh || this.usageCache === undefined || Date.now() - this.usageCache.fetchedAt > USAGE_CACHE_MS) {
      try {
        this.usageCache = await this.fetchUsage(credential)
        this.usageError = undefined
      } catch (error) {
        this.usageError = error instanceof Error ? error.message : String(error)
      }
    }
    return {
      loggedIn: true,
      loginPending: this.loginFlow !== undefined,
      accountId: credential.accountId,
      expiresAt: credential.expires,
      usage: this.usageCache,
      usageError: this.usageError,
      serviceTier,
      csrf: this.csrf,
    }
  }

  private async fetchUsage(credential: OpenAICodexCredential): Promise<UsageSummary> {
    const access = await this.bearerToken()
    if (access === undefined) throw new Error('OpenAI login is missing')
    const response = await fetch(USAGE_URL, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${access}`,
        'chatgpt-account-id': credential.accountId,
        'user-agent': 'dsh-openai-codex-auth/0.2',
      },
    })
    if (!response.ok) throw new Error(`Codex usage request failed (HTTP ${response.status})`)
    return normalizeUsage(await response.json())
  }

  private async searchWeb(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
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
    }, signal, MAX_SEARCH_RESPONSE_BYTES, 'web search')
    return normalizeWebSearchEvents(events)
  }

  private startControlServer(): Promise<() => void> {
    return new Promise((resolveStart, rejectStart) => {
      const server = createServer((request, response) => { void this.controlRequest(request, response) })
      server.once('error', rejectStart)
      server.listen(CONTROL_PORT, '127.0.0.1', () => {
        server.removeListener('error', rejectStart)
        resolveStart(() => {
          this.loginFlow?.abort.abort()
          server.close()
        })
      })
    })
  }

  private async controlRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = request.headers.origin
    const localOrigin = isLocalOrigin(origin)
    const headers: Record<string, string> = {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      vary: 'Origin',
      ...localOrigin ? { 'access-control-allow-origin': origin } : {},
    }
    const send = (status: number, value: unknown): void => {
      response.writeHead(status, headers).end(JSON.stringify(value))
    }
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${CONTROL_PORT}`)
      if (request.method === 'OPTIONS' && localOrigin) {
        response.writeHead(204, {
          ...headers,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-dsh-csrf',
        }).end()
        return
      }
      if (url.pathname === '/start' && request.method === 'GET') {
        const flow = this.beginBrowserLogin()
        response.writeHead(302, { location: flow.url, 'cache-control': 'no-store' }).end()
        return
      }
      if (url.pathname === '/start-device' && request.method === 'GET') {
        if (origin !== undefined && !localOrigin) {
          send(403, { error: 'This endpoint only accepts a local DSH Web origin or a local CLI request.' })
          return
        }
        const flow = await this.beginDeviceLogin()
        send(200, { url: flow.url, userCode: flow.userCode })
        return
      }
      if (!localOrigin) { send(403, { error: 'This endpoint only accepts a local DSH Web origin.' }); return }
      if (url.pathname === '/status' && request.method === 'GET') {
        send(200, await this.status(url.searchParams.get('refresh') === '1'))
        return
      }
      if (url.pathname === '/logout' && request.method === 'POST') {
        if (request.headers['x-dsh-csrf'] !== this.csrf) { send(403, { error: 'Invalid CSRF token.' }); return }
        await this.logout()
        send(200, { ok: true })
        return
      }
      if (url.pathname === '/service-tier-preference' && request.method === 'POST') {
        if (request.headers['x-dsh-csrf'] !== this.csrf) { send(403, { error: 'Invalid CSRF token.' }); return }
        if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
          send(415, { error: 'Content-Type must be application/json.' })
          return
        }
        let body: unknown
        try { body = await readControlJson(request) } catch (error) {
          send(400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        const row = body !== null && typeof body === 'object' ? body as Record<string, unknown> : {}
        let selection: ServiceTierSelection
        try { selection = parseServiceTierSelection(row.selection) } catch (error) {
          send(400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        await this.writePreferences(selection)
        send(200, {
          selection,
          requestValue: serviceTierRequestValue(selection),
          forwardingSupported: false,
        })
        return
      }
      send(404, { error: 'Not found' })
    } catch (error) {
      send(500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  private write(credential: OpenAICodexCredential): Promise<void> {
    return writeFileAtomic(this.filename, `${JSON.stringify({ version: 1, credential }, null, 2)}\n`, {
      mode: 0o600, dirMode: 0o700,
    })
  }

  private writePreferences(serviceTier: ServiceTierSelection): Promise<void> {
    return writeFileAtomic(this.preferencesFilename, `${JSON.stringify({ version: 1, serviceTier }, null, 2)}\n`, {
      mode: 0o600, dirMode: 0o700,
    })
  }

  private waitForCallback(state: string, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '', REDIRECT_URI)
        if (url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state) {
          response.writeHead(400).end('Invalid OpenAI OAuth callback.')
          return
        }
        const code = url.searchParams.get('code')
        if (code === null) { response.writeHead(400).end('Missing authorization code.'); return }
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('OpenAI login complete. You may close this window.')
        settled = true
        signal.removeEventListener('abort', abort)
        server.close()
        resolve(code)
      })
      const abort = (): void => {
        if (settled) return
        settled = true
        server.close()
        reject(new Error('OpenAI login cancelled'))
      }
      signal.addEventListener('abort', abort, { once: true })
      server.listen(1455, '127.0.0.1').on('error', (error) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        reject(error)
      })
    })
  }
}

export default OpenAICodexAuth
