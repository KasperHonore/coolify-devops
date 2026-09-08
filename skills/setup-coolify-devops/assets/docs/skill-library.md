# The skill library as a distributable product: position

Status, 2026-09-08, night: **the library is the hosting half of a pair, and ships
both install routes.** Two decisions, both reversing or sharpening what stands below:

- **Companion to [AI Build Kit](https://github.com/gwpicard/ai-build-kit).** That kit
  teaches non-developers to build a tool in a project repo on their own machine; its
  `/ship` is the only command there that moves work to "the copy the team actually
  uses", and it deliberately does not host. This library is where that copy runs,
  on the server. The split, agreed in principle with its maintainer and still to be
  settled in detail: *`/ship` decides whether and what goes live; `/host` decides
  where and how it runs; the address is the only thing that crosses.* `/host` now
  recognises such a project (`masterplan.md` + `AGENTS.md` + `CHANGELOG.md`), reads
  the hosting request `/ship` writes into the masterplan's operations section instead
  of researching, deploys from the git source with the GitHub App so their preview
  address and push-to-deploy exist, and hands back an address block for the builder
  to paste. Their fit-check question "will anyone outside the team rely on it" *is*
  our lane question. What is still theirs to add: `/ship` writing the request, and a
  mention in their README and `/ship` step 4. What was decided not to do: `/ship`
  calling the Coolify MCP from the laptop. A human between "ready" and "live", with a
  session on each machine, is the safety property both kits are built around; our
  `operator.on_host: false` binding would make it possible later if that changes.
- **The Claude plugin route is back**, alongside the skills CLI, for parity with the
  companion's install routes: `.claude-plugin/plugin.json` lists the five skills,
  `marketplace.json` has a single `source: "./"` entry, both validated with
  `claude plugin validate . --strict` and rehearsed by a real install into a
  throwaway `CLAUDE_CONFIG_DIR`. What made it cheap now, where it was deferred
  below: `${CLAUDE_SKILL_DIR}` is substituted in plugin skills too, so every
  `scripts/scaffold.js` command works unchanged from the cache, and the scaffolder's
  existing fallback to the working directory means the in-place repo model survives
  (verified: files land in the project, the cache stays clean, `--render` from the
  cache leaves no unrendered tag). Commands carry the `coolify-devops:` prefix on
  this route. Not done, and not planned: the open Agent Plugins format the companion
  also serves; nothing has asked for it.
- **The library now has the shape of a proper skills repo**, taken from the Agent
  Skills specification and from how vercel-labs/agent-skills is built. Each
  `SKILL.md` carries `license`, `compatibility` and `metadata.author/version`
  (`skills-ref validate` passes on all five; all are under the 500-line guidance,
  setup at 421). The library root gained a contributor `AGENTS.md` with a one-line
  `CLAUDE.md`, `CONTRIBUTING.md`, a `.gitignore`, `scripts/check-versions.mjs`
  (package, plugin manifest and every skill must agree) and
  `scripts/build-discovery-index.mjs` (a zero-dependency port of Vercel's: a
  `dist/index.json` against the discovery schema plus one artifact per skill, a bare
  `SKILL.md` or a reproducible tar.gz built from git; runs from the deployment repo
  too, via the git prefix). `.github/workflows/agent-skills.yml` runs `npm run check`
  on every push and PR of the public repo and releases **one release per version**,
  not per push as Vercel does: tag `v<version>` from `package.json`, notes from the
  matching `CHANGELOG.md` entry (its presence is part of the version check), and a
  refusal to re-release a version whose skill digests differ from what is already
  out, made by CI and by the publish script before the push. The first release had
  gone out under Vercel's `agent-skills-<sha>` name and was replaced. Two
  facts worth keeping: `git ls-tree` and `git archive` run from a subdirectory
  silently scope to that directory (`--full-tree` for the first, a top-level `cwd`
  for the second), which made the index build empty and then the setup skill's
  archive a 167-byte tarball with no entries, both from `library/`; and
  `claude plugin validate --strict` on a plugin root warns
  about a `CLAUDE.md` there, so that one check is lenient and the reason is in the
  library's `AGENTS.md`.

Status, 2026-09-08, evening: **distribution is the skills CLI, and only that.** The
library is installed with `npx skills add KasperHonore/coolify-devops`; the npm
scaffolder is gone. What forced the shape: the skills CLI installs *only* skill
directories, nothing outside them, and `npx skills update` fires only when a file
inside a skill folder changes. So the runbook templates and the renderer moved *into*
the setup skill (`skills/setup-coolify-devops/assets/`, `skills/setup-coolify-devops/scripts/scaffold.js`), and
`/setup-coolify-devops` now creates the deployment repo itself: interview → flags → render. The
other four skills keep reading `docs/` in the deployment repo — they depend on the
repo `/setup-coolify-devops` produced, never on the setup skill's files, which is the one-level-deep,
no-cross-skill-paths shape the spec and the well-regarded multi-skill repos use. The
update loop a consumer runs is `npx skills update` then `--render`; the living-runbook
problem's transport half is thereby solved, the contribution half is still ours.
The plugin form planned below is no longer the next step; the skills CLI covers the
same ground (namespacing aside) with a far lower bar for consumers, and this section
stands as the record of why the plugin route was considered.

**First trial friction, 2026-09-08 (a real machine, someone other than the author),
folded in the same evening:**

- *"The Coolify host is this machine running Claude Code."* The library had only
  modelled a remote operator; the primary scenario — skills installed on the host,
  Claude Code over Tailscale SSH — had no binding. Now `operator.on_host`: the
  "no shell" rule becomes policy (read-only shell checks yes, mutations through the
  MCP only), the outside firewall probe becomes a prepared human step (from the host
  it proves nothing), and the Coolify URL is `http://localhost:8000` without asking.
- *"Can I choose my own?"* to the tailnet-domain question. Tailscale assigns it; it
  can be renamed in the console from generated names, not to a custom word. On the
  host the skill now reads it with `tailscale status --json` and confirms instead of
  asking; off the host it explains where it comes from.
- `localhost:8000` typed without a scheme. The scaffolder normalises it.
- The general lesson, now in `/setup-coolify-devops`: a free-text answer where options were offered
  means the options were wrong — answer the question the user asked, then re-ask.
- *"I ran the export command. Hopefully that's permanent after reboot."* It is not, and
  "in your shell, never in a file" invited the misreading. The prepared step now hands
  over a 600-mode env file in the user's home, sourced from `.bashrc`, and says that
  "never in a file" means never in the repo.
- *A nested `coolify-devops/` folder appeared*, with the repo inside it and the skills
  outside, and a `cd` nobody would remember. The scaffolder's default target was a new
  directory; it is now the directory the skills are installed in, found from the
  script's own path, and a positional target that differs from it is refused. The
  reason it matters: the skills are installed in **root's home on the Coolify host**,
  because that is where Coolify's web terminal (an SSH session) lands — so the
  deployment repo *is* the home directory, and the `.gitignore` became an allow-list
  so `git add -A` there can never commit the token file or Claude's session data.
- *"I'm not able to access the Hetzner machine — is it okay to skip for now?"* The
  firewall probe blocked the whole setup behind a step the operator could not deliver.
  Two fixes: a skipped firewall is now a recorded known gap with 2FA insisted on, not a
  wall; and the user's own idea — a Hetzner API token as an optional binding, in the
  same env file — lets the skill create the firewall and read its rules back, which is
  also the authoritative answer to "which ports are open" that a probe never was.
- The OAuth-client step offered *"paste the client ID and secret here"* as its first
  option, and the user asked *"can you create it from the tailscale CLI?"*. Both now
  have answers in `/setup-coolify-devops`: the secret never enters the session (the
  human pastes it into Coolify's env store directly, the skill verifies the keys exist
  masked), and the client is console-only — the CLI manages the node, the API only
  mints tokens from an existing client. The same session also found a registrar
  already deployed on the box; step 4 now starts by looking for existing plumbing and
  putting adopt / upgrade / replace to the user with evidence, instead of deploying a
  second one.
- The rendered rules file is now **`AGENTS.md`**, with `CLAUDE.md` a one-line
  `@AGENTS.md` import. The skills CLI installs for many agents; the rules should be
  readable by all of them without a second copy to drift.
- **The full transcript, read afterwards** (19 minutes, 9 questions, 145 assistant
  turns), added what the live reports had not: the agent skipped the "where is Claude
  Code running" question because the evidence made it obvious (now allowed, with a
  one-line confirmation); it assumed the default project/canary/branch names (now one
  confirmation question); `get_server` returned `host.docker.internal` instead of the
  public IP (documented); the docktail reference compose was missing, costing eight
  web calls (now shipped in the skill and seeded into `stacks/`); `service delete` is
  asynchronous and `service create` does not deploy, so the new registrar was left
  created-but-never-started (both now in the skill and the rough-edges table);
  Coolify auto-creates the `production` environment and rejects `:`/`;` in
  descriptions (documented); precondition 2 was assumed from `tailscale status` alone
  — SSH happened to be on, key expiry was not disabled (exact checks now listed); and
  the policy block for `autoApprovers.services` surfaced four questions deep instead
  of with the OAuth handover (moved up front). `--set` on the scaffolder records
  `coolify.version_observed` without hand edits, and the scaffold sets a repo-local
  git identity so later commits do not fall back to `root@<hostname>`.
