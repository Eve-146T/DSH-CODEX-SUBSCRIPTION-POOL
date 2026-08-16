window.__ModuleLoader__.load({
  id: 'dsh-openai-codex-auth',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useMemo, useState } = React
    const BASE = 'http://127.0.0.1:1456'
    const PLUGIN_ID = 'dsh-openai-codex-auth'

    const css = `
      .codexSection{max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:12px}
      .codexTitle{margin:0;font-size:18px;line-height:1.4;font-weight:600}
      .codexIntro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.55}
      .codexCard{overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
      .codexHero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
      .codexBrand{display:flex;align-items:center;gap:10px;min-width:0}
      .codexLogo{display:grid;place-items:center;width:34px;height:34px;flex:0 0 auto;border-radius:10px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);font:600 11px/1 var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
      .codexName{margin:0;font-size:15px;line-height:1.4;font-weight:600}.codexMeta{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;overflow-wrap:anywhere}
      .codexBadge{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;line-height:17px}
      .codexBadge.connected{border-color:transparent;background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}.codexBadge.pending{border-color:transparent;background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label)}
      .codexDot{width:6px;height:6px;border-radius:50%;background:currentColor}
      .codexBody{padding:16px}.codexActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
      .codexButton{appearance:none;height:36px;border:0;border-radius:18px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:0 14px;font:400 14px/22px inherit;cursor:pointer;transition:background .16s,color .16s}
      .codexButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.codexButton:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.codexButton:disabled{opacity:.4;cursor:default}
      .codexButton.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.codexButton.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.codexButton.danger{background:transparent;color:var(--dsw-alias-state-error-primary)}.codexButton.danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
      .codexGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
      .codexUsage{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-2)}
      .codexUsageHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexUsageName{font-size:13px;font-weight:500}.codexUsageValue{font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .codexBar{height:6px;margin:11px 0 9px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-module-platform)}.codexBarFill{height:100%;border-radius:inherit;background:var(--dsw-alias-state-success-primary);transition:width .25s ease}.codexBarFill.high{background:var(--dsw-alias-state-warn-primary)}
      .codexReset{font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .codexPlan{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:2px}.codexPlan strong{font-size:14px;font-weight:500}.codexPlan span{font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .codexNotice{margin:14px 0 0;border-radius:10px;padding:9px 12px;background:var(--dsw-specific-tip);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
      .codexError{margin:14px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;overflow-wrap:anywhere}
      .codexEmpty{margin:0;padding:2px 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.55}.codexSkeleton{height:8px;margin:10px 0;border-radius:99px;background:var(--dsw-alias-bg-skeleton);animation:codexPulse 1.2s ease-in-out infinite alternate}
      @keyframes codexPulse{to{opacity:.4}}@media(max-width:620px){.codexHero{align-items:flex-start;flex-direction:column}.codexGrid{grid-template-columns:1fr}}
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

    function shortAccount(value) {
      if (!value) return ''
      return value.length > 22 ? value.slice(0, 10) + '…' + value.slice(-8) : value
    }

    function formatReset(seconds) {
      if (!Number.isFinite(seconds)) return 'Reset time unavailable'
      const date = new Date(seconds * 1000)
      const remaining = date.getTime() - Date.now()
      if (remaining <= 0) return 'Resetting soon'
      const hours = Math.floor(remaining / 3600000)
      const minutes = Math.max(1, Math.floor((remaining % 3600000) / 60000))
      const relative = hours >= 24 ? 'in ' + Math.floor(hours / 24) + ' days' : hours > 0 ? 'in ' + hours + ' hr ' + minutes + ' min' : 'in ' + minutes + ' min'
      return relative + ' · ' + date.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    function UsageCard(props) {
      const used = Math.max(0, Math.min(100, Number(props.window.usedPercent) || 0))
      return h('div', { className: 'codexUsage' },
        h('div', { className: 'codexUsageHead' },
          h('span', { className: 'codexUsageName' }, props.name),
          h('span', { className: 'codexUsageValue' }, Math.round(used) + '% used · ' + Math.max(0, Math.round(100 - used)) + '% left'),
        ),
        h('div', { className: 'codexBar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': used },
          h('div', { className: 'codexBarFill' + (used >= 80 ? ' high' : ''), style: { width: used + '%' } }),
        ),
        h('div', { className: 'codexReset' }, formatReset(props.window.resetAt)),
      )
    }

    function CodexSection() {
      const [status, setStatus] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [watchLogin, setWatchLogin] = useState(false)

      const load = useCallback(async (refresh) => {
        try {
          const response = await fetch(BASE + '/status' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
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
      const plan = usage && usage.planType ? String(usage.planType).toUpperCase() : 'ChatGPT subscription'
      const windows = useMemo(() => {
        if (!usage) return []
        const rows = []
        if (usage.primary) rows.push({ name: usage.primary.windowSeconds === 18000 ? '5-hour limit' : 'Short-window limit', window: usage.primary })
        if (usage.secondary) rows.push({ name: 'Weekly limit', window: usage.secondary })
        return rows
      }, [usage])

      return h('section', { className: 'codexSection' },
        h('h2', { className: 'codexTitle' }, 'OpenAI Codex'),
        h('p', { className: 'codexIntro' }, 'Sign in with a ChatGPT Plus, Pro, Team, or Enterprise subscription and view Codex usage here. The openai-codex model provider uses the resulting credentials automatically.'),
        h('div', { className: 'codexCard' },
          h('div', { className: 'codexHero' },
            h('div', { className: 'codexBrand' },
              h('div', { className: 'codexLogo', 'aria-hidden': true }, 'OA'),
              h('div', null,
                h('h3', { className: 'codexName' }, 'OpenAI Codex subscription'),
                h('p', { className: 'codexMeta', title: connected ? status.accountId : '' }, loading ? 'Checking OpenAI sign-in status' : connected ? shortAccount(status.accountId) : 'No ChatGPT account connected'),
              ),
            ),
            h('span', { className: 'codexBadge ' + (connected ? 'connected' : loading || pending ? 'pending' : '') },
              h('span', { className: 'codexDot', 'aria-hidden': true }), loading ? 'Refreshing…' : connected ? 'Connected' : pending ? 'Waiting for sign-in' : 'Signed out',
            ),
          ),
          h('div', { className: 'codexBody' },
            status === null && !error
              ? h('div', { 'aria-label': 'Loading' }, h('div', { className: 'codexSkeleton' }), h('div', { className: 'codexSkeleton', style: { width: '72%' } }))
              : connected
                ? h(React.Fragment, null,
                    h('div', { className: 'codexPlan' }, h('strong', null, plan), h('span', null, usage && usage.fetchedAt ? 'Updated ' + new Date(usage.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Usage data pending')),
                    windows.length > 0
                      ? h('div', { className: 'codexGrid' }, windows.map((row) => h(UsageCard, { key: row.name, name: row.name, window: row.window })))
                      : h('p', { className: 'codexEmpty' }, 'The account is connected, but no displayable usage window is currently available.'),
                    usage && Number.isFinite(usage.resetCredits) ? h('p', { className: 'codexNotice' }, 'Available limit resets: ' + usage.resetCredits) : null,
                    status.usageError ? h('p', { className: 'codexError', role: 'status' }, 'Could not load usage: ' + status.usageError) : null,
                  )
                : h('p', { className: 'codexEmpty' }, 'Signing in opens OpenAI\'s authorization page. The plugin stores and refreshes tokens only on the host; the web page never receives them.'),
            status && status.loginError ? h('p', { className: 'codexError', role: 'alert' }, 'Sign-in failed: ' + status.loginError) : null,
            error ? h('p', { className: 'codexError', role: 'alert' }, error) : null,
            h('div', { className: 'codexActions' },
              h('button', { type: 'button', className: 'codexButton primary', disabled: busy || pending || loading, onClick: login }, loading ? 'Checking status…' : connected ? 'Sign in again' : pending ? 'Waiting for authorization…' : 'Sign in with OpenAI'),
              connected ? h('button', { type: 'button', className: 'codexButton', disabled: busy, onClick: refresh }, busy ? 'Refreshing…' : 'Refresh usage') : null,
              connected ? h('button', { type: 'button', className: 'codexButton danger', disabled: busy, onClick: () => { void logout() } }, 'Sign out') : null,
            ),
          ),
        ),
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
