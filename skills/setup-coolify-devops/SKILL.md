---
name: setup-coolify-devops
description: Bootstrap a Coolify instance end to end, or pivot this repo to a different one — interview for the bindings, write instance.yaml, verify the MCP, create the projects, deploy the plumbing and the canary, scaffold the deployment repo, and accept with /health. Use when the user says "set up a new instance", "bootstrap this server", "pivot to another Coolify", or hands over a fresh Coolify server to make ready for hosting.
---

# Set up an instance

This is the one skill that runs *before* `instance.yaml` exists — it writes it.
Everything else here follows `docs/skill-library.md` (the endgame this skill serves)
and the pivot procedure in `docs/conventions.md`, which this skill automates.

## 0. Mode, and what this skill cannot do

Two modes — say which one applies before anything else:

- **Bootstrap**: a fresh Coolify instance and a directory that holds nothing but the
  skills install (`npx skills add KasperHonore/coolify-devops` leaves `.claude/`,
  `.agents/`, `skills-lock.json`). No `instance.yaml` yet. This skill *creates* the
  deployment repo: the interview in step 1, then `scripts/scaffold.js` writes
  `instance.yaml`, `CLAUDE.md`, `.mcp.json`, the rendered runbooks in `docs/`, the two
  state skeletons, and `stacks/README.md`. Everything this skill and the others read
  from `docs/` comes from that render — the runbook templates travel inside this
  skill's `assets/`, so a consumer's repo never depends on any file outside it.
- **Pivot**: an existing deployment repo, repointed at a different instance — the
  procedure in `docs/conventions.md`, "Pivoting to another instance", executed rather
  than paraphrased.

