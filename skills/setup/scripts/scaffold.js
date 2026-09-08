#!/usr/bin/env node
'use strict';

// Scaffold a Claude Code deployment repo for operating a Coolify server through the
// Coolify MCP, or re-render one from its instance.yaml. Bundled with the /setup skill
// and run by it — the skill asks the interview questions, then passes the answers as
// flags. Zero dependencies on purpose: it runs on a machine that has nothing but node.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/scaffold.js [target-dir] [options]
//
// Options:
//   --yes                   accept defaults for anything not given as a flag (non-interactive; always on)
//   --coolify-url=X         https://coolify.example.com (not secret; the token stays in your shell)
//   --internal-suffix=X     tailnet domain, e.g. example-name.ts.net
//   --public-suffix=X       public wildcard domain, e.g. apps.example.com ("" = no public lane)
//   --no-public             no public lane: internal tools only (the default under --yes)
//   --dns-provider=X        cloudflare | duckdns — who holds the public wildcard record (default: by suffix)
//   --coolify-ui=X          tailnet | github | internet — who may reach the Coolify dashboard, port 8000
//                           (default github: tailnet + GitHub's webhook ranges, so push-to-deploy works)
//   --host-provider=X       hetzner | other — whose cloud firewall the provisioning runbook addresses
//   --on-host               Claude Code runs ON the Coolify host itself (the usual case; implies --same-tailnet)
//   --same-tailnet          Claude Code runs elsewhere, on a machine that is on the Coolify host's tailnet
//   --canary=X              reference internal service (default whoami)
//   --backups=X             recommend-but-no | required (default recommend-but-no)
//   --branch=X              commit branch (default main)
//   --no-git                skip git init + initial commit
//   --render                re-render ./CLAUDE.md and the runbooks in ./docs/ from ./instance.yaml
//                           (after `npx skills update`, or after editing instance.yaml); never
//                           touches the state files docs/infrastructure.md and docs/tailnet-state.md
//   --help

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(SKILL_ROOT, 'assets');
// Everything in assets/docs/ is a runbook template except these two, which are
// instance-state skeletons: written once at scaffold time, never re-rendered.
const STATE_SKELETONS = new Set(['infrastructure.md', 'tailnet-state.md']);

// ---------- tiny helpers (no deps) ----------

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--same-tailnet') out.sameTailnet = true;
    else if (a === '--on-host') out.onHost = true;
    else if (a === '--no-public') out.noPublic = true;
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

const UI_EXPOSURES = ['tailnet', 'github', 'internet'];
const DNS_PROVIDERS = ['cloudflare', 'duckdns'];
const HOST_PROVIDERS = ['hetzner', 'other'];
const dnsProviderFor = suffix => (/\.duckdns\.org$/i.test(suffix || '') ? 'duckdns' : 'cloudflare');
const pinnerNameFor = provider => (provider === 'duckdns' ? 'duckdns' : 'cloudflare-ddns');

function varsFromInstance(inst) {
  const d = inst.domains || {}, p = inst.projects || {}, pl = inst.plumbing || {}, po = inst.policy || {};
  const ex = inst.exposure || {}, host = inst.host || {}, op = inst.operator || {};
  const onHost = String(op.on_host) === 'true';
  const internal = d.internal_suffix || '';
  const pub = d.public_suffix || '';
  const dnsProvider = pl.public_dns_provider || dnsProviderFor(pub);
  const ui = UI_EXPOSURES.includes(ex.coolify_ui) ? ex.coolify_ui : 'github';
  const hostProvider = HOST_PROVIDERS.includes(host.provider) ? host.provider : 'hetzner';
  return {
    INTERNAL_SUFFIX: internal || '<your-tailnet>.ts.net',
    PUBLIC_SUFFIX: pub || '<public-suffix>',
    HAS_PUBLIC: Boolean(pub),
    DNS_PROVIDER: dnsProvider,
    DNS_CLOUDFLARE: dnsProvider === 'cloudflare',
    DNS_DUCKDNS: dnsProvider === 'duckdns',
    UI_EXPOSURE: ui,
    UI_TAILNET: ui === 'tailnet',
    UI_GITHUB: ui === 'github',
    UI_INTERNET: ui === 'internet',
    HOST_PROVIDER: hostProvider,
    HOST_HETZNER: hostProvider === 'hetzner',
    ON_HOST: onHost,
    SAME_TAILNET: onHost || (Boolean(internal) && d.operator_tailnet === internal),
    PROJECT_INTERNAL: p.internal || 'Internal tools',
    PROJECT_PUBLIC: p.public || 'Public tools',
    PROJECT_INFRA: p.infrastructure || 'Infrastructure',
    ENVIRONMENT: inst.environment || 'production',
    CANARY: inst.canary || 'whoami',
    REGISTRAR: pl.tailnet_registrar || 'docktail',
    PUBLIC_DNS: pl.public_dns || pinnerNameFor(dnsProvider),
    COMMIT_BRANCH: po.commit_branch || 'main',
    BACKUPS_DEFAULT: po.backups_default || 'recommend-but-no',
    OPERATOR_TAILNET: d.operator_tailnet || '',
    VERSION_OBSERVED: (inst.coolify && inst.coolify.version_observed) || '',
    MCP_SERVER: (inst.coolify && inst.coolify.mcp_server) || 'coolify',
    COOLIFY_URL: (inst.coolify && inst.coolify.url) || '',
  };
}