- The `tailscale` CLI is the one thing the shell may *change*: node-local settings
  (SSH, tags, hostname) are done by the skill when it has the CLI — on the host, or
  over Tailscale SSH from another machine on the tailnet, which is the single
  sanctioned exception to "no SSH" and is scoped to the CLI plus read-only checks.
  Console-only settings (key expiry, tailnet name, policy, OAuth clients) stay
  prepared steps; `provisioning.md` section 2 has the table.

Status, 2026-09-08, earlier: **the trigger fired; the physical split is done; distribution is
a scaffolder; the plugin form is still ahead.** The user asked to share this repo so
others can get it running with one command — the "first real second consumer" moment
the Trigger section below reserved the migration for. The first attempt pushed the
whole deployment repo, state and all, to a public GitHub repo; that forced the
portable/instance split this file had planned to be *physical* immediately:

- **`library/` is the distributable and the only thing ever pushed.** It is the npm
  package (`package.json`, `bin/create.js`, `template/`), the five skills, and the
  portable docs — `platform.md`, `internal-services.md`, `tailnet-access.md`,
  `changing-a-resource.md`, plus the position papers. `npx coolify-devops <dir>` — or
  `npx github:KasperHonore/coolify-devops <dir>` — scaffolds a deployment repo from it:
  skills copied, and everything else — `AGENTS.md`, `instance.yaml`, every runbook in
  `docs/`, the two state docs — rendered from the interview so the repo reads as the
  consumer's own instance; `.mcp.json` reads the token from the shell. `/setup-coolify-devops` fills the skeletons. The GitHub repo is the `library/` subtree
  of the author's deployment repo, published by `npm run publish-library`.
