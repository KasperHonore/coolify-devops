# Coolify deployment repo

Scaffolded by the `/setup-coolify-devops` skill of [coolify-devops](https://github.com/KasperHonore/coolify-devops)
(installed with `npx skills add KasperHonore/coolify-devops`). This repo is the operating
manual and state record for one Coolify instance, driven from Claude Code through the
Coolify MCP.

- `CLAUDE.md` — the rules every session follows. Start here.
- `instance.yaml` — the bindings for this instance (tailnet, domains, project names).
- `.claude/skills/` — `/setup-coolify-devops`, `/host`, `/change-service`, `/health`, `/grant-access`.
- `docs/` — platform runbooks and this instance's recorded state. `docs/provisioning.md`
  is the human checklist for the server itself: VM, Tailscale, Coolify, firewall.
- `stacks/` — reference copies of what is deployed. Coolify is the write path.

## Running a session

`.mcp.json` reads `COOLIFY_BASE_URL` and `COOLIFY_ACCESS_TOKEN` from the shell; the token
is never written to this repo. Keep them in a root-only file outside the repo that your
shell sources, so they survive logout and reboot:

```bash
( umask 077; mkdir -p ~/.config; cat > ~/.config/coolify-devops.env <<'EOF'
export COOLIFY_BASE_URL=http://localhost:8000     # or the host's tailnet IP:8000 from elsewhere
export COOLIFY_ACCESS_TOKEN=<token>               # read + write + deploy scopes; never root
EOF
); grep -q coolify-devops.env ~/.bashrc || echo '. ~/.config/coolify-devops.env' >> ~/.bashrc
```

Then a new shell and `claude` from this directory. On the first
run Claude Code asks you to approve the project MCP server. Then `/health` to look,
`/host <thing>` to deploy, `/setup-coolify-devops` if the instance is not bootstrapped yet.

## Updating the skills

```bash
npx skills update                                        # pulls the latest skills
node .claude/skills/setup-coolify-devops/scripts/scaffold.js --render   # re-renders CLAUDE.md and docs/ runbooks
```

`CLAUDE.md` and the runbooks in `docs/` are rendered from templates inside the setup
skill; the two state files (`docs/infrastructure.md`, `docs/tailnet-state.md`) and
`stacks/` are yours and are never touched by a render.
