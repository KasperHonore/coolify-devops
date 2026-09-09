# Exposing an internal service

How to put something on the tailnet so it lands at
`https://<name>.{{INTERNAL_SUFFIX}}` and stays there. Read this before adding
docktail labels to anything — most of it exists because of mistakes already made.

The canary (`canary` in `instance.yaml`, `whoami` by default) is the reference
implementation. When in doubt, copy it.

> **Tailscale Services is a public beta** (announced 2025-10, all plans, free and
> uncapped "during the open beta period"). The behavior documented here — including
> the write-once-ports trap, which is docktail's creation-time behavior, not a
> Tailscale limitation (definitions *are* editable via `PUT .../services/svc:<name>`,
> which is exactly what the repair procedure below uses) — should be rechecked at GA,
> along with whatever pricing or caps arrive with it.

---

## The labels

This is the whole label set for an ordinary internal web app:

```yaml
labels:
  - docktail.service.enable=true
  - docktail.service.name=<name>          # the plain resource name, nothing else
  - docktail.service.port=<container>     # the port the container actually listens on
  - docktail.service.service-port=443     # what the tailnet sees. Always 443.
  - docktail.service.description=<short human description>
```

The canary, verbatim and working:

```yaml
  - docktail.service.enable=true
  - docktail.service.name={{CANARY}}
  - docktail.service.port=80
  - docktail.service.service-port=443
  - docktail.service.description=Internal connectivity test
```

No published ports. No FQDN in Coolify. No Traefik. Those belong to the public lane.

### The two ports are not the same thing, and mixing them up is the classic mistake

| label | meaning | example |
|---|---|---|
| `docktail.service.port` | the port **inside the container** | `80`, `3000`, `8080` |
| `docktail.service.service-port` | the port **the tailnet serves on** | always `443` |

Tailscale terminates TLS on 443 with its own certificate and forwards to the container
port as plain HTTP. The container does not need to know about TLS.

### Always write `service-port=443` explicitly

Never rely on the smart defaults. They are documented as:

> `docktail.service.service-port` defaults to `443` when `service-protocol` is `https`;
> otherwise it defaults to `80`.
> `docktail.service.protocol` defaults to `https` when the backend port is `443`;
> otherwise it defaults to `http`.

So a container listening on 80 or 3000, with no explicit `service-port`, silently gets a
**plain-HTTP service on port 80** — and per the next section, that is permanent.

---

## The trap: ports are written once, ever

There are two layers, and docktail only keeps one of them in sync:

1. the node-local advertisement (`tailscale serve --service=svc:<name> --https=<port>`),
   which docktail updates correctly whenever labels change; and
2. the **tailnet-global Service definition** in the Tailscale control plane, which
   declares the service's ports — and which docktail writes **only at creation**.

> **Changing `docktail.service.service-port` on an existing service name does nothing.**
> The advertisement moves. The definition does not. The service stops answering, and
> docktail logs nothing about it at `info`.

This is not configurable. There is no env var, label or flag that makes docktail
re-write an existing definition's ports.

**So: get `service-port=443` right on the very first deploy.** That is the entire
prevention story. The canary works because it was born at 443.

If it is already wrong, see *Repairing a wrong port* below.

---

## Verifying a new service

Do all four. Coolify reporting `running:healthy` proves nothing about tailnet reachability.

**1. docktail picked up the container.** Its logs reconcile roughly every 60s:

```
logs → resource=service, uuid=<docktail uuid>, container=docktail
```

Look for your container by name, and check the port it says it will proxy to:

```
INF Proxying directly to container IP (no port publishing required)
    container=<name>-<uuid> container_ip=10.0.x.y container_port=80 will_proxy_to=10.0.x.y:80
INF Adding service backend_port=80 backend_protocol=http service=<name>
    service_port=443 service_protocol=https
INF Successfully added service key=svc:<name>:443
```

`service_port=443` and `key=svc:<name>:443` are the two values that matter.

**2. The control-plane definition declares `tcp:443`.** This is the step that catches the
trap, and it is the only place the truth is visible. Using docktail's own OAuth
credentials from its Coolify env store:

```bash
# The env-store key names are the real ones from docktail's Coolify env store —
# TAILSCALE_OAUTH_CLIENT_ID / TAILSCALE_OAUTH_CLIENT_SECRET (verified 2026-08-25).
TOKEN=$(curl -s -X POST https://api.tailscale.com/api/v2/oauth/token \
  -d "client_id=$TAILSCALE_OAUTH_CLIENT_ID" -d "client_secret=$TAILSCALE_OAUTH_CLIENT_SECRET" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.tailscale.com/api/v2/tailnet/-/services
```

Every service should read `ports=['tcp:443']`. Anything else is broken, however healthy
it looks elsewhere.

The same read through `run_once` in docktail's own container, each command under the
255-character cap (the image has `wget`, `sed` and `grep`; no `curl`, no `python`).
The token lands in a file inside the container and only the filtered line comes back:

