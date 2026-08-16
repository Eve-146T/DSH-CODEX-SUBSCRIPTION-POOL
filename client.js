window.__ModuleLoader__.load({
  id: 'dsh-openai-codex-auth',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useMemo, useState } = React
    const { Button, IconRefreshOutline16 } = require('@deepseek-ai/dsh-client-ui-primitives')
    const BASE = 'http://127.0.0.1:1456'
    const PLUGIN_ID = 'dsh-openai-codex-auth'
    const OPENAI_LOGO_PATH = 'M38.355 36.52v-9.415c0-.793.297-1.388.99-1.784l18.93-10.902c2.578-1.486 5.65-2.18 8.82-2.18 11.894 0 19.426 9.218 19.426 19.029 0 .694 0 1.486-.1 2.28L66.799 22.05c-1.189-.694-2.379-.694-3.568 0L38.355 36.52Zm44.202 36.67V50.694c0-1.388-.596-2.38-1.785-3.073L55.897 33.15l8.126-4.658c.694-.396 1.289-.396 1.982 0l18.93 10.902c5.452 3.172 9.118 9.91 9.118 16.452 0 7.531-4.46 14.47-11.496 17.344Zm-50.05-19.82-8.127-4.757c-.693-.396-.99-.99-.99-1.784V25.025c0-10.605 8.126-18.633 19.127-18.633 4.163 0 8.028 1.388 11.3 3.865l-19.525 11.3c-1.189.693-1.784 1.684-1.784 3.072v28.74ZM50 63.478l-11.645-6.541V43.062L50 36.522l11.645 6.54v13.875L50 63.477Zm7.483 30.129c-4.163 0-8.028-1.388-11.3-3.865l19.525-11.3c1.189-.693 1.784-1.684 1.784-3.071V46.629l8.226 4.757c.694.396.991.991.991 1.784v21.803c0 10.605-8.226 18.633-19.226 18.633v.001Zm-23.49-22.101-18.93-10.902c-5.45-3.172-9.117-9.91-9.117-16.451 0-7.632 4.559-14.47 11.595-17.344v22.596c0 1.388.595 2.379 1.784 3.072l24.777 14.37-8.126 4.659c-.694.396-1.289.396-1.982 0ZM32.905 87.76c-11.2 0-19.425-8.425-19.425-18.83 0-.794.1-1.587.198-2.38L33.2 77.85c1.189.693 2.379.693 3.568 0l24.876-14.37v9.415c0 .793-.298 1.388-.992 1.784L41.724 85.58c-2.576 1.486-5.649 2.18-8.82 2.18h.001Zm24.579 11.793c11.992 0 22.001-8.523 24.281-19.822C92.864 76.857 100 66.451 100 55.846c0-6.937-2.973-13.676-8.325-18.533.496-2.081.793-4.163.793-6.243 0-14.172-11.496-24.777-24.777-24.777-2.676 0-5.253.396-7.83 1.288C55.401 3.221 49.257.445 42.517.445c-11.992 0-22.001 8.523-24.281 19.822C7.136 23.14 0 33.547 0 44.152c0 6.938 2.973 13.676 8.325 18.533-.496 2.081-.793 4.163-.793 6.243 0 14.172 11.497 24.778 24.777 24.778 2.676 0 5.253-.397 7.83-1.289 4.459 4.36 10.604 7.136 17.344 7.136Z'

    const css = `
      .codexSection{width:100%;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column}
      .codexNavItem>svg:not(.codexNavLogo){display:none}.codexNavLogo{width:16px;height:16px;flex:none;color:inherit}
      .codexTitle{margin:0;font-size:18px;line-height:1.4;font-weight:600}
      .codexIntro{margin:6px 0 8px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.55}
      .codexAccount{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .codexLogo{display:grid;place-items:center;width:34px;height:34px;flex:none;color:var(--dsw-alias-label-primary)}.codexLogo svg{width:24px;height:24px}
      .codexAccountText{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.codexAccountTitle{font-size:14px;font-weight:400;line-height:22px}.codexAccountMeta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.codexConnectedDot{box-sizing:border-box;width:8px;height:8px;display:block;flex:none;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
      .codexAccountAction{flex:none}.codexDisconnect{box-sizing:border-box!important;height:36px!important;border:1px solid var(--dsw-alias-state-error-primary)!important;border-radius:18px!important;color:var(--dsw-alias-state-error-primary)!important;background:transparent!important;padding:0 14px!important;font-size:14px!important;line-height:22px!important}.codexDisconnect:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)!important}
      .codexUsageHeader{display:flex;align-items:center;gap:8px;padding:18px 0 4px}.codexUsageHeading{flex:1;margin:0;font-size:12px;font-weight:600;line-height:18px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}
      .codexUpdated{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .codexRefresh{appearance:none;width:28px;height:28px;display:inline-grid;place-items:center;flex:none;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}.codexRefresh:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.codexRefresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.codexRefresh:disabled{opacity:.4;cursor:default}.codexRefresh[data-busy=true] svg{animation:codexSpin .8s linear infinite}
      .codexLimits{display:flex;flex-direction:column}.codexLimit{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .codexLimitText{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.codexLimitName{font-size:14px;font-weight:400;line-height:22px}.codexLimitReset{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.codexLimitValue{flex:none;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}.codexLimitValue.high{color:var(--dsw-alias-state-warn-label)}
      .codexCredit{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .codexError{margin:12px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
      .codexEmpty{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.55}.codexSignIn{margin-top:14px;align-self:flex-start}.codexSkeleton{height:8px;margin:12px 0;border-radius:99px;background:var(--dsw-alias-bg-skeleton);animation:codexPulse 1.2s ease-in-out infinite alternate}
      @keyframes codexPulse{to{opacity:.4}}@keyframes codexSpin{to{transform:rotate(360deg)}}@media(max-width:620px){.codexAccount{align-items:flex-start;flex-wrap:wrap}.codexAccountAction{margin-left:46px}.codexUpdated{display:none}}
    `
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="' + PLUGIN_ID + '"]') === null) {
      const style = document.createElement('style')
      style.dataset.plugin = PLUGIN_ID
      style.textContent = css
      document.head.appendChild(style)
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    let cachedStatus = null
    let initialStatusRequest = null

    async function requestStatus(refresh) {
      const response = await fetch(BASE + '/status' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
      cachedStatus = value
      return value
    }

    function prefetchStatus() {
      if (cachedStatus !== null) return Promise.resolve(cachedStatus)
      if (initialStatusRequest === null) {
        initialStatusRequest = requestStatus(false).finally(() => { initialStatusRequest = null })
      }
      return initialStatusRequest
    }

    if (typeof window !== 'undefined') void prefetchStatus().catch(() => {})

    function OpenAILogo(props) {
      return h('svg', { className: props && props.className, viewBox: '0 0 100 100', fill: 'currentColor', 'aria-hidden': true }, h('path', { d: OPENAI_LOGO_PATH }))
    }

    function formatReset(seconds) {
      if (!Number.isFinite(seconds)) return 'Reset time unavailable'
      const date = new Date(seconds * 1000)
      const remaining = date.getTime() - Date.now()
      if (remaining <= 0) return 'Resetting soon'
      const hours = Math.floor(remaining / 3600000)
      const minutes = Math.max(1, Math.floor((remaining % 3600000) / 60000))
      const relative = hours >= 24 ? 'in ' + Math.floor(hours / 24) + ' days' : hours > 0 ? 'in ' + hours + ' hr ' + minutes + ' min' : 'in ' + minutes + ' min'
      return relative.charAt(0).toUpperCase() + relative.slice(1)
    }

    function UsageRow(props) {
      const used = Math.max(0, Math.min(100, Number(props.window.usedPercent) || 0))
      const left = Math.max(0, Math.round(100 - used))
      return h('div', { className: 'codexLimit' },
        h('div', { className: 'codexLimitText' },
          h('span', { className: 'codexLimitName' }, props.name),
          h('span', { className: 'codexLimitReset' }, formatReset(props.window.resetAt)),
        ),
        h('span', { className: 'codexLimitValue' + (used >= 80 ? ' high' : '') }, left + '% left'),
      )
    }

    function CodexSection() {
      const [status, setStatus] = useState(() => cachedStatus)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [watchLogin, setWatchLogin] = useState(false)

      useEffect(() => {
        const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'OpenAI Codex')
        if (!button || button.querySelector('.codexNavLogo')) return
        button.classList.add('codexNavItem')
        const originalIcon = button.querySelector('svg')
        if (originalIcon) originalIcon.style.display = 'none'
        const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        logo.setAttribute('class', 'codexNavLogo')
        logo.setAttribute('viewBox', '0 0 100 100')
        logo.setAttribute('fill', 'currentColor')
        logo.setAttribute('aria-hidden', 'true')
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', OPENAI_LOGO_PATH)
        logo.appendChild(path)
        button.insertBefore(logo, button.firstChild)
      }, [])

      const load = useCallback(async (refresh) => {
        try {
          const value = !refresh && initialStatusRequest !== null ? await initialStatusRequest : await requestStatus(refresh)
          setStatus(value)
          setError('')
          if (value.loggedIn) setWatchLogin(false)
        } catch (loadError) {
          setError('Could not connect to the local Codex plugin service. Restart the DSH Web profile and try again.' + (messageOf(loadError) ? ' (' + messageOf(loadError) + ')' : ''))
        }
      }, [])

      useEffect(() => {
        void load(false)
        const timer = window.setInterval(() => { void load(false) }, watchLogin ? 2000 : 30000)
        return () => { window.clearInterval(timer) }
      }, [load, watchLogin])

      const login = () => {
        const popup = window.open(BASE + '/start', 'dsh-openai-codex-login', 'popup,width=560,height=760')
        if (popup === null) setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')
        setWatchLogin(true)
        window.setTimeout(() => { void load(false) }, 1000)
      }

      const logout = async () => {
        if (!status || !status.csrf) return
        setBusy(true)
        try {
          const response = await fetch(BASE + '/logout', { method: 'POST', headers: { 'x-dsh-csrf': status.csrf } })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          cachedStatus = null
          await load(false)
        } catch (logoutError) { setError(messageOf(logoutError)) }
        finally { setBusy(false) }
      }

      const refresh = async () => {
        setBusy(true)
        await load(true)
        setBusy(false)
      }

      const usage = status && status.usage
      const loading = status === null && !error
      const connected = Boolean(status && status.loggedIn)
      const pending = Boolean(status && status.loginPending) || watchLogin
      const plan = usage && usage.planType ? String(usage.planType).charAt(0).toUpperCase() + String(usage.planType).slice(1).toLowerCase() : ''
      const windows = useMemo(() => {
        if (!usage) return []
        const rows = []
        if (usage.primary) rows.push({ name: usage.primary.windowSeconds && usage.primary.windowSeconds <= 21600 ? '5-hour limit' : usage.primary.windowSeconds && usage.primary.windowSeconds >= 604800 ? 'Weekly limit' : 'Usage limit', window: usage.primary })
        if (usage.secondary) rows.push({ name: 'Weekly limit', window: usage.secondary })
        return rows
      }, [usage])

      return h('section', { className: 'codexSection' },
        h('h2', { className: 'codexTitle' }, 'OpenAI Codex'),
        h('p', { className: 'codexIntro' }, 'Use your ChatGPT subscription for Codex models and web search in DeepSeek Harness.'),
        loading
          ? h('div', { 'aria-label': 'Loading' }, h('div', { className: 'codexSkeleton' }), h('div', { className: 'codexSkeleton', style: { width: '72%' } }))
          : connected
            ? h(React.Fragment, null,
                h('div', { className: 'codexAccount' },
                  h('div', { className: 'codexLogo' }, h(OpenAILogo)),
                  h('div', { className: 'codexAccountText' },
                    h('div', { className: 'codexAccountTitle' }, 'ChatGPT' + (plan ? ' ' + plan : '')),
                    h('div', { className: 'codexAccountMeta' }, h('span', { className: 'codexConnectedDot', 'aria-hidden': true }), h('span', null, 'Connected')),
                  ),
                  h(Button, { className: 'codexAccountAction codexDisconnect', variant: 'outline', size: 'md', disabled: busy, onClick: () => { void logout() } }, 'Sign out'),
                ),
                h('div', { className: 'codexUsageHeader' },
                  h('h3', { className: 'codexUsageHeading' }, 'Usage'),
                  h('span', { className: 'codexUpdated' }, usage && usage.fetchedAt ? 'Updated ' + new Date(usage.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
                  h('button', { type: 'button', className: 'codexRefresh', disabled: busy, 'data-busy': busy ? 'true' : 'false', 'aria-label': busy ? 'Refreshing usage' : 'Refresh usage', title: 'Refresh usage', onClick: refresh }, h(IconRefreshOutline16, { size: 16 })),
                ),
                windows.length > 0
                  ? h('div', { className: 'codexLimits' }, windows.map((row) => h(UsageRow, { key: row.name, name: row.name, window: row.window })))
                  : h('p', { className: 'codexEmpty' }, 'Usage information is unavailable right now.'),
                usage && Number(usage.resetCredits) > 0 ? h('p', { className: 'codexCredit' }, usage.resetCredits + ' limit reset' + (usage.resetCredits === 1 ? '' : 's') + ' available') : null,
                status.usageError ? h('p', { className: 'codexError', role: 'status' }, 'Could not load usage: ' + status.usageError) : null,
              )
            : h(React.Fragment, null,
                h('div', { className: 'codexAccount' },
                  h('div', { className: 'codexLogo' }, h(OpenAILogo)),
                  h('div', { className: 'codexAccountText' },
                    h('div', { className: 'codexAccountTitle' }, 'ChatGPT'),
                    h('div', { className: 'codexAccountMeta' }, pending ? 'Waiting for sign-in' : 'Not connected'),
                  ),
                ),
                h(Button, { className: 'codexSignIn', variant: 'primary', disabled: busy || pending, onClick: login }, pending ? 'Waiting for authorization…' : 'Sign in'),
              ),
        status && status.loginError ? h('p', { className: 'codexError', role: 'alert' }, 'Sign-in failed: ' + status.loginError) : null,
        error ? h('p', { className: 'codexError', role: 'alert' }, error) : null,
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'openai-codex',
        order: 11,
        label: () => 'OpenAI Codex',
      }, CodexSection))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
