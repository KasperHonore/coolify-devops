#!/usr/bin/env node
'use strict';

// Scaffold a Claude Code deployment repo for operating a Coolify server through the
// Coolify MCP, or re-render one from its instance.yaml. Bundled with the /setup-coolify-devops skill
// and run by it — the skill asks the interview questions, then passes the answers as
// flags. Zero dependencies on purpose: it runs on a machine that has nothing but node.
//
//   node ${CLAUDE_SKILL_DIR}/scripts/scaffold.js [options]
//
// It scaffolds the deployment repo IN PLACE: the directory the skills are installed
// in (found from this script's own location under .claude/skills or .agents/skills),
// falling back to the current directory. It never creates a nested folder — the
// skills must end up inside the repo they operate, and nobody should have to cd.
// In the usual setup that directory is root's home on the Coolify host, which is
// where the Coolify web terminal and Tailscale SSH both land; the .gitignore it
// writes is an allow-list so a home directory can safely be a git repo.
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
//   --route=X               skills-cli | plugin — how the skills are installed (default: detected from
//                           this script's path; recorded as install.route in instance.yaml)
//   --render                re-render ./AGENTS.md and the runbooks in ./docs/ from ./instance.yaml
//   --set a.b=value         (with --render) update one instance.yaml key first, e.g.
//                           --set coolify.version_observed=4.3.18 — keeps the file's comments intact
//                           (after updating the skills, either route, or after editing instance.yaml);
//                           adds new env passthroughs to an existing .mcp.json, keeping its values; never
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
    else if (a.startsWith('--set=')) { (out.set = out.set || []).push(a.slice(6)); }
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
    DUCKDNS_SUBNAME: pub.replace(/\.duckdns\.org$/i, ''),
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
    ...routeVars((inst.install && inst.install.route) || 'skills-cli'),
  };
}

// How the skills reached this machine decides the update command, the re-render step,
// whether skill names are namespaced, and whether skills-lock.json is tracked.
const INSTALL_ROUTES = ['skills-cli', 'plugin'];
const PLUGIN_NAME = 'coolify-devops';
const SKILL_NAMES = ['setup-coolify-devops', 'host', 'change-service', 'health', 'grant-access'];
function routeVars(route) {
  route = INSTALL_ROUTES.includes(route) ? route : 'skills-cli';
  return { INSTALL_ROUTE: route, INSTALL_PLUGIN: route === 'plugin', INSTALL_SKILLS_CLI: route === 'skills-cli' };
}

