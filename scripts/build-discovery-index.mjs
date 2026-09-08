#!/usr/bin/env node
// Build an Agent Skills discovery index (dist/index.json) and one artifact per skill
// from the committed tree, the way vercel-labs/agent-skills does. A skill that is only
// a SKILL.md ships as that file; anything larger ships as a reproducible tar.gz built
// from git so the digest is stable across machines. Zero dependencies.
//
//   node scripts/build-discovery-index.mjs <artifact-base-url>
//
// Works both in the public repo (skills/ at the root) and inside the deployment repo
// (library/skills/): the git prefix is read from the working directory.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const baseUrl = process.argv[2];
const out = 'dist';
if (!baseUrl) throw new Error('Usage: node scripts/build-discovery-index.mjs <artifact-base-url>');

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });
const prefix = git(['rev-parse', '--show-prefix']).trim();           // '' or 'library/'
const top = git(['rev-parse', '--show-toplevel']).trim();            // git archive scopes to cwd; run it from the top
const skillsPath = `${prefix}skills`;
const fixedDate = {
  ...process.env,
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  GIT_AUTHOR_NAME: 'Agent Skills', GIT_COMMITTER_NAME: 'Agent Skills',
  GIT_AUTHOR_EMAIL: 'agent-skills@invalid', GIT_COMMITTER_EMAIL: 'agent-skills@invalid',
};

// Minimal frontmatter read: only name and description are needed, both single-line.
const readMetadata = (dir) => {
  const path = `${skillsPath}/${dir}/SKILL.md`;
  const src = git(['show', `HEAD:${path}`]);
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!fm) throw new Error(`Missing frontmatter in ${path}`);
  const field = (k) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '');
  const name = field('name');
  const description = field('description');
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) throw new Error(`Invalid name in ${path}`);
  if (!description || description.length > 1024) throw new Error(`Invalid description in ${path}`);
  if (name !== dir) throw new Error(`${path}: name "${name}" must equal its directory`);
  return { name, description };
};

const artifact = (dir) => {
  const entries = git(['ls-tree', '--full-tree', '-r', `HEAD:${skillsPath}/${dir}`]).trim().split('\n');
  if (entries.some((e) => !/^100(?:644|755) blob /.test(e))) throw new Error(`Unsupported entry in ${skillsPath}/${dir}`);
  const files = entries.map((e) => e.slice(e.indexOf('\t') + 1));
  if (files.length === 1 && files[0] === 'SKILL.md') {
    return { content: execFileSync('git', ['show', `HEAD:${skillsPath}/${dir}/SKILL.md`]), ext: 'md', type: 'skill-md' };
  }
  const tree = git(['rev-parse', `HEAD:${skillsPath}/${dir}`]).trim();
  const commit = git(['commit-tree', tree], { env: fixedDate, input: 'Agent Skills archive\n' }).trim();
  const tar = execFileSync('git', ['archive', '--format=tar', commit], { cwd: top });
  return { content: execFileSync('gzip', ['-n', '-9', '-c'], { input: tar }), ext: 'tar.gz', type: 'archive' };
};

rmSync(out, { force: true, recursive: true });
mkdirSync(out);
const dirs = git(['ls-tree', '--full-tree', '-d', '--name-only', `HEAD:${skillsPath}`]).trim().split('\n');
const skills = dirs.map((dir) => {
  const meta = readMetadata(dir);
  const a = artifact(dir);
  const filename = `${meta.name}.${a.ext}`;
  writeFileSync(join(out, filename), a.content);
  return {
    ...meta, type: a.type,
    url: `${baseUrl.replace(/\/$/, '')}/${filename}`,
    digest: `sha256:${createHash('sha256').update(a.content).digest('hex')}`,
  };
}).sort((x, y) => x.name.localeCompare(y.name));
if (new Set(skills.map((s) => s.name)).size !== skills.length) throw new Error('Skill names must be unique');
writeFileSync(join(out, 'index.json'), `${JSON.stringify({ $schema: schema, skills }, null, 2)}\n`);
console.log(`Built ${skills.length} skills into ${out}/`);
