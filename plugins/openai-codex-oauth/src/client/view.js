export function createEntryViews(React, client, locale, t) {
  const h = React.createElement;
  const css = `.wz-codex{color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:1.5;padding:8px 0}
.wz-codex.wz-codex-fold{padding:0}
.wz-codex summary{cursor:pointer;line-height:20px;width:fit-content;border-radius:4px}
.wz-codex summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.wz-codex details[open]>summary{margin-bottom:8px}
.wz-codex p{margin:4px 0;line-height:1.5;overflow-wrap:anywhere}
.wz-codex .muted,.wz-codex .warn,.wz-codex .error{color:var(--dsw-alias-label-secondary)}
.wz-codex button,.wz-codex input{box-sizing:border-box;font:inherit;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:4px 10px}
.wz-codex button{height:28px;line-height:18px;white-space:nowrap;cursor:pointer}.wz-codex button:disabled{opacity:.5;cursor:not-allowed}
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
    const dialog = React.useRef(null), input = React.useRef(null);
    const id = React.useId();
    const active = ['starting', 'waiting', 'saving', 'unknown'].includes(state.phase);
    React.useEffect(() => {
      if (open && !dialog.current.open) dialog.current.showModal();
      if (!open && dialog.current.open) dialog.current.close();
    }, [open]);
    React.useEffect(() => { if (input.current) input.current.value = ''; }, [state.promptId, open]);
    React.useEffect(() => () => { void client.cancel(); }, []);
    const close = () => {
      if (input.current) input.current.value = '';
      setOpen(false);
      if (active || state.loading) void client.cancel();
    };
    const begin = () => { setOpen(true); void client.start(); };
    const status = state.phase === 'idle' ? (state.configured ? 'present' : 'absent') : `phase_${state.phase}`;
    return h('section', { className: 'wz-codex wz-codex-fold', 'aria-label': t('title') },
      h('style', null, css),
      // Native disclosure defaults closed. Folding neither unmounts Panel nor
      // starts/cancels authorization; the modal stays outside the hidden area.
      h('details', null,
      h('summary', null, t('authorizationSettings')),
      h('p', { className: 'muted' }, t('intro')),
      state.apiKeyOverride === true && h('p', { className: 'warn' }, t('override')),
      state.apiKeyOverride === null && h('p', { className: 'warn' }, t('overrideUnknown')),
      h('p', { role: 'status' }, t(status)),
      state.error && h('p', { role: 'alert', className: 'error' }, t(`error_${state.error}`)),
      state.busy && h('p', null, t('busy')),
      !state.available && h('p', null, t('unavailable')),
      h('div', { className: 'actions' },
        h('button', { type: 'button', disabled: state.loading || active || state.busy || !state.available, onClick: begin }, t(state.configured ? 'reauthorize' : 'login')),
        active && h('button', { type: 'button', onClick: () => setOpen(true) }, t('show')),
        h('button', { type: 'button', disabled: state.loading, onClick: () => { void client.refresh(); } }, t('refresh')))),
      h('dialog', { ref: dialog, 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-limits`,
        onCancel: e => { e.preventDefault(); close(); } },
        h('h3', { id: `${id}-title` }, t('title')),
        h('p', { id: `${id}-limits`, className: 'muted' }, t('limits')),
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
