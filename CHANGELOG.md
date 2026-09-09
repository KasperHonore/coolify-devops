# Changelog

One entry per version in `package.json`. The public repo carries a `v<version>` tag and
a GitHub release for each, with this entry as its notes and the Agent Skills discovery
index plus one artifact per skill attached. A version is never re-released with
different skill content; CI and the publish script both refuse it.

## 0.4.0 — 2026-09-09

- Lessons from two more trials on a fresh box: the tailnet policy paste comes before
  the OAuth client (its tag dropdown only offers existing tags), and the Coolify host's
  own node must advertise `tag:server` or the registrar fails every service add — a
  node-local step the setup skill now runs and verifies, which also retires the
  disable-key-expiry console step. A masked env var can be empty; the skill proves
  presence inside the container before blaming a recreate.
- `/host` looks for an existing resource before asking anything, adopts one created
  from Coolify's UI (clears its public sslip.io FQDN, renames it), and for a private
  repo hands over `gh auth login` and reads the clone instead of asking six
  questions. The git-source application path on the internal lane is proven:
  `custom_labels` is base64, Railpack's bare-`bash` restart loop means "write the
  Dockerfile", the image needs `curl` for Coolify's healthcheck, a webhook deploy
  is watched rather than duplicated. This side never edits a product repo: the
  hosting request is pasted in (never fetched, so a private repo needs no `gh` login
  on the server), and code that will not host goes back as a findings block.
- Waiting is bounded polling in tool calls, never a scheduled wakeup (one outlived
  its session). Nine new rows in the MCP rough-edges table.

## 0.3.0 — 2026-09-08

- The library is the hosting companion to [AI Build Kit](https://github.com/gwpicard/ai-build-kit).
  `/host` recognises a project built with it, reads the hosting request its `/ship`
  writes into the masterplan instead of researching, deploys from the git source with
  the GitHub App, and hands back an address block for the builder to paste.
- Claude Code plugin route alongside the skills CLI: `claude plugin marketplace add
  KasperHonore/coolify-devops`, commands prefixed `coolify-devops:`. The setup skill
  gained a re-render mode and works from the plugin cache.
- README restructured in AI Build Kit's section order; `LICENSE` added.
- Every skill's frontmatter carries `license`, `compatibility` and `metadata`; a
  contributor `AGENTS.md`, `CONTRIBUTING.md`, a version-sync check, a discovery-index
  build, and CI that validates every push and releases every version.

## 0.2.0 — 2026-09-08

- Distribution through the skills CLI only; the runbook templates and the scaffolder
  moved inside the setup skill, which now creates the deployment repo in place.
- Lessons from the first trial on a real machine: Claude Code on the Coolify host,
  the tailnet domain discovered rather than asked, the MCP token in a sourced
  root-only env file, the deployment repo as root's home with an allow-list
  `.gitignore`, a Hetzner API token as an optional binding for the firewall, the
  Tailscale OAuth client as a console-only step whose secret never enters a session.
- Rules render to `AGENTS.md` with a one-line `CLAUDE.md` import; secrets are never
  printed into a session.

## 0.1.0 — 2026-09-08

- First public cut: the five skills, the provisioning runbook, explicit lane and
  dashboard-exposure bindings, and the physical split between the library and any
  instance's state.
