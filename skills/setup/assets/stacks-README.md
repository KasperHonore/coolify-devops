# stacks/

**One folder per resource** — `stacks/<name>/` is the single home for everything this
repo holds about a resource: its `README.md` (the per-resource doc, required when the
wiring is non-obvious), a reference copy of its compose file, and any file-mount
contents broken out as real files.

**Nothing here is applied to anything.** Coolify's database is the source of truth and
its UI/API is the write path; these copies exist so the definitions are readable and
reviewable in git, and they drift silently if someone edits a resource in Coolify
without updating them. `/health` diffs them against live state.

**Before changing anything, read `docs/changing-a-resource.md`** — what actually
changes a `content:` file mount, what recreates a container, and how to prove a change
took. `/change-service` walks it.

## What is here

Nothing yet. `/setup` adds the plumbing and canary reference copies; `/host` adds a
folder for every resource with non-obvious wiring or file mounts, and updates this list.
