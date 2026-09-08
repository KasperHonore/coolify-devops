---
name: host
description: Host something new on the Coolify server, end to end — from a git repo, Docker image, or product name to a verified, reachable service. Use when the user says "host X", "deploy X", "spin up X", "put X on the tailnet", or "make X public". Handles lane choice (internal/public), naming, compose authoring, Coolify creation, deployment, verification, and repo bookkeeping.
---

# Host a new resource

You are deploying onto the single Coolify server described in `docs/platform.md` (how it works)
and `docs/infrastructure.md` (what is on it), reachable **only through the Coolify MCP** — no SSH, no docker CLI. Read that file's
"Checklist for adding a new resource" if anything below is ambiguous; it is authoritative.

Required input: **what** to host (git repo URL, image reference, or product name).
Optional: **lane** and **name**. The name is resolved from the rules; the lane is
**asked for** when the user did not state it (step 1).

**Read `instance.yaml` (at the repo root) first.** Domains, project names, the
environment, and policy defaults are named below by their keys there — never assume
the values, and never hardcode a value from it back into this skill.

## 1. Decide lane and name

- **Lane: if the user stated it, that decides it. If not, always ask** — one question,
  "internal (tailnet-only) or public (on the internet)?" — recommending internal unless
  an external party, inbound webhook, or OAuth callback genuinely requires public
  (the bar: a tool that receives third-party webhooks). Never silently default: the lane decides who can reach the thing, and
  exposure is the user's call, not the skill's.
  - Internal → project `projects.internal`, address `https://<name>.<domains.internal_suffix>`
  - Public → project `projects.public`, address `https://<name>.<domains.public_suffix>`
- **Name: one plain lowercase word**, hyphen only if unavoidable. Same name for the
  Coolify resource, the subdomain, and (internal) `docktail.service.name`. No `-api`,
  `-web`, `-app` suffixes, no prefixes, no port. If the resource seems to need a
  qualified name, its wiring is wrong — re-read "Naming" in `docs/platform.md`.

## 2. Research the upstream before writing anything

**Do not skip to compose authoring on the strength of a README badge.** For anything
beyond a single obvious image, spawn a web-capable research subagent to read the
project's official docs and return a deployability report — delegating keeps the doc
dumps out of this session's context, and the report is the input to step 3.

The subagent answers, from the official installation/self-hosting docs (not blog posts):

1. **How is this actually installed?** Every documented method — official Docker
   image, official compose file, helm-only, bare-metal — and which one upstream
   recommends. Docker being undocumented does not make it impossible, but it raises
   the bar: say so explicitly.
2. **Image and version**: registry path, the current stable tag to pin (never
   `latest`), official vs. community image.
3. **Required configuration**: the env vars a working install needs (and which are
   secrets), config files it must mount, first-run / initial-admin steps, and the
   databases or caches it expects — with versions.
4. **Behind a reverse proxy**: does it need a base/public-URL setting, proxy-header
   trust, or websocket config? (A reverse-proxied app can need five separate proxy/URL vars set together.)
5. **State**: which paths must persist, and what breaks when they don't.
6. **Healthcheck**: does the image ship one; if not, which endpoint would serve.
7. **Baked-at-build config (SPA trap)**: is any URL or flag we need to change a
   `VITE_*`/`NEXT_PUBLIC_*`-style build-time value? If unsure, inspect the Dockerfile
   or grep the served JavaScript of a demo. Build-time-only config forces
   build-from-source or a fronting proxy — know this before
   choosing the shape.
8. **Gotchas**: migration steps, self-hosting license limits, known reverse-proxy or
   HTTPS issues.

Everything version-sensitive is validated **against the tag being pinned, not `main`**
(`raw.githubusercontent.com/<org>/<repo>/<tag>/<path>`).

**In parallel, check for an official Coolify service template** (e.g. `n8n-with-postgresql`). A template wires `SERVICE_*` magic variables, healthchecks,
and volumes correctly — prefer it, but validate it against the report: templates can
lag upstream or omit proxy settings the docs require. A template that fails validation
simply demotes you down the ladder — and a template adapted past recognition is a
hand-written compose that the template seeded, which is a fine outcome.

