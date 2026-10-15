# Changelog

One entry per version in `package.json`. The public repo carries a `v<version>` tag and
a GitHub release for each, with this entry as its notes and the Agent Skills discovery
index plus one artifact per skill attached. A version is never re-released with
different skill content; CI and the publish script both refuse it.

## 0.8.1 — 2026-10-15

- `/host` has a step for redeploying an application after a merge that did not
  deploy (the address block said `Deploys on merge: no`). It finds the application,
  checks that a webhook has not already queued a build, names the app and commit to
  the user, deploys, and checks that the merge commit is what went live: from the
  health route when it reports one (`SOURCE_COMMIT` on AI Build Kit recipes), or
  from the finished deployment otherwise. "Redeploy X" is now one of the phrases
  that starts `/host`.
- The address block's `Deploys on merge: no` line also names Coolify's **Redeploy**
  button, which works when nobody has an agent session open on the server. `/host`
  stays the recommended route because the button does not check the commit.

## 0.8.0 — 2026-10-15

Lines up with [AI Build Kit](https://github.com/gwpicard/ai-build-kit) v0.20.

- The kit's `/ship` is now `/setup-hosting` and its `/sync` is `/maintain` (kit
  v0.20.0). `/host`, the README and the design notes use the new names, so `/host`
  no longer tells anyone to run a command that is gone. A release is now each merge
  through the kit's `/implement`.
- `/host` reads `Healthcheck: none` in a hosting request as an answer, not a missing
  field. The kit writes it for any tool not on one of its recipes. Instead of sending
  the request back, `/host` ends with a findings block that says what the builder
  needs: a health route such as `/api/health` returning 200, the app bound to
  `0.0.0.0`, and `curl` or `wget` in the image, plus a `/shape` line to paste into
  their repo.
- The address block's `Later releases:` line is now `Deploys on merge: yes | no
  (redeploy by hand: …)`. With `exposure.coolify_ui: tailnet` GitHub cannot reach
  Coolify, so a merge does not deploy; the kit's `/implement` and `/maintain` would
  otherwise find an older version running with nothing saying why.
- `/host` takes the kit's `setup-hosting/references/hosting-request.md` as the
  reference format and reads either wording by field name.
- Updating on the skills CLI route is `npx skills add KasperHonore/coolify-devops`
  then `--render`, the same pattern as the kit. `npx skills update` skips renamed
  skills. The README, the rendered `AGENTS.md` and the deployment repo's README all
  say so.
- `--render` now adds any env passthrough the `.mcp.json` template has gained to an
  existing `.mcp.json`, and leaves the existing values alone. A server set up before
  0.7.0 gets `COOLIFY_UI_URL` on its next render. The README has upgrade notes for
  servers set up before 0.7.0 and 0.4.0 (`tag:server` on the host node).
- The README's skills CLI install line no longer passes `-a claude-code`, which
  installed for Claude Code only and left Codex, Cursor and Gemini CLI with nothing.
- `/health` checks disk use on the Docker filesystem (a finding at 80%, the lead
  finding over 90%). `docs/infrastructure.md`'s housekeeping section is now a table
  for disk use, the Docker cleanup settings and Sentinel.

## 0.7.0 — 2026-10-03

Follows Coolify MCP 3.8.0 and 3.9.0, summarised by its maintainer on
[#2](https://github.com/KasperHonore/coolify-devops/issues/2).

- `/host` can roll an application back. `deployment rollback_images` lists the image
  tags Coolify still holds, and `deploy` with `rollback_to` returns to one; it then
  verifies as after any deploy. It needs Coolify 4.3+ and MCP 3.8.0+, names the tag to
  the user first (the MCP asks no confirmation), and says the next push builds over
  it. The address block's `Rollback:` line now describes this. Not yet run live.
- MCP 3.9.0 follows no redirects, so an `http://` base URL behind a proxy that
  upgrades to https now fails every call. When a Coolify URL is typed without a
  scheme, the scaffolder now adds `https://` to a bare domain and keeps `http://` for
  `localhost`, an IP, or a host with a port. Setup says a domain's URL must be
  `https://`.
- `.mcp.json` passes `COOLIFY_UI_URL` through when it is set, so the MCP's dashboard
  links open in the operator's browser rather than at `localhost`. The env-file
  snippets list it as optional.
- `docs/platform.md`: new rows for rollback, the redirect refusal, `COOLIFY_UI_URL`,
  and `lines` being a whole number from 1 to 10000.

## 0.6.0 — 2026-10-01