function checkChoice(name, value, choices) {
  if (value !== undefined && !choices.includes(value)) {
    console.error(`--${name} must be one of: ${choices.join(', ')}`);
    process.exit(1);
  }
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  return r.status === 0;
}

function has(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// The runbooks in assets/docs/ are templates: rendered with the instance's bindings so
// a deployment repo reads as its own, never as the library author's.
const RUNBOOK_BANNER = '<!-- Rendered from library/skills/setup/assets/docs/%s by `npm run render`. Edit the source, not this file. -->\n\n';
function renderRunbooks(targetDocs, vars) {
  fs.mkdirSync(targetDocs, { recursive: true });
  for (const f of fs.readdirSync(path.join(TEMPLATE_DIR, 'docs'))) {
    if (!f.endsWith('.md') || STATE_SKELETONS.has(f)) continue;
    const body = render(fs.readFileSync(path.join(TEMPLATE_DIR, 'docs', f), 'utf8'), vars);
    fs.writeFileSync(path.join(targetDocs, f), (vars.IS_LIBRARY ? RUNBOOK_BANNER.replace('%s', f) : '') + body);
  }
}

// ---------- maintainer mode: re-render this repo's CLAUDE.md and runbooks ----------

function renderMode() {
  const cwd = process.cwd();
  const inst = readInstanceYaml(path.join(cwd, 'instance.yaml'));
  const tpl = fs.readFileSync(path.join(TEMPLATE_DIR, 'CLAUDE.md'), 'utf8');
  // IS_LIBRARY: the library author's own deployment repo, which carries library/ and
  // gets the "rendered from" banners; a consumer's repo does not.
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: fs.existsSync(path.join(cwd, '.mcp.json')), IS_LIBRARY: fs.existsSync(path.join(cwd, 'library', 'skills')) };
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), render(tpl, vars));
  renderRunbooks(path.join(cwd, 'docs'), vars);
  console.log(`Rendered CLAUDE.md and the runbooks in docs/ from instance.yaml${vars.IS_LIBRARY ? ' (library author mode)' : ''}`);
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
  // An empty dir, or one holding nothing but the skills install (.claude/, .agents/,
  // skills-lock.json, .git) — that is what a fresh `npx skills add` leaves behind.
  const harmless = new Set(['.claude', '.agents', 'skills-lock.json', '.git', '.gitignore', '.DS_Store']);
  if (fs.existsSync(target) && fs.readdirSync(target).some(f => !harmless.has(f))) {
    console.error(`Refusing to scaffold into a directory that already has content: ${target}`);
    process.exit(1);
  }

  // Bindings come in as flags; /setup asked the questions. Anything not given stays
  // blank ("" in instance.yaml) for /setup to fill after the MCP answers.
  const onHost = Boolean(args.onHost);
  let internal = args.internalSuffix, pub = args.publicSuffix, same = onHost || Boolean(args.sameTailnet);
  let canary = args.canary || 'whoami', branch = args.branch || 'main';
  let coolifyUrl = args.coolifyUrl, backups = args.backups || 'recommend-but-no';
  let projInternal = 'Internal tools', projPublic = 'Public tools', projInfra = 'Infrastructure';
  let dnsProvider = args.dnsProvider, uiExposure = args.coolifyUi, hostProvider = args.hostProvider;
  checkChoice('dns-provider', dnsProvider, DNS_PROVIDERS);
  checkChoice('coolify-ui', uiExposure, UI_EXPOSURES);
  checkChoice('host-provider', hostProvider, HOST_PROVIDERS);
  if (args.noPublic) pub = '';
  internal = internal || '';
  pub = pub || '';
  coolifyUrl = (coolifyUrl || '').trim().replace(/\/+$/, '');
  if (coolifyUrl && !/^https?:\/\//i.test(coolifyUrl)) coolifyUrl = 'http://' + coolifyUrl; // "localhost:8000" is a common answer
  dnsProvider = dnsProvider || dnsProviderFor(pub);
  uiExposure = uiExposure || 'github';
  hostProvider = hostProvider || 'hetzner';

  const inst = {
    coolify: { mcp_server: 'coolify', url: coolifyUrl, version_observed: '' },
    host: { provider: hostProvider },
    operator: { on_host: onHost },
    domains: { internal_suffix: internal, public_suffix: pub, operator_tailnet: same ? internal : '' },
    exposure: { coolify_ui: uiExposure },
    projects: { internal: projInternal, public: projPublic, infrastructure: projInfra },
    environment: 'production',
    canary,
    plumbing: { tailnet_registrar: 'docktail', public_dns: pinnerNameFor(dnsProvider), public_dns_provider: dnsProvider },
    policy: { backups_default: backups, write_path: 'coolify-via-mcp', commit_branch: branch },
  };
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: true };
  // instance.yaml is YAML, so empty strings must be quoted there.
  const yamlVars = { ...vars, INTERNAL_SUFFIX: internal || '""', PUBLIC_SUFFIX: pub || '""', OPERATOR_TAILNET: (same ? internal : '') || '""', COOLIFY_URL: coolifyUrl || '""', ON_HOST_YAML: String(onHost) };

  fs.mkdirSync(target, { recursive: true });

  // 1. Runbooks rendered for this instance. (The skills themselves are already in
  // place: `npx skills add` put them there, which is how this script got here.)
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
  for (const f of STATE_SKELETONS) {
    write(path.join('docs', f), render(fs.readFileSync(path.join(TEMPLATE_DIR, 'docs', f), 'utf8'), vars));
  }

  // 3. Git.
  let gitDone = false;
  if (!args.noGit && has('git')) {
    gitDone = (fs.existsSync(path.join(target, '.git')) || run('git', ['init', '-q', '-b', branch], target))
      && run('git', ['add', '-A'], target)
      && run('git', ['-c', 'user.name=coolify-devops', '-c', 'user.email=coolify-devops@localhost', 'commit', '-q', '-m', 'Scaffold deployment repo with coolify-devops'], target);
  }

  const rel = path.relative(process.cwd(), target) || '.';
  console.log(`
Scaffolded ${rel}/
  CLAUDE.md          operating rules for every Claude Code session
  instance.yaml      your bindings${internal ? '' : ' (blank — /setup fills them)'}
  .mcp.json          Coolify MCP wiring; reads COOLIFY_BASE_URL and COOLIFY_ACCESS_TOKEN from your shell
  docs/              runbooks and state files, rendered for your instance
  stacks/README.md   what reference copies are; the change lore is docs/changing-a-resource.md
${gitDone ? '  git: committed on ' + branch : '  git: not initialised (run git init yourself)'}
  lane: ${pub ? 'public lane on (' + pub + ', ' + dnsProvider + ')' : 'no public lane'}; dashboard reachable by: ${uiExposure}
  operated from: ${onHost ? 'the Coolify host itself' : same ? 'a machine on the same tailnet' : 'a machine off the tailnet'}

Human steps still ahead (the skill hands these over and verifies them):
  - docs/provisioning.md if the server, Tailscale, Coolify, or the firewall are not done yet
  - in the shell Claude Code runs from, never in a file:
       export COOLIFY_BASE_URL=${coolifyUrl || (onHost ? 'http://localhost:8000' : 'http://<tailnet-ip-of-the-host>:8000')}
       export COOLIFY_ACCESS_TOKEN=...      # read + write + deploy scopes; never root
    then restart claude so .mcp.json is picked up, and approve the project MCP server
  - a Tailscale OAuth client with devices:core + services scopes${pub ? ', and a ' + (dnsProvider === 'duckdns' ? 'DuckDNS token' : 'Cloudflare DNS token scoped to the zone') : ''}
`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
