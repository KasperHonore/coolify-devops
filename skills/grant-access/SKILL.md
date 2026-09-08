---
name: grant-access
description: Manage who can reach internal tools on the tailnet — onboard a person, grant a person or group specific services, scope a service to a narrower audience, or offboard someone. Use when the user says "add <person> to the tailnet", "give <person> access to <tool>", "onboard/offboard <person>", "who can reach <tool>?", or "restrict <tool> to <team>". People and policy only — publishing a service is /host; editing its labels is /change-service.
---

# Grant or revoke tailnet access

The facts — the three access layers, the policy-file model, the device-share dead end,
the failure table — live in **`docs/tailnet-access.md`**. Read it before acting; it is
authoritative, and this skill is only the procedure that walks it.

Two facts shape everything below:

- **Everything here is API-doable; scopes are the limit, not the console.** Invites,
  device approval, user suspension and roles, and policy reads *and writes* are all
  first-class API operations — but each is gated by an OAuth scope (the table in the
  doc's *Credentials and scopes* section), and the only credential on hand is the
  registrar's (`plumbing.tailnet_registrar` in `instance.yaml`), whose scopes cover
  exactly the Services and device operations (the doc records the list, and how to
  re-check it in-container without the secret transiting the session). So the
  default mode is: **prepare each console step so precisely (exact policy JSON,
  exact console path) that the human executes without thinking, and verify
  afterwards through whatever reads the credential allows.** When a task would go
  faster API-first, *offer* it — minting a broader-scoped client is the user's call,
  stated as the trade it is (a stronger credential is a bigger prize for a
  compromised session). Never mark a console step done because you asked for it.
- **Using the credential passes a secret through the session**, same as
  `docs/internal-services.md` verification, and a permission rule may refuse it — do
  not fight the refusal; hand the API checks to the human as explicit steps instead,
  never skip them silently.

Read `instance.yaml` first: the tailnet domain is `domains.internal_suffix`, the
registrar is `plumbing.tailnet_registrar`, the reference service is `canary`.

## 0. Classify the request before acting

Every access request lands in one of the three layers (membership / grants / app
auth — the table in `docs/tailnet-access.md`). Say which one out loud first:

- "add <person>" → membership, then grants.
- "<person> can't reach <tool>" → diagnose with the failure table (no DNS =
  membership; timeout = grants; app error = the tool, not the tailnet). Do not start
  inviting or editing policy until the symptom names the layer.
- "restrict <tool> to <team>" → grants, and possibly a new tag (step 3).
- "remove <person>" → all three layers (step 4).

**Read the live policy before proposing any change to it.** Check the doc's
*Credentials and scopes* record first: unless a client with `policy_file:read` is
recorded there, no credential on hand can read it — have the human paste the file
from the console (Access Controls) instead. What
the policy actually says today decides everything below; `docs/tailnet-state.md`
records it, but the live file wins.

**First use on a tailnet — map it, then ask how access should be shaped.** Before
the first grant change (and whenever the doc still records the blanket grant), run a
discovery pass and an interview, in that order:

1. Enumerate what exists: the live policy's `groups`, `tagOwners`, and grants (the
   paste above), and the published services (`GET .../services` — a read the
   registrar's client *can* do).
2. Interview the user — these questions, concretely, not "what do you want":
   - Are there **role-shaped audiences** (an HR group for HR tools, an ops group for
     admin surfaces), or just a **handful of individuals** who each need specific
     tools? Roles get groups + (eventually) tags; individuals still get groups —
     one per audience, however small — never bare emails in grants.
   - Which of the currently running services should the *next* person to join be
     able to reach — all of them, or a named few?
   - Should admins keep reach-everything, and who is an admin?
3. Encode the answers as groups and grants (the doc's "A model that grows" carries
   the judgment), and **record the chosen model in `docs/tailnet-state.md`, "Where we are
   today"** — the next session should inherit a decision, not a mystery.

## 1. Adding a person

1. **Surface the blast radius first.** Under a blanket `src:* dst:*` grant, membership
   is access to *everything* — every tool, every device, every future deploy. If that
   is what the live policy holds, tell the user what joining means before anyone is
   invited, and offer the group model (step 2) as the alternative. Say the billing
   line too: **every user who joins is billable**, whatever they pay elsewhere.
   Exposure and cost are the user's call, never the skill's.
2. **Invite** — console path (admin console → Users → invite) or, with a
   users-scoped credential, the API path (`POST .../user-invites`; the returned
   `inviteUrl` works with no email at all). Either way **state the role explicitly**
   — `member` unless the user deliberately chooses otherwise — and note that invites
   expire (90 days email / 30 days link), so a stale invite is a real failure cause.
   Then the person **installs Tailscale and signs in on the machine they will browse
   from**. Say that half explicitly every time — the invite creates a user, not a
   device, and the missing device is the step people miss.
3. **Verify the device registered** via the API (`/devices?fields=all`, the query in
   `docs/tailnet-access.md`): a device under their email, `authorized: true`. If
   `false`, device approval is on — approve it (console, or
   `POST /device/{id}/authorized` with a `devices:core` credential). If the *user*
   never appeared at all, check the two non-obvious gates: tailnet-level user
   approval pending, or the invite expired.
4. **Check the grants actually cover them** (step 2 if they don't), then **have them
   load the tool in a browser**. Map any failure with the doc's symptom table before
   changing anything — including its "worked before, dead now" row: node keys expire
   after 180 days by default, and re-authenticating fixes what looks like a grants
   problem.

Never suggest sharing a device instead of inviting — services are unreachable through
shares, it fails silently, and the doc records the test that proved it. If a share
already exists as a workaround, remove it as part of onboarding.

## 2. Granting tools to a person or group

- **Grants go to groups, never to individuals.** If the person is not in a suitable
  group, the change is "add them to a group" or "create a group" — never their email
  in a grant's `src`. This is the rule that keeps offboarding honest.
- **Choose the destination shape per audience** (the doc's judgment): explicit
  `svc:<name>` lists while an audience has a handful of tools; a dedicated tag once
  adding tools to that audience becomes routine. Never `tag:container` and never
  `dst: ["*"]` as an audience — both mean "everything, including what doesn't exist
  yet".
- **Prepare the exact policy edit as a JSON fragment** — the groups entry and the
  grant, ready to paste — and state in one sentence what the new rule exposes and to
  whom. Include a **`tests` entry asserting the access the change is meant to
  create** (e.g. `group:tools` reaches `svc:<name>:443`); the tests accumulate into
  a regression suite the validate endpoint runs on every future change.
- **Validate before it is applied, whoever applies it**: `POST .../acl/validate`
  with the full intended file (needs only `policy_file:read`). The human then applies
  it in the console (Access Controls); apply it yourself via the API only if the
  credential holds `policy_file` *and* the user approved that explicitly — and then
  only by the doc's write sequence: `GET` the policy, keep the `ETag`, `POST` with
  `If-Match`, and treat a 412 as "someone else edited it — re-read, re-merge,
  re-validate", never as an error to force past.
- **Verify from both sides**: re-read the policy to confirm the edit landed, then the
  doc's from-their-machine checks (`getent`, `curl` with no `-k`) — human work, since
  their machine is theirs.

## 3. Scoping a service to a narrower audience (tags)

A new tag is three coordinated changes, and the service dies quietly if the second is
missed:

1. `docktail.tags=tag:<audience>` on the container — a compose label edit, so it is
   **a `/change-service` job**, not this skill's. Tags set in the console get
   reverted by the registrar every reconcile; the label is the only real write path.
2. **Both** policy entries: `tagOwners` for the tag *and* an
   `autoApprovers.services` entry — without the latter the service sits at *Pending
   approval* forever, a failure that looks identical to a broken port.
3. The grant pointing the audience group at the tag.

Prepare 2 and 3 as one policy edit, sequence it before the label change, and verify
with the `/devices` check from `docs/internal-services.md` (`approved:auto`,
`configured: ready`) after.

## 4. Removing a person

All three layers, or the offboarding is incomplete:

1. Remove the user — console, or the users-scoped API (`suspend` / `delete`; delete
   takes their devices with it). **Offer suspend first when the departure might be
   temporary** — it cuts access without destroying anything.
2. Policy: scrub them from every `groups` entry — otherwise a future re-invite
   silently restores everything. Grep the policy for their email; zero hits is the
   done condition.
3. **Application accounts survive tailnet removal.** List every tool they could
   reach and deal with each account inside it (the tool's own user record, or its auth gateway's). Check `stacks/<name>/README.md` for per-tool auth notes.

## 5. Before widening any access

Run the doc's pre-flight list with the user, out loud: does the tool allow
self-registration (reaching the URL is enough to create an account if so)? Can they
recover a password without admin help? What does the grant's `dst` *actually* cover?
Do automation hosts rely on the rule being changed? Answers recorded, then act.

## 6. Bookkeeping

`docs/tailnet-state.md` records the current policy ("Where we are today") and the
credential scopes — when either changes shape, update it in the same sitting.
`docs/tailnet-access.md` is the portable procedure and does not carry instance state.
Access decisions about a specific tool go in its `stacks/<name>/README.md`. Commit
straight to `main`.
