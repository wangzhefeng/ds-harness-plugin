import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createEntryClient } from '../src/client/model.js';
import { entryFactory } from '../src/client/entry.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(respond) {
  const calls = [], timers = new Map(); let id = 0;
  const client = createEntryClient({ crypto: webcrypto, setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id),
    fetch: async (url, request) => {
      const body = JSON.parse(request.body); calls.push({ url, request, body });
      const value = await respond(body);
      return { ok: true, json: async () => ({ value }) };
    } });
  return { client, calls, timers };
}
test('client starts without model/session dependency and suppresses double click', async () => {
  const f = setup(async () => ({ phase: 'waiting', available: true }));
  await Promise.all([f.client.start(), f.client.start()]);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.action, 'start');
  assert.match(f.calls[0].body.owner, /^[a-f0-9]{64}$/);
  assert.equal(f.calls[0].request.credentials, 'same-origin'); assert.equal(f.calls[0].request.redirect, 'error');
  assert.equal(f.calls[0].request.headers['x-codex-entry'], '1');
  f.client.dispose(); await tick();
});
test('input is sent once and absent from state; no command auto-retry', async () => {
  const f = setup(async body => ({ phase: body.action === 'answer' ? 'saved' : 'waiting', promptId: body.action === 'answer' ? undefined : 'p' }));
  await f.client.start(); await f.client.answer('p', 'synthetic-callback-secret');
  assert.doesNotMatch(JSON.stringify(f.client.getSnapshot()), /synthetic-callback/);
  assert.equal(f.calls.filter(x => x.body.action === 'answer').length, 1);
  assert.equal(f.client.getSnapshot().phase, 'saved'); f.client.dispose(); await tick();
});
test('dispose queues cancellation after in-flight start and clears timers', async () => {
  let release;
  const f = setup(body => body.action === 'start' ? new Promise(resolve => { release = resolve; }) : { phase: 'cancel-requested' });
  const started = f.client.start(); await tick(); f.client.dispose();
  release({ phase: 'waiting' }); await started; await tick();
  assert.deepEqual(f.calls.map(x => x.body.action), ['start', 'cancel']);
  assert.equal(f.calls[1].request.keepalive, true); assert.equal(f.timers.size, 0);
});
test('failed network stops polling and hides raw exceptions', async () => {
  const f = setup(() => { throw new Error('synthetic-sensitive-error'); });
  await f.client.start();
  assert.equal(f.client.getSnapshot().error, 'NETWORK'); assert.equal(f.timers.size, 0);
  assert.equal(f.client.getSnapshot().phase, 'unknown');
  await f.client.start(); // Unknown outcome still suppresses a duplicate authorization.
  assert.equal(f.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(f.client.getSnapshot()), /synthetic-sensitive/);
  assert.equal(f.calls.length, 1); f.client.dispose(); await tick();
});
test('authoritative start refusal exits starting state without a phantom cancel', async () => {
  const calls = [];
  const client = createEntryClient({ crypto: webcrypto, fetch: async (_url, req) => {
    calls.push(JSON.parse(req.body).action);
    return { ok: false, json: async () => ({ error: 'FORBIDDEN' }) };
  } });
  await client.start();
  assert.equal(client.getSnapshot().phase, 'failed');
  assert.equal(client.getSnapshot().loading, false);
  await client.cancel();
  assert.deepEqual(calls, ['start']);
  client.dispose();
});
test('unknown outcome retains cancellation and can reconcile with status', async () => {
  let first = true;
  const f = setup(body => {
    if (first) { first = false; throw new Error('synthetic-transport-loss'); }
    return { phase: body.action === 'cancel' ? 'cancel-requested' : 'saved' };
  });
  await f.client.start(); assert.equal(f.client.getSnapshot().phase, 'unknown');
  await f.client.cancel(); assert.equal(f.client.getSnapshot().phase, 'cancel-requested');
  assert.equal(f.calls[1].body.owner, f.calls[0].body.owner);
  await f.client.refresh(); assert.equal(f.client.getSnapshot().phase, 'saved');
  f.client.dispose(); await tick();
});
test('poll is bounded to active attempt and new attempts use new owner', async () => {
  const f = setup(body => ({ phase: body.action === 'start' ? 'waiting' : 'saved' }));
  await f.client.start(); const owner = f.calls[0].body.owner;
  const poll = [...f.timers.values()].find(t => t.ms === 1000); assert.ok(poll);
  poll.fn(); await tick(); assert.equal(f.client.getSnapshot().phase, 'saved');
  await f.client.start(); assert.notEqual(f.calls.at(-1).body.owner, owner);
  f.client.dispose(); await tick();
});
test('recoverable callback error keeps lease heartbeats without disabling input', async () => {
  const timers = new Map(); let id = 0;
  const client = createEntryClient({ crypto: webcrypto,
    setTimer: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id),
    fetch: async (_url, req) => {
      const action = JSON.parse(req.body).action;
      return action === 'answer' ? { ok: false, json: async () => ({ error: 'CALLBACK_INVALID' }) }
        : { ok: true, json: async () => ({ value: { phase: action === 'cancel' ? 'cancel-requested' : 'waiting', promptId: 'p' } }) };
    },
  });
  await client.start(); await client.answer('p', 'invalid');
  assert.equal(client.getSnapshot().error, 'CALLBACK_INVALID');
  assert.ok([...timers.values()].some(t => t.ms === 1000));
  const loading = []; const unsubscribe = client.subscribe(() => loading.push(client.getSnapshot().loading));
  await client.refresh();
  assert.ok(loading.every(value => value === false));
  assert.equal(client.getSnapshot().error, 'CALLBACK_INVALID');
  unsubscribe(); client.dispose(); await tick();
});
test('entry registers actual settings namespace, not provider id; lifecycle disposes', async () => {
  // Wiring-only test: no emulation or claim of a rendered React component.
  const oldWindow = globalThis.window;
  const registrations = [], effects = [], disposals = [], listeners = new Map();
  let notify, snapshot = { settingsNs: null }, clientDisposed = false;
  const client = { getSnapshot: () => snapshot, subscribe: fn => { notify = fn; return () => disposals.push('subscription'); },
    refresh: async () => {}, dispose: () => { clientDisposed = true; } };
  globalThis.window = { fetch() {}, crypto: webcrypto, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event) };
  try {
    const plugin = entryFactory(name => { assert.equal(name, 'react'); return {}; }, () => client, () => ({ Card: 'card', Fallback: 'footer' }), { en: {}, zh: {} });
    const ctx = { effect: fn => effects.push(fn()), locale: { register: (_ns, language) => () => disposals.push(language), bind: () => () => '' },
      slots: { inject: (_slot, fn) => fn(), register: (spec, component) => { registrations.push([spec, component]); return () => disposals.push(spec.name); } } };
    plugin.apply(ctx);
    snapshot = { settingsNs: 'actual-pi-entry' }; notify();
    const card = registrations.find(([spec]) => spec.name === 'settings.models.provider-card');
    assert.equal(card[0].key, 'actual-pi-entry'); assert.equal(card[1], 'card');
    effects[0](); assert.equal(clientDisposed, true); assert.equal(listeners.size, 0);
    assert.ok(disposals.includes('settings.models.provider-card')); assert.ok(disposals.includes('en'));
  } finally { globalThis.window = oldWindow; }
});
