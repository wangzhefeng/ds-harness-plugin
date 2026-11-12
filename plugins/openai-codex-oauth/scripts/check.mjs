import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'No symlinks in package source');
    if (entry.isDirectory()) out.push(...await files(file)); else out.push(file);
  }
  return out;
}
for (const folder of ['src', 'scripts', 'tests']) for (const file of await files(path.join(root, folder))) {
  if (!/\.(js|mjs)$/.test(file)) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path.relative(root, file)}: ${result.stderr}`);
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(manifest.private, true); assert.equal(manifest.engines.dsh, '0.2.2-rc.2');
assert.equal(manifest.dsh.client.platform, 'web'); assert.equal(manifest.dependencies, undefined);
const en = JSON.parse(await readFile(path.join(root, 'locale/en.json'), 'utf8'));
const zh = JSON.parse(await readFile(path.join(root, 'locale/zh.json'), 'utf8'));
assert.deepEqual(Object.keys(en.ui).sort(), Object.keys(zh.ui).sort());
for (const dict of [en, zh]) { assert.ok(dict.meta.title); assert.ok(dict.meta.description); for (const value of Object.values(dict.ui)) assert.equal(typeof value, 'string'); }
for (const target of ['src/index.js', 'cordis.patch.yml', 'README.md', 'TESTING.md', 'icon.svg']) assert.ok((await lstat(path.join(root, target))).isFile());
const icon = await readFile(path.join(root, 'icon.svg'), 'utf8');
assert.match(icon, /viewBox="0 0 36 36"/); assert.ok(Buffer.byteLength(icon) < 256 * 1024);
assert.doesNotMatch(icon, /<script|<image|<style|<foreignObject|\bon\w+=|href=/i);
for (const file of await files(path.join(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /\/Applications\/|app\.asar|\.credentials\.yaml|console\.|localStorage|sessionStorage/);
  if (file.includes(`${path.sep}client${path.sep}`)) assert.doesNotMatch(source, /node:|@earendil|require\(['"]@deepseek/);
}
console.log('Plugin sources, syntax, bilingual metadata, icon constraints and sensitive-boundary checks passed.');
