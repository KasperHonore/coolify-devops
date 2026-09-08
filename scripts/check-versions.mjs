#!/usr/bin/env node
// Every version the library states must equal package.json's: the plugin manifest,
// each skill's metadata.version, and a CHANGELOG.md entry. Fails with the list to fix.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const wrong = [];

const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'));
if (plugin.version !== version) wrong.push(`.claude-plugin/plugin.json: ${plugin.version}`);

for (const name of readdirSync(join(root, 'skills'))) {
  const file = join(root, 'skills', name, 'SKILL.md');
  const src = readFileSync(file, 'utf8');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const found = fm.match(/^\s+version:\s*"?([^"\n]+)"?\s*$/m)?.[1];
  if (found !== version) wrong.push(`skills/${name}/SKILL.md: ${found ?? 'missing'}`);
  const declared = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (declared !== name) wrong.push(`skills/${name}/SKILL.md: name "${declared}" != directory`);
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
if (!new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b`, 'm').test(changelog)) wrong.push(`CHANGELOG.md: no "## ${version}" entry`);

if (wrong.length) {
  console.error(`package.json is ${version}; out of sync:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
console.log(`All versions are ${version}`);
