# Tailnet state — where this instance is today

The instance half of `tailnet-access.md`: what the policy file says, which credentials
exist and with what scopes, and the per-tool decisions that bear on access. The
procedures and judgment live in `tailnet-access.md`; this file only records state, and
`/grant-access` and `/setup-coolify-devops` write here.

## Where we are today

_(Paste the policy's grants here as `/setup-coolify-devops` finds them. A fresh tailnet usually has
the blanket grant:)_

```json
{ "src": ["*"], "dst": ["*"], "ip": ["*"] }
```

That wildcard destination covers Tailscale Services, so every member reaches every
internal tool the moment their device connects — and every port on every device. Fine
for one person; the first thing to change when someone else joins (`tailnet-access.md`,
*A model that grows*).

**Write path:** the admin console (Access Controls); this repo holds no policy copy.

## Credentials and scopes as minted

* `{{REGISTRAR}}` OAuth client: _(scopes as shown in the console when minted — expected
  `devices:core services` — the console shows them as *Devices → Core: Write* and
  *Services: Write*; re-check with the `wget` snippet in `tailnet-access.md`)_.

## Per-tool decisions that bear on access

_(Per tool: self-registration on or off, password recovery, where app accounts live.)_
