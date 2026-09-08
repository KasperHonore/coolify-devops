---
name: setup
description: Bootstrap a Coolify instance end to end, or pivot this repo to a different one — interview for the bindings, write instance.yaml, verify the MCP, create the projects, deploy the plumbing and the canary, scaffold the deployment repo, and accept with /health. Use when the user says "set up a new instance", "bootstrap this server", "pivot to another Coolify", or hands over a fresh Coolify server to make ready for hosting.
---

# Set up an instance

This is the one skill that runs *before* `instance.yaml` exists — it writes it.
Everything else here follows `docs/skill-library.md` (the endgame this skill serves)
and the pivot procedure in `docs/conventions.md`, which this skill automates.

## 0. Mode, and what this skill cannot do

Three modes — say which one applies before anything else:

- **Bootstrap**: a fresh Coolify instance and a new (or empty) deployment repo.
- **Scaffolded**: the repo was created by `npx coolify-devops` (tell-tales: a
  `.mcp.json` reading `${COOLIFY_ACCESS_TOKEN}`, a `README.md` saying so, `stacks/`
  holding only its README). `instance.yaml` already has whatever the scaffolder's
  interview captured — `""` marks what it did not. `docs/` holds the portable
  runbooks plus two **skeleton** state files, `infrastructure.md` and
  `tailnet-state.md`, with placeholders in italics for this skill to fill. Step 1
  confirms rather than re-asks; step 6 fills the skeletons.
- **Pivot**: this repo, repointed at a different instance — the procedure in
  `docs/conventions.md`, "Pivoting to another instance", executed rather than
  paraphrased.

Five preconditions are outside any repo's reach. Hand each to the human as a
prepared step — exact console path or command, verified afterwards, never marked
done because it was asked for:

0. **The server exists, is on the tailnet, runs Coolify, and sits behind the cloud
   firewall that matches the lane answers.** All of that is human console work, and
   `docs/provisioning.md` is the checklist — hand it over section by section rather
   than paraphrasing it, and treat its *Done when* list as the verification. The
   firewall part is verified from *here*, in step 2 below, by probing the public IP;
   a probe that connects is the finding. If the checklist's questions (public lane?
   who reaches the dashboard?) have not been answered yet, they are the first two
   questions of the interview in step 1, and `docs/provisioning.md` re-renders from
   the answers.
1. **The Coolify MCP is pointed at the instance** — harness configuration; tokens
   never enter the repo. The prepared step for Claude Code, token supplied from the
   human's shell environment and scoped per `docs/platform.md`, *Token scoping* (never `root`):

   ```bash
   claude mcp add coolify \
     -e COOLIFY_BASE_URL="https://<coolify-host>" \
     -e COOLIFY_ACCESS_TOKEN="$COOLIFY_ACCESS_TOKEN" \
     -- npx @masonator/coolify-mcp@latest
   ```

   A scaffolded repo needs none of that: its `.mcp.json` expands `${COOLIFY_BASE_URL}`
   and `${COOLIFY_ACCESS_TOKEN}` from the shell Claude Code was started in. The
   prepared step is then "export both, restart `claude`, approve the project server
   when prompted" — and `/mcp` showing it connected is the verification. An unset
   variable does not fail loudly: Claude Code loads the server with the literal
   `${VAR}` text and only warns in `claude mcp list`, so a token-shaped 401 from
   `get_version` usually means the export was missing, not the token wrong.
2. **The Coolify host is on the tailnet** (Tailscale installed, signed in with
   `--ssh` so Tailscale SSH is the way onto the box, and — for the registrar's node —
   key expiry disabled; `docs/provisioning.md` section 2, `docs/tailnet-access.md` for
   the policy side).
3. **A Tailscale OAuth client exists** with the registrar's scopes (`devices:core`
   and `services` — the working set in `docs/tailnet-access.md`, recorded as minted in
   `docs/tailnet-state.md`), minted in
   the admin console; also the ACL needs `autoApprovers.services` for the
   registrar's tag or every service will sit at *Pending approval*.
4. **Public lane only**: a DNS token for the wildcard record's holder — a Cloudflare
   API token scoped to the zone, or the DuckDNS account token
   (`plumbing.public_dns_provider` says which).

## 1. Interview → `instance.yaml`

Ask for each binding; never assume:

- the tailnet domain (`domains.internal_suffix`),
- **will there be public-facing apps?** Internal tools are always on the tailnet;
  a public lane exists only for apps the internet must reach, and only with a
  domain — one the team owns, or a free DuckDNS one. Yes → the wildcard domain
  (`domains.public_suffix`) and who holds its DNS (`plumbing.public_dns_provider`).
  No → `public_suffix` stays `""`, and 80/443 stay closed,
