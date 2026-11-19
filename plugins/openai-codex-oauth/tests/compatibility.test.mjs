import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import semver from 'semver';
import { apply, inject } from '../src/index.js';

test('DSH loader range admits the reviewed releases and later 0.2.2 RCs only within the bound', async () => {
  const { engines } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  // dsh-app-boot/src/plugin-compatibility.ts (Desktop rc.5).
  for (const [expected, versions] of [
    [true, ['0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.5', '0.2.2-rc.6', '0.2.2-rc.10']],
    [false, ['0.2.2-rc.1', '0.2.2-rc.4', '0.2.2', '0.2.3-rc.1']],
  ]) for (const version of versions) {
    assert.equal(semver.satisfies(version, engines.dsh, { includePrerelease: true }), expected, version);
  }
});

test('missing Host services or required methods never expose a login route', () => {
  let routes = 0;
  const noop = () => {};
  const services = { authorization: { describe: noop, begin: assert.fail }, credentials: { describeRecord: noop },
    llm: { listConfigurableProviders: noop }, settings: { describe: noop }, connection: { requestRejection: noop, admit: noop },
    webServer: { register: () => { routes++; }, getOrigin: noop } };
  assert.deepEqual(inject.slice().sort(), Object.keys(services).sort());
  for (const [key, service] of Object.entries(services)) {
    for (const missing of [undefined, ...Object.keys(service)]) {
      const ctx = { ...services, effect: fn => fn(), [key]: missing ? { ...service, [missing]: undefined } : undefined };
      assert.throws(() => apply(ctx), /^Error: UNAVAILABLE$/);
    }
  }
  assert.equal(routes, 0);
});
