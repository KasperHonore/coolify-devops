# coolify-devops

Operate a [Coolify](https://coolify.io) server from [Claude Code](https://claude.com/claude-code)
through the [Coolify MCP](https://github.com/StuMason/coolify-mcp), with a tailnet-first
hosting model: internal tools reach the team over Tailscale at `https://<name>.<tailnet>.ts.net`,
public ones reach the internet at `https://<name>.<your-domain>` via Traefik, and every
operation goes through the MCP — no SSH, no `docker` CLI on the host.

This repo is two things at once:

1. **A skill library** — five Claude Code skills (`/setup`, `/host`, `/change-service`,
   `/health`, `/grant-access`) and the runbooks they follow, written and corrected by
   sessions that ran real operations.
2. **The deployment repo for one instance** — `instance.yaml`, `stacks/`, and the recorded
   state in `docs/`. That instance is the reference; yours gets its own repo.

## Quick start

```bash
npx coolify-devops my-coolify        # or: npx github:KasperHonore/coolify-devops my-coolify
```

The scaffolder interviews you — where the server runs, Coolify URL, tailnet domain,
whether you will host public-facing apps (and if so the domain: your own or a free DuckDNS
one), who may reach the Coolify dashboard, project names, canary, backup policy — and
generates a deployment repo **specific to your instance**: `CLAUDE.md`, `instance.yaml`, the skills, and the runbooks and state docs all
rendered with your names and domains, plus a `.mcp.json` that reads the Coolify token from
your shell. Nothing secret is ever written to a file, and nothing in it describes anyone
else's instance.

Then:

```bash
export COOLIFY_BASE_URL=https://coolify.example.com
export COOLIFY_ACCESS_TOKEN=...      # a scoped token: read + write + deploy, never root
cd my-coolify && claude              # approve the project MCP server when asked
```

and run `/setup`. It verifies the MCP, creates the projects, deploys the tailnet registrar
([docktail](https://github.com/dgl/docktail)) and the canary service, runs the four
verification steps that prove the internal lane end to end, and rewrites the docs from the
and fills in the state docs. `/health` is the acceptance test.

No server yet? `docs/provisioning.md` in the generated repo is the checklist from an
empty cloud account to a Coolify host that is reachable only over your tailnet: VM,
Tailscale, the Coolify install, and the cloud firewall rules that follow from your two
answers (public lane or not; who reaches the dashboard). It is written for Hetzner; any
provider with a firewall outside the VM works the same way.

Have ready before `/setup` — these are console steps the skill hands to you rather than
pretends to do:

- the server provisioned per `docs/provisioning.md`, firewall included — `/setup` probes
  it from outside before it trusts anything;
- the Coolify host joined to your tailnet with Tailscale SSH enabled (`tailscale up --ssh`)
  and key expiry disabled on that node;
- a Tailscale OAuth client with `devices:core` and `services` scopes, and an ACL
  `autoApprovers.services` entry for the registrar's tag;
- public lane only: a DNS token — Cloudflare, scoped to the zone, or your DuckDNS token.

`docs/provisioning.md`, `docs/tailnet-access.md` and `docs/internal-services.md` cover each.

## What you get

| Path | What it is |
|---|---|
| `CLAUDE.md` | The operating rules every session reads: lanes, naming, the write path, the traps |
| `instance.yaml` | Your bindings; skills name its keys instead of hardcoding values |
| `.claude/skills/` | The five skills |
| `docs/` | Runbooks rendered for your instance — `platform.md`, `internal-services.md`, `tailnet-access.md`, `changing-a-resource.md` (docktail's traps, Tailscale semantics, what actually recreates a container) — plus two state files, `infrastructure.md` and `tailnet-state.md`, pre-filled from the interview and completed by `/setup` |
| `stacks/README.md` | What the reference copies are, and that nothing there is applied |
| `.mcp.json` | `npx @masonator/coolify-mcp@latest` with the URL and token from `${COOLIFY_BASE_URL}` / `${COOLIFY_ACCESS_TOKEN}` |

Flags for non-interactive use: `--yes`, `--coolify-url=`, `--internal-suffix=`,
`--public-suffix=` / `--no-public`, `--dns-provider=`, `--coolify-ui=`, `--host-provider=`,
`--same-tailnet`, `--canary=`, `--backups=`, `--branch=`, `--no-git`. `npx coolify-devops --help` lists them.

## Assumptions the library makes

- **Software**: Coolify 4.x, docktail as the tailnet registrar, Traefik as the public proxy,
  Cloudflare or DuckDNS for public DNS. `instance.yaml` parameterises the *names*; swapping the
  software invalidates whole runbook sections, not just bindings.
- **Lanes are fixed**: internal tools are always Tailscale Services on the tailnet; the
  public lane needs a domain and exists only for public-facing apps. The cloud firewall
  outside the VM is what enforces that split, because Docker-published ports bypass `ufw`.
- **The MCP is the only way in.** The skills never assume a shell on the host; `scheduled_tasks`
  `run_once` is the shell substitute.
- **Coolify is the write path.** `stacks/` holds reference copies, never applied config.
  `docs/iac.md` records why Terraform was evaluated and not adopted.

## Updating a scaffolded repo

Today the scaffold is a copy: your repo owns its skills and docs, and lessons you fold in
stay local. To pick up library changes, diff `.claude/skills/` and `docs/` against a fresh
scaffold and merge by hand. The planned next step — the library as a Claude Code plugin
your repo pins, with an upstream path for lessons — is designed in `docs/skill-library.md`.

## Maintaining this repo

The author's own deployment repo consumes this library exactly as a scaffold does:
`CLAUDE.md` and the runbooks in `docs/` are rendered from `template/` and `docs/` here by
`npm run render` (reads `instance.yaml`), so what every scaffold receives and what the
author runs on cannot drift. `npm test` scaffolds
into a temp dir as a smoke check.

License: MIT.
