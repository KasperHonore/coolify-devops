# Tailnet access — who gets to reach what

How people get onto the tailnet, how they are granted specific internal tools, and how to
keep that manageable as more people and more tools arrive.

For how to *publish* a tool in the first place, see `internal-services.md`. This file is
about the people side; what the policy and credentials *are* on your instance is
`tailnet-state.md`.

---

## Three layers, and they are independent

Confusing these is the source of nearly every "it doesn't work for them" problem.

| layer | question | where it lives |
|---|---|---|
| **Membership** | is this person on the tailnet at all, with a device? | admin console → Users, plus Tailscale signed in on their machine |
| **Grants** | which hosts and services may they reach? | the policy file → Access Controls |
| **App auth** | may they log in to the tool, and as whom? | the application itself (its own accounts, or an auth gateway such as Supabase/GoTrue) |

Reaching a URL is not the same as being allowed to use it. Someone can have perfect
tailnet access and still need an account — and, more importantly, **anyone who can reach a
tool can attempt to sign up for it** if the tool allows self-registration.

---

## Adding a person

Two things to say out loud *before* inviting anyone:

* **Every user who joins is billable** — "Tailscale bills for every user on every
  tailnet", including people who are paying users of some other tailnet.
* Under a blanket grant (`{ "src": ["*"], "dst": ["*"] }` — check `tailnet-state.md`),
  membership is access to everything.

1. **Invite them.** Two paths:
   * Admin console → Users → invite; they accept by email.
   * **Or via the API**: `POST /api/v2/tailnet/-/user-invites` with `[{"email": ...,
     "role": "member"}]` — needs a credential with the users-management scope, which
     docktail's client does not hold (see *Credentials and scopes* below). The response
     carries an `inviteUrl` that works even with no email set, so an invite can be
     handed over in chat. Always state the role explicitly; it defaults to `member`
     and anything higher (`admin`, `network-admin`, …) should be a deliberate choice.

   Invites **expire**: welcome-email invites after 90 days, one-time invite links
   after 30. And if **user approval** is enabled on the tailnet, acceptance is not
   enough — an admin must additionally approve the new user in the console, a gate
   that looks exactly like "invite accepted but nothing works".
2. **They install Tailscale and sign in on the machine they will browse from**, choosing
   *this* tailnet if their account belongs to more than one.

   Accepting the invite creates the **user**. It does not create a **device**, and nothing
   is reachable until a device exists. This is the step people miss.
