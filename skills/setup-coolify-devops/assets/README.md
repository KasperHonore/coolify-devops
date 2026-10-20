# Coolify deployment repo

Scaffolded by the `/setup-coolify-devops` skill of [coolify-devops](https://github.com/KasperHonore/coolify-devops)
({{#INSTALL_PLUGIN}}installed as the Claude Code plugin `coolify-devops`{{/INSTALL_PLUGIN}}{{#INSTALL_SKILLS_CLI}}installed with `npx skills add KasperHonore/coolify-devops`{{/INSTALL_SKILLS_CLI}}). This repo is the operating
manual and state record for one Coolify instance, driven from Claude Code through the
Coolify MCP.

- `AGENTS.md` — the rules every session follows. Start here.
- `instance.yaml` — the bindings for this instance (tailnet, domains, project names).
- {{#INSTALL_SKILLS_CLI}}`.claude/skills/` — {{/INSTALL_SKILLS_CLI}}{{#INSTALL_PLUGIN}}the skills, from the plugin (not in this repo) — {{/INSTALL_PLUGIN}}`/setup-coolify-devops`, `/host`, `/change-service`, `/health`, `/grant-access`.
- `docs/` — platform runbooks and this instance's recorded state. `docs/provisioning.md`
  is the human checklist for the server itself: VM, Tailscale, Coolify, firewall.
- `stacks/` — reference copies of what is deployed. Coolify is the write path.

## Running a session

`.mcp.json` reads `COOLIFY_BASE_URL`, `COOLIFY_ACCESS_TOKEN` and, optionally,
`COOLIFY_UI_URL` (the dashboard as your browser reaches it, for the MCP's links) from
the shell; the token
is never committed. Keep them in a root-only file that your shell sources, so they
survive logout and reboot (the allow-list `.gitignore` keeps it out of git):

```bash
( umask 077; mkdir -p ~/.config; cat > ~/.config/coolify-devops.env <<'EOF'
export COOLIFY_BASE_URL=http://localhost:8000     # or the host's tailnet IP:8000 from elsewhere
export COOLIFY_UI_URL=http://<tailnet-ip>:8000    # optional: the dashboard as your browser reaches it
export COOLIFY_ACCESS_TOKEN=<token>               # read, read:sensitive, write, deploy; never root
export HCLOUD_TOKEN=<token>                       # optional: Hetzner API, so the skills manage the firewall
EOF
); grep -q coolify-devops.env ~/.bashrc || echo '. ~/.config/coolify-devops.env' >> ~/.bashrc
```

Then a new shell and `claude` from this directory. When this directory is root's home
on the Coolify host — the usual setup — that is where the Coolify web terminal
(Servers → Terminal) and Tailscale SSH already land, so there is nothing to `cd` into.

This repo's `.gitignore` is an allow-list: only `AGENTS.md`, `instance.yaml`, `docs/`,
`stacks/`, `.mcp.json`{{#INSTALL_SKILLS_CLI}}, `README.md` and `skills-lock.json`{{/INSTALL_SKILLS_CLI}}{{#INSTALL_PLUGIN}} and `README.md`{{/INSTALL_PLUGIN}} are tracked. Everything else
in the directory is ignored on purpose. On the first
run Claude Code asks you to approve the project MCP server. Then `/health` to look,
`/host <thing>` to deploy, `/setup-coolify-devops` if the instance is not bootstrapped yet.

## Updating the skills

{{#INSTALL_PLUGIN}}```bash
claude plugin marketplace update coolify-devops
claude plugin update coolify-devops@coolify-devops --scope local
```

Then a new session here and `/setup-coolify-devops`, which in an existing repo only
re-renders. There is no script path to run by hand: the plugin lives in a versioned
directory under `~/.claude/plugins/cache/` that moves on every update. `AGENTS.md`{{/INSTALL_PLUGIN}}{{#INSTALL_SKILLS_CLI}}```bash
npx skills add KasperHonore/coolify-devops               # re-adds: refreshes what is installed, adds what is new
node .claude/skills/setup-coolify-devops/scripts/scaffold.js --render   # re-renders AGENTS.md and docs/ runbooks
```

Not `npx skills update`: it refreshes only names already in `skills-lock.json`, so a
skill renamed upstream silently goes missing. `AGENTS.md`{{/INSTALL_SKILLS_CLI}} and the runbooks in `docs/`
are rendered from templates inside the setup skill; the render also adds any new env
passthrough to `.mcp.json`, keeping its existing values; the two state files (`docs/infrastructure.md`, `docs/tailnet-state.md`) and
`stacks/` are yours and are never touched by a render.
