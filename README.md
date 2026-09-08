# coolify-devops

[![skills.sh](https://skills.sh/b/KasperHonore/coolify-devops)](https://skills.sh/KasperHonore/coolify-devops)

An installable set of skills that lets a small team run the tools it builds on its own
server, through [Claude Code](https://claude.com/claude-code), without becoming the
team's sysadmin. It is the hosting half of a pair: [AI Build Kit](https://github.com/gwpicard/ai-build-kit)
builds and checks a tool on your machine; coolify-devops runs on the server and takes
that tool to an address the team can use.

## At a glance

- **Runs on the server.** The skills are installed on the machine that runs
  [Coolify](https://coolify.io), and every operation goes through the
  [Coolify MCP](https://github.com/StuMason/coolify-mcp). No SSH, no `docker` commands,
  no files edited on the host.
- **Two lanes, one name each.** Internal tools reach the team over
  [Tailscale](https://tailscale.com) at `https://<name>.<tailnet>.ts.net`, with no port
  and no public exposure. Public ones reach the internet at
  `https://<name>.<your-domain>` with TLS handled for you. Internal is the default.
- **Five commands.** Set up once, then host, change, check, and grant access.
- **A deployment repo is the memory.** What is deployed, how it is wired, who can reach
  it, and what was decided, written down where the next session finds it.
- **Free (MIT).** You pay for your server and your agent subscription.

Requirements: a server running Coolify 4.x on a Tailscale tailnet, Claude Code, and
Node for `npx`. `docs/provisioning.md`, rendered for your instance during setup, is the
human checklist for the server itself.

## Install

Choose one route per server. Either way, install **on the Coolify host, in root's
home directory**: that is where Coolify's own web terminal (Servers → Terminal) and
Tailscale SSH both land, so there is never anything to `cd` into, and the deployment
repo the skills create *is* that directory.

For Claude Code only:

```bash
cd ~
claude plugin marketplace add KasperHonore/coolify-devops
claude plugin install coolify-devops@coolify-devops --scope local
claude
```

Then type `/coolify-devops:setup-coolify-devops`. Local scope keeps the plugin
attached to this directory on this machine. The commands carry the `coolify-devops:`
prefix.

For Claude Code alongside other agents, or if you prefer the shared
[skills installer](https://github.com/vercel-labs/skills):

```bash
cd ~
npx skills add KasperHonore/coolify-devops -a claude-code -y
claude
```

Then type `/setup-coolify-devops`. This route installs the skills as files inside the
deployment repo and records their source in `skills-lock.json`.

Whichever route, setup interviews you one question at a time: where Claude Code runs
(on the host it reads the tailnet domain and IPs itself), where the server runs,
whether you will host public-facing apps (and if so the domain: your own, or a free
DuckDNS one), and who may reach the Coolify dashboard. It writes the deployment repo,
hands you the steps only a human can do (the VM, Tailscale, the Coolify install, the
cloud firewall), verifies each, creates the projects, deploys the tailnet registrar
([docktail](https://github.com/dgl/docktail)) and a canary service, and accepts with
`/health`.

Do not install the skills globally or outside the deployment repo. On their own they
read `instance.yaml` and `docs/` and are useless.

## What this is

Coolify already makes deploying a container a few clicks. What it does not give a
small team is a way of working that survives the person who clicked: which of the two
lanes a tool belongs in, one plain name used everywhere, the labels that put a tool
on the tailnet correctly the first time (some are write-once, and nothing warns you),
the firewall that actually enforces "internal", secrets that never land in a repo,
and a record of what was deployed and why.

The skills carry that discipline. They decide the lane with you, pick the name,
research the upstream, author the deployment, create and deploy it through the MCP,
verify it with checks that a green container does not answer, and write the reference
copy and the inventory. When something changes, they know which changes recreate a
container and which quietly do nothing.

## The five commands

| Command | Use it when |
|---|---|
| `/setup-coolify-devops` | A fresh Coolify server, or pointing this repo at a different one. Run once |
| `/host` | "Put X on the tailnet", "make X public". A git repo, an image, or a product name, to a verified address |
| `/change-service` | A deployed tool needs a compose edit, an env var, or a config-file change. Knows which paths change nothing |
| `/health` | "How is everything?" A read-only sweep: status, reachability, firewall, published ports, drift. Never changes anything |
| `/grant-access` | Who can reach which internal tool: onboard, offboard, grant a group, narrow a service |

## How it flows

Setup runs once. After that a session is usually one `/host`, or one
`/change-service`, or `/health` at the start of an ops day. `/grant-access` runs when
people join or leave. Each command reads the deployment repo first, does its work
through the MCP, verifies, and updates the repo before it finishes. Nothing is
"done" because a deploy went green.

## Companion to AI Build Kit

[AI Build Kit](https://github.com/gwpicard/ai-build-kit) is a workflow for
non-developers to build reliable software with a coding agent, and it is strongest for
internal tools. It lives in the project repo on the builder's machine. Its `/ship` is
the only command there that moves work to "the copy the team actually uses", and it
deliberately does not host. coolify-devops is where that copy runs.

The split, so neither kit oversteps: **`/ship` decides whether and what goes live.
`/host` decides where and how it runs.** `/ship` never touches the server. `/host`
never judges readiness. The address is the only thing that crosses.

| Moment | On the builder's machine (AI Build Kit) | On the server (coolify-devops) |
|---|---|---|
| Setup | The fit check asks whether anyone outside the team will rely on it | That is the lane question: outside users mean public, otherwise internal |
| First launch | `/ship` clears the work and writes a hosting request into the masterplan: repo, branch, recommended lane, port, env var names, persistent paths, healthcheck | `/host <repo url>` reads that request instead of researching, deploys from the git source, and hands back an address block to paste into the masterplan |
| Every later launch | `/ship` merges to `main` and checks the live address | Coolify redeploys on push; per-PR previews are the draft copy `/ship` expects |
| Operational readiness | `/ship` asks for rollback, access review, backups | Rollback is a redeploy of the previous build; access is `/grant-access`; backups are Coolify's schedules. The address block names all three |

The two kits never read each other's files, apart from `/host` reading the masterplan.
The person carries the address between two sessions on two machines, and that is
deliberate: a human between "ready" and "live" is the safety property both kits are
built around.

## How it compares

| | Where it runs | What you type | What it gives you |
|---|---|---|---|
| Coolify's dashboard | your browser | clicks | Deploys anything in minutes. Remembers nothing about why, and cannot tell you the tailnet label you set is write-once |
| Terraform for Coolify | your machine | HCL | Declarative state for a provider that lags the API. `docs/iac.md` in the deployment repo records why it was evaluated and not adopted |
| Dokku, Kamal, Coolify's CLI | your terminal | commands | A developer's deploy tool. Assumes you read logs and know Docker |
| AI Build Kit | the project repo | `/ship` | Decides when a tool is ready to rely on. Does not host it |
| coolify-devops | the server | `/host`, `/change-service`, `/health`, `/grant-access` | The hosting discipline carried for you, with the deployment repo as the record |

## What it does not promise

Provided as-is under MIT, with no warranty. The skills verify what they can reach
from the server: a browser check over the tailnet is still a human's job, and a
skipped firewall is recorded as a known gap, not silently accepted. The MCP is the
only way in, so anything the MCP cannot do, the skills will say cannot be done from
here rather than reach for a shell. Secrets are never printed into a session, and
never stored in the repo.

## For technical people

The public repository is an Agent Skills source and a Claude Code plugin marketplace.
Each folder under `skills/` is one skill with everything it needs; both routes carry
the same five. `.claude-plugin/plugin.json` lists them for the plugin route, and
`skills.sh.json` groups them for the skills CLI.

The skills operate a **deployment repo**, which `/setup-coolify-devops` creates *in
place*, in the working directory. Its `.gitignore` is an allow-list, so a home
directory is safe as a git repo: only the files below are ever tracked.

| Path | What it is |
|---|---|
| `AGENTS.md` | The operating rules every agent session reads: lanes, naming, the write path, the traps. Rendered |
| `CLAUDE.md` | One line, `@AGENTS.md`, so Claude Code imports the same rules; other agents read `AGENTS.md` directly |
| `instance.yaml` | Your bindings; skills name its keys instead of hardcoding values |
| `docs/` | Runbooks rendered for your instance (`provisioning.md`, `platform.md`, `internal-services.md`, `tailnet-access.md`, `changing-a-resource.md`) plus two hand-maintained state files, `infrastructure.md` and `tailnet-state.md` |
| `stacks/` | Reference copies of what is deployed. Coolify is the write path; nothing here is applied |
| `.mcp.json` | `npx @masonator/coolify-mcp@latest` with `${COOLIFY_BASE_URL}` / `${COOLIFY_ACCESS_TOKEN}` from your shell |

The rendered files come from templates bundled *inside* the setup skill
(`skills/setup-coolify-devops/assets/`, rendered by
`skills/setup-coolify-devops/scripts/scaffold.js`). That is deliberate: both install
routes deliver only skill directories, so the runbooks travel with the skill and
update with it. The scaffolder finds the deployment repo from its own path when
installed as files, and falls back to the working directory when it runs from the
plugin cache; it never creates a nested folder.

Updating, plugin route:

```bash
claude plugin marketplace update coolify-devops
claude plugin update coolify-devops@coolify-devops --scope local
```

then ask Claude to re-render the runbooks (`/coolify-devops:setup-coolify-devops`
in an existing repo does only that). Skills CLI route:

```bash
npx skills update                                                        # new skills, new templates
node .claude/skills/setup-coolify-devops/scripts/scaffold.js --render    # re-render AGENTS.md and docs/
```

`npx skills update` refreshes the skills already installed; a skill that was
*renamed* upstream shows as "deleted upstream" and its new name is not picked up. Run
`npx skills add KasperHonore/coolify-devops -a claude-code -y` again to get it, and
`npx skills remove <old-name> -y` for the stale copy. The state files and `stacks/`
are yours and are never touched by a render.

Assumptions the library makes:

- **Software**: Coolify 4.x, docktail as the tailnet registrar, Traefik as the public
  proxy, Cloudflare or DuckDNS for public DNS. `instance.yaml` parameterises the
  *names*; swapping the software invalidates whole runbook sections, not just bindings.
- **Lanes are fixed**: internal tools are always Tailscale Services on the tailnet; the
  public lane needs a domain and exists only for public-facing apps. The cloud firewall
  outside the VM is what enforces that split, because Docker-published ports bypass `ufw`.
- **The MCP is the only way in.** The skills never assume a shell on the host;
  `scheduled_tasks` `run_once` is the shell substitute.
- **Coolify is the write path.** `stacks/` holds reference copies, never applied config.

Maintaining this repo: it is the `library/` subtree of the author's own deployment
repo, which consumes it exactly as a consumer does, so what every consumer receives
and what the author runs on cannot drift. `npm test` scaffolds two sample repos into
a temp dir and fails on any unrendered template tag; `claude plugin validate . --strict`
checks the manifests. Design notes and the record of decisions:
`skills/setup-coolify-devops/assets/docs/skill-library.md`.

License: MIT.
