# Coolify deployment repo

Scaffolded by the `/setup` skill of [coolify-devops](https://github.com/KasperHonore/coolify-devops)
(installed with `npx skills add KasperHonore/coolify-devops`). This repo is the operating
manual and state record for one Coolify instance, driven from Claude Code through the
Coolify MCP.

- `CLAUDE.md` — the rules every session follows. Start here.
- `instance.yaml` — the bindings for this instance (tailnet, domains, project names).
- `.claude/skills/` — `/setup`, `/host`, `/change-service`, `/health`, `/grant-access`.
- `docs/` — platform runbooks and this instance's recorded state. `docs/provisioning.md`
  is the human checklist for the server itself: VM, Tailscale, Coolify, firewall.
- `stacks/` — reference copies of what is deployed. Coolify is the write path.

## Running a session

```bash
export COOLIFY_BASE_URL=https://coolify.example.com
export COOLIFY_ACCESS_TOKEN=...   # read + write + deploy scopes; never root
claude
```

`.mcp.json` reads both variables; the token is never written to this repo. On the first
run Claude Code asks you to approve the project MCP server. Then `/health` to look,
`/host <thing>` to deploy, `/setup` if the instance is not bootstrapped yet.

## Updating the skills

```bash
npx skills update                                        # pulls the latest skills
node .claude/skills/setup/scripts/scaffold.js --render   # re-renders CLAUDE.md and docs/ runbooks
```

`CLAUDE.md` and the runbooks in `docs/` are rendered from templates inside the setup
skill; the two state files (`docs/infrastructure.md`, `docs/tailnet-state.md`) and
`stacks/` are yours and are never touched by a render.
