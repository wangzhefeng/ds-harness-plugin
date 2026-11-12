import { randomUUID } from 'node:crypto';

export const KEY = 'llm-pi-ai/openai-codex';
export const PROVIDER = 'openai-codex';
const ACTIVE = new Set(['starting', 'waiting', 'saving']);
export class EntryError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new EntryError(code); };
export function safeCode(error) {
  return ['NO_FLOW', 'ALREADY_IN_FLIGHT', 'NOT_COMMITTED', 'UNAVAILABLE', 'BAD_REQUEST', 'FORBIDDEN',
    'PROMPT_CHANGED', 'CALLBACK_INVALID', 'CALLBACK_HOST', 'OPEN_FAILED', 'UNSUPPORTED_FLOW', 'CLOSED']
    .includes(error?.code) ? error.code : 'AUTH_FAILED';
}
export function authorizationUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 8192) return null;
    const url = new URL(value);
    if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/oauth/authorize' ||
        url.username || url.password || url.hash || url.searchParams.get('client_id') !== 'app_EMoamEEZ73f0CkXaXp7hrann' ||
        url.searchParams.get('response_type') !== 'code' ||
        url.searchParams.get('redirect_uri') !== 'http://localhost:1455/auth/callback' ||
        url.searchParams.get('code_challenge_method') !== 'S256' ||
        !url.searchParams.get('state') || !url.searchParams.get('code_challenge')) return null;
    for (const key of ['client_id', 'state', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method']) {
      if (url.searchParams.getAll(key).length !== 1) return null;
    }
    return url;
  } catch { return null; }
}
export function validCallback(value, state) {
  try {
    if (!state || typeof value !== 'string' || value.length > 8192) return false;
    const url = new URL(value);
    return url.origin === 'http://localhost:1455' && url.pathname === '/auth/callback' &&
      !url.username && !url.password && !url.hash && !url.searchParams.has('error') &&
      url.searchParams.getAll('state').length === 1 && url.searchParams.get('state') === state &&
      url.searchParams.getAll('code').length === 1 && Boolean(url.searchParams.get('code'));
  } catch { return false; }
}

