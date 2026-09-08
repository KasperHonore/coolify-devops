# Coolify deployment repo

Scaffolded with [coolify-devops](https://www.npmjs.com/package/coolify-devops). This repo
is the operating manual and state record for one Coolify instance, driven from Claude
Code through the Coolify MCP.

- `CLAUDE.md` — the rules every session follows. Start here.
- `instance.yaml` — the bindings for this instance (tailnet, domains, project names).
- `.claude/skills/` — `/setup`, `/host`, `/change-service`, `/health`, `/grant-access`.
- `docs/` — platform runbooks and this instance's recorded state.
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
