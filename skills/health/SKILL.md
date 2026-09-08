---
name: health
description: Read-only health sweep of the whole Coolify estate — infrastructure overview, unhealthy resources, tailnet spot-checks, and drift detection between live compose and the stacks/ reference copies. Use when the user asks "how is everything", "health check", "status", "anything broken?", or at the start of an ops session before touching anything. Never mutates anything.
---

# Estate health sweep

**Read-only by contract.** No deploys, restarts, env writes, or storage changes — if the
sweep finds something that needs fixing, report it and stop; fixing is `/change-service`
territory and a separate decision.

## 1. Coolify layer

- `get_infrastructure_overview` and `find_issues`.
- `find_issues` flags every healthcheck-less service as a `running:unknown` warning on
  every run — cross-check its list against the expected set before reporting any of
  them as a finding. A warning about an **available Traefik update** on the server is
  real signal, not noise — report it (fixing is a `/change-service` decision).
- `get_version` and `get_mcp_version`: if either differs from what
  `docs/infrastructure.md`'s platform table records, report the drift (the MCP's tool
  names have changed between majors before — see "Tool surface" there).
- **Which `running:unknown` statuses are expected (images without healthchecks) and
  which are real signal is documented in the inventory section of
  `docs/infrastructure.md`** — read it and do not re-litigate the expected ones.

## 2. Reachability

- **Public lane** resolves from this host: `curl -sI` each public resource at
  `https://<name>.<domains.public_suffix>` (suffix from `instance.yaml`, resources from
  the inventory) and expect 200/30x. A Traefik `no available server` 503 often means an *unhealthy
  container was dropped from the load balancer*, not a network fault — check the
  healthcheck first.
- **Internal lane does not resolve from this host** — a failed curl proves nothing.
  Verify via the two paths that work from anywhere (`docs/internal-services.md`):
  the registrar's logs through the MCP (`plumbing.tailnet_registrar` in
  `instance.yaml`; the `logs` rough edge may 500 — skip, don't fight it), and the
  Tailscale control-plane API using the registrar's own OAuth credentials:
  every service should read `ports=['tcp:443']` and its `/devices` should show
  `approved:auto` + `configured: ready`. Never echo those credentials.

## 2b. Exposure — is the perimeter what `instance.yaml` says?

Two checks, both read-only, both cheap; skip neither.

- **Probe the public IP from here.** `get_server` for the address, then the loop in
  `/setup` step 2 (`</dev/tcp/<ip>/<port>` with a 3 s timeout) over 22, 80, 443,
  3000, 8000, 6001, 6002. Expected: 80/443 open only with a public lane
  (`domains.public_suffix` set), 8000 open only when `exposure.coolify_ui` is
  `internet` (in `github` mode it must read closed from here), all else closed. A
  port that answers when it should not is the lead finding of the whole sweep — it
  means the cloud firewall is missing or wrong (`docs/provisioning.md`), not that
  some container is misconfigured.
- **Scan the internal lane for published ports.** For every resource in
  `projects.internal` (and `projects.infrastructure`), read the compose
  (`get_service` / `get_application`; `ports_exposes` on applications is Coolify's
  own field, not a published port) and flag any `ports:` entry or `ports_mappings`.
  Internal tools are reached by the registrar over the container network; a
  published port is a leak waiting for the firewall to be relaxed. Report it as
  drift from the lane model even though the firewall currently masks it.

## 3. Drift — live vs. reference copies

For each folder in `stacks/` with a compose copy: fetch the live compose
(`get_service`) and diff it against `stacks/<name>/docker-compose.yml`; read live
file-mount contents (`storages` `action: list`) and diff against the broken-out files.
Report drift with the differing lines — **do not reconcile in either direction** during
a sweep; which side is right is a decision for the user or a `/change-service` session.

## 4. Report

One table — resource, Coolify status, reachability check, drift — leading with anything
actually broken (an unexpected open port first of all), then drift, then the
expected-unknowns marked as such. If nothing is
wrong, say so in one line; do not pad. Note anything the sweep could not check and why
(e.g. internal browser-level reachability needs a human on the tailnet).
