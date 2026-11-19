export function createEntryViews(React, client, locale, t) {
  const h = React.createElement;
  const css = `.wz-codex{color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:1.5;padding:0}
.wz-codex-entry{display:flex;align-items:center;gap:8px;min-height:28px}
.wz-codex-badge{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.wz-codex-badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.wz-codex-badge[data-saved="true"]::before{background:var(--dsw-alias-state-success-primary,#22ad60)}
.wz-codex-login-group{display:inline-flex;align-items:center}
.wz-codex-login-group[hidden]{display:none}
.wz-codex p{margin:4px 0;line-height:1.5;overflow-wrap:anywhere}
.wz-codex .muted,.wz-codex .warn,.wz-codex .error{color:var(--dsw-alias-label-secondary)}
.wz-codex button,.wz-codex input{box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px 10px}
.wz-codex button{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm,8px);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:transparent;white-space:nowrap;cursor:pointer}
.wz-codex button:disabled{opacity:.4;cursor:default}
.wz-codex button.wz-codex-toggle{padding:0 2px;border-color:transparent;color:var(--dsw-alias-label-secondary)}
.wz-codex-toggle svg{flex:none}
.wz-codex-toggle[aria-expanded="true"] svg{transform:rotate(90deg)}
@media(hover:hover){.wz-codex button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}}
.wz-codex button:focus-visible,.wz-codex input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.wz-codex .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.wz-codex dialog{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:24px;width:min(520px,calc(100vw - 64px));max-height:80vh;overflow:auto}
.wz-codex dialog::backdrop{background:var(--dsw-alias-bg-base);opacity:.7}
.wz-codex input{box-sizing:border-box;width:100%;margin:8px 0}
.wz-codex h3{font-size:14px;margin:0 0 12px}`;
  function useState() {
    React.useSyncExternalStore(fn => locale.subscribe(fn), () => locale.getSnapshot());
    return React.useSyncExternalStore(client.subscribe, client.getSnapshot);
  }
  function Panel() {
    const state = useState();
    const [open, setOpen] = React.useState(false);
    const [expanded, setExpanded] = React.useState(false);
    const dialog = React.useRef(null), input = React.useRef(null);
    const id = React.useId();
    const active = ['starting', 'waiting', 'saving', 'unknown'].includes(state.phase);
    React.useEffect(() => {
      if (open && !dialog.current.open) dialog.current.showModal();
      if (!open && dialog.current.open) dialog.current.close();
    }, [open]);
    React.useEffect(() => { if (input.current) input.current.value = ''; }, [state.promptId, open]);
    React.useEffect(() => { void client.refresh(); return () => { void client.cancel(); }; }, []);
    const close = () => {
      if (input.current) input.current.value = '';
      setOpen(false);
      if (active || state.loading) void client.cancel();
    };
    const begin = () => { setOpen(true); void client.start(); };
    const status = state.phase === 'idle' ? (state.configured ? 'present' : 'absent') : `phase_${state.phase}`;
    return h('section', { className: 'wz-codex', 'aria-label': t('title') },
      h('style', null, css),
      // One stable-height row in the public slot; never move the owner's DOM.
      // Disclosure only changes visibility, not Panel lifetime or authorization.
      h('div', { className: 'wz-codex-entry' },
        h('button', { type: 'button', className: 'wz-codex-toggle',
          'aria-expanded': expanded, 'aria-controls': `${id}-entry-actions`,
          onClick: () => setExpanded(value => !value),
        }, t('authorizationControls'),
          h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false },
            h('path', { d: 'M6 3l5 5-5 5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        h('span', { id: `${id}-entry-actions`, className: 'wz-codex-login-group', hidden: !expanded },
          h('button', { type: 'button',
            disabled: !active && (state.loading || state.busy || !state.available),
            title: t(active ? 'show' : state.busy ? 'busy' : !state.available ? 'unavailable' : 'intro'),
            onClick: active ? () => setOpen(true) : begin,
          }, t('login'))),
        h('span', { className: 'wz-codex-badge', role: 'status', 'data-saved': state.grantSaved === true,
          title: state.grantSaved === true ? t('present') : undefined,
        }, t(state.grantSaved === true ? 'grantSaved' : state.grantSaved === false ? 'noGrant' : 'grantUnknown'))),
      h('dialog', { ref: dialog, 'data-window-drag-exclude': '', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-limits`,
        onCancel: e => { e.preventDefault(); close(); } },
        h('h3', { id: `${id}-title` }, t('title')),
        h('p', { className: 'muted' }, t('intro')),
        h('p', { id: `${id}-limits`, className: 'muted' }, t('limits')),
        state.apiKeyOverride === true && h('p', { className: 'warn' }, t('override')),
        state.apiKeyOverride === null && h('p', { className: 'warn' }, t('overrideUnknown')),
        state.busy && h('p', null, t('busy')),
        !state.available && h('p', null, t('unavailable')),
        h('p', { role: 'status', 'aria-live': 'polite' }, t(status)),
        state.error && h('p', { role: 'alert', className: 'error' }, t(`error_${state.error}`)),
        state.promptId && h('form', { onSubmit: e => {
          e.preventDefault();
          const value = input.current.value.trim();
          input.current.value = '';
          if (value) void client.answer(state.promptId, value);
        } },
          h('label', { htmlFor: `${id}-callback` }, t('manual')),
          h('input', { ref: input, id: `${id}-callback`, type: 'password', autoComplete: 'off', spellCheck: false,
            maxLength: 8192, required: true, disabled: state.loading, 'aria-describedby': `${id}-privacy` }),
          h('p', { id: `${id}-privacy`, className: 'muted' }, t('privacy')),
          h('button', { type: 'submit', disabled: state.loading }, t('submit'))),
        h('div', { className: 'actions' },
          state.error && h('button', { type: 'button', disabled: state.loading, onClick: () => { void client.refresh(); } }, t('refresh')),
          h('button', { type: 'button', onClick: close }, t(active ? 'cancelClose' : 'close')))));
  }
  function Card(props) {
    return props.provider?.provider === 'openai-codex' ? h(Panel) : null;
  }
  function Fallback() {
    const state = useState();
    if (state.settingsNs) return null;
    return h('section', { className: 'wz-codex' }, h('style', null, css),
      h('p', null, t('bootstrap')),
      state.error && h('p', { role: 'alert' }, t(`error_${state.error}`)),
      h('button', { type: 'button', disabled: state.loading, onClick: () => { void client.refresh(); } }, t('refresh')));
  }
  return { Card, Fallback };
}