3. **Confirm the device registered:**

   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://api.tailscale.com/api/v2/tailnet/-/devices?fields=all" \
     | python3 -c "
   import sys,json
   for d in json.load(sys.stdin)['devices']:
       print(d['hostname'], d['user'], 'authorized=', d['authorized'])"
   ```

   A device under their email should appear with `authorized: true`. If it shows `false`,
   device approval is enabled and an admin must approve it in the console.
4. **Check the grants cover them** — see below. Under an allow-all policy they are
   covered automatically.
5. **Have them load the tool** and confirm it renders.

### What does not work: sharing a device

Sharing is the obvious thing to reach for and it fails silently.

> "Sharing gives the recipient access to only the shared machine in your tailnet, and
> nothing else." — Tailscale, *Share devices with other users*

Internal tools here are **Tailscale Services**, not machines — separate objects with their
own VIP and their own ACL identity (`svc:<name>`), merely *advertised by* a host. Device
sharing never reaches them, and no ACL rule can bridge the gap: `autogroup:shared` is valid
only as a **source**, never a destination.

This was tested directly from an account holding an active share from this tailnet:

| from a non-member holding a share | from a member with a device |
|---|---|
| service hostname: no DNS resolution at all | resolves via MagicDNS |
| service VIP: connection timed out | HTTPS 200, certificate validates |
| shared machine itself: reachable | reachable |

The shared account could not reach the canary either — this is not specific to any one tool.

**If someone was given a device share, remove it once they are a member.** It grants a
machine you probably did not mean to expose, and it never delivered the access you wanted.

---

## Removing a person

1. Remove the user in the admin console — this also removes their devices from the
   tailnet. (API equivalents exist under the same users-management scope:
   `POST /api/v2/users/{id}/suspend`, `/restore`, and `/delete` — delete removes
   their devices too. Suspend is the right first move when the departure might be
   temporary.)
2. Remove them from any `groups` in the policy file, or the group membership silently
   grants access again if they are ever re-invited.
3. **Deal with their account inside each tool.** Tailnet removal does not touch application
   accounts, sessions or data — each tool's own user record has to go too.

---

## The policy file

Roles on the Users page — Owner, Admin, Member, Auditor, Billing admin — govern what
someone can do *in the console*: approve devices, edit the policy, view billing. They do
**not** control what anyone can reach on the network. That is the policy file, and only the
policy file. What it says today is recorded in `tailnet-state.md`.

### A model that grows

Grant to **groups**, never to individuals. Individuals scattered through rules become
impossible to audit, and offboarding means hunting for every mention.

```json
{
  "groups": {
    "group:admins": ["you@example.com"],
    "group:tools":  ["coworker@example.com"]
  },
  "grants": [
    { "src": ["group:admins"], "dst": ["*"],            "ip": ["*"] },
    { "src": ["group:tools"],  "dst": ["svc:sometool"], "ip": ["tcp:443"] }
  ]
}
```

Admins keep what they have. Everyone else is opt-in, per service. The property worth
protecting is the last one: **a newly deployed tool is invisible to `group:tools` until
someone grants it deliberately.** Under the blanket grant, every new tool is exposed to
everyone the moment it starts.

One trap for the eventual migration off `src: ["*"]`: **`autogroup:member` includes
external invited users on shared devices** — per the policy-file reference, granting to
`autogroup:member` "also grants access to external invited users if the destination
device is shared with them". Groups you name yourself have no such surprise; prefer
them.

### When teams need different things

Two ways to express "this audience, those tools":

**Name each service.** Clear and explicit; fine up to a handful.

```json
{ "src": ["group:hr"], "dst": ["svc:sometool", "svc:someothertool"], "ip": ["tcp:443"] }
```

**Tag services into buckets.** One grant covers a category, and a new tool joins it by
being tagged — no policy edit at deploy time.

```json
{ "src": ["group:hr"], "dst": ["tag:hr-tools"], "ip": ["tcp:443"] }
```

Prefer explicit names while there are few tools; move to tags when adding a tool to an
existing audience becomes the common case. Tags trade a little clarity for the property
that deploying no longer requires a policy change — which is good for velocity and bad for
"nothing is exposed unless someone decides so". Pick per audience, not globally.

#### Service tags come from docktail, not the console

A service's tags are set by the `docktail.tags` label, defaulting to `tag:container`:

```yaml
  - docktail.tags=tag:hr-tools
