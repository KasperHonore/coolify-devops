# Hand-back blocks for an AI Build Kit project

Loaded by `/host` at step 7.6, at the end of a run on an AI Build Kit project. The
builder pastes what you print into the "How it stays running" section of their
`masterplan.md`; their `/setup-hosting` records it and `/maintain` keeps it current.
This repo never writes into theirs.

## The address block

Print it verbatim, once the deploy is verified:

```
Hosted by coolify-devops at <Coolify URL>
Address:        https://<name>.<suffix>                (lane: internal | public)
Preview:        per-PR at https://<pr_id>.<name>.<suffix>, seen on PR #<n>
                | enabled, not yet seen: confirm on the first PR
                | none: <why: internal lane (Coolify drops custom labels on PR
                  deploys; no app domain, no preview URL) | dashboard not reachable by GitHub
                  | not wanted | not a GitHub App source>
                ; basic auth: set by hand, confirmed | set by hand, not yet confirmed
                  (only when the request's Previews: line names Basic Authentication)
Deploys on merge: yes, a merge to <branch> redeploys
                | no (after each merge, the server operator runs /host "redeploy <name>",
                  or presses Redeploy on the application in Coolify; <why: dashboard
                  not reachable by GitHub (exposure.coolify_ui: tailnet) | not a
                  GitHub App source>)
Rollback:       deploy rollback_to an earlier image tag (deployment rollback_images); holds until the next push
Access:         <who can reach it, per docs/tailnet-state.md | anyone on the internet>
Backups:        <the decision from /host step 6>
Secrets:        <env var names>, held in Coolify's env store for this resource
Build vars:     <names from the request's Build vars: line>, build-time and runtime;
                a change needs a redeploy, not a restart | none
```

Never write a preview address that `/host` step 5 has not seen: a `Preview:` line that
promises PR builds while the flag is off is the failure this line exists to stop.
`Deploys on merge:` is read from `exposure.coolify_ui` and the source, never
assumed: `yes` only with the GitHub App source and `github` or `internet`. On `no`,
`/host` (its step 4.6) is the recommended route because it checks the commit that went
live; the dashboard's **Redeploy** button skips that check, but works when nobody
has an agent session open on the server. Their
`/setup-hosting` reads that block on every later visit, and their
operational-readiness step counts rollback, access and backups as answered by it.

## The findings block

A deploy that failed on the code ends the run with this instead — no bookkeeping
beyond a line in `docs/infrastructure.md` — and resumes at step 4 when the push
lands:

```
Not hosted yet — coolify-devops at <Coolify URL>
Finding:   <one line, quoting the deployment log>
Needs:     <the request field it violates: Build (Dockerfile with curl, or lock file + Procfile) | Bind 0.0.0.0 or HOST/PORT | …>
Then:      push to <branch>; Coolify redeploys and /host verifies
```

### Healthcheck: none

For **`Healthcheck: none`** there is no deployment log to quote: `Finding:` is
"the hosting request has no health route; Coolify's zero-downtime deploys need
one", `Then:` is "merge, then send the updated request back here", and `Needs:`
lists all three facts Coolify's check depends on, each as a line the builder can
act on:
- a health route such as `/api/health` that answers `200` without signing in and
  without calling anything slow;
- the app bound to `0.0.0.0` (or reading `HOST` and `PORT`), not `127.0.0.1`;
- `curl` or `wget` in the image (a repo's own Dockerfile; Railpack adds both);

and ends with a line to paste into their repo's session:

```
/shape Add a health route at /api/health that returns 200 with no sign-in, make the server listen on 0.0.0.0 (or read HOST and PORT), and make sure the image has curl or wget, so the server can check the tool before switching traffic to it.
```