- **Everything else stays in the deployment repo**: `instance.yaml`, `stacks/`, the
  two state docs. The author's deployment repo's `.claude/skills/<name>` are symlinks into
  `library/skills/`, so a lesson folded into a skill lands in the library directly —
  the living-runbook loop for the *reference* instance is intact.
- **What is deliberately not done**: a *scaffolded* repo still gets copies, so its
  lessons stay local (the hard problem below). The plugin form — skills loaded from
  the library by reference, invoked as `/coolify-devops:host`, portable docs reached
  via `${CLAUDE_PLUGIN_ROOT}` — is the fix, and the split now makes it a file move
  plus path rewrite. The `npx` entry point survives it: the CLI would pin the plugin
  instead of copying skills.

## The endgame

The unit of sharing becomes the **skill library**, not this repo. Someone receives
the library, runs a setup skill, and ends with a working deployment repo of their
own. Two artifacts replace today's one:

- **The library — a Claude Code plugin.** Plugins bundle multiple skills plus shared
  files at the plugin root, referenced by relative path — which is what lets the
  portable docs travel with the skills *without* landing inside any single skill's
  folder (they are shared by all of them; a per-skill home would assign a false
  owner). Contents: the five skills (`host`, `change-service`, `health`,
  `grant-access`, `setup`) and the portable halves of today's
  `internal-services.md`, `tailnet-access.md`, and `infrastructure.md` — docktail's
  traps, Tailscale semantics, the verification procedures — plus the platform-lore
  body of `stacks/README.md` (the mount/recreate/verification knowledge
  `/change-service` depends on, which must not stay behind in a deployment repo).
  Distributed as a git repo or marketplace entry.
- **A deployment repo per instance** — everything the library must not contain:
  `instance.yaml`, `stacks/`, the instance-state docs (current policy model,
  recorded credential scopes, inventory), and a scaffolded `AGENTS.md`. Created and
  populated by the setup skill; accumulates state over the deployment's life.

The portable-vs-instance split that `conventions.md` maintains *logically* today
becomes *physical* at migration. That split staying clean is what makes the
migration cheap — which is the standing reason to keep enforcing it now.

**This supersedes, at migration time, the conventions rule that skill-supporting
facts never move into the skill tree.** That rule's reasoning (shared facts need a
neutral, discoverable home) is answered by the plugin root, not violated by it.

## The mechanics, verified against the plugin docs (2026-08)