**When you keep a template's healthcheck but bump the image tag, validate the
check's own binary against the tag's Dockerfile** — the probe command is
version-sensitive config like any other. A check written for an older image can
reference a binary a newer image dropped, and then fail forever on a healthy backend.

**Then pick the deployment shape.** First branch on whose code it is:

- **Our own repo, or anything under active development → a Coolify *application***
  from the git source (step 3a). This is what buys auto-deploy on push, rolling
  zero-downtime updates, and working deployment history — a compose service gets none
  of those. Do not wrap your own repo in a hand-written compose out of habit.
- **A third-party product → a *service***, in order of preference: Coolify template →
  upstream's own compose, adapted → official image in a minimal hand-written compose →
  build-from-source (last resort, and only with a concrete reason such as the SPA
  trap).

If the report shows no sane path at all, say so and stop — "not a good fit for this
platform" is a valid outcome, and far cheaper before a deploy than after.

## 3. Author the deployment

### 3a. Application — our own git repo

- **Source**: a GitHub App integration is the full-featured path (auto-configured
  webhooks, auto-deploy on push, commit statuses, per-PR preview deployments) and
  needs configuring once per account; a plain public-repo source or deploy key works
  with a manually added webhook for push-to-deploy. Point it at the default branch —
  a push to `main` then redeploys automatically. **Push-to-deploy needs GitHub to
  reach the Coolify instance URL**: it works when `exposure.coolify_ui` is `github`
  or `internet`, and cannot when it is `tailnet` — say so up front rather than
  letting the first push silently not deploy (`docs/platform.md`, *The Coolify
  dashboard and push-to-deploy*).
- **Build pack**: a `Dockerfile` in the repo for anything long-lived (full control,
  reproducible); Nixpacks/Railpack only for quick zero-config starts.
- **Zero-downtime**: rolling updates happen for applications *only* when a passing
  healthcheck is configured and no host port is published — both are therefore
  required, not optional. (Compose services always hard-stop then start.)
- **Do not publish host ports.** Env vars, volumes, and secrets rules below apply
  the same as for services.
- **MCP differences from services**: `deploy` semantics, deployment history
  (`list_deployments`), and `diagnose_app` all *work* for applications; use
  `update_application` for the FQDN.
- **Internal-lane applications**: docktail labels go through the application's
  custom container-labels setting rather than a compose file. This path is unproven
  on this estate — verify with the four steps extra carefully on first use, and
  record what worked in the app's `stacks/<name>/README.md`.

### 3b. Service — third-party compose

Rules for every service in the stack:

- Pin image tags. Declare named volumes for anything stateful. No `container_name`.
- **No published ports, either lane.** Traefik and docktail both reach containers over
  the network.
- Credentials via Coolify magic variables (`SERVICE_PASSWORD_X`, `SERVICE_USER_X`,
  `SERVICE_FQDN_X`) unless the app needs a format Coolify cannot generate (an
  `sk-` prefix, a 64-hex key) — then hand-set and document why.
- Healthchecks on every container where feasible — an `unknown` status should be signal,
  not noise. A healthcheck probing `localhost` against an IPv4-only server causes
  Traefik 503s; probe `127.0.0.1`. Whether Coolify honors an image-baked `HEALTHCHECK`
  is unverified — duplicate it explicitly in the compose rather than
  find out from a `running:unknown`.
