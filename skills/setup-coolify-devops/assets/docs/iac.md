# Infrastructure-as-code: position

Status, 2026-08: **not adopted — pilot candidate.** Coolify's UI/API (via the MCP)
remains the write path, and `stacks/` remains reference copies. This file records why,
so the question is not re-researched from scratch.

## The candidate

`coolify-terraform/terraform-provider-coolify` (Terraform Registry + OpenTofu registry)
is the only serious IaC option. Researched in depth 2026-08-25, including its source:

- 57 resources / 70 data sources. Covers raw docker-compose **services**
  (`docker_compose_raw`), env vars (incl. bulk), scheduled tasks, projects,
  backup schedules, start/stop/restart actions.
- Pinned, at time of writing, to the Coolify version then current (4.3.10),
  with per-version API contracts and 1,500+ tests. Well engineered.
- But: ~3 months old, 0.x, effectively **one maintainer**. The Coolify 4.3.0 API
  change broke it for about two weeks before a pinned fix.

## Why not adopted now

The two worst documented traps in this setup survive Terraform intact:

1. **A service compose change is a DB-only PATCH** — no deploy, no restart. The
   "database updated, container unchanged" trap from `stacks/README.md`, reproduced.
   Restarts must be hand-wired via `coolify_resource_action` triggers, and whether a
   restart *recreates* containers is still Coolify's usual semantics.
2. **`content:` file mounts are unsupported** — `coolify_storage` has no content
   attribute. The delete-and-recreate sequence stays MCP work.
3. **Compose drift is invisible to `terraform plan`.** The provider deliberately keeps
   your input in state to avoid fighting Coolify's compose regeneration, so UI/MCP
   edits to a compose never surface as a diff. The #1 drift source here is exactly the
   blind spot. (Env-var drift *is* detected, with a `read:sensitive` token.)
4. **Secrets land in plaintext in the state file.** With no remote and no cloud, the
   only sound shape is OpenTofu ≥1.6 client-side state encryption, state outside this
   repo, never committed.

What it would genuinely buy: compose/env authoritative in git (ending "reference
copies" as a concept for tracked attributes), env drift detection, and a credible
rebuild-the-server-from-scratch story.

## The standing plan, if/when revisited

Pilot on the canary with OpenTofu + encrypted local state, and answer empirically:

1. Does `docker_compose_raw` change + restart trigger actually recreate the container
   (watch for the dip, per `stacks/README.md`)?
2. Does a compose re-parse touch an existing `content:` file mount? (Expected: no —
   confirm and document.)
3. How noisy are plans with a root token?

If clean: expand to services **without** file mounts only; anything with `content:`
mounts stays on the MCP flow. The MCP is kept regardless — logs, `run_once`, and
diagnostics have no Terraform equivalent.

## Lighter alternative worth knowing

A small script that GETs live compose per service and diffs it against `stacks/<name>/`
would detect compose drift *better* than `terraform plan` can, with no state file and
no third-party dependency. If drift detection (rather than a declarative write path) is
the actual goal, start there.

The interactive version of that check already exists as the `/health` skill's drift
step. If it ever wants to be scheduled, the field's pattern for proto-CI is a cron'd
headless run — `claude -p` with read-only allowed tools, `--max-turns`, and JSON
output — which fits the "idempotent, bounded, verifiable" bar that gates what is safe
to automate unattended. Drift-checking is the right first candidate; nothing mutating
belongs in an unattended run.
