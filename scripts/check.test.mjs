import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, checkWorkspace } from './check.mjs';
import { fileURLToPath } from 'node:url';

const valid = () => ({
  name: '@local/test-fixture', version: '0.1.0', private: true, type: 'module',
  engines: { dsh: '0.2.2-rc.2' },
  dsh: { bundle: { patch: './cordis.patch.yml' } },
  files: ['index.js', 'cordis.patch.yml'],
  scripts: { check: 'node --check index.js', test: 'node --test', build: 'node --check index.js' },
});

test('accepts repository manifest conventions', () => {
  assert.deepEqual(validateManifest(valid()), []);
});
test('rejects missing required metadata', () => {
  assert.ok(validateManifest({}).length >= 8);
});
test('rejects absolute and escaping patch paths', () => {
  for (const patch of ['/tmp/patch.yml', '../patch.yml', './nested/../../patch.yml']) {
    const manifest = valid();
    manifest.dsh.bundle.patch = patch;
    assert.ok(validateManifest(manifest).some(error => error.includes('package-local')));
  }
});
test('requires explicit publication review', () => {
  const manifest = valid();
  manifest.private = false;
  assert.ok(validateManifest(manifest).some(error => error.includes('private')));
});
test('requires per-plugin validation commands', () => {
  const manifest = valid();
  delete manifest.scripts.test;
  assert.ok(validateManifest(manifest).includes('scripts.test is required'));
});
test('checks the actual workspace', async () => {
  assert.equal(typeof await checkWorkspace(fileURLToPath(new URL('../', import.meta.url))), 'number');
});
