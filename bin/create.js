#!/usr/bin/env node
'use strict';

// Scaffold a Claude Code deployment repo for operating a Coolify server through the
// Coolify MCP. Zero dependencies on purpose: this runs via `npx` on a machine that
// has nothing installed yet.
//
//   npx coolify-devops [target-dir] [options]
//
// Options:
//   --yes                   accept defaults, leave unknown bindings as placeholders
//   --coolify-url=X         https://coolify.example.com (not secret; the token stays in your shell)
//   --internal-suffix=X     tailnet domain, e.g. example-name.ts.net
//   --public-suffix=X       public wildcard domain, e.g. apps.example.com ("" = no public lane)
//   --same-tailnet          the machine running Claude Code is on the Coolify host's tailnet
//   --canary=X              reference internal service (default whoami)
//   --backups=X             recommend-but-no | required (default recommend-but-no)
//   --branch=X              commit branch (default main)
//   --no-git                skip git init + initial commit
//   --render                (maintainers) re-render ./CLAUDE.md and ./docs/<runbooks> from library/ + ./instance.yaml
//   --help

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(PKG_ROOT, 'template');

// ---------- tiny helpers (no deps) ----------

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--same-tailnet') out.sameTailnet = true;
    else if (a === '--no-git') out.noGit = true;
    else if (a === '--render') out.render = true;
    else if (a.startsWith('--') && a.includes('=')) {
      const [k, ...v] = a.slice(2).split('=');
      out[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.join('=');
    } else if (a.startsWith('--')) {
      out[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    } else out._.push(a);
  }
  return out;
}

// Minimal YAML reader for instance.yaml's shape: two levels, scalars, `# comments`.
function readInstanceYaml(file) {
  const doc = {};
  let section = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '');
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    const nested = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      const [, k, v] = top;
      if (v === '') { section = k; doc[k] = doc[k] || {}; }
      else { section = null; doc[k] = unquote(v); }
    } else if (nested && section) {
      doc[section][nested[1]] = unquote(nested[2]);
    }
  }
  return doc;
}
function unquote(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === '~' || v === 'null') return '';
  return v;
}