```
sh -c 'wget -qO- --post-data="client_id=$TAILSCALE_OAUTH_CLIENT_ID&client_secret=$TAILSCALE_OAUTH_CLIENT_SECRET" https://api.tailscale.com/api/v2/oauth/token > /tmp/tok.json'
sh -c 'T=$(sed -n "s/.*\"access_token\":\"\([^\"]*\)\".*/\1/p" /tmp/tok.json); wget -qO- --header="Authorization: Bearer $T" https://api.tailscale.com/api/v2/tailnet/-/services > /tmp/svcs.json'
sh -c 'grep -o "svc:<name>[^}]*" /tmp/svcs.json'
```

Step 3 below is the second command again with `/services/svc:<name>/devices` as the
URL and no redirect; finish with `rm -f /tmp/tok.json /tmp/svcs.json`. Verified
2026-09-09. A session's permission rules may still refuse the first command for
naming the secret's variable — then see *If steps 2–3 are out of reach*.

**3. The host is approved and ready:**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.tailscale.com/api/v2/tailnet/-/services/svc:<name>/devices
```

Want `approvalLevel: approved:auto` and `configured: ready`. The ACL's
`autoApprovers.services` for `tag:container` handles approval; without it, a human must
approve the service in the admin console.

**4. Actually load the URL in a browser.** Nothing above proves the app works.

### If steps 2–3 are out of reach

Both credential paths for the control-plane check — revealing docktail's OAuth secret
from its env store, or minting a token inside its container — pass a secret through
the session, and a session's permission rules may (reasonably) refuse that. Do not
fight the refusal. For a **newly created** service there is sanctioned compensating
evidence:

1. docktail's logs show **`Creating new service definition in Control Plane`** for
   `svc:<name>` alongside `service_port=443` and `key=svc:<name>:443` — a definition
   *born* at 443 structurally cannot have the write-once ports trap.
2. `run_once` in the docktail container: `tailscale serve status` shows
   `https://<name>.{{INTERNAL_SUFFIX}} (tailnet only) (svc:<name>) → proxy http://<container ip>:<port>`,
   the same shape as the working siblings.

Then hand steps 2–3 to a human explicitly (admin console → Services tab: no
*"required ports are missing"* banner) rather than marking them done. This shortcut is
valid **only for fresh creations** — for a changed or renamed service the control-plane
read remains the only place the truth is visible.

---

## Failure signatures

| what you see | what it means |
|---|---|
| Admin console: *"Advertising the service, but some required ports are missing"* | The definition's ports do not match what the node advertises. Almost always the write-once trap. |
| Hostname does not resolve or connect, but docktail logs look clean and report `failed=0` | Same thing. docktail short-circuits at `debug` level and looks like success at `info`. |
| Service missing from the admin console entirely | Labels not picked up, or the container is not running. Check docktail found it (step 1). |
| Host stuck at `Pending approval` | ACL has no matching `autoApprovers.services` entry. Approve by hand, then fix the ACL. |
| docktail logs: `ERR Failed to add service error="...your Tailscale node is not tagged..."`, with working credentials and a correct ACL | The **host's own node** must advertise the tag `autoApprovers` keys off — `tagOwners` only says who may hold it. From the host: `tailscale up --advertise-tags=tag:server --force-reauth` plus the non-default flags it tells you to re-specify, then approve the login URL (`docs/provisioning.md` §2). Node-local, so the skill does it; the URL is the human's part. Tagging also clears key expiry. |
| Everything green, browser still fails | Not a docktail problem. Check the container itself. |

To see the stale port list from docktail's side, set `LOG_LEVEL: debug` on docktail —
`Service definition already up to date in Control Plane` logs the existing ports.

---

## Repairing a wrong port

Two ways. Both act on the Tailscale control plane, not on Coolify or docktail.

**Correct the definition in place** (no downtime, no re-approval):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.tailscale.com/api/v2/tailnet/-/services/svc:<name> > def.json
# edit ONLY "ports" -> ["tcp:443"], leave name/addrs/tags/comment untouched
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data @def.json https://api.tailscale.com/api/v2/tailnet/-/services/svc:<name>
```

docktail will not undo this: its update path only fires on tag or description drift, and
even then carries the existing ports forward.

**Or delete the definition** in the Tailscale admin console (Services tab) and let
docktail recreate it on its next reconcile, within `RECONCILE_INTERVAL` (60s default).
Simpler, but the service is gone in the meantime and may need re-approving.

**Do not restart docktail to force either.** Its default shutdown drains and clears
*every* service it advertises, so a restart briefly takes the others down too.

**Do not reach for `DELETE_UNUSED_SERVICES`.** It does not help — a service you are
actively advertising is protected — and it arms tailnet-wide deletion of any `svc:`
definition with no advertising host, including ones docktail did not create.

---

## Renaming, and the orphans it leaves

A new `docktail.service.name` creates a brand-new definition with correct ports. The old
definition is **not** deleted — docktail never deletes definitions by default — so it
lingers in the tailnet forever pointing at nothing. Delete the old one by hand in the
same change:

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://api.tailscale.com/api/v2/tailnet/-/services/svc:<oldname>
```

