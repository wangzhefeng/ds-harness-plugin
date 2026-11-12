import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('generated artifact is a lazy factory with only React import and no Host code', async () => {
  await import('../scripts/build.mjs');
  const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');
  let registration;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { registration = value; } } } });
  assert.equal(registration.id, '@wangzf/dsh-openai-codex-oauth');
  const imports = [];
  const plugin = registration.factory(name => { imports.push(name); return {}; });
  assert.deepEqual(imports, ['react']);
  assert.deepEqual([...plugin.inject], ['slots', 'locale']);
  assert.equal(typeof plugin.apply, 'function'); // Does not render or mount a component.
  assert.doesNotMatch(source, /node:|execFile|readRecord|modifyRecord|access_token|refresh_token|accountId|oauth\/authorize|app\.asar/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|dangerouslySetInnerHTML/);
  // Scoped compact styling; semantic alerts/focus rings remain independent of text color.
  assert.match(source, /font-size:12px/);
  assert.match(source, /\.wz-codex button\{height:28px;line-height:18px/);
  assert.match(source, /\.wz-codex \.muted,\.wz-codex \.warn,\.wz-codex \.error\{color:var\(--dsw-alias-label-secondary\)/);
  assert.doesNotMatch(source, /--dsw-alias-label-primary|--dsw-alias-state-error-primary|--dsw-alias-state-warn-primary/);
  assert.match(source, /role: 'alert'/);
  assert.match(source, /focus-visible/);
  assert.match(source, /h\('details', null,/); // No open prop: collapsed on mount.
  assert.match(source, /h\('summary', null, t\('authorizationSettings'\)\)/);
  assert.match(source, /\.wz-codex\.wz-codex-fold\{padding:0\}/);
  assert.doesNotMatch(source, /onToggle:/); // Disclosure must not invoke authorization actions.
});