```

Two consequences:

* **Every internal service carries `tag:container` unless labelled otherwise**, so a grant
  on that tag is a grant to everything on the tailnet, now and in future. Do not use it to scope an audience.
* **Set tags in the compose, never in the admin console.** docktail reconciles tags every
  cycle and reverts hand edits.

A new tag needs two matching policy entries or the service will not work at all:

```json
"tagOwners":     { "tag:hr-tools": ["tag:server"] },
"autoApprovers": { "services": { "tag:hr-tools": ["tag:server"] } }
```

Without the `autoApprovers` entry the service sits at *Pending approval* and never answers
— a failure that looks identical to a misconfigured port.

### Editing the policy — console today, API discipline either way

The console (Access Controls) is the current write path. But the policy file is fully
API-manageable, and any API write must follow this sequence — it exists to prevent two
writers silently clobbering each other:

1. `POST /api/v2/tailnet/-/acl/validate` with the intended file — a dry run that also
   executes the file's `tests` section.
2. `GET /api/v2/tailnet/-/acl` and keep the `ETag` response header.
3. `POST /api/v2/tailnet/-/acl` with `If-Match: "<etag>"`. An HTTP 412 means the file
   changed underneath you: re-read, re-merge, re-validate.

The policy supports a **`tests` section** — assertions like "group:tools can reach
svc:sometool:443" that `validate` checks. Every grant change should ship with a test
asserting the access it was meant to create; the tests accumulate into a regression
suite for the policy.

Tailscale's sanctioned end state is **policy-as-code** (the `gitops-acl-action` flow:
policy file in a repo, validate on PR, apply on merge). Worth knowing before adopting
any of it: under GitOps, "any changes made in the Tailscale admin console will be
overwritten" on the next sync — a repo copy and console editing cannot both be the
write path. Which one is authoritative on your instance is recorded in
`tailnet-state.md`; if a `policy.hujson` reference copy is ever added (the `stacks/`
philosophy applied to the policy), that decision flips, and the state file must say so.

Prior art worth a look when editing policy syntax: Tailscale's own (alpha) agent
skill, `github.com/tailscale/tailscale-skill`, carries a grants/ACL reference file
that makes a good cross-check for any policy JSON prepared here.

### Credentials and scopes

API access is per-scope; there is no read-everything default. What matters here:

| operation | scope |
|---|---|
| read / validate policy | `policy_file:read` |
| write policy | `policy_file` |
| list devices, authorize devices | `devices:core` (`:read` for list only) |
| list users, invites, suspend/delete, roles | `users` (`:read` for list only) |
| Tailscale Services (list/get/put/delete) | `services` — observed on docktail's client; not in the published taxonomy |

The registrar's client needs **`devices:core services`** — that covers every
verification read in `internal-services.md` plus device authorization, and nothing
else: no `policy_file` (not even read), no `users`. With only those, the policy file
is read by having a human paste it from the console, and invites, user management,
and policy writes are console work. Anything beyond needs a separately minted client,
which is the user's decision: broader credentials are a real increase in what a
compromised session could do. Scope names should be re-verified against the
console's picker when minting — part of the table above comes from mirrored API docs,
not the rendered reference. Record the scopes as minted in `tailnet-state.md`.

To re-check the scopes without the secret ever leaving the container, mint a token
inside docktail (`run_once`) and print only the scope field — the container has no
curl, but busybox `wget` works, and the env var names are the ones in its Coolify env
store:

```sh
wget -qO- --post-data="client_id=$TAILSCALE_OAUTH_CLIENT_ID&client_secret=$TAILSCALE_OAUTH_CLIENT_SECRET" \
  https://api.tailscale.com/api/v2/oauth/token | grep -o '"scope":"[^"]*"'
```

From a machine signed in as the person in question:

```bash
getent hosts <name>.{{INTERNAL_SUFFIX}}          # MagicDNS resolves?
curl -s -o /dev/null -w "%{http_code} ssl=%{ssl_verify_result}\n" \
  https://<name>.{{INTERNAL_SUFFIX}}/            # 200 and ssl=0
```

No `-k`. A certificate error means something is wrong with the hostname or the service, and
suppressing it hides exactly the problem worth seeing.

Reading the failure:

| symptom | layer at fault |
|---|---|
| no DNS resolution | membership — not a member, or no device signed in |
| resolves, connection times out | grants — no rule reaches that service |
| certificate warning | wrong hostname, or the service is not on 443 |
| HTTP error from the app | access is fine; the problem is the tool itself |
| worked before, dead now, config untouched | **node key expired** — 180-day default; the person re-authenticates. Disable key expiry on infra devices (the Coolify host, docktail's node) so *they* never hit this |
| invite accepted, still no user or device | user approval pending in the console, or the invite expired (90 days email / 30 days link) |

---

## Things to decide before widening access

* **Does the tool allow self-registration?** Reaching the URL is enough to create an account
  if it does (for a Supabase/GoTrue app that is `GOTRUE_DISABLE_SIGNUP`). Record the
  answer per tool in `tailnet-state.md`.
* **Can people recover their own passwords?** Not without SMTP; a tool with none needs a
  manual database reset for a forgotten password.
* **Does the grant expose more than intended?** Check what the rule's `dst` actually covers
  before adding someone to it — particularly `*` and `tag:container`, both of which mean
  "everything, including things that do not exist yet".
* **Do automated hosts need their own grant?** A sandbox or CI box that manages
  infrastructure needs access to the Coolify host, which a tool-scoped grant will not give
  it. Grant it deliberately rather than leaving the blanket rule in place for its sake.