- **who may reach the Coolify dashboard** (`exposure.coolify_ui`): `tailnet`,
  `github` (adds GitHub's webhook ranges, so push-to-deploy works — the default),
  or `internet` (2FA mandatory). The reasoning is `docs/platform.md`, *The Coolify
  dashboard and push-to-deploy*,
- where the server runs (`host.provider`) — decides which console
  `docs/provisioning.md` describes,
- project names (offer the defaults from this repo's `instance.yaml` shape:
  internal / public / infrastructure),
- the canary name (default `whoami`),
- policy defaults (backups; the write path is always coolify-via-mcp; the commit
  branch).

Write `instance.yaml` from the interview, marking `[pivot]` keys exactly as the
existing file does. In pivot mode, rewrite the `[pivot]` keys and leave structural
ones alone. In scaffolded mode, read the file first: confirm each value it already
holds in one question, and ask only for the keys left as `""`.

## 2. Verify the MCP before trusting it

`get_version` answers and its value is recorded as `coolify.version_observed`;
`get_mcp_version` goes into the platform table of `docs/infrastructure.md` (its tool
names have moved between majors, so the version explains any doc/tool mismatch);
`list_servers` shows the server reachable and validated; `list_destinations` says how
many Docker networks the server has, which decides whether every later create must
carry `destination_uuid` — record the count in the platform table too. If the MCP
does not answer, stop — everything below depends on it, and the fix is precondition 1.

**Then probe the firewall from outside.** `get_server` gives the host's public IP.
From this machine, which is on the internet, try each port with a short timeout:

```bash
for p in 22 80 443 3000 8000 6001 6002; do
  timeout 3 bash -c "</dev/tcp/<public-ip>/$p" 2>/dev/null && echo "$p OPEN" || echo "$p closed"
done
```

Expected, from `instance.yaml`: 80 and 443 open only if `domains.public_suffix` is
set; 8000 open only if `exposure.coolify_ui` is `internet` (in `github` mode this
machine is not in GitHub's ranges, so 8000 must read *closed* here — that is the
rule working); everything else closed, always. Any other answer is precondition 0 not
met — stop and hand back the firewall section of `docs/provisioning.md`. Record the
result and date in the *Dashboard exposure* row of `docs/infrastructure.md`.

Optional, and never part of the bootstrap: MCP 3.x can also run *inside* Coolify in
HTTP mode so remote clients (claude.ai, Claude Desktop) connect without a local
install. If the user wants that, it is a `/host` job after acceptance, with the
caveat recorded in `docs/platform.md` that remote clients cannot run delete-class
tools.

## 3. Projects

Create the three projects from `projects.*` (or, in pivot/adopt mode, confirm they
exist and map them). Each gets the single environment named by `environment`.

## 4. Plumbing

Deploy into `projects.infrastructure`:

- **The tailnet registrar** (`plumbing.tailnet_registrar`) — the two OAuth
  credentials go into its Coolify env store, never the compose. Its compose is
  seeded from the reference copy in `stacks/` — **currently missing there; see the
  open item in `docs/skill-library.md`**. Until backfilled, author it from the
  registrar's upstream docs plus the label rules in `docs/internal-services.md`,
  and write the reference copy as part of this step.
- **The public-DNS pinner** (`plumbing.public_dns`) — only if a public lane was
  chosen; the token goes in its env store. Which pinner depends on
  `plumbing.public_dns_provider`: a Cloudflare DDNS updater holding a zone-scoped
  token, or the DuckDNS updater holding the account token. Never hand-add DNS
  records. Also confirm the wildcard domain is set in Coolify's server settings and
  ports 80/443 read *open* in the step-2 probe — the lane does not exist otherwise.

Deploy each the `/host` way (pinned tags, no published ports, healthchecks), but
into the infrastructure project and with no docktail labels of their own.

## 5. Canary

Deploy the canary (`canary`, default whoami) to the internal lane with the full
label set from `docs/internal-services.md`, then run **all four verification
steps** against it — registrar logs showing `key=svc:<name>:443`, the
control-plane definition at `tcp:443`, `/devices` approved and ready, and a human
loading `https://<canary>.<domains.internal_suffix>` in a browser. The canary
existing and answering is what proves the internal lane end to end; nothing else
is hosted before it passes.

## 6. Scaffold the deployment repo

Bootstrap mode — create, in this order:

1. `instance.yaml` (step 1's output).
2. `CLAUDE.md` — this repo's structure with the header facts (tailnets, suffixes,
   project names) rewritten from the interview; the rules and skill list carry
   over unchanged.
3. `docs/` — the portable runbooks from the library, plus the two instance-state
   files: `infrastructure.md` (platform table, inventory, credentials in play,
   volumes, known gaps) and `tailnet-state.md` ("Where we are today" with the fresh
   policy state, and the OAuth client's scopes as minted). The library's
   `template/docs/` holds the skeletons.
4. `stacks/` — the plumbing and canary reference copies from step 4–5, plus the
   short `stacks/README.md` from the library template (the lore itself is
   `docs/changing-a-resource.md`).
5. `git init` if needed; commit straight to the branch named by
   `policy.commit_branch`.

Pivot mode — instead: rewrite the header facts in `CLAUDE.md` and
`docs/infrastructure.md`, prune `stacks/` to what exists on the new instance, and
grep the repo for the *old* domain suffixes — zero hits outside git history is the
done condition.

Scaffolded mode — `CLAUDE.md` was rendered from `instance.yaml` by the scaffolder, so
once the bindings are final it is already right; do not hand-edit its header. The two
state files exist as skeletons: fill every italic placeholder in
`docs/infrastructure.md` (platform table from step 2, inventory and credentials from
steps 4–5) and `docs/tailnet-state.md` (the policy as pasted from the console, the
registrar's scopes as minted). Done condition: no italic placeholder left in either
file. The runbooks in `docs/` were rendered for this instance by the scaffolder;
they only need re-rendering if `instance.yaml` changes.

## 7. Accept

Run `/health` as the acceptance test. A clean sweep — every resource green, canary
reachable, the outside probe matching `instance.yaml`, no published ports on the
internal lane, no drift — is what "set up" means; anything less is an open item to
fix before handing the instance over.

If push-to-deploy was wanted (`exposure.coolify_ui` is `github` or `internet`), the
last prepared step is the GitHub App: created once from Coolify's *Sources* page, with
the instance URL set to what GitHub can reach (`docs/provisioning.md`, *Push-to-deploy*).
Verify with a real push to a throwaway repo, not by reading the settings.