// No credential values are read here. The existing flow remains the sole writer.
export function createController({ authorization, metadata, openBrowser, callbackHost,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  leaseMs = 45_000, deadlineMs = 600_000 }) {
  let attempt, disposed = false;
  function owned(owner) {
    if (!attempt || attempt.owner !== owner) fail('FORBIDDEN');
    return attempt;
  }
  function active(a) { return a && ACTIVE.has(a.phase); }
  function clearPrompt(a, error = new EntryError('PROMPT_CHANGED')) {
    const pending = a.pending;
    a.pending = undefined;
    pending?.reject(error);
  }
  function stop(a, reason = 'cancel-requested') {
    if (!active(a)) return;
    a.phase = reason;
    clearTimer(a.timer);
    a.controller.abort(); // Only this attempt; never cancel(key) on someone else's flow.
    clearPrompt(a);
    a.state = undefined;
  }
  function touch(a) {
    if (!active(a)) return;
    clearTimer(a.timer);
    const remaining = a.deadline - now();
    if (remaining <= 0) { stop(a, 'timeout-requested'); return; }
    a.timer = setTimer(() => stop(a, now() >= a.deadline ? 'timeout-requested' : 'disconnected'), Math.min(leaseMs, remaining));
    a.timer?.unref?.();
  }
  function view(a) {
    return {
      phase: a?.phase ?? 'idle',
      ...(a?.error ? { error: a.error } : {}),
      ...(a?.pending && active(a) ? { promptId: a.pending.id } : {}),
    };
  }
  async function snapshot(owner) {
    if (disposed) fail('CLOSED');
    const meta = await metadata();
    const entry = authorization.describe(KEY);
    const own = attempt?.owner === owner ? attempt : undefined;
    if (own) touch(own);
    return {
      ...meta,
      available: Boolean(meta.writable && meta.settingsNs && entry?.methods.some(m => m.id === 'oauth')),
      busy: Boolean((active(attempt) && !own) || (entry?.inFlight && !active(own))),
      ...view(own),
    };
  }
  function notify(a, notice) {
    // Never relay upstream strings, links, codes, or exceptions to the client/log.
    if (!active(a) || a.controller.signal.aborted) return;
    if (notice.url === undefined) return;
    const url = authorizationUrl(notice.url);
    if (!url || a.opened) { a.error = 'UNSUPPORTED_FLOW'; stop(a, 'failed'); return; }
    a.opened = true;
    a.state = url.searchParams.get('state');
    a.phase = 'waiting';
    void Promise.resolve().then(() => {
      if (a.controller.signal.aborted) return;
      return openBrowser(url.href, a.controller.signal);
    }).catch(() => { if (active(a)) { a.error = 'OPEN_FAILED'; stop(a, 'failed'); } });
  }
  async function prompt(a, p) {
    if (!active(a) || a.controller.signal.aborted || p.signal?.aborted) fail('PROMPT_CHANGED');
    if (p.kind === 'select' && p.options?.length === 2 &&
        p.options.some(o => o.id === 'browser') && p.options.some(o => o.id === 'device_code')) return 'browser';
    if (p.kind !== 'text' || p.placeholder !== 'http://localhost:1455/auth/callback' || !a.state || a.pending) {
      fail('UNSUPPORTED_FLOW');
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        p.signal?.removeEventListener('abort', abort);
        if (a.pending?.id === id) a.pending = undefined;
      };
      const abort = () => {
        cleanup();
        if (active(a)) a.phase = 'saving'; // Flow withdrew its losing prompt; not proof of a commit.
        reject(new EntryError('PROMPT_CHANGED'));
      };
      a.pending = {
        id,
        resolve(value) { cleanup(); resolve(value); },
        reject(error) { cleanup(); reject(error); },
      };
      p.signal?.addEventListener('abort', abort, { once: true });
      if (p.signal?.aborted) abort();
    });
  }
  async function start(owner) {
    if (disposed) fail('CLOSED');
    if (attempt?.owner === owner) return snapshot(owner); // Retry of same start is idempotent.
    if (active(attempt)) fail('ALREADY_IN_FLIGHT');
    // Reserve before awaited metadata so double clicks / concurrent tabs cannot both start.
    const a = { owner, phase: 'starting', controller: new AbortController(), deadline: now() + deadlineMs };
    attempt = a;
    touch(a);
    try {
      const host = callbackHost();
      if (host && host !== '127.0.0.1' && host !== '::1') fail('CALLBACK_HOST');
      const meta = await metadata();
      if (!active(a)) return snapshot(owner);
      if (!meta.writable || !meta.settingsNs) fail('UNAVAILABLE');
      const entry = authorization.describe(KEY);
      if (!entry?.methods.some(m => m.id === 'oauth')) fail('NO_FLOW');
      if (entry.inFlight) fail('ALREADY_IN_FLIGHT');
      // Promise is retained/handled. Service cancellation may settle before its flow exits.
      a.done = authorization.begin({ key: KEY, method: 'oauth', signal: a.controller.signal,
        interaction: { notify: n => notify(a, n), prompt: p => prompt(a, p) } })
        .then(result => {
          if (result.status === 'authorized') a.phase = a.controller.signal.aborted ? 'saved-after-cancel' : 'saved';
          else if (active(a)) a.phase = 'cancel-requested';
        }, error => {
          if (active(a)) { a.error = safeCode(error); a.phase = 'failed'; }
        }).finally(() => { clearTimer(a.timer); clearPrompt(a); a.state = undefined; });
    } catch (error) {
      a.error = safeCode(error);
      stop(a, 'failed');
    }
    return snapshot(owner);
  }
  async function answer(owner, id, value) {
    const a = owned(owner);
    if (!active(a) || a.pending?.id !== id) fail('PROMPT_CHANGED');
    if (!validCallback(value, a.state)) fail('CALLBACK_INVALID');
    const pending = a.pending;
    a.phase = 'saving';
    pending.resolve(value.trim());
    touch(a);
    return snapshot(owner);
  }
  async function cancel(owner) {
    const a = owned(owner);
    stop(a);
    return snapshot(owner);
  }
  function dispose() {
    disposed = true;
    if (attempt) stop(attempt, 'disconnected');
  }
  return { snapshot, start, answer, cancel, dispose };
}