Confirm it has no advertising hosts first (`/devices` returns `{}`).

---

## When a resource is more than one container

docktail has **no path routing for private services** — `path` exists only for Funnel.
A service maps to one backend port, so labels alone give you one hostname per container.

If several containers must share one hostname — the usual reason being an app that bakes
a single API URL into its client JavaScript — the stack needs its own reverse proxy:

* one small nginx container is the only thing that carries docktail labels;
* it routes by path to the other containers;
* everything else has no labels and no published ports.

The shape that works: an nginx `proxy` is the only labelled container and routes `/` to
the app and, say, `/auth` and `/rest` to its API gateway. Document the routing in that
resource's `stacks/<name>/README.md`.

### Server-side code that calls the service's own public hostname

An app whose *server-side* code uses the same public URL as its browser code has to
resolve that hostname from inside the Docker network. **Coolify's compose parser strips
network aliases**, so the obvious fix does not survive deployment.

Pin it to the Tailscale Service VIP instead — a plain compose key Coolify leaves alone:

```yaml
    extra_hosts:
      - "<name>.{{INTERNAL_SUFFIX}}:<service VIP>"
```

The VIP is the `addrs` entry in the service definition (step 2 above), or, without the
control-plane credentials, `tailscale dns query <name>.{{INTERNAL_SUFFIX}} A` via `run_once`
in the docktail container. Traffic leaves for tailscaled and comes back through the real
certificate, so no internal TLS trust is needed.

### One stack calling another internal service

The same pin is how **any** container reaches **another** internal resource. Coolify
gives every service its own network (`10.0.<n>.0/24`) and `connect_to_docker_network`
is off everywhere, so `<container>-<uuid>:<port>` does not resolve across stacks —
measured 2026-09-03. The VIP route does work from any
container on the host (an HTTPS probe with the hostname resolved to the VIP returned
200 with a valid certificate), so:

```yaml
    environment:
      OPENAI_BASE_URL: https://<other>.{{INTERNAL_SUFFIX}}/v1
    extra_hosts:
      - "<other>.{{INTERNAL_SUFFIX}}:<that service's VIP>"
```

The cost: a recreated Tailscale Service gets a
new VIP, and every `extra_hosts` line that names it has to follow — note the
dependency in both resources' READMEs.

**The alternative, unproven here:** since MCP 3.0.0 (2026-09-08) `service update`
takes `connect_to_docker_network: true`, which attaches the stack to the shared
`coolify` network so container names resolve across stacks over plain HTTP. When the
VIP pin was chosen the toggle was not settable through the MCP; it now is, so the pin
is a preference, not a necessity. The VIP hop stays the default because it is
measured and keeps every stack on its own network. Before choosing the toggle for a
new hop, settle under `/change-service`: whether both stacks need it or only the
caller; whether the update recreates the containers (expect the dip); and whether
docktail still registers the right container IP once a container sits on two
networks — that last one is the trap, because a wrong IP looks healthy everywhere
except the browser. Record the answers here when measured. Expect the *first* HTTPS contact with a brand-new
service hostname to take tens of seconds while Tailscale issues its certificate; a
15-second probe timed out, the retry took 0.3 s.

---

## Giving someone else access

Access is a separate concern with its own file — see **`tailnet-access.md`** for adding and
removing people, what the policy file should look like as teams grow, and why sharing a
device does not work.

Two things from it that bear on publishing a service:

* **A grant on `tag:container` is a grant to every internal tool**, because that is
  docktail's default tag. If a new service should be visible to a narrower audience, give it
  its own tag via the `docktail.tags` label and add matching `tagOwners` and
  `autoApprovers.services` entries — without the latter the service never leaves *Pending
  approval*.
* **Under a blanket grant, publishing a service exposes it to everyone on the tailnet
  immediately.** `docs/tailnet-state.md` records what the policy is today. Decide who
  should see it before deploying, not after.

## Checklist

1. Internal lane? Then the **{{PROJECT_INTERNAL}}** project, no FQDN, no published ports.
2. One plain name, used for the resource and `docktail.service.name` alike.
3. `docktail.service.port` = the container's real port.
4. **`docktail.service.service-port=443`, written explicitly, first time and forever.**
5. Several containers under one name? Front them with a proxy; only the proxy gets labels.
6. Deploy, then run all four verification steps — including reading the control-plane
   definition and loading the URL.
7. Add the resource to the inventory table in `infrastructure.md`.
8. Who should see it? Under a blanket grant it is visible to the whole tailnet the
   moment it starts. See `tailnet-access.md`, and `tailnet-state.md` for today's policy.

