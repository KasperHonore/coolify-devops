# {{REGISTRAR}} — the tailnet registrar

`plumbing.tailnet_registrar` in `instance.yaml`. Upstream
[marvinvr/docktail](https://github.com/marvinvr/docktail). It reads
`docktail.service.*` labels on every other container and creates a Tailscale Service
per labelled container through the tailnet control-plane API, using an OAuth client;
Tailscale then serves `https://<name>.{{INTERNAL_SUFFIX}}` on 443 and proxies to the
container port. Everything about the labels, the write-once-ports trap and the four
verification steps is `docs/internal-services.md`.

## Wiring

- Lives in `{{PROJECT_INFRA}}`, no FQDN, no published port, no docktail labels of its own.
- Mounts the Docker socket read-only (to see labels) and `/var/run/tailscale`
  (to program the host's `tailscale serve`). It does **not** run its own tailscaled —
  the host's Tailscale node is the one that serves.
- Credentials: `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET` in this
  service's Coolify env store. The OAuth client is minted once in the Tailscale console
  (scopes *Devices → Core: Write* and *Services: Write*; console-only, no CLI or API
  can create one) and the values are pasted into Coolify by a human, never through a
  session. Create the service with both keys empty, have them filled, then deploy.
- The tailnet policy needs `autoApprovers.services` for the tag the client carries,
  or every Service sits at *Pending approval* — `docs/tailnet-access.md`.

## Verifying it

Its logs (MCP `logs`, or `run_once`) show `Creating new service definition in Control
Plane` with `key=svc:<name>:443` per labelled container. `run_once` with
`tailscale --socket=/var/run/tailscale/tailscaled.sock serve status` lists what it
programmed. A registrar that is `running:healthy` but shows neither has bad
credentials or a missing policy entry — not a label problem.

## Known stand-in to watch for

An instance may already carry a *hand-rolled* "docktail": an `alpine` image running a
shell script that drives `tailscale serve` directly with `docktail.enable/name/port`
labels and no OAuth client. It never creates real, individually-scoped Tailscale
Services, so per-tool access grants are impossible. `/setup-coolify-devops` step 4
compares any existing registrar against this file and offers to replace it.
