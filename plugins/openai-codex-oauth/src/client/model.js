// Pure browser controller; tests inject transport/clock. Never persist owner or input.
export function createEntryClient({ fetch: fetcher, crypto, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let owner = '', attempted = false, disposed = false, polling, chain = Promise.resolve();
  let snapshot = { phase: 'idle', loading: false, configured: false, available: false, busy: false, settingsNs: null };
  const listeners = new Set();
  const active = () => ['starting', 'waiting', 'saving', 'unknown'].includes(snapshot.phase);
  function emit(patch) { snapshot = { ...snapshot, ...patch }; for (const fn of listeners) fn(); }
  function newOwner() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
  async function request(action, extra = {}, keepalive = false) {
    if (!owner) owner = newOwner();
    const abort = new AbortController();
    const timer = setTimer(() => abort.abort(), 10_000);
    try {
      const response = await fetcher('/api/wangzf/codex-oauth', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-codex-entry': '1' },
        body: JSON.stringify({ action, owner, ...extra }), signal: abort.signal, keepalive,
      });
      const data = await response.json();
      if (!response.ok || !data.value) {
        const allowed = ['NO_FLOW', 'ALREADY_IN_FLIGHT', 'NOT_COMMITTED', 'UNAVAILABLE', 'BAD_REQUEST', 'FORBIDDEN',
          'PROMPT_CHANGED', 'CALLBACK_INVALID', 'CALLBACK_HOST', 'OPEN_FAILED', 'UNSUPPORTED_FLOW', 'CLOSED', 'AUTH_FAILED'];
        throw new Error(allowed.includes(data.error) ? data.error : 'NETWORK');
      }
      return data.value;
    } finally { clearTimer(timer); }
  }
  function schedule() {
    clearTimer(polling);
    if (!disposed && active()) polling = setTimer(() => { void run('status'); }, 1000);
  }
  function run(action, extra, keepalive = false) {
    const operation = chain.then(async () => {
      if (disposed && action !== 'cancel') return;
      clearTimer(polling);
      // Heartbeats must not disable a focused callback input every second.
      emit({ loading: action !== 'status' || !active(), error: action === 'status' ? snapshot.error : undefined });
      try {
        const next = await request(action, extra, keepalive);
        const inputError = action === 'status' && next.promptId && snapshot.error === 'CALLBACK_INVALID' ? snapshot.error : undefined;
        emit({ promptId: undefined, error: inputError, ...next, loading: false });
      } catch (error) {
        // Local exceptions and all unknown response fields are excluded from visible state.
        const code = ['NO_FLOW', 'ALREADY_IN_FLIGHT', 'NOT_COMMITTED', 'UNAVAILABLE', 'BAD_REQUEST', 'FORBIDDEN',
          'PROMPT_CHANGED', 'CALLBACK_INVALID', 'CALLBACK_HOST', 'OPEN_FAILED', 'UNSUPPORTED_FLOW', 'CLOSED', 'AUTH_FAILED']
          .includes(error.message) ? error.message : 'NETWORK';
        const rejectedStart = action === 'start' && ['FORBIDDEN', 'BAD_REQUEST', 'NO_FLOW', 'UNAVAILABLE', 'ALREADY_IN_FLIGHT'].includes(code);
        const uncertain = attempted && active() && !['CALLBACK_INVALID', 'PROMPT_CHANGED'].includes(code);
        if (rejectedStart) attempted = false;
        emit({ loading: false, error: code,
          ...(rejectedStart ? { phase: 'failed', promptId: undefined }
            : uncertain ? { phase: 'unknown', promptId: undefined } : {}),
        });
        // Rejected input is recoverable: keep the existing attempt's heartbeat alive.
        // Never retry a command or failed transport automatically.
        if (code === 'CALLBACK_INVALID' || code === 'PROMPT_CHANGED') schedule();
        return;
      }
      schedule();
    });
    chain = operation.catch(() => {});
    return operation;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh: () => run('status'),
    start() {
      if (disposed || snapshot.loading || active()) return Promise.resolve();
      owner = newOwner(); attempted = true;
      emit({ phase: 'starting', promptId: undefined, error: undefined, loading: true });
      return run('start');
    },
    answer(promptId, value) { return run('answer', { promptId, value }); },
    cancel() {
      clearTimer(polling);
      return attempted ? run('cancel', undefined, true) : Promise.resolve();
    },
    dispose() {
      clearTimer(polling);
      // Queued after start/answer so a late start response cannot bypass cancellation.
      if (attempted) void run('cancel', undefined, true);
      disposed = true;
      listeners.clear();
    },
  };
}