- Config files go in as `content:` bind mounts — but know they are **written once, at
  creation** (see `docs/changing-a-resource.md` before ever changing one). This holds even when
  the config *is* the product (a dashboard's own YAML, say) — there is no shell to
  edit a volume-backed file — but it means every future config edit is the full
  `/change-service` recreate sequence; state that consequence in the resource's
  README so nobody discovers it mid-edit.

**Talking to another internal resource** (an LLM gateway, a database UI, anything
already on the tailnet): stacks do not share a Docker network here, so its container
name will not resolve — measure, do not assume. The proven path is its tailnet hostname
pinned to its Tailscale Service VIP via `extra_hosts` ("One stack calling another
internal service" in `docs/internal-services.md`); record the VIP dependency in both READMEs. The alternative — `service update`
with `connect_to_docker_network: true`, joining the shared `coolify` network — is
settable since MCP 3.0.0 but unmeasured here; the open questions to settle
before using it are listed in that same section. Do not pick it silently.

**Read the image's init before trusting a green container.** An s6/supervisord image
can stay `running` with its main process never started (e.g. a migrate-before-Postgres-is-ready race that leaves
sidecars up and nothing on the app port).
`run_once` a `ps` and a loopback probe of the app port as soon as the container exists;
a `content:` mount over the init's own script is a legitimate fix when upstream has
none, with the write-once caveats stated in the README.

**Internal lane** — add the docktail labels to exactly one container (the app, or a
small nginx front if one hostname must cover several backends — see "When a resource is
more than one container" in `docs/internal-services.md`):

```yaml
labels:
  - docktail.service.enable=true
  - docktail.service.name=<name>
  - docktail.service.port=<the port the container actually listens on>
  - docktail.service.service-port=443   # explicit, first deploy, forever — write-once
  - docktail.service.description=<short description>
```

**Public lane** — no docktail labels; the FQDN does the work (step 4). Never add DNS
records by hand; the `plumbing.public_dns` service owns the wildcard record. If the
resource needs Traefik basic-auth labels, set `is_container_label_escape_enabled:
false` on the service *before* writing them, or Coolify double-escapes the `$` in the
htpasswd hash and the login never matches.

## 4. Create, configure, deploy (MCP)

1. Applications: create via `application` with the git source, branch, and build
   pack. Services: `service` create with `docker_compose_raw` — **omit `type`** (the
   API rejects `type` + `docker_compose_raw` together). Either way, target the lane's
   project and the `environment` from `instance.yaml`. If `list_destinations` shows
   more than one Docker network on the server, pass `destination_uuid` — the API
   refuses a service create without it there (one destination: omit it).
2. Public lane: set the FQDN `https://<name>.<domains.public_suffix>` on the app
   container.
3. Set any hand-set env vars (`env_vars` / `bulk_env_update`). Remember: only `${VAR}`
   references in the compose create env-store rows.
4. Deploy. **`deploy wait: true` does not wait for services** — poll
   `list_containers` / the URL yourself, with tool calls, immediately and between
   bookkeeping steps. **Never end the turn to "wait"** — an image pull typically
   finishes inside a minute, and a parked session helps nobody. Ignore the deploy
   response's `list_deployments` hint for services: it returns `[]`. Deployment
   history is invisible for services; on failure, inspect with `run_once` instead of
   hunting for build logs. (History and hints work properly for applications.)

## 5. Verify — a green deploy proves nothing

- **Internal:** run **all four steps** in `docs/internal-services.md`: the
  registrar's logs (`plumbing.tailnet_registrar`) show `key=svc:<name>:443`; the
  Tailscale control-plane definition reads
  `ports=['tcp:443']` (the only place the write-once trap is visible); `/devices` shows
  `approved:auto` + `configured: ready`; a human loads the URL in a browser (it does not
  resolve from this host — that failure is not evidence). If the control-plane check is
  blocked because the registrar's credentials are access-controlled in your session, collect
  the compensating evidence that doc describes and hand steps 2–3 to the human
  explicitly — never skip them silently, and never fight the permission system for a
  secret.
- **Public:** `curl` the public URL from here — it is on the open internet.
- In-container checks (files, ports, processes): `scheduled_tasks` `action: run_once`
  (255-char command cap, keep it idempotent). Reach for it at the *first* hypothesis,
  not the third.

## 6. Backups — recommend, don't require

If the resource is stateful, recommend a backup and say what it protects. The worked
pattern is a nightly `pg_dump` scheduled task into a volume of its own
(`docs/platform.md`, *Backups*). The default answer follows `policy.backups_default` in
`instance.yaml`. Either way, record the decision in `stacks/<name>/README.md` and move
on — a "no" is a decision, not an open item.

## 7. Bookkeeping (not optional)

1. `stacks/<name>/docker-compose.yml` — reference copy of what Coolify now holds; break
   any `content:` mounts out as real files alongside it.
2. `stacks/<name>/README.md` — required if anything about the wiring is non-obvious
   (proxy fronting, hand-set secrets, build-from-source, backup decision).
3. Update the inventory table and, if stateful, the volumes table in
   `docs/infrastructure.md`.
4. Internal lane: note the access decision — check the current grant model in
   `docs/tailnet-state.md` ("Where we are today"); under a blanket grant the whole
   tailnet sees the new service immediately.
5. Commit straight to `main`.
