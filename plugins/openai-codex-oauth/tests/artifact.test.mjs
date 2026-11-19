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
  assert.match(source, /\.wz-codex button\{[^\n]*height:28px;padding:0 10px;border:0\.5px solid var\(--dsw-alias-border-l3\)/);
  assert.match(source, /color:var\(--dsw-alias-label-primary\);background:transparent/);
  assert.match(source, /\.wz-codex \.muted,\.wz-codex \.warn,\.wz-codex \.error\{color:var\(--dsw-alias-label-secondary\)/);
  assert.doesNotMatch(source, /--dsw-alias-state-error-primary|--dsw-alias-state-warn-primary/);
  assert.match(source, /role: 'alert'/);
  assert.match(source, /focus-visible/);
  // rc.3's installed Desktop guide requires custom overlays to own no-drag bounds.
  assert.match(source, /h\('dialog', \{ ref: dialog, 'data-window-drag-exclude': ''/);
  assert.match(source, /\.wz-codex-entry\{display:flex;align-items:center;gap:8px;min-height:28px\}/);
  assert.match(source, /\.wz-codex-login-group\[hidden\]\{display:none\}/);
  assert.match(source, /\[expanded, setExpanded\] = React.useState\(false\)/);
  assert.match(source, /'aria-expanded': expanded, 'aria-controls':/);
  assert.match(source, /onClick: \(\) => setExpanded\(value => !value\)/);
  assert.match(source, /hidden: !expanded/);
  assert.match(source, /onClick: active \? \(\) => setOpen\(true\) : begin/);
  assert.doesNotMatch(source, /h\('details'|h\('summary'|t\('reauthorize'\)|t\('authorizationSettings'\)/);
  // The owner card controls/DOM are not relocated or overlaid.
  assert.doesNotMatch(source, /querySelector|createPortal|position:absolute|margin-top:-/);
  const cardBody = source.split('function Panel()')[1].split("h('dialog'")[0];
  assert.equal((cardBody.match(/h\('button'/g) ?? []).length, 2); // Disclosure + hidden login, not extra business actions.
  assert.match(cardBody, /t\('login'\)/);
  const zh = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8'));
  assert.equal(zh.ui.login, '登录');
});