A repo whose `instance.yaml` exists but has `""` for some keys is bootstrap mode
resumed: confirm what is there, ask only for the blanks, re-render.

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
     -e COOLIFY_BASE_URL="https://<coolify-host>" \        # http://localhost:8000 on the host itself
     -e COOLIFY_ACCESS_TOKEN="$COOLIFY_ACCESS_TOKEN" \
     -- npx @masonator/coolify-mcp@latest
   ```

   A repo this skill scaffolded needs none of that: its `.mcp.json` expands
   `${COOLIFY_BASE_URL}` and `${COOLIFY_ACCESS_TOKEN}` from the shell Claude Code was
   started in. The prepared step is: put both in a **root-only file that the shell
   sources**, so they survive logout and reboot — a bare `export` lasts
   one session and a user *will* assume otherwise (it happened). Hand over exactly:

   ```bash
   ( umask 077; mkdir -p ~/.config; cat > ~/.config/coolify-devops.env <<'EOF'
   export COOLIFY_BASE_URL=http://localhost:8000     # or the host's tailnet IP:8000 from elsewhere
   export COOLIFY_ACCESS_TOKEN=<token>               # read + write + deploy scopes; never root
   EOF
   ); grep -q coolify-devops.env ~/.bashrc || echo '. ~/.config/coolify-devops.env' >> ~/.bashrc
   ```

   then a new shell, `claude` from the repo, approve the project server when prompted —
   and `/mcp` showing it connected is the verification. "Never in a file" means never
   in a *tracked* file; a 600-mode file under `~/.config` is the right place, and the
   allow-list `.gitignore` keeps it out even when the repo is the home directory.
   The session will not survive the restart, so say plainly that the next `/setup-coolify-devops`
   resumes at step 2. In bootstrap mode this means the order is: interview and scaffold
   (step 1) first, *then* this precondition, *then* step 2 onwards in a new session. An unset
   variable does not fail loudly: Claude Code loads the server with the literal
   `${VAR}` text and only warns in `claude mcp list`, so a token-shaped 401 from
   `get_version` usually means the export was missing, not the token wrong.
2. **The Coolify host is on the tailnet** (Tailscale installed, signed in with
   `--ssh` so Tailscale SSH is the way onto the box, and — for the registrar's node —
   key expiry disabled; `docs/provisioning.md` section 2, `docs/tailnet-access.md` for
   the policy side). How much of this is a *prepared step* depends on where Claude
   Code runs:
   - **On the host**: the `tailscale` CLI is here — verify with `tailscale status`,
     and if SSH is off, turn it on yourself with `sudo tailscale set --ssh`; likewise
     tags and hostname. Only the console-side items (key expiry, tailnet name, policy,
     OAuth client) are handed over.
   - **On the same tailnet, not the host**: first verify Tailscale SSH works —
     `ssh -o BatchMode=yes -o ConnectTimeout=5 root@<host-tailnet-ip> tailscale status`
     succeeds with no key — then use that connection for exactly the on-host scope
     above: the `tailscale` CLI and read-only checks, never `docker` mutations or
     `/data/coolify`. If it fails, enabling Tailscale SSH on the host is the one
     prepared step (someone with a shell there runs `sudo tailscale set --ssh`;
     the policy must also allow it, `docs/tailnet-access.md`), after which the rest
     is done from here.
   - **Elsewhere**: all of section 2 is a prepared step, verified through the
     control-plane API as `docs/internal-services.md` describes.
3. **A Tailscale OAuth client exists** with the registrar's scopes (`devices:core`
   and `services` — the working set in `docs/tailnet-access.md`, recorded as minted in
   `docs/tailnet-state.md`), minted in
   the admin console; also the ACL needs `autoApprovers.services` for the
   registrar's tag or every service will sit at *Pending approval*.
4. **Public lane only**: a DNS token for the wildcard record's holder — a Cloudflare
   API token scoped to the zone, or the DuckDNS account token
   (`plumbing.public_dns_provider` says which).

## 1. Interview → `instance.yaml`

**First, where is Claude Code running?** Ask with three options: on the Coolify host
itself (the usual case, and the recommended one — `--on-host`), on another machine that
is on the host's tailnet (`--same-tailnet`), or elsewhere. "Is it on the same tailnet?"
alone misses the first, which changes what this skill can verify itself (step 2) and
lets it *discover* the next bindings instead of asking for them.

**On the host, discover rather than ask** — and confirm what was found in one line:

```bash
tailscale status --json | jq -r '.MagicDNSSuffix'   # → domains.internal_suffix
tailscale ip -4                                      # the host's tailnet IP
curl -4 -s https://api.ipify.org                     # the host's public IP (for the probe)
```

The Coolify URL is then `http://localhost:8000` — do not ask for it. If `tailscale`
is not installed or not signed in, that is precondition 2 not met; hand over section 2
of `docs/provisioning.md` and stop. On a machine that is on the same tailnet but not
the host, run the same three commands over Tailscale SSH
(`ssh root@<host-tailnet-ip> tailscale status --json`), once precondition 2 has
confirmed that connection works.

**Read every free-text answer as a signal.** When the user types something instead
of picking an option, the options were wrong for them: answer what they asked, then
re-ask the question with better options. Two that have happened: "can I choose my
own?" for the tailnet domain (below), and a Coolify URL typed without a scheme
(`localhost:8000` — the scaffolder adds `http://`, but confirm it).

Ask for each remaining binding; never assume:

- the tailnet domain (`domains.internal_suffix`) when not discovered above. It is
  **assigned by Tailscale**, not chosen: the `<name>.ts.net` under *DNS* in the admin
  console. It *can* be changed there (DNS → Tailnet name → rename, from a set of
  generated names; custom names are not offered), and every internal URL follows it —
  so if the team wants a different one, rename first, then bind. Point them at the
  console rather than accepting a made-up value,
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

Then, in bootstrap mode, **run the bundled scaffolder with the answers as flags** —
it writes `instance.yaml` and renders everything else from it:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/scaffold.js" \
  --coolify-url=<url> --internal-suffix=<tailnet> \
  --public-suffix=<domain-or-omit> --no-public \
  --dns-provider=cloudflare|duckdns --coolify-ui=tailnet|github|internet \
  --host-provider=hetzner|other --canary=<name> --backups=recommend-but-no|required
