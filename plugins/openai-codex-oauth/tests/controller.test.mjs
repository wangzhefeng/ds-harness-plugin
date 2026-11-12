import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, KEY, authorizationUrl, validCallback } from '../src/host/controller.js';
import { metadataReader } from '../src/index.js';
import { openBrowser } from '../src/host/browser.js';
const A = 'a'.repeat(64), B = 'b'.repeat(64);
const tick = () => new Promise(resolve => setImmediate(resolve));
const url = () => 'https://auth.openai.com/oauth/authorize?' + new URLSearchParams({
  client_id: 'app_EMoamEEZ73f0CkXaXp7hrann', response_type: 'code', redirect_uri: 'http://localhost:1455/auth/callback', code_challenge_method: 'S256',
  code_challenge: 'synthetic-challenge', state: 'synthetic-state',
});
const callback = 'http://localhost:1455/auth/callback?state=synthetic-state&code=synthetic-code';
function fixture(run, overrides = {}) {
  let request, count = 0, opened = 0, time = 0;
  const timers = new Map(); let tid = 0;
  const metadata = async () => ({ settingsNs: 'test-pi', configured: false, writable: true, apiKeyOverride: false });
  const authorization = {
    describe: () => ({ methods: [{ id: 'oauth' }], inFlight: false }),
    begin(r) { request = r; count++; return run ? run(r) : new Promise(resolve => {
      r.signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true });
    }); },
  };
  const controller = createController({ authorization, metadata, openBrowser: async () => { opened++; },
    callbackHost: () => undefined, now: () => time,
    setTimer: (fn, delay) => { timers.set(++tid, { fn, delay }); return tid; }, clearTimer: id => timers.delete(id),
    ...overrides });
  return { controller, authorization, timers, get request() { return request; }, get count() { return count; },
    get opened() { return opened; }, time: value => { time = value; } };
}
async function manual(r, signal = new AbortController().signal) {
  assert.equal(r.key, KEY); assert.equal(r.method, 'oauth');
  assert.equal(await r.interaction.prompt({ kind: 'select', options: [{ id: 'browser' }, { id: 'device_code' }] }), 'browser');
  r.interaction.notify({ url: url(), message: 'synthetic-sensitive-notice' });
  return r.interaction.prompt({ kind: 'text', placeholder: 'http://localhost:1455/auth/callback', message: 'synthetic-sensitive-prompt', signal });
}
test('manual entry uses only built-in flow, saves only on authorized outcome', async () => {
  let submitted;
  const f = fixture(async r => { submitted = await manual(r); return { status: 'authorized' }; });
  try {
    await f.controller.start(A); await tick();
    const state = await f.controller.snapshot(A);
    assert.equal(state.phase, 'waiting'); assert.ok(state.promptId); assert.equal(f.opened, 1);
    assert.equal(JSON.stringify(state).includes('synthetic'), false);
    await f.controller.answer(A, state.promptId, callback); await tick();
    assert.equal(submitted, callback);
    assert.equal((await f.controller.snapshot(A)).phase, 'saved');
    assert.equal(f.timers.size, 0);
  } finally { f.controller.dispose(); }
});
test('double start and concurrent owner are exclusive before metadata resolves', async () => {
  let release;
  const f = fixture(undefined, { metadata: () => new Promise(resolve => { release = () => resolve({ settingsNs: 'test', writable: true }); }) });
  const start = f.controller.start(A);
  await assert.rejects(f.controller.start(B), { code: 'ALREADY_IN_FLIGHT' });
  // Restore metadata for subsequent snapshot; first request remains reserved.
  f.controller.dispose(); release();
  await assert.rejects(start, { code: 'CLOSED' });
  assert.equal(f.count, 0);
});
test('retry same owner start is idempotent; other owner cannot see prompt or cancel', async () => {
  const f = fixture(async r => { await manual(r); return { status: 'authorized' }; });
  try {
    await f.controller.start(A); await tick(); await f.controller.start(A);
    assert.equal(f.count, 1);
    const other = await f.controller.snapshot(B);
    assert.equal(other.phase, 'idle'); assert.equal(other.busy, true); assert.equal(other.promptId, undefined);
    await assert.rejects(f.controller.cancel(B), { code: 'FORBIDDEN' });
    assert.equal(f.request.signal.aborted, false);
  } finally { f.controller.dispose(); }
});
test('wrong state, raw code, stale prompt and foreign owner are refused', async () => {
  const f = fixture(async r => { await manual(r); return { status: 'authorized' }; });
  try {
    await f.controller.start(A); await tick(); const s = await f.controller.snapshot(A);
    for (const value of ['synthetic-code', callback.replace('synthetic-state', 'wrong'), callback.replace('localhost', 'evil.invalid')]) {
      await assert.rejects(f.controller.answer(A, s.promptId, value), { code: 'CALLBACK_INVALID' });
    }
    await assert.rejects(f.controller.answer(B, s.promptId, callback), { code: 'FORBIDDEN' });
    await assert.rejects(f.controller.answer(A, 'stale', callback), { code: 'PROMPT_CHANGED' });
    assert.equal((await f.controller.snapshot(A)).phase, 'waiting');
  } finally { f.controller.dispose(); }
});
test('cancel clears prompt and signals own request, not a global cancel(key)', async () => {
  const f = fixture(async r => { await manual(r); return { status: 'authorized' }; });
  await f.controller.start(A); await tick();
  const before = await f.controller.snapshot(A);
  const s = await f.controller.cancel(A); await tick();
  assert.equal(s.phase, 'cancel-requested'); assert.equal(s.promptId, undefined); assert.equal(f.request.signal.aborted, true);
  await assert.rejects(f.controller.answer(A, before.promptId, callback), { code: 'PROMPT_CHANGED' });
  assert.equal(f.timers.size, 0); f.controller.dispose();
});
test('flow may report saved after cancellation; UI must not claim rollback', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }));
  await f.controller.start(A); await f.controller.cancel(A);
  finish({ status: 'authorized' }); await tick();
  assert.equal((await f.controller.snapshot(A)).phase, 'saved-after-cancel'); f.controller.dispose();
});
test('flow withdrawal of manual prompt clears it without declaring saved', async () => {
  const abort = new AbortController();
  const f = fixture(async r => { await manual(r, abort.signal).catch(() => {}); return new Promise(() => {}); });
  await f.controller.start(A); await tick(); abort.abort(); await tick();
  const s = await f.controller.snapshot(A);
  assert.equal(s.phase, 'saving'); assert.equal(s.promptId, undefined); f.controller.dispose();
});
test('lease and absolute deadline request cancellation, never success', async () => {
  for (const [time, phase] of [[46_000, 'disconnected'], [600_001, 'timeout-requested']]) {
    const f = fixture(); await f.controller.start(A); f.time(time);
    [...f.timers.values()][0].fn(); await tick();
    assert.equal((await f.controller.snapshot(A)).phase, phase);
    assert.equal(f.request.signal.aborted, true); f.controller.dispose();
  }
});
test('non-loopback callback host rejected before begin', async () => {
  const f = fixture(undefined, { callbackHost: () => '0.0.0.0' });
  const s = await f.controller.start(A);
  assert.equal(s.error, 'CALLBACK_HOST'); assert.equal(f.count, 0); f.controller.dispose();
});
test('missing flow, busy flow, readonly storage refuse begin', async () => {
  for (const kind of ['missing', 'busy', 'readonly']) {
    const f = fixture(undefined, kind === 'readonly' ? { metadata: async () => ({ writable: false, settingsNs: 'test' }) } : {});
    if (kind === 'missing') f.authorization.describe = () => undefined;
    if (kind === 'busy') f.authorization.describe = () => ({ methods: [{ id: 'oauth' }], inFlight: true });
    const s = await f.controller.start(A);
    assert.equal(s.phase, 'failed'); assert.equal(f.count, 0); f.controller.dispose();
  }
});
test('exceptions/URLs/prompts are not projected; storage failure is not success', async () => {
  const f = fixture(async () => { throw new Error('synthetic-access synthetic-refresh https://secret.invalid/'); });
  await f.controller.start(A); await tick();
  const s = await f.controller.snapshot(A);
  assert.equal(s.phase, 'failed'); assert.equal(s.error, 'AUTH_FAILED');
  assert.doesNotMatch(JSON.stringify(s), /synthetic|secret\.invalid/); f.controller.dispose();
});
test('browser open failure and unsupported URL abort instead of leaking exceptions', async () => {
  for (const badUrl of [false, true]) {
    const f = fixture(async r => {
      r.interaction.notify({ url: badUrl ? 'https://evil.invalid/' : url() });
      return new Promise(resolve => { if (r.signal.aborted) resolve({ status: 'cancelled' }); else r.signal.addEventListener('abort', () => resolve({ status: 'cancelled' })); });
    }, { openBrowser: async () => { throw new Error('synthetic-private-error'); } });
    await f.controller.start(A); await tick();
    const s = await f.controller.snapshot(A);
    assert.equal(s.phase, 'failed'); assert.equal(s.error, badUrl ? 'UNSUPPORTED_FLOW' : 'OPEN_FAILED');
    assert.equal(f.request.signal.aborted, true); f.controller.dispose();
  }
});
test('allowlists reject encoded alternate origins, duplicate state, fragment and userinfo', () => {
  assert.ok(authorizationUrl(url())); assert.ok(validCallback(callback, 'synthetic-state'));
  for (const bad of [url().replace('auth.openai.com', 'auth.openai.com.evil.invalid'), url() + '#x', url() + '&state=other', url().replace('https://', 'https://user@')]) assert.equal(authorizationUrl(bad), null);
  for (const bad of [callback + '&state=other', callback + '#x', callback.replace('http://', 'http://user@')]) assert.equal(validCallback(bad, 'synthetic-state'), false);
});
test('metadata uses only target describeRecord and redacted settings; API key override is explicit', async () => {
  const ctx = {
    llm: { listConfigurableProviders: () => [{ provider: 'openai-codex', settingsNs: 'actual-key', settingsPath: ['providers', 'openai-codex'] }] },
    credentials: { describeRecord: async key => { assert.equal(key, KEY); return { configured: true, writable: true, payload: 'synthetic-token' }; } },
    settings: { describe: options => { assert.deepEqual(options, { redactSecrets: true }); return [{ ns: 'actual-key', value: { providers: { 'openai-codex': { apiKeyEnv: 'SYNTHETIC_REF' } } } }]; } },
  };
  const value = await metadataReader(ctx)();
  assert.equal(value.apiKeyOverride, true); assert.equal(value.settingsNs, 'actual-key');
  assert.doesNotMatch(JSON.stringify(value), /SYNTHETIC|synthetic-token|payload/);
});
test('browser opener uses fixed executable and no shell; rejects other URLs', async () => {
  if (process.platform !== 'darwin') return;
  let args;
  await openBrowser(url(), new AbortController().signal, (...a) => { args = a; a[3](null); });
  assert.equal(args[0], '/usr/bin/open'); assert.deepEqual(args[1], [url()]); assert.equal(args[2].shell, false);
  await assert.rejects(openBrowser('https://evil.invalid', new AbortController().signal), { code: 'OPEN_FAILED' });
});
