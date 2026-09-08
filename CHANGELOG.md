# Changelog

One entry per version in `package.json`. The public repo carries a `v<version>` tag and
a GitHub release for each, with this entry as its notes and the Agent Skills discovery
index plus one artifact per skill attached. A version is never re-released with
different skill content; CI and the publish script both refuse it.

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
