// Opt-in source probe, NOT a plugin or a real OAuth integration test.
// Usage: an ASAR-aware Node runtime --experimental-vm-modules this-file <pi-ai-dist>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';

const root = process.argv[2];
if (!root) throw new Error('Pass the reviewed pi-ai dist directory explicitly');
const sources = Object.fromEntries(['callback-server', 'openai-codex'].map(name => {
  const source = readFileSync(resolve(root, `auth/oauth/${name}.js`), 'utf8');
  console.log(`${name} sha256 ${createHash('sha256').update(source).digest('hex')}`);
  return [name, source];
}));

// Every import is explicitly substituted. No real HTTP, crypto, env, browser,
// credential store, or fetch is available to the modules under test.
async function harness({ bindError = false, abortDuringListen } = {}) {
  const servers = [], timers = [];
  const context = vm.createContext({
    URL, URLSearchParams, AbortController,
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {},
    process: { versions: { node: 'test' } },
    fetch() { throw new Error('Network forbidden in probe'); },
  });
  function synthetic(values) {
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  }
  const http = synthetic({ createServer(handler) {
    const server = new EventEmitter();
    Object.assign(server, {
      handler, listening: false, closes: 0,
      listen(_port, _host, ready) {
        if (bindError) { this.emit('error', Object.assign(new Error('synthetic bind error'), { code: 'EADDRINUSE' })); return; }
        abortDuringListen?.abort();
        this.listening = true;
        ready();
      },
      address() { return { port: 45678 }; },
      close() { this.listening = false; this.closes++; },
    });
    servers.push(server);
    return server;
  } });
  const callback = new vm.SourceTextModule(sources['callback-server'], { context });
  const pages = synthetic({ oauthErrorHtml: () => 'error', oauthSuccessHtml: () => 'success' });
  await callback.link(spec => {
    if (spec === 'node:http') return http;
    if (spec === '../../utils/oauth-page.js') return pages;
    throw new Error(`Unexpected callback import: ${spec}`);
  });
  await callback.evaluate();
  const crypto = synthetic({ randomBytes: () => ({ toString: () => 'synthetic-state' }) });
  await crypto.link(() => { throw new Error('Unexpected import'); });
  await crypto.evaluate();
  const codex = new vm.SourceTextModule(sources['openai-codex'], {
    context,
    importModuleDynamically(spec) {
      assert.equal(spec, 'node:crypto');
      return crypto;
    },
  });
  const dependencies = {
    '../../utils/provider-env.js': synthetic({ getProviderEnvValue: () => undefined }),
    './callback-server.js': callback,
    './device-code.js': synthetic({ pollOAuthDeviceCodeFlow() { throw new Error('Device flow forbidden'); } }),
    './pkce.js': synthetic({ generatePKCE: async () => ({ verifier: 'synthetic', challenge: 'synthetic' }) }),
  };
  await codex.link(spec => {
    if (!dependencies[spec]) throw new Error(`Unexpected Codex import: ${spec}`);
    return dependencies[spec];
  });
  await codex.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  return { callback: callback.namespace, codex: codex.namespace.openaiCodexOAuth, servers, timers };
}
const options = signal => ({ providerName: 'Synthetic', host: '127.0.0.1', port: 0, path: '/auth/callback', state: 'synthetic-state', complete: async code => code, signal });
let passed = 0;
async function probe(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await probe('binding failure is swallowed; auth URL and manual prompt still emitted', async () => {
  const h = await harness({ bindError: true });
  const notices = [], prompts = [];
  await assert.rejects(h.codex.login({
    notify: notice => { notices.push(notice.type); },
    prompt: async prompt => {
      prompts.push(prompt.type);
      if (prompt.type === 'select') return 'browser';
      throw new Error('synthetic manual refusal');
    },
  }), /synthetic manual refusal/);
  assert.deepEqual(notices, ['auth_url']);
  assert.deepEqual(prompts, ['select', 'manual_code']);
});
await probe('rejecting manual input also cancels a successfully bound callback', async () => {
  const h = await harness();
  await assert.rejects(h.codex.login({ notify() {}, prompt: async p => {
    if (p.type === 'select') return 'browser';
    throw new Error('synthetic manual refusal');
  } }), /synthetic manual refusal/);
  assert.equal(h.servers[0].listening, false);
});
await probe('abort during listen is missed until explicit close (characterization)', async () => {
  const controller = new AbortController();
  const h = await harness({ abortDuringListen: controller });
  const callback = await h.callback.startOAuthCallbackServer(options(controller.signal));
  let settled = false;
  callback.wait().then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.signal.aborted, true);
  assert.equal(settled, false);
  assert.equal(h.servers[0].listening, true);
  callback.close();
  await assert.rejects(callback.wait(), /closed/);
  assert.equal(h.servers[0].listening, false);
});
await probe('throwing auth_url notification escapes before finally cleanup (characterization)', async () => {
  const h = await harness();
  await assert.rejects(h.codex.login({ notify() { throw new Error('synthetic opener failure'); }, prompt: async () => 'browser' }), /synthetic opener failure/);
  assert.equal(h.servers[0].listening, true);
  // Only the mock server exists; remove simulated resource after observation.
  h.servers[0].close();
});
await probe('state mismatch rejected; valid callback succeeds; explicit close releases', async () => {
  const h = await harness();
  const callback = await h.callback.startOAuthCallbackServer(options());
  async function request(url) {
    let status;
    await new Promise(resolve => h.servers[0].handler({ method: 'GET', url }, {
      writeHead(code) { status = code; }, end() { resolve(); },
    }));
    return status;
  }
  assert.equal(await request('/auth/callback?state=wrong&code=synthetic'), 400);
  assert.equal(await request('/auth/callback?state=synthetic-state'), 400);
  assert.equal(await request('/auth/callback?state=synthetic-state&code=synthetic'), 200);
  assert.equal(await callback.wait(), 'synthetic');
  callback.close();
  assert.equal(h.servers[0].listening, false);
});
await probe('helper timeout rejects wait but requires caller close', async () => {
  const h = await harness();
  const callback = await h.callback.startOAuthCallbackServer({ ...options(), timeoutMs: 1 });
  h.timers[0]();
  await assert.rejects(callback.wait(), /timed out/);
  assert.equal(h.servers[0].listening, true);
  callback.close();
  assert.equal(h.servers[0].listening, false);
});
console.log(`${passed} characterization probes passed; this confirms observed limitations, NOT strict acceptance.`);
