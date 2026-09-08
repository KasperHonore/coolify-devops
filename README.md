# coolify-devops

[![skills.sh](https://skills.sh/b/KasperHonore/coolify-devops)](https://skills.sh/KasperHonore/coolify-devops)

Operate a [Coolify](https://coolify.io) server from [Claude Code](https://claude.com/claude-code)
through the [Coolify MCP](https://github.com/StuMason/coolify-mcp), with a tailnet-first
hosting model: internal tools reach the team over Tailscale at `https://<name>.<tailnet>.ts.net`,
public ones reach the internet at `https://<name>.<your-domain>` via Traefik, and every
operation goes through the MCP — no SSH, no `docker` CLI on the host.

Five [Agent Skills](https://agentskills.io), installed with the [skills CLI](https://skills.sh).
The usual setup is Claude Code running **on the Coolify host itself**, over Tailscale
SSH, with the skills in a directory there:

```bash
mkdir my-coolify && cd my-coolify
npx skills add KasperHonore/coolify-devops -a claude-code -y
claude
```

Then run `/setup-coolify-devops`. It interviews you — where Claude Code runs (on the host, it reads the
tailnet domain and IPs itself), where the server runs, whether you will host
public-facing apps (and if so the domain: your own or a free DuckDNS one), who may
reach the Coolify dashboard — and scaffolds the deployment repo around the
skills: `CLAUDE.md`, `instance.yaml`, `.mcp.json` (reads the Coolify token from your
shell environment — kept in a root-only file in your home, never in the repo), and the runbooks in `docs/` rendered for *your* instance. Then it
hands you the human steps it cannot do — `docs/provisioning.md` covers the VM, Tailscale,
the Coolify install and the cloud firewall — verifies each one, creates the projects,
deploys the tailnet registrar ([docktail](https://github.com/dgl/docktail)) and the canary
service, and accepts with `/health`.

| Skill | What it does |
|---|---|
| `/setup-coolify-devops` | Bootstrap an instance: interview → deployment repo → preconditions → projects → plumbing → canary → `/health` |
| `/host` | Host something new, end to end: lane, name, research, compose, deploy, the four tailnet verification steps, bookkeeping |
| `/change-service` | Change a deployed resource safely — compose, env, and `content:` file mounts, where the obvious path changes nothing |
| `/health` | Read-only sweep: status, reachability, the outside firewall probe, published-port scan, drift against `stacks/` |
| `/grant-access` | Who can reach which internal tool: onboard, offboard, grant, scope — policy and membership only |

## How it fits together

The skills operate a **deployment repo**, which `/setup-coolify-devops` creates in the directory you
installed them into. Everything the skills read at run time lives there:

| Path | What it is |
|---|---|
| `CLAUDE.md` | The operating rules every session reads: lanes, naming, the write path, the traps. Rendered |
| `instance.yaml` | Your bindings; skills name its keys instead of hardcoding values |
| `docs/` | Runbooks rendered for your instance — `provisioning.md`, `platform.md`, `internal-services.md`, `tailnet-access.md`, `changing-a-resource.md` — plus two hand-maintained state files, `infrastructure.md` and `tailnet-state.md` |
| `stacks/` | Reference copies of what is deployed. Coolify is the write path; nothing here is applied |
| `.mcp.json` | `npx @masonator/coolify-mcp@latest` with `${COOLIFY_BASE_URL}` / `${COOLIFY_ACCESS_TOKEN}` from your shell |

The rendered files come from templates bundled *inside* the setup skill
(`skills/setup-coolify-devops/assets/`, rendered by `skills/setup-coolify-devops/scripts/scaffold.js`). That is
deliberate: the skills CLI installs only skill directories, so the runbooks travel with
the skill and update with it:

```bash
npx skills update                                        # new skills, new templates
node .claude/skills/setup-coolify-devops/scripts/scaffold.js --render   # re-render CLAUDE.md and docs/ runbooks
```

The state files and `stacks/` are yours and are never touched by a render.

Install the skills **inside the deployment repo, not globally**: on their own they
reference `instance.yaml` and `docs/` and are useless.

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

## Maintaining this repo

This repo is the `library/` subtree of the author's own deployment repo, which consumes
it exactly as a consumer does: `CLAUDE.md` and `docs/` there are rendered from
`skills/setup-coolify-devops/assets/` by `npm run render`, so what every consumer receives and what the
author runs on cannot drift. `npm test` scaffolds two sample repos into a temp dir and
fails on any unrendered template tag. Design notes and the record of decisions:
`skills/setup-coolify-devops/assets/docs/skill-library.md`.

License: MIT.