// {{KEY}} substitution, {{#KEY}}…{{/KEY}} kept when truthy, {{^KEY}}…{{/KEY}} kept when falsy.
function render(tpl, vars) {
  const block = /\{\{([#^])([A-Z_]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
  let out = tpl;
  let prev;
  do {
    prev = out;
    out = out.replace(block, (_, mode, key, body) => {
      const truthy = Boolean(vars[key]);
      return (mode === '#') === truthy ? body : '';
    });
  } while (out !== prev);
  return out.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

function varsFromInstance(inst) {
  const d = inst.domains || {}, p = inst.projects || {}, pl = inst.plumbing || {}, po = inst.policy || {};
  const internal = d.internal_suffix || '';
  const pub = d.public_suffix || '';
  return {
    INTERNAL_SUFFIX: internal || '<your-tailnet>.ts.net',
    PUBLIC_SUFFIX: pub || '<public-suffix>',
    HAS_PUBLIC: Boolean(pub),
    SAME_TAILNET: Boolean(internal) && d.operator_tailnet === internal,
    PROJECT_INTERNAL: p.internal || 'Internal tools',
    PROJECT_PUBLIC: p.public || 'Public tools',
    PROJECT_INFRA: p.infrastructure || 'Infrastructure',
    ENVIRONMENT: inst.environment || 'production',
    CANARY: inst.canary || 'whoami',
    REGISTRAR: pl.tailnet_registrar || 'docktail',
    PUBLIC_DNS: pl.public_dns || 'cloudflare-ddns',
    COMMIT_BRANCH: po.commit_branch || 'main',
    BACKUPS_DEFAULT: po.backups_default || 'recommend-but-no',
    OPERATOR_TAILNET: d.operator_tailnet || '',
    VERSION_OBSERVED: (inst.coolify && inst.coolify.version_observed) || '',
    MCP_SERVER: (inst.coolify && inst.coolify.mcp_server) || 'coolify',
    COOLIFY_URL: (inst.coolify && inst.coolify.url) || '',
  };
}

async function ask(rl, question, def) {
  const suffix = def ? ` [${def}]` : '';
  const a = (await rl.question(`${question}${suffix}: `)).trim();
  return a === '' ? (def || '') : a;
}
async function askYesNo(rl, question, def) {
  const a = (await rl.question(`${question} ${def ? '[Y/n]' : '[y/N]'}: `)).trim().toLowerCase();
  if (a === '') return def;
  return a === 'y' || a === 'yes';
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  return r.status === 0;
}

function has(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// The runbooks in docs/ are templates: rendered with the instance's bindings so a
// deployment repo reads as its own, never as the library author's.
const RUNBOOK_BANNER = '<!-- Rendered from library/docs/%s by `npm run render`. Edit the source, not this file. -->\n\n';
function renderRunbooks(targetDocs, vars) {
  fs.mkdirSync(targetDocs, { recursive: true });
  for (const f of fs.readdirSync(path.join(PKG_ROOT, 'docs'))) {
    if (!f.endsWith('.md')) continue;
    const body = render(fs.readFileSync(path.join(PKG_ROOT, 'docs', f), 'utf8'), vars);
    fs.writeFileSync(path.join(targetDocs, f), (vars.IS_LIBRARY ? RUNBOOK_BANNER.replace('%s', f) : '') + body);
  }
}

// ---------- maintainer mode: re-render this repo's CLAUDE.md and runbooks ----------

function renderMode() {
  const cwd = process.cwd();
  const inst = readInstanceYaml(path.join(cwd, 'instance.yaml'));
  const tpl = fs.readFileSync(path.join(TEMPLATE_DIR, 'CLAUDE.md'), 'utf8');
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: fs.existsSync(path.join(cwd, '.mcp.json')), IS_LIBRARY: true };
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), render(tpl, vars));
  renderRunbooks(path.join(cwd, 'docs'), vars);
  console.log('Rendered CLAUDE.md and docs/ runbooks from library/ + instance.yaml');
}

// ---------- scaffold ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    return;
  }
  if (args.render) return renderMode();

  const target = path.resolve(process.cwd(), args._[0] || 'coolify-devops');
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    console.error(`Refusing to scaffold into a non-empty directory: ${target}`);
    process.exit(1);
  }

  // Interview — only the bindings that a shell can know. /setup does the rest
  // (it verifies the MCP, creates projects, deploys plumbing and canary).
  let internal = args.internalSuffix, pub = args.publicSuffix, same = Boolean(args.sameTailnet);
  let canary = args.canary || 'whoami', branch = args.branch || 'main';
  let coolifyUrl = args.coolifyUrl, backups = args.backups || 'recommend-but-no';
  let projInternal = 'Internal tools', projPublic = 'Public tools', projInfra = 'Infrastructure';
  if (!args.yes && process.stdin.isTTY) {
    const { createInterface } = require('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nInstance bindings (Enter to accept a default; leave blank to fill in later with /setup)\n');
    coolifyUrl = coolifyUrl ?? await ask(rl, 'Coolify URL (e.g. https://coolify.example.com; the token is never asked for)', '');
    internal = internal ?? await ask(rl, 'Tailnet domain of the Coolify host (e.g. example-name.ts.net)', '');
    pub = pub ?? await ask(rl, 'Public wildcard domain, if you want a public lane (e.g. apps.example.com)', '');
    same = args.sameTailnet ?? await askYesNo(rl, 'Is the machine you run Claude Code from on that same tailnet?', false);
    projInternal = await ask(rl, 'Coolify project for tailnet-only resources', projInternal);
    projPublic = await ask(rl, 'Coolify project for internet-reachable resources', projPublic);
    projInfra = await ask(rl, 'Coolify project for platform plumbing', projInfra);
    canary = await ask(rl, 'Canary service name (reference internal service)', canary);
    backups = (await askYesNo(rl, 'Require a backup for every stateful resource? (No = recommend, record the decision, default no)', false)) ? 'required' : 'recommend-but-no';
    branch = await ask(rl, 'Commit branch', branch);
    rl.close();
  }
  internal = internal || '';
  pub = pub || '';
  coolifyUrl = (coolifyUrl || '').replace(/\/+$/, '');

  const inst = {
    coolify: { mcp_server: 'coolify', url: coolifyUrl, version_observed: '' },
    domains: { internal_suffix: internal, public_suffix: pub, operator_tailnet: same ? internal : '' },
    projects: { internal: projInternal, public: projPublic, infrastructure: projInfra },
    environment: 'production',
    canary,
    plumbing: { tailnet_registrar: 'docktail', public_dns: 'cloudflare-ddns' },
    policy: { backups_default: backups, write_path: 'coolify-via-mcp', commit_branch: branch },
  };
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: true };
  // instance.yaml is YAML, so empty strings must be quoted there.
  const yamlVars = { ...vars, INTERNAL_SUFFIX: internal || '""', PUBLIC_SUFFIX: pub || '""', OPERATOR_TAILNET: (same ? internal : '') || '""', COOLIFY_URL: coolifyUrl || '""' };

  fs.mkdirSync(target, { recursive: true });

  // 1. Skills copied as-is; runbooks rendered for this instance.
  fs.cpSync(path.join(PKG_ROOT, 'skills'), path.join(target, '.claude', 'skills'), { recursive: true });
  renderRunbooks(path.join(target, 'docs'), vars);
  fs.mkdirSync(path.join(target, 'stacks'), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE_DIR, 'stacks-README.md'), path.join(target, 'stacks', 'README.md'));

  // 2. Instance files, rendered.
  const write = (rel, content) => {
    const p = path.join(target, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write('CLAUDE.md', render(fs.readFileSync(path.join(TEMPLATE_DIR, 'CLAUDE.md'), 'utf8'), vars));
  write('instance.yaml', render(fs.readFileSync(path.join(TEMPLATE_DIR, 'instance.yaml'), 'utf8'), yamlVars));
  write('.mcp.json', fs.readFileSync(path.join(TEMPLATE_DIR, 'mcp.json'), 'utf8'));
  write('.gitignore', fs.readFileSync(path.join(TEMPLATE_DIR, '_gitignore'), 'utf8'));
  write('README.md', render(fs.readFileSync(path.join(TEMPLATE_DIR, 'README.md'), 'utf8'), vars));
  // Instance-state skeletons: portable docs never carry state, so these start empty.
  for (const f of fs.readdirSync(path.join(TEMPLATE_DIR, 'docs'))) {
    write(path.join('docs', f), render(fs.readFileSync(path.join(TEMPLATE_DIR, 'docs', f), 'utf8'), vars));
  }

  // 3. Git.
  let gitDone = false;
  if (!args.noGit && has('git')) {
    gitDone = run('git', ['init', '-q', '-b', branch], target)
      && run('git', ['add', '-A'], target)
      && run('git', ['-c', 'user.name=coolify-devops', '-c', 'user.email=coolify-devops@localhost', 'commit', '-q', '-m', 'Scaffold deployment repo with coolify-devops'], target);
  }

  const rel = path.relative(process.cwd(), target) || '.';
  console.log(`
Created ${rel}/
  CLAUDE.md          operating rules for every Claude Code session
  instance.yaml      your bindings${internal ? '' : ' (blank — /setup fills them)'}
  .mcp.json          Coolify MCP wiring; reads COOLIFY_BASE_URL and COOLIFY_ACCESS_TOKEN from your shell
  .claude/skills/    /setup /host /change-service /health /grant-access
  docs/              runbooks and state files, rendered for your instance
  stacks/README.md   what reference copies are; the change lore is docs/changing-a-resource.md
${gitDone ? '  git: initialised on ' + branch + ' with an initial commit' : '  git: not initialised (run git init yourself)'}

Next
  1. In the shell you will run Claude Code from — never in a file in the repo:
       export COOLIFY_BASE_URL=https://coolify.example.com
       export COOLIFY_ACCESS_TOKEN=...      # read + write + deploy scopes; never root
  2. cd ${rel} && claude
     Approve the project MCP server when asked, then run /mcp to confirm it connected.
  3. /setup
     Verifies the MCP, creates the projects, deploys the tailnet registrar and the canary,
     and fills the two state files in docs/.

Have ready before /setup: the Coolify host joined to your tailnet, a Tailscale OAuth
client with devices:core + services scopes, and — public lane only — a Cloudflare DNS
token. docs/tailnet-access.md and docs/internal-services.md explain each.
`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