// The route this script is running from: the plugin cache (a versioned directory under
// ~/.claude/plugins/, which moves on every update) or a skills CLI install in the repo.
// null from a library checkout or a test, where the recorded route stands.
function detectRoute() {
  for (const candidate of [SKILL_ROOT, fs.realpathSync(SKILL_ROOT)]) {
    if (/\/\.claude\/plugins\//.test(candidate)) return 'plugin';
    if (/\/(?:\.claude|\.agents)\/skills\/[^/]+$/.test(candidate)) return 'skills-cli';
  }
  return null;
}

// Plugin skills are invoked namespaced (/coolify-devops:host). The templates name them
// bare, in backticks; on the plugin route the rendered text gets the namespace.
function renderFor(tpl, vars) {
  const out = render(tpl, vars);
  if (!vars.INSTALL_PLUGIN) return out;
  return out.replace(new RegExp('`/(' + SKILL_NAMES.join('|') + ')\\b', 'g'), '`/' + PLUGIN_NAME + ':$1');
}

function checkChoice(name, value, choices) {
  if (value !== undefined && !choices.includes(value)) {
    console.error(`--${name} must be one of: ${choices.join(', ')}`);
    process.exit(1);
  }
}

// Where is the deployment repo? This script lives at <repo>/.claude/skills/<name>/scripts
// (or <repo>/.agents/skills/<name>/scripts in the skills CLI's symlink mode). Walk up
// past the skills container; null when the script is run from somewhere else (the
// library checkout, a test).
function repoRootFromSkillDir() {
  const real = fs.realpathSync(SKILL_ROOT);          // resolve the symlink-mode link
  for (const candidate of [real, SKILL_ROOT]) {
    const m = candidate.match(/^(.*)\/(?:\.claude|\.agents)\/skills\/[^/]+$/);
    if (m) return m[1];
  }
  return null;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  return r.status === 0;
}

function has(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

// The operating rules are rendered to AGENTS.md — the agent-agnostic convention every
// coding agent reads — and CLAUDE.md is a one-line import of it, so Claude Code loads
// the same file without a second copy to drift.
const CLAUDE_STUB = '@AGENTS.md\n';

// Reference copies of the plumbing and canary composes ship with the skill so /setup
// never has to research upstream. Rendered into stacks/<name>/ once, at scaffold time
// (or on --render when the folder is missing); after that the folder belongs to the
// instance and is never overwritten. Which pinner ships depends on the lane and provider.
function seedStacks(target, vars) {
  const src = path.join(TEMPLATE_DIR, 'stacks');
  if (!fs.existsSync(src)) return [];
  const want = new Set([vars.REGISTRAR === 'docktail' ? 'docktail' : null, vars.CANARY === 'whoami' ? 'whoami' : null,
    vars.HAS_PUBLIC ? (vars.DNS_DUCKDNS ? 'duckdns' : 'cloudflare-ddns') : null].filter(Boolean));
  const seeded = [];
  for (const name of fs.readdirSync(src)) {
    if (!want.has(name)) continue;
    const dst = path.join(target, 'stacks', name);
    if (fs.existsSync(dst)) continue;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(path.join(src, name))) {
      fs.writeFileSync(path.join(dst, f), renderFor(fs.readFileSync(path.join(src, name, f), 'utf8'), vars));
    }
    seeded.push(name);
  }
  return seeded;
}

// --set a.b=value: rewrite one two-level key in instance.yaml in place, keeping comments.
function setInstanceKey(file, spec) {
  const m = spec.match(/^([A-Za-z_][\w-]*)\.([A-Za-z_][\w-]*)=(.*)$/);
  if (!m) { console.error(`--set expects section.key=value, got ${spec}`); process.exit(1); }
  const [, section, key, value] = m;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inSection = false, done = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^[A-Za-z_][\w-]*:/.test(lines[i])) inSection = lines[i].startsWith(section + ':');
    const km = inSection && lines[i].match(new RegExp(`^(\\s+${key}:\\s*)(\"[^\"]*\"|[^#]*?)(\\s*#.*)?$`));
    if (km) { lines[i] = km[1] + (value === '' ? '""' : value) + (km[3] || ''); done = true; break; }
  }
  if (!done) { console.error(`--set: ${section}.${key} not found in ${file}`); process.exit(1); }
  fs.writeFileSync(file, lines.join('\n'));
}

// The runbooks in assets/docs/ are templates: rendered with the instance's bindings so
// a deployment repo reads as its own, never as the library author's.
const RUNBOOK_BANNER = '<!-- Rendered from library/skills/setup-coolify-devops/assets/docs/%s by `npm run render`. Edit the source, not this file. -->\n\n';
function renderRunbooks(targetDocs, vars) {
  fs.mkdirSync(targetDocs, { recursive: true });
  for (const f of fs.readdirSync(path.join(TEMPLATE_DIR, 'docs'))) {
    if (!f.endsWith('.md') || STATE_SKELETONS.has(f)) continue;
    const body = renderFor(fs.readFileSync(path.join(TEMPLATE_DIR, 'docs', f), 'utf8'), vars);
    fs.writeFileSync(path.join(targetDocs, f), (vars.IS_LIBRARY ? RUNBOOK_BANNER.replace('%s', f) : '') + body);
  }
}

