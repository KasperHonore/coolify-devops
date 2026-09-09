{{#IS_LIBRARY}}<!-- Rendered from library/skills/setup-coolify-devops/assets/AGENTS.md + instance.yaml by `npm run render`. Edit the template, not this file. -->

{{/IS_LIBRARY}}# Coolify hosting

Everything is hosted on a single Coolify server, deployed as Docker Compose services.

**Before changing anything about hosting, read `docs/platform.md`** (how it works) and
`docs/infrastructure.md` (what is here), and follow the patterns already in use. Check live state with the Coolify MCP — it is the source of
truth.

## The MCP is the only way in
{{#ON_HOST}}
**This repo is operated on the Coolify host itself.** A shell, the `docker` CLI and
`/data/coolify` are all right here — and every change still goes **through the Coolify
MCP only**. That is policy, not a limitation: Coolify's database is the source of truth,
and a `docker compose up`, a `docker restart`, or an edit under `/data/coolify` changes
the box behind Coolify's back, leaves the MCP's view stale, and is exactly the drift
`/health` exists to catch. Never mutate anything from the shell. Read-only checks from
the shell are fine and useful — `curl` against a tailnet URL, `tailscale status`,
`docker ps` to confirm what the MCP reports — but the MCP's answer is the one that
gets recorded.

Because this machine is on the `{{INTERNAL_SUFFIX}}` tailnet, `https://<name>.{{INTERNAL_SUFFIX}}`
resolves here and `curl -sI` against it is a real reachability check for internal
services. Still do the MCP-side verification in `docs/internal-services.md` too — it
proves the service is registered, not just that this machine can see it.

This directory is normally root's home: where the Coolify web terminal and Tailscale
SSH land, so a session starts here with nothing to `cd` into. The `.gitignore` is an
allow-list — only the repo's own files are tracked — so `git add -A` is safe here.

**The `tailscale` CLI is here, and it is the one thing the shell *may* change.** Node-local
Tailscale settings — Tailscale SSH (`tailscale set --ssh`), tags
(`tailscale up --advertise-tags=... --force-reauth`), the hostname — are done from
here directly, not handed to a human. What the CLI cannot do stays a prepared console
step: key expiry, the tailnet's name, the policy file, OAuth clients
(`docs/provisioning.md`, section 2, has the table).

**The outside firewall probe cannot be run from here.** Traffic from the host to its
own public IP never crosses the cloud firewall, so every port would look open. That
probe is a prepared step for a human on a machine off the tailnet (`docs/provisioning.md`,
section 7); `/setup-coolify-devops` and `/health` hand it over and record the answer.
{{/ON_HOST}}{{^ON_HOST}}
This repo operates Coolify **through the Coolify MCP only**. No SSH, no `docker` CLI,
no reading or writing files on the server. Anything about live state — compose, env,
logs, container health — goes through the MCP. If the MCP cannot do it, it cannot be
done from here; say so rather than reaching for a shell.
{{#SAME_TAILNET}}
The machine this repo is operated from is on the `{{INTERNAL_SUFFIX}}` tailnet, the same
one internal services live on, so `https://<name>.{{INTERNAL_SUFFIX}}` resolves from here
and a browser-level check is possible locally. Still prefer the MCP-side verification in
`docs/internal-services.md` — it proves the service is registered, not just that one
machine can see it.

**One exception to "no SSH": Tailscale SSH onto the Coolify host, for the `tailscale`
CLI and read-only checks only.** If the host has Tailscale SSH enabled,
`ssh root@<host-tailnet-ip> tailscale status` works from here with no key, and through
it the node-local Tailscale settings (SSH, tags, hostname) and the read-only checks
(`curl`, `tailscale status`, `docker ps`) are done directly instead of handed over.
Nothing else crosses that connection: no `docker` mutations, nothing under
`/data/coolify` — Coolify's state changes through the MCP only. Console-only items
(key expiry, tailnet name, policy, OAuth clients) stay prepared human steps.
{{/SAME_TAILNET}}{{/ON_HOST}}{{^SAME_TAILNET}}
**Internal URLs do not resolve from here.** This repo is operated from a machine
{{#OPERATOR_TAILNET}}on the **`{{OPERATOR_TAILNET}}`** tailnet — not {{/OPERATOR_TAILNET}}{{^OPERATOR_TAILNET}}that is **not** on {{/OPERATOR_TAILNET}}the `{{INTERNAL_SUFFIX}}` tailnet
where internal services live. Being on some tailnet here does not put you on that one.
`https://<name>.{{INTERNAL_SUFFIX}}` is reachable only from that tailnet, so curling
one from this host fails no matter how healthy the service is — a failure here is not
evidence of anything. Verify internal services the way `docs/internal-services.md`
says: the registrar's logs through the MCP, and the Tailscale control-plane API, both
of which work from anywhere. Only browser-level reachability needs someone actually on
that tailnet.{{#HAS_PUBLIC}} Public `*.{{PUBLIC_SUFFIX}}` addresses are on the open
internet and are reachable from here.{{/HAS_PUBLIC}}
{{/SAME_TAILNET}}
## Public vs internal

Every resource goes down one of two lanes. Pick the lane first; it decides the project,
the domain, and the networking.

**Internal (default)** — reachable only over the tailnet. No domain, no published port,
not on the internet. Registered as a Tailscale Service by `{{REGISTRAR}}`. Lives in the
**{{PROJECT_INTERNAL}}** project. Internal tools are *always* on the tailnet; there is no
other internal option.

**Public** — reachable on the internet at `<name>.{{PUBLIC_SUFFIX}}` via Traefik, which
handles TLS. DNS is automatic; never add records by hand. Lives in the **{{PROJECT_PUBLIC}}**
project. The public lane exists only with a domain (your own, or a free DuckDNS
one).{{^HAS_PUBLIC}} **This instance has no public lane** — `domains.public_suffix` in
`instance.yaml` is empty and ports 80/443 are closed at the firewall. Nothing here is
internet-reachable, and nothing should be; to add a public lane, set the suffix, open
80/443 per `docs/provisioning.md`, and deploy `{{PUBLIC_DNS}}` before the first public
resource.{{/HAS_PUBLIC}}

Default to internal. Go public only when an external party, inbound webhook, or OAuth
callback genuinely requires it — a tool receiving third-party webhooks is the bar.

**The firewall is what enforces the lanes.** "No published port" is a convention; the
cloud firewall in front of the host is the guarantee — Docker's own port publishing walks
straight past `ufw`, so a stray `ports:` line on an internal tool would put it on the
public IP if the cloud firewall were not there. The rules, which follow from the lane
answer and `exposure.coolify_ui`, are in `docs/provisioning.md`. With a Hetzner API
token in the shell (`HCLOUD_TOKEN`), `/setup-coolify-devops` creates that firewall and
`/health` reads its rules back; without one, both fall back to having the public IP
probed from outside. The Coolify dashboard itself
(port 8000) is reachable by: **{{UI_EXPOSURE}}**{{#UI_GITHUB}} — the tailnet plus
GitHub's webhook ranges, so push-to-deploy works without the dashboard being on the open
internet{{/UI_GITHUB}}{{#UI_TAILNET}} — over the tailnet only; GitHub cannot deliver
push-to-deploy webhooks to it{{/UI_TAILNET}}{{#UI_INTERNET}} — anyone; 2FA on the
Coolify account is mandatory{{/UI_INTERNET}}.

A third project, **{{PROJECT_INFRA}}**, holds the platform plumbing that makes both lanes
work (`{{REGISTRAR}}` for the tailnet, `{{PUBLIC_DNS}}` for public DNS). It is not
user-facing.

## Simple names

One resource, one plain name — `{{CANARY}}`, `wiki`. That name is the Coolify resource, the
Tailscale Service, and the subdomain, and the name plus the lane's suffix is the whole
address:

- Internal — `https://<name>.{{INTERNAL_SUFFIX}}`
- Public — `https://<name>.{{PUBLIC_SUFFIX}}`

No qualifiers, no environment or team prefixes, and no port for anyone to remember.

**Always HTTPS.** An internal tool reached over its Tailscale domain is served on 443 with
a Tailscale-issued certificate — never plain HTTP, and never a non-standard port. That is
`docktail.service.service-port=443`, with `docktail.service.port` pointing at whatever port
the container listens on. `{{CANARY}}` is the reference: `port=80`, `service-port=443`.

If a resource seems to need a qualified name, treat that as a signal to look again at how
it is wired before accepting the name.

**Set `service-port=443` on the first deploy and never change it.** docktail writes a
Tailscale Service definition's ports only when it creates it, so changing `service-port`
later silently breaks the service, with no error anywhere.

**Putting something on the tailnet? Follow `docs/internal-services.md`** — the label set,
the port rules, and the four verification steps that catch this. For who may reach it —
adding people, groups, and scoping grants — see `docs/tailnet-access.md`.

## Skills

The project skills encode the procedures — prefer invoking them over working from memory:

- **`/host`** — host something new, end to end. Input: a repo, image, or product name,
plus the lane (internal by default, public only when something external needs in). It
runs the whole flow: research, naming, compose, create, deploy, the four verification
steps, and the repo bookkeeping.
- **`/change-service`** — change an existing resource safely. Compose edits, env vars,
and especially `content:` file mounts, where the obvious path updates a database row
and nothing else.
- **`/health`** — read-only sweep of the whole estate: status, reachability, and drift
between live state and the `stacks/` copies. Start ops sessions here; it never mutates.
- **`/grant-access`** — the people side of the tailnet: onboard or offboard someone,
grant a group specific tools, scope a service to a narrower audience. Policy and
membership only — publishing a service is `/host`, its labels are `/change-service`.
- **`/setup-coolify-devops`** — bootstrap a fresh Coolify instance or pivot this repo to a
different one: interview → `instance.yaml`, projects, plumbing, canary, repo
scaffold, `/health` as acceptance. The endgame it serves is `docs/skill-library.md`.
What comes *before* it — the VM, Tailscale, the Coolify install, the firewall — is a
human checklist, `docs/provisioning.md`, that `/setup-coolify-devops` hands over and then verifies.

The docs stay authoritative; the skills follow them. When a skill and a doc disagree,
the doc wins — then fix the skill.

**Instance bindings live in `instance.yaml`** — domains, project names, canary, policy
defaults. Skills name its keys instead of hardcoding values, so the skill library
survives a pivot to another instance. The domain suffixes and tailnet names stated in
prose in this file are restated for readability only; `instance.yaml` is authoritative —
on a pivot, update it first and re-render this file. The full layering rules are
`docs/conventions.md`.

**Skills are living runbooks.** When a session learns something the hard way, fold it
into the skill that should have prevented it — in the same commit as the fix, the same
way `stacks/` copies are updated with the change. Before authoring a *new* skill, watch
a session struggle without it first, and encode only what closes the observed gap;
skills stay short enough to be followed. New or heavily changed skills earn trust
through a fresh-context trial — the protocol is in `docs/conventions.md`.

## Watch out for

- Secrets live in Coolify's per-service env store, never in this repo.{{#HAS_MCP_JSON}} The MCP's
own token comes from the shell (`.mcp.json` reads `COOLIFY_ACCESS_TOKEN`); it is never
written to a file here.{{/HAS_MCP_JSON}} **Never print a secret into the session**: no
`env`, no `env | grep`, no `echo $COOLIFY_ACCESS_TOKEN`, no `cat` of `~/.config/*.env`,
`.bash_history` or any credential file — a session transcript is a file on disk, and a
value printed once is stored for good. Check presence only:
`[ -n "$COOLIFY_ACCESS_TOKEN" ] && echo set || echo unset`. The same goes for MCP
calls: `env_vars list` without `reveal`, and `reveal: true` only with a `key`, only
when the value itself is what the task needs.
- **Coolify is the write path.** Compose definitions and env live in its database, not in
this repo. `stacks/<name>/` holds reference copies so they are readable in git, but nothing
there is applied and they are not runnable as plain Compose. Change the resource in
Coolify, then update the copy. See `docs/changing-a-resource.md`.
- **A resource with non-obvious wiring gets its own `stacks/<name>/README.md`**, next to
its reference compose. Look for one before touching a resource, and write one when you
deploy something that needs it.
- **No shell — `run_once` is the shell substitute.** Coolify is on another host;
`scheduled_tasks` `action: run_once` runs a command in any container and returns its
output. Reach for it before theorising. The `logs` tool has 500'd for service
containers in the past but worked in 2026-08 — try it, fall back to `run_once`. See
`docs/platform.md`, *Working through MCP*. For "how does Coolify do X", `search_docs`
searches the official docs — use it before guessing.
- **Wait with tool calls, never with a scheduled wakeup.** A registrar reconcile, an
image build, a human's console step: poll `logs`, `deployment get` or `get_service` in
bounded loops. A scheduled wakeup outlives the session — one fired its prompt into the
next session after a `/clear`, which re-did finished work and committed a spurious
finding.
- **This side never edits a product repo.** `/host` deploys what a repo is; code that
will not host (a loopback bind, no Dockerfile, no `curl` for the healthcheck) is a
finding sent back to the builder, who pushes the fix and Coolify redeploys. No `gh`,
no clone, no PR from here — the GitHub App Coolify holds is the only GitHub access
this server has.
- **Before your first deploy, read `docs/changing-a-resource.md` too**, not just
`platform.md`. The lore about what actually changes a file mount, what recreates a container, and which
status fields lie lives there — written by sessions that learned it the hard way.
- **Commit straight to `{{COMMIT_BRANCH}}`.** There is no PR flow and no other branch —
do not create one, and do not ask to. If work is already sitting on a branch,
fast-forward `{{COMMIT_BRANCH}}` onto it and delete the branch.{{#IS_LIBRARY}}
- **Never push this repo.** It holds this instance's state (`docs/`, `stacks/`,
`instance.yaml`) and has no push remote on purpose. The only thing that leaves it is
`library/`, published to GitHub by `npm run publish-library` from inside `library/`,
where consumers install it with `npx skills add`. `.claude/skills/*` are symlinks into
`library/skills/`; the runbook templates live in `library/skills/setup-coolify-devops/assets/`, and
this file plus the runbooks in `docs/` are rendered from them by `npm run render` —
edit the source, then render. Nothing instance-specific ever goes under `library/` —
the rules are in `docs/conventions.md`.{{/IS_LIBRARY}}{{^IS_LIBRARY}} If the repo has
a remote, push after every commit.
- **`AGENTS.md` and the runbooks in `docs/` are rendered outputs.** They come from the
templates bundled in the setup skill, rendered from `instance.yaml`. Do not hand-edit
them; change `instance.yaml` (or update the skills with `npx skills update`) and run
`node .claude/skills/setup-coolify-devops/scripts/scaffold.js --render`. The two state files,
`docs/infrastructure.md` and `docs/tailnet-state.md`, are hand-maintained and never
re-rendered.{{/IS_LIBRARY}}
- Guardrails and the checklist for adding a resource are in `docs/platform.md`; the
inventory, volumes and known gaps are `docs/infrastructure.md`.
