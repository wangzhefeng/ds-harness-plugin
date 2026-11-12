import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHandler, parseBody, readBody } from '../src/host/routes.js';
const owner = 'a'.repeat(64);
function fixture() {
  const peer = { id: 'browser', principal: { kind: 'owner' } };
  const calls = [];
  const connection = { browserPeer: peer, requestRejection: () => undefined, admit: () => ({ peer }) };
  const controller = Object.fromEntries(['snapshot', 'start', 'cancel', 'answer'].map(key => [key, async (...args) => {
    calls.push([key, ...args]); return { phase: 'idle', available: true };
  }]));
  let origin = 'http://127.0.0.1:12345';
  const handler = createHandler({ connection, controller, getOrigin: () => origin });
  return { calls, connection, controller, handler, origin: value => { origin = value; } };
}
async function invoke(f, { method = 'POST', headers = {}, raw = JSON.stringify({ action: 'status', owner }), address = '127.0.0.1' } = {}) {
  const req = Readable.from([Buffer.from(raw)]);
  Object.assign(req, { method, headers: { origin: 'http://127.0.0.1:12345', 'content-type': 'application/json', 'x-codex-entry': '1', ...headers }, socket: { remoteAddress: address } });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; this.writableEnded = true; } };
  await f.handler(req, res); return res;
}
test('trust rejection happens before body/actions; API peers cannot use browser authority', async () => {
  const f = fixture(); f.connection.requestRejection = () => 401;
  assert.equal((await invoke(f)).statusCode, 401); assert.equal(f.calls.length, 0);
  f.connection.requestRejection = () => undefined;
  f.connection.admit = () => ({ peer: { id: 'api', principal: { kind: 'owner' } } });
  assert.equal((await invoke(f)).statusCode, 403); assert.equal(f.calls.length, 0);
});
test('CSRF, cross-origin, inconsistent metadata and non-loopback requests fail closed', async () => {
  const f = fixture();
  for (const headers of [
    { origin: undefined, 'sec-fetch-site': 'same-origin' },
    { origin: undefined, 'sec-fetch-site': 'cross-site' },
    { origin: 'null' }, { origin: '' }, { origin: 'dsh-app://app' },
    { origin: 'http://evil.invalid' }, { 'x-codex-entry': undefined }, { 'sec-fetch-site': 'cross-site' },
    { origin: undefined, 'x-codex-entry': undefined },
  ]) {
    assert.equal((await invoke(f, { headers })).statusCode, 403);
  }
  assert.equal((await invoke(f, { address: '192.0.2.1' })).statusCode, 403);
  assert.equal(f.calls.length, 0);
});
test('authenticated Desktop forward shape works without Origin or Sec-Fetch-Site', async () => {
  const f = fixture();
  const res = await invoke(f, { headers: { origin: undefined } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(f.calls, [['snapshot', owner]]);
});
test('missing Origin never bypasses authentication, peer ownership, or loopback checks', async () => {
  const f = fixture();
  f.connection.requestRejection = () => 401;
  assert.equal((await invoke(f, { headers: { origin: undefined } })).statusCode, 401);
  f.connection.requestRejection = () => undefined;
  f.connection.admit = () => ({ rejection: 403 });
  assert.equal((await invoke(f, { headers: { origin: undefined } })).statusCode, 403);
  f.connection.admit = () => ({ peer: { id: 'api', principal: { kind: 'owner' } } });
  assert.equal((await invoke(f, { headers: { origin: undefined } })).statusCode, 403);
  assert.equal(f.calls.length, 0);
  const local = fixture();
  assert.equal((await invoke(local, { headers: { origin: undefined }, address: '192.0.2.1' })).statusCode, 403);
  assert.equal(local.calls.length, 0);
});
test('cross-site preflight and simple form cannot enter the Desktop branch', async () => {
  const f = fixture();
  assert.equal((await invoke(f, { method: 'OPTIONS', headers: { origin: 'https://evil.invalid', 'access-control-request-headers': 'x-codex-entry,content-type' } })).statusCode, 405);
  assert.equal((await invoke(f, { headers: { origin: undefined, 'content-type': 'application/x-www-form-urlencoded' } })).statusCode, 415);
  assert.equal(f.calls.length, 0);
});
test('POST JSON only, strict schema, bounded body and safe failures', async () => {
  const f = fixture();
  assert.equal((await invoke(f, { method: 'GET' })).statusCode, 405);
  assert.equal((await invoke(f, { headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  for (const raw of ['{synthetic-secret', 'x'.repeat(17_000), JSON.stringify({ action: 'start', owner, path: '/secret' }), JSON.stringify({ action: 'start', owner: 'short' })]) {
    const res = await invoke(f, { raw }); assert.equal(res.statusCode, 400); assert.doesNotMatch(res.body, /synthetic-secret|\/secret/);
  }
  assert.equal(f.calls.length, 0);
});
test('unexpected controller exception is never sent to frontend', async () => {
  const f = fixture(); f.controller.snapshot = async () => { throw new Error('synthetic-token-response'); };
  const res = await invoke(f);
  assert.equal(res.body, '{"error":"AUTH_FAILED"}'); assert.equal(res.headers['cache-control'], 'no-store');
});
test('only fixed actions accepted; token and provider substitution rejected', () => {
  for (const body of [{ action: 'open', owner, value: 'https://evil.invalid' }, { action: 'start', owner, provider: 'other' }, { action: 'status', owner, value: 'synthetic-token' }]) {
    assert.throws(() => parseBody(JSON.stringify(body)), { code: 'BAD_REQUEST' });
  }
});
test('stalled request body is bounded and listeners removed', async () => {
  const stream = new Readable({ read() {} });
  // Keep the test event loop alive independently of the unref'ed production timeout.
  const keeper = setTimeout(() => {}, 1000);
  try { await assert.rejects(readBody(stream, 1024, 5), { code: 'BAD_REQUEST' }); }
  finally { clearTimeout(keeper); stream.destroy(); }
  assert.equal(stream.listenerCount('data'), 0); assert.equal(stream.listenerCount('aborted'), 0);
});
test('simulated HTTP integration on isolated ephemeral loopback, no OAuth', async () => {
  const f = fixture();
  const server = createServer(f.handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; f.origin(origin);
  try {
    const response = await fetch(`${origin}/api/wangzf/codex-oauth`, { method: 'POST', headers: {
      origin, 'content-type': 'application/json', 'x-codex-entry': '1',
    }, body: JSON.stringify({ action: 'start', owner }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).value.phase, 'idle');
    assert.deepEqual(f.calls, [['start', owner]]);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    // Match Desktop main's forwarded shape, without reading or using a real cookie.
    const forwarded = await fetch(`${origin}/api/wangzf/codex-oauth`, { method: 'POST', headers: {
      'content-type': 'application/json', 'x-codex-entry': '1',
    }, body: JSON.stringify({ action: 'status', owner }) });
    assert.equal(forwarded.status, 200);
    assert.equal((await forwarded.json()).value.phase, 'idle');
    assert.deepEqual(f.calls, [['start', owner], ['snapshot', owner]]);
  } finally {
    const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed;
  }
  assert.equal(server.listening, false);
});
