{{#IS_LIBRARY}}<!-- Rendered from template/CLAUDE.md + instance.yaml by `npm run render`. Edit the template, not this file. -->

{{/IS_LIBRARY}}# Coolify hosting

Everything is hosted on a single Coolify server, deployed as Docker Compose services.

**Before changing anything about hosting, read `docs/platform.md`** (how it works) and
`docs/infrastructure.md` (what is here), and follow the patterns already in use. Check live state with the Coolify MCP — it is the source of
truth.

## The MCP is the only way in

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
{{/SAME_TAILNET}}{{^SAME_TAILNET}}
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
**{{PROJECT_INTERNAL}}** project.

**Public** — reachable on the internet at `<name>.{{PUBLIC_SUFFIX}}` via Traefik, which
handles TLS. DNS is automatic; never add records by hand. Lives in the **{{PROJECT_PUBLIC}}**
project.{{^HAS_PUBLIC}} No public lane is configured yet — `domains.public_suffix` in
`instance.yaml` is empty; set it (and deploy `{{PUBLIC_DNS}}`) before the first public
resource.{{/HAS_PUBLIC}}

Default to internal. Go public only when an external party, inbound webhook, or OAuth
callback genuinely requires it — a tool receiving third-party webhooks is the bar.

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
- **`/setup`** — bootstrap a fresh Coolify instance or pivot this repo to a
different one: interview → `instance.yaml`, projects, plumbing, canary, repo
scaffold, `/health` as acceptance. The endgame it serves is `docs/skill-library.md`.

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
written to a file here.{{/HAS_MCP_JSON}}
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
- **Before your first deploy, read `docs/changing-a-resource.md` too**, not just
`platform.md`. The lore about what actually changes a file mount, what recreates a container, and which
status fields lie lives there — written by sessions that learned it the hard way.
- **Commit straight to `{{COMMIT_BRANCH}}`.** There is no PR flow and no other branch —
do not create one, and do not ask to. If work is already sitting on a branch,
fast-forward `{{COMMIT_BRANCH}}` onto it and delete the branch.{{#IS_LIBRARY}}
- **Never push this repo.** It holds this instance's state (`docs/`, `stacks/`,
`instance.yaml`) and has no push remote on purpose. The only thing that leaves it is
`library/`, published to GitHub by `npm run publish-library` from inside `library/`;
`.claude/skills/*` are symlinks into `library/skills/`, and this file plus the runbooks
in `docs/` are rendered from `library/` by `npm run render` — edit the source, then
render. Nothing instance-specific ever goes under `library/` — the rules are in
`docs/conventions.md`.{{/IS_LIBRARY}}{{^IS_LIBRARY}} If the repo has a remote,
push after every commit.{{/IS_LIBRARY}}
- Guardrails and the checklist for adding a resource are in `docs/platform.md`; the
inventory, volumes and known gaps are `docs/infrastructure.md`.
