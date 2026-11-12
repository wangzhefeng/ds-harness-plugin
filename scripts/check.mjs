import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Repository conventions, not a replacement for DSH's runtime validation.
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest.name || typeof manifest.name !== 'string') errors.push('name is required');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? '')) errors.push('version must be an explicit version');
  if (manifest.private !== true) errors.push('private must remain true until publication is reviewed');
  if (manifest.type !== 'module') errors.push('type must be module');
  if (!manifest.engines?.dsh) errors.push('engines.dsh must declare the reviewed compatibility range');
  const patch = manifest.dsh?.bundle?.patch;
  if (typeof patch !== 'string' || !patch.startsWith('./') || patch.split(/[\\/]/).includes('..')) {
    errors.push('dsh.bundle.patch must be a package-local ./ path');
  }
  for (const script of ['check', 'test', 'build']) {
    if (typeof manifest.scripts?.[script] !== 'string' || !manifest.scripts[script].trim()) errors.push(`scripts.${script} is required`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) errors.push('files must explicitly list distribution resources');
  return errors;
}

async function requireFile(root, name) {
  const path = resolve(root, name);
  const rel = relative(root, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Path escapes package: ${name}`);
  let cursor = root;
  for (const part of rel.split(/[\\/]/)) {
    cursor = resolve(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error(`Symlink not permitted in required resource: ${name}`);
  }
  if (!(await lstat(path)).isFile()) throw new Error(`Not a regular file: ${name}`);
}

export async function checkWorkspace(root) {
  const entries = await readdir(resolve(root, 'plugins'), { withFileTypes: true });
  let count = 0;
  const names = new Set();
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Plugin symlinks are not supported: ${entry.name}`);
    if (!entry.isDirectory()) continue;
    const directory = resolve(root, 'plugins', entry.name);
    await requireFile(directory, 'package.json');
    const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    const errors = validateManifest(manifest);
    if (names.has(manifest.name)) errors.push('duplicate package name');
    names.add(manifest.name);
    if (errors.length) throw new Error(`${entry.name}: ${errors.join('; ')}`);
    await requireFile(directory, manifest.dsh.bundle.patch);
    await requireFile(directory, 'README.md');
    count++;
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const count = await checkWorkspace(root);
  console.log(`Workspace conventions passed: ${count} plugin package(s).`);
  if (!count) console.log('No plugins yet; this does not verify DSH runtime compatibility.');
}