// .mcp.json is not rendered over: the operator may have changed it. A render only adds
// the env passthroughs a newer template carries (COOLIFY_UI_URL came in 0.7.0) to the
// server that runs the Coolify MCP, and leaves every existing key and value alone.
function mergeMcpJson(file) {
  let cur;
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.error(`.mcp.json is not valid JSON; left as is`); return []; }
  const tplServers = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'mcp.json'), 'utf8')).mcpServers;
  const servers = cur.mcpServers || {};
  const added = [];
  for (const [name, tpl] of Object.entries(tplServers)) {
    const key = Object.keys(servers).find(k => (servers[k].args || []).some(a => String(a).includes('coolify-mcp'))) || (servers[name] && name);
    if (!key) continue;
    const env = servers[key].env = servers[key].env || {};
    for (const [k, v] of Object.entries(tpl.env || {})) if (!(k in env)) { env[k] = v; added.push(k); }
  }
  if (added.length) fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
  return added;
}

// ---------- maintainer mode: re-render this repo's AGENTS.md and runbooks ----------

function renderMode(args) {
  const cwd = process.cwd();
  const instFile = path.join(cwd, 'instance.yaml');
  for (const spec of [].concat(args.set || [])) setInstanceKey(instFile, spec);
  // Record the install route. A repo from before 0.9.0 has no install: section, and one
  // that switched routes records the old one; the running script knows which it is.
  checkChoice('route', args.route, INSTALL_ROUTES);
  const route = args.route || detectRoute();
  const recorded = (readInstanceYaml(instFile).install || {}).route;
  let routeNote = '';
  if (route && route !== recorded) {
    if (recorded === undefined) fs.appendFileSync(instFile, `\ninstall:\n  route: ${route}                 # skills-cli | plugin — how the skills reach this machine; a render records it\n`);
    else setInstanceKey(instFile, `install.route=${route}`);
    routeNote = `; install.route ${recorded || '(unset)'} -> ${route}`;
  }
  const inst = readInstanceYaml(instFile);
  const tpl = fs.readFileSync(path.join(TEMPLATE_DIR, 'AGENTS.md'), 'utf8');
  // IS_LIBRARY: the library author's own deployment repo, which carries library/ and
  // gets the "rendered from" banners; a consumer's repo does not.
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: fs.existsSync(path.join(cwd, '.mcp.json')), IS_LIBRARY: fs.existsSync(path.join(cwd, 'library', 'skills')) };
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), renderFor(tpl, vars));
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), CLAUDE_STUB);
  // The allow-list .gitignore is a rendered output too: when the tracked file set grows
  // (AGENTS.md did), an old copy silently ignores the new file — refresh it on render,
  // unless this is the library author's repo, which has its own.
  if (!vars.IS_LIBRARY) fs.writeFileSync(path.join(cwd, '.gitignore'), render(fs.readFileSync(path.join(TEMPLATE_DIR, '_gitignore'), 'utf8'), vars));
  renderRunbooks(path.join(cwd, 'docs'), vars);
  const seeded = seedStacks(cwd, vars);
  const mcpAdded = vars.HAS_MCP_JSON ? mergeMcpJson(path.join(cwd, '.mcp.json')) : [];
  console.log(`Rendered AGENTS.md and the runbooks in docs/ from instance.yaml${vars.IS_LIBRARY ? ' (library author mode)' : ''}${seeded.length ? '; seeded stacks/' + seeded.join(', stacks/') : ''}${mcpAdded.length ? '; added ' + mcpAdded.join(', ') + ' to .mcp.json' : ''}${routeNote}`);
}

