# Infrastructure — this instance

The state record for this Coolify instance: platform versions, inventory, credentials
in play (by name), volumes, housekeeping, and known gaps. How hosting *works* — lanes,
naming, the deployment model, working through the MCP — is the portable
`docs/platform.md`; this file is what `/host`, `/health` and `/setup-coolify-devops` write into.

---

## Platform

| | |
|---|---|
| Coolify | {{#COOLIFY_URL}}`{{COOLIFY_URL}}`, version {{/COOLIFY_URL}}_(`get_version` — `/setup-coolify-devops` records it)_ |
| MCP server | `@masonator/coolify-mcp` _(`get_mcp_version`)_ — runs on the operator's machine as a stdio process via `.mcp.json`; a new release is picked up on the next session start |
| Servers | _(`list_servers`)_ |
| Destinations | _(`list_destinations` — more than one means every create needs `destination_uuid`)_ |
| Proxy | Traefik |
| Wildcard domain | {{#HAS_PUBLIC}}`https://{{PUBLIC_SUFFIX}}` ({{DNS_PROVIDER}}){{/HAS_PUBLIC}}{{^HAS_PUBLIC}}_(no public lane)_{{/HAS_PUBLIC}} |
| Tailnet | `{{INTERNAL_SUFFIX}}` |
| Host / firewall | {{HOST_PROVIDER}} — _(firewall name as shown in the console; `/setup-coolify-devops` records it)_ |
| Dashboard exposure | `{{UI_EXPOSURE}}` — _(outside probe result and date, from `/setup-coolify-devops` step 2)_ |

Single-node. Currently public: _(none)_. The canary is `https://{{CANARY}}.{{INTERNAL_SUFFIX}}/`.

---

## Current inventory

| Project | Resource | Containers | Exposure |
|---|---|---|---|
| {{PROJECT_INFRA}} | `{{REGISTRAR}}` | _(image:tag)_ | none (tailnet control plane) |
{{#HAS_PUBLIC}}| {{PROJECT_INFRA}} | `{{PUBLIC_DNS}}` | _(image:tag)_ | none (egress only) |
{{/HAS_PUBLIC}}| {{PROJECT_INTERNAL}} | `{{CANARY}}` | `traefik/whoami:latest` | `https://{{CANARY}}.{{INTERNAL_SUFFIX}}` → :80 |

Images with no healthcheck report `running:unknown`; that is expected — note them here
so `find_issues` warnings about them are not read as new findings.

---

## Credentials in play

Names only — values live in Coolify's env store, never here.

* Tailscale OAuth client ID + secret (`{{REGISTRAR}}`).
{{#HAS_PUBLIC}}* {{#DNS_CLOUDFLARE}}Cloudflare API token, scoped to the zone{{/DNS_CLOUDFLARE}}{{#DNS_DUCKDNS}}DuckDNS account token{{/DNS_DUCKDNS}} (`{{PUBLIC_DNS}}`).
{{/HAS_PUBLIC}}* Coolify API token for the MCP (in the operator's shell, never here).
{{#UI_INTERNET}}* Coolify account 2FA — the dashboard is on the open internet; record here that it is on.
{{/UI_INTERNET}}
---

## Persistent state

| Volume | Mount | Owner |
|---|---|---|
| _(none yet)_ | | |

Keep `delete_unused_volumes` and `delete_unused_networks` **off** in server settings.

---

## Housekeeping in place

_(Sentinel, cleanup schedules, disk alerts — record what `get_server` shows.)_

---

## Known gaps

1. _(Backups — `policy.backups_default` is `{{BACKUPS_DEFAULT}}`; list what is unprotected.)_