```

(`--help` lists every flag; omit what was not answered and it stays `""` for later.)
**No target directory.** The script scaffolds *in place*, in the directory the skills
are installed in — it finds that from its own path — so the repo, the skills and the
session's working directory are the same folder and nobody has to `cd` anywhere. In
the usual setup that folder is **root's home on the Coolify host**: it is where the
Coolify web terminal (an SSH session, Servers → Terminal) and Tailscale SSH both land,
so `claude` there finds everything with no navigation. A home directory full of
dotfiles is fine — the script only refuses to overwrite an existing repo, and the
`.gitignore` it writes is an allow-list, so `git add -A` there never picks up the
token file, shell history or Claude's session data. Passing a directory name creates
a nested repo *without* the skills in it, which is exactly what happened once; the
script now refuses that.
Relay its closing "human steps still ahead" block to the user verbatim — it is the
prepared-step handover for preconditions 0, 1 and 3. Never hand-edit `CLAUDE.md` or
the runbooks in `docs/`: they are rendered outputs, and
`node "${CLAUDE_SKILL_DIR}/scripts/scaffold.js" --render` regenerates them from
`instance.yaml` whenever a binding changes or the skills were updated.

In pivot mode, rewrite the `[pivot]` keys in the existing `instance.yaml`, leave
structural ones alone, and re-render.

## 2. Verify the MCP before trusting it

`get_version` answers and its value is recorded as `coolify.version_observed`;
`get_mcp_version` goes into the platform table of `docs/infrastructure.md` (its tool
names have moved between majors, so the version explains any doc/tool mismatch);
`list_servers` shows the server reachable and validated; `list_destinations` says how
many Docker networks the server has, which decides whether every later create must
carry `destination_uuid` — record the count in the platform table too. If the MCP
does not answer, stop — everything below depends on it, and the fix is precondition 1.

**Then probe the firewall from outside.** `get_server` gives the host's public IP.
The probe has to come from a machine that is **off the tailnet and not the host**:
traffic from the host to its own public IP never crosses the cloud firewall, so run
on the host (`operator.on_host` true) it would show every port open and prove nothing.
On the host, hand the loop below to the human as a prepared step — "from your
laptop with Tailscale off" — and wait for the pasted result. Off the host, run it
here. Either way, try each port with a short timeout:

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

The deployment repo, in this order:

1. `instance.yaml` (step 1's output).
2. `CLAUDE.md` — this repo's structure with the header facts (tailnets, suffixes,
   project names) rewritten from the interview; the rules and skill list carry
   over unchanged.
3. `docs/` — the rendered runbooks, plus the two instance-state files:
   `infrastructure.md` (platform table, inventory, credentials in play, volumes,
   known gaps) and `tailnet-state.md` ("Where we are today" with the fresh policy
   state, and the OAuth client's scopes as minted). This skill's `assets/docs/`
   holds the skeletons; the scaffolder wrote them in step 1.
4. `stacks/` — the plumbing and canary reference copies from step 4–5, plus the
   short `stacks/README.md` from the library template (the lore itself is
   `docs/changing-a-resource.md`).
5. `git init` if needed; commit straight to the branch named by
   `policy.commit_branch`.

Pivot mode — instead: rewrite the header facts in `CLAUDE.md` and
`docs/infrastructure.md`, prune `stacks/` to what exists on the new instance, and
grep the repo for the *old* domain suffixes — zero hits outside git history is the
done condition.

In practice bootstrap mode already did 1–4 in step 1 through the scaffolder, so what
remains here is filling the two state skeletons: every italic placeholder in
`docs/infrastructure.md` (platform table from step 2, inventory and credentials from
steps 4–5) and `docs/tailnet-state.md` (the policy as pasted from the console, the
registrar's scopes as minted). Done condition: no italic placeholder left in either
file. `CLAUDE.md` and the runbooks are rendered outputs — never hand-edit them; if a
binding changed, fix `instance.yaml` and `--render`.

## 7. Accept

Run `/health` as the acceptance test. A clean sweep — every resource green, canary
reachable, the outside probe matching `instance.yaml`, no published ports on the
internal lane, no drift — is what "set up" means; anything less is an open item to
fix before handing the instance over.

If push-to-deploy was wanted (`exposure.coolify_ui` is `github` or `internet`), the
last prepared step is the GitHub App: created once from Coolify's *Sources* page, with
the instance URL set to what GitHub can reach (`docs/provisioning.md`, *Push-to-deploy*).
Verify with a real push to a throwaway repo, not by reading the settings.