// ---------- scaffold ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
    return;
  }
  if (args.render) return renderMode(args);

  const target = path.resolve(process.cwd(), args._[0] || repoRootFromSkillDir() || '.');
  if (args._[0] && repoRootFromSkillDir() && target !== repoRootFromSkillDir()) {
    console.error(`Refusing: the skills are installed in ${repoRootFromSkillDir()}, so that is the deployment repo. Run without a target to scaffold there.`);
    process.exit(1);
  }
  // The target may be a home directory full of other things; that is fine. What is
  // not fine is overwriting a deployment repo that already exists there.
  if (target === '/') { console.error('Refusing to scaffold /'); process.exit(1); }
  const clobber = ['AGENTS.md', 'CLAUDE.md', 'instance.yaml', 'docs', 'stacks'].filter(f => fs.existsSync(path.join(target, f)));
  if (clobber.length) {
    console.error(`Refusing: ${target} already holds ${clobber.join(', ')}. To re-render an existing repo from its instance.yaml, run with --render.`);
    process.exit(1);
  }

  // Bindings come in as flags; /setup-coolify-devops asked the questions. Anything not given stays
  // blank ("" in instance.yaml) for /setup-coolify-devops to fill after the MCP answers.
  const onHost = Boolean(args.onHost);
  let internal = args.internalSuffix, pub = args.publicSuffix, same = onHost || Boolean(args.sameTailnet);
  let canary = args.canary || 'whoami', branch = args.branch || 'main';
  let coolifyUrl = args.coolifyUrl, backups = args.backups || 'recommend-but-no';
  let projInternal = 'Internal tools', projPublic = 'Public tools', projInfra = 'Infrastructure';
  let dnsProvider = args.dnsProvider, uiExposure = args.coolifyUi, hostProvider = args.hostProvider;
  checkChoice('dns-provider', dnsProvider, DNS_PROVIDERS);
  checkChoice('coolify-ui', uiExposure, UI_EXPOSURES);
  checkChoice('host-provider', hostProvider, HOST_PROVIDERS);
  checkChoice('route', args.route, INSTALL_ROUTES);
  const route = args.route || detectRoute() || 'skills-cli';
  if (args.noPublic) pub = '';
  internal = internal || '';
  pub = pub || '';
  coolifyUrl = (coolifyUrl || '').trim().replace(/\/+$/, '');
  // "localhost:8000" is a common answer and means http; a bare domain sits behind a proxy
  // that redirects to https, and the MCP refuses redirects (3.9.0), so guess https for it.
  if (coolifyUrl && !/^https?:\/\//i.test(coolifyUrl)) {
    const plainHttp = /:\d+$/.test(coolifyUrl) || /^(localhost|\d+\.\d+\.\d+\.\d+|\[)/i.test(coolifyUrl);
    coolifyUrl = (plainHttp ? 'http://' : 'https://') + coolifyUrl;
  }
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
    install: { route },
  };
  const vars = { ...varsFromInstance(inst), HAS_MCP_JSON: true };
  // instance.yaml is YAML, so empty strings must be quoted there.
  const yamlVars = { ...vars, INTERNAL_SUFFIX: internal || '""', PUBLIC_SUFFIX: pub || '""', OPERATOR_TAILNET: (same ? internal : '') || '""', COOLIFY_URL: coolifyUrl || '""', ON_HOST_YAML: String(onHost) };

  fs.mkdirSync(target, { recursive: true });

  // 1. Runbooks rendered for this instance. (The skills themselves are already in
  // place, in the repo or the plugin cache, which is how this script got here.)
  renderRunbooks(path.join(target, 'docs'), vars);
  fs.mkdirSync(path.join(target, 'stacks'), { recursive: true });
  fs.copyFileSync(path.join(TEMPLATE_DIR, 'stacks-README.md'), path.join(target, 'stacks', 'README.md'));
  const seeded = seedStacks(target, vars);

  // 2. Instance files, rendered.
  const write = (rel, content) => {
    const p = path.join(target, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write('AGENTS.md', renderFor(fs.readFileSync(path.join(TEMPLATE_DIR, 'AGENTS.md'), 'utf8'), vars));
  write('CLAUDE.md', CLAUDE_STUB);
  write('instance.yaml', renderFor(fs.readFileSync(path.join(TEMPLATE_DIR, 'instance.yaml'), 'utf8'), yamlVars));
  write('.mcp.json', fs.readFileSync(path.join(TEMPLATE_DIR, 'mcp.json'), 'utf8'));
  write('.gitignore', render(fs.readFileSync(path.join(TEMPLATE_DIR, '_gitignore'), 'utf8'), vars));
  write('README.md', renderFor(fs.readFileSync(path.join(TEMPLATE_DIR, 'README.md'), 'utf8'), vars));
  // Instance-state skeletons: portable docs never carry state, so these start empty.
  for (const f of STATE_SKELETONS) {
    write(path.join('docs', f), renderFor(fs.readFileSync(path.join(TEMPLATE_DIR, 'docs', f), 'utf8'), vars));
  }

  // 3. Git.
  let gitDone = false;
  if (!args.noGit && has('git')) {
    // A repo-local identity, so later commits by a skill do not fall back to
    // root@<hostname> and a warning (seen in a trial).
    gitDone = (fs.existsSync(path.join(target, '.git')) || run('git', ['init', '-q', '-b', branch], target))
      && run('git', ['config', 'user.name', 'coolify-devops'], target)
      && run('git', ['config', 'user.email', 'coolify-devops@localhost'], target)
      && run('git', ['add', '-A'], target)
      && run('git', ['commit', '-q', '-m', 'Scaffold deployment repo with coolify-devops'], target);
  }

  const rel = path.relative(process.cwd(), target) || '.';
  console.log(`
Scaffolded ${rel}/
  AGENTS.md          operating rules for every agent session (Claude Code, Codex, Cursor, ...)
  CLAUDE.md          one line, @AGENTS.md — Claude Code imports the same rules
  instance.yaml      your bindings${internal ? '' : ` (blank — ${route === 'plugin' ? '/coolify-devops:' : '/'}setup-coolify-devops fills them)`}
  .mcp.json          Coolify MCP wiring; reads COOLIFY_BASE_URL, COOLIFY_ACCESS_TOKEN (and optional COOLIFY_UI_URL) from your shell
  docs/              runbooks and state files, rendered for your instance
  stacks/            reference copies seeded for: ${seeded.join(', ') || '(none)'} — plus README.md
${gitDone ? '  git: committed on ' + branch : '  git: not initialised (run git init yourself)'}
  lane: ${pub ? 'public lane on (' + pub + ', ' + dnsProvider + ')' : 'no public lane'}; dashboard reachable by: ${uiExposure}
  operated from: ${onHost ? 'the Coolify host itself' : same ? 'a machine on the same tailnet' : 'a machine off the tailnet'}
  skills installed: ${route === 'plugin' ? 'as the Claude Code plugin (skills are /coolify-devops:<name>)' : 'with the skills CLI'}

Human steps still ahead (the skill hands these over and verifies them):
  - docs/provisioning.md if the server, Tailscale, Coolify, or the firewall are not done yet
  - the MCP token, in a root-only file sourced by your shell so it survives logout
    and reboot (a bare export lasts one session; the .gitignore keeps it out of git):
       ( umask 077; mkdir -p ~/.config; cat > ~/.config/coolify-devops.env <<'EOF'
       export COOLIFY_BASE_URL=${coolifyUrl || (onHost ? 'http://localhost:8000' : 'http://<tailnet-ip-of-the-host>:8000')}
       export COOLIFY_UI_URL=<dashboard address>  # optional: the URL you open in a browser, so MCP links work there
       export COOLIFY_ACCESS_TOKEN=<token>      # read, read:sensitive, write, deploy; never root
       export HCLOUD_TOKEN=<token>              # optional: lets the skills manage the Hetzner firewall
       EOF
       ); grep -q coolify-devops.env ~/.bashrc || echo '. ~/.config/coolify-devops.env' >> ~/.bashrc
    then open a new shell (or source ~/.bashrc), start claude here so .mcp.json picks the
    variables up, and approve the project MCP server; /mcp showing it connected is the check
  - a Tailscale OAuth client with devices:core + services scopes${pub ? ', and a ' + (dnsProvider === 'duckdns' ? 'DuckDNS token' : 'Cloudflare DNS token scoped to the zone') : ''}
`);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