Researched from the official Claude Code plugin documentation
(code.claude.com/docs/en/plugins.md, plugins-reference.md, plugin-marketplaces.md);
the load-bearing facts for the migration:

- **Layout**: plugin root holds `.claude-plugin/plugin.json` (only `name` is
  required), `skills/<name>/SKILL.md` per skill, and shared docs in any plugin-root
  directory (e.g. `shared-docs/`). Skills reference plugin-level files via
  `${CLAUDE_PLUGIN_ROOT}/shared-docs/<file>.md` — a substitution available *only* to
  plugin skills, which is the mechanism that lets the portable docs travel at
  library level. `${CLAUDE_PROJECT_DIR}` still works from plugin skills, which is
  how they will keep reading the deployment repo's `instance.yaml` and state docs.
- **Namespacing**: plugin skills invoke as `/<plugin>:<skill>` and never collide
  with project skills; a project skill with the same bare name shadows nothing.
  During a transition both can coexist (`/host` project-local, `/<plugin>:host`
  from the library) — useful for the migration's trial period, then the project
  copies are deleted.
- **Distribution**: a marketplace is a repo with `.claude-plugin/marketplace.json`;
  sources can be a GitHub repo, a git URL, a **subdirectory of a git repo**
  (`git-subdir`), or a local path. A deployment repo pins the library for its team
  via `enabledPlugins` in committed `.claude/settings.json`. Dogfooding before any
  split: `claude --plugin-dir ./<plugin>` or a file-source marketplace entry —
  meaning the plugin can be developed *inside this repo* and consumed by it.
- **Updates**: marketplace installs refresh on `/plugin marketplace update` +
  `/reload-plugins`; skills-dir installs update by `git pull`. Version comes from
  `plugin.json`. This is the transport half of the living-runbook problem — the
  upstream *contribution* half remains ours to design.
- **Porting cost**: SKILL.md frontmatter is identical for project and plugin
  skills; converting is a file move plus rewriting `docs/` references to
  `${CLAUDE_PLUGIN_ROOT}` paths. Invocation names change to the namespaced form.

## Migration map, from the 2026-08-25 audit

A read-only audit classified every section of the shared docs and swept the skills
for binding leaks. The leaks it found are fixed (registrar naming in `/host` and
`/health`, instance-state assertions in `/host` and `/grant-access`, the env-var
name mismatch between the two access docs, and the operator tailnet gaining its
`domains.operator_tailnet` key). What remains is the split itself:

- **Purely portable, destined for the plugin root**: internal-services.md's trap /
  verification / repair / failure-signature sections; tailnet-access.md's
  procedures, group-model judgment, policy-editing discipline, and scope taxonomy;
  stacks/README.md's entire platform-lore body; infrastructure.md's `run_once`
  lore, MCP rough edges, token-scoping and deployment-shape judgment.
- **Purely instance, staying in the deployment repo**: "Where we are today", the
  recorded credential scopes, the platform table, inventory and volumes tables,
  housekeeping, known gaps, the stacks file lists — and `AGENTS.md` as a file,
  which becomes a setup-skill-scaffolded artifact from a portable template.
- **Mixed sections split along exactly those lines**; prose that restates
  `instance.yaml` values gets rewritten to name keys as it moves.

Checklist for the migration itself, beyond moving files:

1. **Re-home every path skills use**: library docs via `${CLAUDE_PLUGIN_ROOT}`,
   the deployment repo's `instance.yaml`, instance docs, and `stacks/<name>/` via
   `${CLAUDE_PROJECT_DIR}` — state the convention once, at the top of the library.
2. **Deduplicate the write-once-ports trap** — it is currently written out three
   times (internal-services.md, infrastructure.md, AGENTS.md); one portable copy,
   the others become pointers, or they drift.
3. **Worked examples name shapes, not resources** — done 2026-09-08; the runbooks
   and skills carry no named resource of any instance.
4. **State the software assumption**: the library assumes docktail and Traefik as
   the plumbing software. `plumbing.*` keys parameterize resource *names*, not the
   software — swapping registrars invalidates whole sections, not just bindings.
5. **The scaffold must guarantee the instance-state write targets** that portable
   skills write into — tailnet-access's "Where we are today", infrastructure's
   inventory and volumes tables — exist under those exact names (`/setup-coolify-devops` step 6
   does this; keep it true).

## 2026-09-08, second pass: the setup starts before Coolify exists

Feedback from running the library with a team that vibe-codes its apps in another
build kit: the library assumed a Coolify host on the tailnet as its starting point,
and for that audience the hardest part is everything *before* that — the cloud VM,
Tailscale, the Coolify install, and above all the firewall. Nothing in the library
mentioned a firewall at all. Three decisions came out of it, all landed in this pass:

- **Human checklist, skill verifies.** The console work (VM, Tailscale, Coolify,
  cloud firewall) is a rendered runbook, `provisioning.md`, not a skill: a skill
  cannot click a cloud console, and a doc a human can read start to finish is the
  honest form. What a skill *can* do is verify it — `/setup-coolify-devops` and `/health` probe the
  public IP from the operator's machine, which is on the internet, so a port that
  answers is the finding. The split is "human does, skill checks", the same
  prepared-step discipline `/setup-coolify-devops` already used for the tailnet preconditions.
- **The lanes are fixed and the firewall enforces them.** Internal tools are always
  Tailscale Services; the public lane needs a domain (owned, or a free DuckDNS one)
  and exists only for public-facing apps. Docker-published ports bypass `ufw`, so the
  cloud firewall outside the VM is the guarantee behind "no published ports". Its
  rule set is a function of two new bindings the scaffolder now asks for explicitly:
  `domains.public_suffix` (via a yes/no on public-facing apps first) and
  `exposure.coolify_ui` (`tailnet` / `github` / `internet`).
- **Push-to-deploy needs no domain.** Verified by the user: GitHub delivers webhooks
  to `http://<public-ip>:8000` fine. What it needs is *reachability* of port 8000,
  which is what `exposure.coolify_ui` encodes — `github` allow-lists GitHub's
  published hook ranges; `internet` opens it with 2FA mandatory; `tailnet` forgoes
  push-to-deploy. The runbook records which mode was verified how.

Path-based routing through Traefik on the host's MagicDNS name was considered and
rejected: MagicDNS gives one name per machine, so every tool becomes a path, which
breaks apps that assume `/` and — decisive — collapses per-Service tailnet grants into
one grant for everything. One name per tool stays.

**Next**: a fresh-context trial of the scaffold plus `/setup-coolify-devops` against a real, newly
provisioned machine, by someone other than the author, friction log as the
deliverable (`conventions.md`, *Trialing a skill*). Items marked *unverified* in
`provisioning.md` — the `github` dashboard mode in particular, including the one-time
GitHub App creation through the allow-listed port — are what that trial settles.

## Open items

- ~~The deployment repo's `stacks/` lacks reference copies for the plumbing and
  canary~~ — **closed 2026-09-08**: `get_service reveal: true` worked once permissions
  allowed it; the live composes of the reference instance's `docktail`, `whoami` and
  `cloudflare-ddns` were genericised into `skills/setup-coolify-devops/assets/stacks/`
  (plus a DuckDNS pinner), pinned to release tags, and are seeded into every
  deployment repo's `stacks/` at scaffold time. The reference instance itself still
  runs `latest` tags for all three — recorded there as a known gap, and `/health`
  will report the drift against the seeded copies until they are pinned.

## The setup skill

`/setup-coolify-devops` is `conventions.md`'s "Pivoting to another instance" procedure turned into
a skill, plus an interview. It:

1. Interviews for the bindings — tailnet suffix, public domain, project names,
   policy defaults — and writes `instance.yaml`.
2. Verifies the MCP answers (`get_version`), then creates the three projects.
3. Deploys the plumbing if missing (the tailnet registrar with its OAuth
   credentials, the public-DNS pinner), then the canary, then runs the four
   internal-services verification steps against it.
4. Scaffolds the deployment repo: `AGENTS.md`, `docs/` skeletons for instance
   state, empty `stacks/`.
5. Finishes with `/health` as the acceptance test.

What it must hand to the human as prepared steps, never claim to do: pointing the
harness at the Coolify MCP server (config outside any repo), joining the machine to
the tailnet, and minting the Tailscale OAuth client (console work) — the same
prepared-handover discipline `/grant-access` uses.

## The hard problem to solve at migration, not after

**The living-runbook loop breaks across distribution.** Today a lesson is folded
into the skill in the same commit because everything is one repo. Once the library
is shared, a lesson learned in a deployment needs an upstream path back to the
library, or every deployment forks its skills and the library rots. Design the
contribution path (library as git dependency; lessons land as upstream commits)
as part of the migration, not as a discovery afterwards.

## Trigger

The first real second consumer — the moment the library is actually handed to
someone, or a genuine second instance appears. **Fired 2026-09-08** (see the status at
the top). The physical split and the scaffolder are the v1 answer; the plugin form is
the next step, gated on the first scaffolded instance actually running `/setup-coolify-devops` and
reporting friction.