- `/host` switches per-PR preview deployments on itself
  ([#2](https://github.com/KasperHonore/coolify-devops/issues/2)). The Coolify MCP
  gained the preview fields in 3.6.0, so on the public lane `/host` now sets
  `is_preview_deployments_enabled` when it sets the app's address, reads it back, and
  still counts previews as working only after a PR has produced one. The
  **Enable preview deployments** button is no longer part of the procedure. Previews
  from forked repositories stay off unless the user asks for them.
- On a Coolify MCP older than 3.6.0, `/host` and `setup-coolify-devops` tell the user
  to update it (restart the session; `.mcp.json` runs `@latest`) rather than work
  around it.
- `/host` can rebuild an existing preview with `deploy` and `pr` (MCP 3.7.0). It
  cannot create the first one: that still comes from GitHub's webhook.
- `docs/platform.md`: the "MCP cannot switch previews on" row is replaced by the
  version requirement, and two rows are added: the MCP's "ignored `<key>`" note means
  a field was not sent, and `deploy` with `pr` only redeploys a preview that exists.
- The internal lane still has no previews.

## 0.5.0 — 2026-09-26

- `/host` no longer promises per-PR preview deployments it cannot deliver
  ([#1](https://github.com/KasperHonore/coolify-devops/issues/1)). Coolify creates
  every application with previews off, and the Coolify MCP cannot turn them on, so a
  PR used to build nothing while the address block said previews worked. Now, on the
  public lane, `/host` hands the human the **Enable preview deployments** button,
  reads the flag back, and calls previews working only after a PR has produced one.
  On the internal lane it says previews are not available and why: Coolify drops
  the docktail labels on PR deployments and gives an app with no domain no preview
  address.
- The address block's `Preview:` line has three honest values (seen on a PR,
  enabled but not yet seen, or none with the reason), which changes what AI Build
  Kit's `/ship` reads.
- Three new rows in the MCP rough-edges table: the missing preview flag, previews
  needing an app domain, and PR deployments replacing custom labels.

## 0.4.0 — 2026-09-09

- Lessons from two more trials on a fresh box: the tailnet policy paste comes before
  the OAuth client (its tag dropdown only offers existing tags), and the Coolify host's
  own node must advertise `tag:server` or the registrar fails every service add — a
  node-local step the setup skill now runs and verifies, which also retires the
  disable-key-expiry console step. A masked env var can be empty; the skill proves
  presence inside the container before blaming a recreate.
- `/host` looks for an existing resource before asking anything, adopts one created
  from Coolify's UI (clears its public sslip.io FQDN, renames it), and for a private
  repo hands over `gh auth login` and reads the clone instead of asking six
  questions. The git-source application path on the internal lane is proven:
  `custom_labels` is base64, Railpack's bare-`bash` restart loop means "write the
  Dockerfile", the image needs `curl` for Coolify's healthcheck, a webhook deploy
  is watched rather than duplicated. This side never edits a product repo: the
  hosting request is pasted in (never fetched, so a private repo needs no `gh` login
  on the server), and code that will not host goes back as a findings block.
- Waiting is bounded polling in tool calls, never a scheduled wakeup (one outlived
  its session). Nine new rows in the MCP rough-edges table.

## 0.3.0 — 2026-09-08

- The library is the hosting companion to [AI Build Kit](https://github.com/gwpicard/ai-build-kit).
  `/host` recognises a project built with it, reads the hosting request its `/ship`
  writes into the masterplan instead of researching, deploys from the git source with
  the GitHub App, and hands back an address block for the builder to paste.
- Claude Code plugin route alongside the skills CLI: `claude plugin marketplace add
  KasperHonore/coolify-devops`, commands prefixed `coolify-devops:`. The setup skill
  gained a re-render mode and works from the plugin cache.
- README restructured in AI Build Kit's section order; `LICENSE` added.
- Every skill's frontmatter carries `license`, `compatibility` and `metadata`; a
  contributor `AGENTS.md`, `CONTRIBUTING.md`, a version-sync check, a discovery-index
  build, and CI that validates every push and releases every version.

## 0.2.0 — 2026-09-08

- Distribution through the skills CLI only; the runbook templates and the scaffolder
  moved inside the setup skill, which now creates the deployment repo in place.
- Lessons from the first trial on a real machine: Claude Code on the Coolify host,
  the tailnet domain discovered rather than asked, the MCP token in a sourced
  root-only env file, the deployment repo as root's home with an allow-list
  `.gitignore`, a Hetzner API token as an optional binding for the firewall, the
  Tailscale OAuth client as a console-only step whose secret never enters a session.
- Rules render to `AGENTS.md` with a one-line `CLAUDE.md` import; secrets are never
  printed into a session.

## 0.1.0 — 2026-09-08

- First public cut: the five skills, the provisioning runbook, explicit lane and
  dashboard-exposure bindings, and the physical split between the library and any
  instance's state.
