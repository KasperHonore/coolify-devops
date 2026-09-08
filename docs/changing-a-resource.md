# Changing what Coolify runs: file mounts, recreates, and proving a change took

`stacks/<name>/` in a deployment repo holds reference copies — nothing there is applied
to anything. Coolify's database is the source of truth and its UI/API is the write path;
the copies exist so definitions are readable and reviewable in git, and they drift
silently if someone edits a resource in Coolify without updating them.

This file is the operational lore for *changing* what Coolify runs. The `/change-service`
skill walks these procedures; this file remains the full explanation. Everything in it
was learned the hard way.

## `content:` file mounts are written once, at creation

The `content:` key inside a bind mount is a Coolify extension that tells Coolify to create
the file with those contents. It is honoured **only when the resource is created**. Editing
`content:` in the compose and saving does *not* rewrite the file — Coolify strips the key on
parse, keeps the file it already made, and reports success. The container goes on mounting
the old contents, and nothing anywhere says so.

This is the same shape as docktail's write-once ports (`internal-services.md`), and it fails
the same silent way: the change looks applied everywhere except where it matters.

**`storages` with `action: update` is not enough either.** It rewrites Coolify's database row
and nothing else — read the storage back afterwards and the new content is there, convincingly,
while the file on the host is untouched and the container goes on mounting the old one. Every
layer reports success. This has cost several hours: the record said one thing, the process
behaved according to another, and there is no view in Coolify that shows the disagreement.

What works is making Coolify **create** the file storage again, since creation is the only path
that writes to disk:

1. Put the intended content in the compose's `content:` block, and update the copy here.
2. Delete the file storage (`storages` with `action: delete`, `type: file`, and its uuid).
3. Push the compose (`service` with `action: update`), which re-parses `content:` and creates a
   new file storage — confirm via `storages` `action: list` that it came back with a **new
   uuid**, which is how you know it was created rather than updated.
4. Deploy, so the file is written to the host.
5. Only then force the container to be recreated, per below — a container that started before
   step 4 is still on the old file.

**Then force the container to be recreated, because a deploy is not enough.** These are
single-*file* bind mounts, and a bind-mounted file is pinned to the inode it had when the
container started. Rewriting the file on the host does not reach a running container, and
neither does a restart. A `deploy` only helps if it happens to recreate the container —
Coolify hands Docker an unchanged spec, Docker keeps the existing container, and the deploy
reports success while the process keeps reading the old file. Adding an env var to the same
service is not reliably enough either; it has been observed not to recreate.

The sequence that does work, in this order:

1. `service` `action: stop_application` with the sub-application's `app_uuid`
2. `service` `action: start_application` with `force: true`

Do not substitute a `deploy` for step 2. Every container here runs `restart: unless-stopped`,
and Docker treats a container stopped by hand as deliberately stopped: `up` will not start it
again, so between the two steps the resource is genuinely down and a deploy issued there
leaves it that way. `start_application` is what brings it back. Expect a couple of minutes of
downtime while migrations run, and do this when that is acceptable.

**`deploy` with `force: true` also recreates containers**, service-wide, and is the one
recreate that has been watched happen from outside: a stack's websocket endpoint went to
503 and came back, on a stack that a plain `deploy` had left running. It is
blunter than the stop/start above — every container in the service goes, not just the one you
meant — so it costs the whole resource a short outage rather than one sub-application a
longer one. Use it when that trade is the right way round, and note it does *not* replace
step 2 above: once a container has been stopped by hand, `start_application` is still what
brings it back.

The corollary is the only reliable tell there is: **watch the service from outside and look
for the dip.** A container that was genuinely replaced stops answering for a moment. No dip,
no recreate — regardless of what any status field says. Poll at a few seconds, not twenty; a
fast restart hides between samples, and a 20-second poll that showed no dip was read as
evidence of no recreate, wrongly.

**`last_online_at` is not the tell**, despite looking like one. It records the container
coming *online*, which a plain `docker start` of the existing stopped container does too — so
it moves on a restart that changed nothing, and it moved here on exactly that. If it did
*not* move, nothing happened; if it did, that still proves nothing.

Coolify's own `config_hash` is closer to the truth and also unreliable: it did not change when
env vars were added to a service here, which is the likeliest reason `deploy` decided there
was nothing to do. Including a real change to the container spec in the same edit — a
healthcheck interval, say — gives both Coolify and Docker something to notice.

A related trap in the same area: only `${VAR}` references create rows in Coolify's env store.
A literal value in `environment:` goes straight into the container spec, so `env_vars` with
`action: list` returns nothing for it — absence there is not evidence a variable is unset, only
that it was not written as a reference.

So verify at the application layer instead — but check what the field you pick is actually
derived from before trusting it, because a plausible-looking one can be incapable of showing
the change. A readiness endpoint's `log_level` field is the cautionary example:
it reports the *logger's* effective level, while the env var sets the level on the log
*handler* and never on the logger, so the field reads `WARNING` no matter what the env var
says. It cannot distinguish a stale container from a fresh one, and it was used here as though
it could.

A usable tell has to be something the endpoint computes *from* the setting you changed —
a "no cache connected" warning flag derived from whether the cache actually resolved, say,
with the caveat that a "disable this warning" switch short-circuits such a probe.

Find such a value before you start. Without one there is no way to tell a stale container from
a working change, and every status field Coolify shows will be green either way.

Verify it took, twice over, because every layer of this fails silently: read the storage
back (`storages` with `action: list`) to confirm the stored content, and then confirm the
running process actually reflects it — an app-level endpoint that reports the setting, or
the startup log line that announces it. Do not treat a green deploy as evidence.

Reference compose files under `stacks/` are **not working plain-Compose files** — the
`content:` key inside their bind mounts is a Coolify extension that tells Coolify to
create the file with those contents. `docker compose up` would ignore it and mount
nothing. Break the same contents out as real files next to the compose (`<name>/init/`,
`<name>/proxy/`, `<name>/config/`) so they can be diffed against upstream.
