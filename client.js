window.__ModuleLoader__.load({
  id: 'dsh-openai-codex-auth',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React
    const { Button } = require('@deepseek-ai/dsh-client-ui-primitives')
    const BASE = 'http://127.0.0.1:1456'
    const PLUGIN_ID = 'dsh-openai-codex-auth'
    const PREFERENCE_PREFIX = PLUGIN_ID + '.preference.'
    const PREFERENCE_EVENT = PLUGIN_ID + ':preference'
    const OPENAI_LOGO_PATH = 'M38.355 36.52v-9.415c0-.793.297-1.388.99-1.784l18.93-10.902c2.578-1.486 5.65-2.18 8.82-2.18 11.894 0 19.426 9.218 19.426 19.029 0 .694 0 1.486-.1 2.28L66.799 22.05c-1.189-.694-2.379-.694-3.568 0L38.355 36.52Zm44.202 36.67V50.694c0-1.388-.596-2.38-1.785-3.073L55.897 33.15l8.126-4.658c.694-.396 1.289-.396 1.982 0l18.93 10.902c5.452 3.172 9.118 9.91 9.118 16.452 0 7.531-4.46 14.47-11.496 17.344Zm-50.05-19.82-8.127-4.757c-.693-.396-.99-.99-.99-1.784V25.025c0-10.605 8.126-18.633 19.127-18.633 4.163 0 8.028 1.388 11.3 3.865l-19.525 11.3c-1.189.693-1.784 1.684-1.784 3.072v28.74ZM50 63.478l-11.645-6.541V43.062L50 36.522l11.645 6.54v13.875L50 63.477Zm7.483 30.129c-4.163 0-8.028-1.388-11.3-3.865l19.525-11.3c1.189-.693 1.784-1.684 1.784-3.071V46.629l8.226 4.757c.694.396.991.991.991 1.784v21.803c0 10.605-8.226 18.633-19.226 18.633v.001Zm-23.49-22.101-18.93-10.902c-5.45-3.172-9.117-9.91-9.117-16.451 0-7.632 4.559-14.47 11.595-17.344v22.596c0 1.388.595 2.379 1.784 3.072l24.777 14.37-8.126 4.659c-.694.396-1.289.396-1.982 0ZM32.905 87.76c-11.2 0-19.425-8.425-19.425-18.83 0-.794.1-1.587.198-2.38L33.2 77.85c1.189.693 2.379.693 3.568 0l24.876-14.37v9.415c0 .793-.298 1.388-.992 1.784L41.724 85.58c-2.576 1.486-5.649 2.18-8.82 2.18h.001Zm24.579 11.793c11.992 0 22.001-8.523 24.281-19.822C92.864 76.857 100 66.451 100 55.846c0-6.937-2.973-13.676-8.325-18.533.496-2.081.793-4.163.793-6.243 0-14.172-11.496-24.777-24.777-24.777-2.676 0-5.253.396-7.83 1.288C55.401 3.221 49.257.445 42.517.445c-11.992 0-22.001 8.523-24.281 19.822C7.136 23.14 0 33.547 0 44.152c0 6.938 2.973 13.676 8.325 18.533-.496 2.081-.793 4.163-.793 6.243 0 14.172 11.497 24.778 24.777 24.778 2.676 0 5.253-.397 7.83-1.289 4.459 4.36 10.604 7.136 17.344 7.136Z'

    const css = `
      .codexSection{width:100%;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column}
      .codexNavLogo{width:16px;height:16px;flex:none;color:inherit}
      .codexAccounts{border-top:1px solid var(--dsw-alias-border-l2)}.codexAccountGroup{border-bottom:1px solid var(--dsw-alias-border-l2)}.codexAccount{display:grid;grid-template-columns:34px max-content minmax(170px,1fr);align-items:start;column-gap:12px;padding:10px 0}
      .codexLogo{display:grid;grid-column:1;grid-row:1;place-items:center;width:34px;height:34px;margin-top:12px;color:var(--dsw-alias-label-primary);cursor:default;user-select:none}.codexLogo svg{width:24px;height:24px;transform-origin:center}
      .codexAccountText{display:flex;width:max-content;max-width:190px;min-width:0;flex-direction:column;gap:1px}.codexAccountTitle{font-size:14px;font-weight:500;line-height:20px}.codexAccountIdentity{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}.codexAccountMeta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.codexConnectedDot{box-sizing:border-box;width:8px;height:8px;display:block;flex:none;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
      .codexAccountRight{display:flex;grid-column:3;min-width:0;margin-left:12px;flex-direction:column;gap:12px}.codexMeter{min-width:0}.codexMeterCopy{display:flex;align-items:center;justify-content:flex-end;gap:18px;margin-bottom:7px}.codexMeterValue{font-size:13px;font-weight:600;white-space:nowrap}.codexMeterReset{color:var(--dsw-alias-label-tertiary);font-size:11px;white-space:nowrap}.codexMeterTrack{height:7px;overflow:hidden;border-radius:99px;background:var(--dsw-alias-bg-skeleton)}.codexMeterFill{height:100%;min-width:3px;border-radius:inherit}.codexMeterFill.good{background:var(--dsw-alias-state-success-primary)}.codexMeterFill.warn{background:#f0a12b}.codexMeterFill.low{background:var(--dsw-alias-state-error-primary)}.codexMeterEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px}.codexAccountActions{display:grid;grid-template-columns:118px 138px 98px;justify-content:end;gap:8px;min-width:0}.codexResetSlot{display:flex;width:118px;height:38px;align-items:center;justify-content:flex-end}.codexAccountAction{height:38px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:20px!important;white-space:nowrap!important}.codexActivate{width:138px!important;padding:0 10px!important}.codexActivate:disabled{opacity:.55}.codexDisconnect{box-sizing:border-box!important;width:98px!important;border:1px solid var(--dsw-alias-state-error-primary)!important;border-radius:19px!important;color:var(--dsw-alias-state-error-primary)!important;background:transparent!important;padding:0 12px!important}.codexDisconnect:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)!important}.codexRedeem{width:118px!important;padding:0 10px!important;border-color:var(--dsw-alias-state-business-primary)!important;color:var(--dsw-alias-state-business-primary)!important}
      .codexError{margin:12px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;overflow-wrap:anywhere}.codexEmpty{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.55}.codexSignInActions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:14px;align-self:flex-start}.codexAddRow{display:flex;justify-content:flex-end;padding:15px 0 1px}.codexAddAccount{height:38px!important;padding:0 16px!important}.codexDeviceButton{border-color:var(--dsw-alias-border-l2)!important}.codexDevice{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.codexDeviceText{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.codexDeviceLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.codexDeviceCode{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em}.codexDeviceLink{color:var(--dsw-alias-state-business-primary);font-size:13px;text-decoration:none}.codexDeviceLink:hover{text-decoration:underline}.codexSkeleton{height:8px;margin:12px 0;border-radius:99px;background:var(--dsw-alias-bg-skeleton);animation:codexPulse 1.2s ease-in-out infinite alternate}
      .codexPreferences{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}.codexPreferencesTitle{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:700;line-height:18px;letter-spacing:.08em;text-transform:uppercase}.codexPreference{display:flex;min-height:42px;align-items:center;gap:14px;padding:2px 0}.codexPreference+.codexPreference{border-top:1px solid var(--dsw-alias-border-l2)}.codexPreferenceLabel{min-width:0;flex:1;font-size:14px;font-weight:500}.codexToggle{position:relative;width:38px;height:22px;flex:none;border:0;border-radius:99px;background:var(--dsw-alias-bg-skeleton);cursor:pointer}.codexToggle:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .18s}.codexToggle[data-on=true]{background:var(--dsw-alias-state-business-primary)}.codexToggle[data-on=true]:after{transform:translateX(16px)}.codexToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .codexImageTool{width:min(100%,680px);overflow:hidden;margin:10px 0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}.codexImageHeader{display:flex;align-items:center;gap:10px;padding:12px 14px}.codexImageMark{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:7px;background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-state-business-primary)}.codexImageMark svg{display:block;width:18px;height:18px}.codexImageHeading{display:flex;min-width:0;flex:1;flex-direction:column}.codexImageHeading strong{font-size:13px;line-height:18px}.codexImageHeading span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}.codexImageInspect{appearance:none;padding:4px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}.codexImagePrompt{margin:0;padding:0 14px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.codexImagePreviewLink{display:block;line-height:0}.codexImagePreview{display:block;width:100%;height:auto;max-height:560px;object-fit:contain;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform)}.codexImageLoading{height:180px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-skeleton);animation:codexPulse 1.2s ease-in-out infinite alternate}.codexImageError{margin:0;padding:10px 14px;border-top:1px solid var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
      @keyframes codexPulse{to{opacity:.4}}@media(max-width:560px){.codexAccount{grid-template-columns:34px minmax(0,1fr);row-gap:7px;padding:8px 0}.codexAccountRight{grid-column:1/3;margin-left:0;gap:9px}.codexMeter,.codexMeterEmpty{margin-left:46px}.codexAccountActions{width:100%;grid-template-columns:minmax(0,1fr) 82px;justify-content:start;gap:6px}.codexAccountActions .codexActivate{width:100%!important;padding:0 7px!important;font-size:13px!important}.codexAccountActions .codexDisconnect{width:82px!important;padding:0 8px!important;font-size:13px!important}.codexResetSlot{grid-column:1/3;justify-content:flex-start}.codexResetSlot:empty{display:none}.codexAccountIdentity{white-space:normal;overflow-wrap:anywhere}.codexAddRow{justify-content:flex-end;padding-left:0}.codexDevice{align-items:flex-start;flex-direction:column;gap:7px}}@media(max-width:410px){.codexAccountActions{display:flex;flex-wrap:wrap}.codexResetSlot{width:100%}}
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

    function readPreference(name, fallback) {
      try {
        const value = window.localStorage.getItem(PREFERENCE_PREFIX + name)
        return value === null ? fallback : value === 'true'
      } catch { return fallback }
    }

    function writePreference(name, value) {
      try { window.localStorage.setItem(PREFERENCE_PREFIX + name, String(value)) } catch {}
      window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: { name, value } }))
    }

    function usePreference(name, fallback) {
      const [value, setValue] = useState(() => readPreference(name, fallback))
      useEffect(() => {
        const update = (event) => {
          if (event.type === 'storage' && event.key === PREFERENCE_PREFIX + name) setValue(readPreference(name, fallback))
          if (event.type === PREFERENCE_EVENT && event.detail && event.detail.name === name) setValue(Boolean(event.detail.value))
        }
        window.addEventListener('storage', update)
        window.addEventListener(PREFERENCE_EVENT, update)
        return () => {
          window.removeEventListener('storage', update)
          window.removeEventListener(PREFERENCE_EVENT, update)
        }
      }, [name, fallback])
      return [value, (next) => writePreference(name, next)]
    }

    function maskEmail(value) {
      const split = value.indexOf('@')
      return split > 0 ? '*'.repeat(split) + value.slice(split) : value
    }

    function isAllowedModel(value) {
      const model = String(value || '').toLowerCase().replace(/[_\s]+/g, '-')
      return /(?:^|-)gpt-5\.6(?:-|$)/.test(model) || /(?:^|-)5\.6(?:-|$)/.test(model)
        || /(?:^|-)gpt-5\.3-spark(?:-|$)/.test(model) || /(?:^|-)5\.3-spark(?:-|$)/.test(model)
    }

    function modelValue(node) {
      return node.getAttribute('data-model-id') || node.getAttribute('data-model') || node.getAttribute('data-value') || node.textContent || ''
    }

    function looksLikeModel(value) {
      return /gpt|codex|deepseek|claude|gemini|qwen|llama|spark|sonnet|opus|haiku|model/i.test(String(value || ''))
    }

    function applyModelFilter(enabled) {
      document.querySelectorAll('[data-codex-model-hidden]').forEach((node) => {
        node.style.removeProperty('display')
        node.removeAttribute('data-codex-model-hidden')
      })
      if (!enabled) return
      document.querySelectorAll('[data-model-id],[data-model],[role="option"][data-value]').forEach((node) => {
        const value = modelValue(node)
        if (value && looksLikeModel(value) && !isAllowedModel(value)) {
          node.setAttribute('data-codex-model-hidden', 'true')
          node.style.setProperty('display', 'none', 'important')
        }
      })
    }

    let modelFilterObserver = null
    function setModelFilter(enabled) {
      if (modelFilterObserver !== null) {
        modelFilterObserver.disconnect()
        modelFilterObserver = null
      }
      applyModelFilter(false)
      if (!enabled || document.body === null) return
      applyModelFilter(true)
      modelFilterObserver = new MutationObserver(() => applyModelFilter(true))
      modelFilterObserver.observe(document.body, { childList: true, subtree: true })
    }

    if (typeof window !== 'undefined') {
      window.setTimeout(() => setModelFilter(readPreference('hideUselessModels', true)), 0)
      window.addEventListener('storage', (event) => {
        if (event.key === PREFERENCE_PREFIX + 'hideUselessModels') setModelFilter(readPreference('hideUselessModels', true))
      })
    }

    function turnLogo(event) {
      const node = event.currentTarget
      const svg = node.querySelector('svg')
      if (!svg) return
      svg.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 650, easing: 'cubic-bezier(.45,0,.2,1)' })
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

    function SparkleIcon() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M12 1.75c.72 5.5 4.75 9.53 10.25 10.25C16.75 12.72 12.72 16.75 12 22.25 11.28 16.75 7.25 12.72 1.75 12 7.25 11.28 11.28 7.25 12 1.75Z' }),
      )
    }

    function decorateNavLogo() {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.trim() === 'OpenAI Codex')
      if (!button) return
      const originalIcon = button.querySelector('svg:not(.codexNavLogo)')
      if (originalIcon) originalIcon.style.display = 'none'
      if (button.querySelector('.codexNavLogo')) return
      const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      logo.setAttribute('class', 'codexNavLogo')
      logo.setAttribute('viewBox', '0 0 100 100')
      logo.setAttribute('fill', 'currentColor')
      logo.setAttribute('aria-hidden', 'true')
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', OPENAI_LOGO_PATH)
      logo.appendChild(path)
      button.insertBefore(logo, button.firstChild)
    }

    let navLogoObserver = null
    function installNavLogoObserver() {
      if (navLogoObserver !== null) return
      if (document.body === null) {
        document.addEventListener('DOMContentLoaded', installNavLogoObserver, { once: true })
        return
      }
      decorateNavLogo()
      navLogoObserver = new MutationObserver(decorateNavLogo)
      navLogoObserver.observe(document.body, { childList: true, subtree: true })
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

    function weeklyWindow(usage) {
      if (!usage) return null
      if (usage.secondary) return usage.secondary
      if (usage.primary && Number(usage.primary.windowSeconds) >= 604800) return usage.primary
      return null
    }

    function UsageMeter(props) {
      if (!props.window) return h('span', { className: 'codexMeterEmpty' }, 'Unavailable')
      const used = Math.max(0, Math.min(100, Number(props.window.usedPercent) || 0))
      const left = Math.max(0, Math.round(100 - used))
      const health = left <= 15 ? 'low' : left <= 50 ? 'warn' : 'good'
      const reset = formatReset(props.window.resetAt)
      const resetLabel = reset.startsWith('In ') ? 'resets ' + reset.toLowerCase() : reset
      return h('div', { className: 'codexMeter' },
        h('div', { className: 'codexMeterCopy' },
          h('strong', { className: 'codexMeterValue' }, left + '% left'),
          h('span', { className: 'codexMeterReset' }, resetLabel),
        ),
        h('div', { className: 'codexMeterTrack', role: 'progressbar', 'aria-label': left + '% remaining', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': left },
          h('div', { className: 'codexMeterFill ' + health, style: { width: left + '%' } }),
        ),
      )
    }

    function AccountGroup(props) {
      const account = props.account
      const usage = account.usage
      const plan = usage && usage.planType
        ? String(usage.planType).charAt(0).toUpperCase() + String(usage.planType).slice(1).toLowerCase()
        : ''
      const weekly = weeklyWindow(usage)
      const identity = account.email || account.name || ''
      return h('div', { className: 'codexAccountGroup' },
        h('div', { className: 'codexAccount' },
          h('div', { className: 'codexLogo', onClick: turnLogo }, h(OpenAILogo)),
          h('div', { className: 'codexAccountText' },
            h('div', { className: 'codexAccountTitle' }, 'ChatGPT' + (plan ? ' ' + plan : '')),
            identity ? h('div', { className: 'codexAccountIdentity', title: identity }, props.emailPrivacy ? maskEmail(identity) : identity) : null,
            h('div', { className: 'codexAccountMeta' },
              h('span', { className: 'codexConnectedDot', 'aria-hidden': true }),
              h('span', null, 'Connected'),
            ),
          ),
          h('div', { className: 'codexAccountRight' },
            h(UsageMeter, { window: weekly }),
            h('div', { className: 'codexAccountActions' },
              h('span', { className: 'codexResetSlot' }, Number(usage && usage.resetCredits) > 0
                ? h(Button, { className: 'codexAccountAction codexRedeem', variant: 'outline', size: 'md', disabled: props.busy, onClick: () => { void props.redeem(account.accountId) } }, 'Redeem reset')
                : null),
              h(Button, {
                className: 'codexAccountAction codexActivate', variant: 'outline', size: 'md',
                disabled: props.busy || account.active,
                onClick: () => { void props.activate(account.accountId) },
              }, account.active ? 'Active account' : 'Activate account'),
              h(Button, {
                className: 'codexAccountAction codexDisconnect', variant: 'outline', size: 'md',
                disabled: props.busy,
                onClick: () => { void props.logout(account.accountId) },
              }, 'Sign out'),
            ),
          ),
        ),
        account.usageError ? h('p', { className: 'codexError', role: 'status' }, 'Could not load usage: ' + account.usageError) : null,
      )
    }

    function PreferenceToggle(props) {
      return h('div', { className: 'codexPreference' },
        h('span', { className: 'codexPreferenceLabel' }, props.label),
        h('button', {
          type: 'button', className: 'codexToggle', role: 'switch',
          'aria-label': props.label, 'aria-checked': props.value ? 'true' : 'false',
          'data-on': props.value ? 'true' : 'false',
          onClick: () => props.onChange(!props.value),
        }),
      )
    }

    function CodexSection() {
      const [status, setStatus] = useState(() => cachedStatus)
      const [device, setDevice] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [watchLogin, setWatchLogin] = useState(false)
      const [hideModels, setHideModels] = usePreference('hideUselessModels', true)
      const [emailPrivacy, setEmailPrivacy] = usePreference('emailPrivacy', false)
      const [showImages, setShowImages] = usePreference('showGeneratedImages', true)
      const expectedAccountCount = useRef(0)
      const sawLoginPending = useRef(false)

      useEffect(() => { setModelFilter(hideModels) }, [hideModels])

      const load = useCallback(async (refresh) => {
        try {
          const value = !refresh && initialStatusRequest !== null ? await initialStatusRequest : await requestStatus(refresh)
          setStatus(value)
          setError('')
          if (value.loginPending) sawLoginPending.current = true
          const accountCount = Array.isArray(value.accounts) ? value.accounts.length : 0
          if (expectedAccountCount.current > 0
            && (accountCount >= expectedAccountCount.current || (sawLoginPending.current && !value.loginPending))) {
            expectedAccountCount.current = 0
            sawLoginPending.current = false
            setWatchLogin(false)
            setDevice(null)
          }
        } catch (loadError) {
          setError('Could not connect to the local Codex plugin service. Restart the DSH Web profile and try again.' + (messageOf(loadError) ? ' (' + messageOf(loadError) + ')' : ''))
        }
      }, [])

      useEffect(() => {
        void load(false)
        const timer = window.setInterval(() => { void load(false) }, watchLogin ? 2000 : 30000)
        return () => { window.clearInterval(timer) }
      }, [load, watchLogin])

      const login = (addAnother) => {
        setDevice(null)
        expectedAccountCount.current = (status && Array.isArray(status.accounts) ? status.accounts.length : 0) + 1
        sawLoginPending.current = false
        const popup = window.open(BASE + '/start' + (addAnother ? '?add=1' : ''), 'dsh-openai-codex-login', 'popup,width=560,height=760')
        if (popup === null) setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')
        setWatchLogin(true)
        window.setTimeout(() => { void load(false) }, 1000)
      }

      const deviceLogin = async () => {
        setBusy(true)
        try {
          expectedAccountCount.current = (status && Array.isArray(status.accounts) ? status.accounts.length : 0) + 1
          sawLoginPending.current = false
          const response = await fetch(BASE + '/start-device', { cache: 'no-store' })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          setDevice(value)
          setWatchLogin(true)
          setError('')
        } catch (deviceError) { setError(messageOf(deviceError)) }
        finally { setBusy(false) }
      }

      const accountAction = async (action, accountId) => {
        if (!status || !status.csrf) return
        setBusy(true)
        try {
          const response = await fetch(BASE + '/accounts/' + action, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-dsh-csrf': status.csrf },
            body: JSON.stringify({ accountId }),
          })
          const value = await response.json()
          if (!response.ok) throw new Error(value.error || 'HTTP ' + response.status)
          cachedStatus = null
          await load(false)
        } catch (actionError) { setError(messageOf(actionError)) }
        finally { setBusy(false) }
      }

      const logout = (accountId) => accountAction('remove', accountId)
      const activate = (accountId) => accountAction('activate', accountId)
      const redeem = (accountId) => {
        if (!window.confirm('Redeem one usage limit reset for this account?')) return Promise.resolve()
        return accountAction('redeem', accountId)
      }

      const loading = status === null && !error
      const connected = Boolean(status && status.loggedIn)
      const pending = Boolean(status && status.loginPending) || watchLogin
      const accounts = status && Array.isArray(status.accounts) ? status.accounts : []

      return h('section', { className: 'codexSection' },
        loading
          ? h('div', { 'aria-label': 'Loading' }, h('div', { className: 'codexSkeleton' }), h('div', { className: 'codexSkeleton', style: { width: '72%' } }))
          : connected
            ? h(React.Fragment, null,
                h('div', { className: 'codexAccounts' }, accounts.map((account) => h(AccountGroup, { key: account.accountId, account, busy, activate, logout, redeem, emailPrivacy }))),
                h('div', { className: 'codexAddRow' }, h(Button, { className: 'codexAddAccount', variant: 'outline', size: 'md', disabled: busy || pending, onClick: () => login(true) }, pending ? 'Waiting for authorization…' : 'Add another account')),
                h('div', { className: 'codexPreferences' },
                  h('h3', { className: 'codexPreferencesTitle' }, 'Settings'),
                  h(PreferenceToggle, { label: 'Hide useless models', value: hideModels, onChange: setHideModels }),
                  h(PreferenceToggle, { label: 'Email privacy', value: emailPrivacy, onChange: setEmailPrivacy }),
                  h(PreferenceToggle, { label: 'Show generated images in threads', value: showImages, onChange: setShowImages }),
                ),
              )
            : h(React.Fragment, null,
                h('div', { className: 'codexAccount' },
                  h('div', { className: 'codexLogo' }, h(OpenAILogo)),
                  h('div', { className: 'codexAccountText' },
                    h('div', { className: 'codexAccountTitle' }, 'ChatGPT'),
                    h('div', { className: 'codexAccountMeta' }, pending ? 'Waiting for sign-in' : 'Not connected'),
                  ),
                ),
                h('div', { className: 'codexSignInActions' },
                  h(Button, { variant: 'primary', disabled: busy || pending, onClick: () => login(false) }, pending && !device ? 'Waiting for authorization…' : 'Sign in'),
                  h(Button, { className: 'codexDeviceButton', variant: 'outline', disabled: busy || pending, onClick: () => { void deviceLogin() } }, 'Use device code'),
                ),
                device
                  ? h('div', { className: 'codexDevice' },
                      h('div', { className: 'codexDeviceText' },
                        h('span', { className: 'codexDeviceLabel' }, 'Enter this code at OpenAI'),
                        h('strong', { className: 'codexDeviceCode' }, device.userCode),
                      ),
                      h('a', { className: 'codexDeviceLink', href: device.url, target: '_blank', rel: 'noreferrer' }, 'Open sign-in page'),
                    )
                  : null,
              ),
        status && status.loginError ? h('p', { className: 'codexError', role: 'alert' }, 'Sign-in failed: ' + status.loginError) : null,
        error ? h('p', { className: 'codexError', role: 'alert' }, error) : null,
      )
    }

    function imageAttachment(block) {
      if (!block || block.kind !== 'tool-result' || !Array.isArray(block.content)) return null
      const item = block.content.find((part) => part && part.type === 'image' && part.attachment && typeof part.attachment.attachmentId === 'string')
      return item ? item.attachment : null
    }

    function imagePrompt(block) {
      const raw = block && block.kind === 'tool-result' ? block.call && block.call.argsRaw : block && block.argsRaw
      if (typeof raw !== 'string') return ''
      try {
        const value = JSON.parse(raw)
        return typeof value.prompt === 'string' ? value.prompt.trim() : ''
      } catch { return '' }
    }

    function imageError(block) {
      if (!block || block.kind !== 'tool-result' || !block.isError || !Array.isArray(block.content)) return ''
      return block.content
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
    }

    function ImageToolView(props) {
      const block = props.block
      const [showGeneratedImages] = usePreference('showGeneratedImages', true)
      const settled = Boolean(block && block.kind === 'tool-result')
      const attachment = imageAttachment(block)
      const prompt = imagePrompt(block)
      const failure = imageError(block)
      const [preview, setPreview] = useState('')
      const [previewError, setPreviewError] = useState('')
      const resolver = useRef(props.resolveImage)
      resolver.current = props.resolveImage

      useEffect(() => {
        let active = true
        setPreview('')
        setPreviewError('')
        if (!attachment || typeof resolver.current !== 'function') return () => { active = false }
        Promise.resolve(resolver.current(attachment))
          .then((url) => {
            if (typeof url !== 'string' || url.length === 0) throw new Error('Preview is unavailable.')
            if (active) setPreview(url)
          })
          .catch((reason) => { if (active) setPreviewError(messageOf(reason)) })
        return () => { active = false }
      }, [attachment && attachment.attachmentId])

      if (!showGeneratedImages) return null

      const failed = Boolean(failure || previewError)
      const state = failed ? 'Failed' : preview ? 'Ready' : settled && attachment ? 'Loading preview' : 'Generating'
      return h('section', { className: 'codexImageTool', 'aria-busy': !failed && !preview },
        h('div', { className: 'codexImageHeader' },
          h('span', { className: 'codexImageMark', 'aria-hidden': true }, h(SparkleIcon)),
          h('div', { className: 'codexImageHeading' },
            h('strong', null, 'Image generation'),
            h('span', { role: 'status' }, state),
          ),
          props.inspect ? h('button', { type: 'button', className: 'codexImageInspect', onClick: props.inspect }, 'Details') : null,
        ),
        prompt ? h('p', { className: 'codexImagePrompt' }, prompt) : null,
        preview
          ? h('a', { className: 'codexImagePreviewLink', href: preview, target: '_blank', rel: 'noreferrer', title: 'Open full image' },
              h('img', { className: 'codexImagePreview', src: preview, alt: prompt || 'Generated image', width: attachment.width, height: attachment.height }),
            )
          : failed
            ? h('p', { className: 'codexImageError', role: 'alert' }, failure || previewError)
            : h('div', { className: 'codexImageLoading', 'aria-hidden': true }),
      )
    }

    const inject = ['slots', 'conversation']
    function apply(ctx) {
      installNavLogoObserver()
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'openai-codex',
        order: 11,
        label: () => 'OpenAI Codex',
      }, CodexSection))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'image_gen',
        inject: (sessionId) => ({
          resolveImage: (attachment) => ctx.conversation.resolveImage(sessionId, attachment),
        }),
      }, ImageToolView))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
