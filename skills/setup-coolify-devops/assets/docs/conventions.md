# Repo conventions: where knowledge lives

The layering rule this repo follows: **skills carry workflow and judgment; files carry
facts.** Each kind of fact has exactly one home, so a fact is corrected in one place
and nothing else pretends to know it.

| Layer | Holds | Changes when |
|---|---|---|
| `CLAUDE.md` | Rules that apply to *every* session — access model, lanes, write path, the traps that bite immediately. Rendered from the library's template + `instance.yaml` | The operating model changes |
| `.claude/skills/` | Portable procedures: how to host, change, and check things. **No instance bindings hardcoded** — skills name values from `instance.yaml`. Installed and updated with the skills CLI (`npx skills add` / `update`){{#IS_LIBRARY}}; here they are symlinks into `library/skills/`{{/IS_LIBRARY}}. The setup skill additionally carries, in its `assets/` and `scripts/`, the templates and the renderer that produce everything below — the one place portable knowledge lives inside a skill folder, because the skills CLI installs nothing outside one | The *procedure* improves (often right after it failed) |
| `instance.yaml` | The bindings that would change on a pivot to another Coolify instance: Coolify URL, domains, project names, canary, policy defaults | The instance changes |
| `docs/` — runbooks | `provisioning.md` (the human checklist before Coolify exists: VM, Tailscale, Coolify, the cloud firewall — rendered from the lane and dashboard answers), `platform.md` (lanes, naming, deployment model, the MCP), `internal-services.md` (docktail, verification, repair), `tailnet-access.md` (people and policy), `changing-a-resource.md` (mounts, recreates, proving a change took), and the position papers. Rendered for this instance from the templates in the setup skill's `assets/docs/`; they carry no state{{#IS_LIBRARY}} — edit them in `library/skills/setup-coolify-devops/assets/docs/` and re-render{{/IS_LIBRARY}}{{^IS_LIBRARY}} — after `npx skills update`, re-render{{/IS_LIBRARY}} | The platform's behaviour changes, or a lesson is learned |
| `docs/` — state | `infrastructure.md` (platform table, inventory, credentials in play, volumes, known gaps) and `tailnet-state.md` (the policy today, scopes as minted, per-tool access decisions). Hand-maintained; `/host`, `/health`, `/grant-access` and `/setup-coolify-devops` write here | The instance's state changes |
| `stacks/<name>/` | Everything about one resource: its README (wiring, decisions, quirks), reference compose, file-mount contents | That resource changes |
{{#IS_LIBRARY}}| `library/` | The distributable: the five skills under `skills/`, with the templates and renderer inside `skills/setup-coolify-devops/`. Installed by consumers with `npx skills add`. **The only thing that is ever pushed anywhere** | The library changes |
{{/IS_LIBRARY}}
Rules that follow from the table:

- **A skill or runbook that states a domain, project name, or policy default is wrong**
  — it names the key in `instance.yaml` (or a placeholder the renderer fills). Worked
  examples describe a *shape* ("an app that bakes its gateway URL into client JS"),
  never a specific resource of some other instance; the resource-specific knowledge
  of *this* instance lives in `stacks/<name>/README.md`.
- **Runbooks carry no state; state docs carry no procedure.** A lesson about how the
  platform behaves goes in a runbook{{#IS_LIBRARY}} (in `library/skills/setup-coolify-devops/assets/docs/`,
  then `npm run render`){{/IS_LIBRARY}}; a fact about this instance goes in a state doc or a
  stack README. `instance.yaml` is authoritative where prose disagrees.
- **Skills read shared facts from `docs/` in the deployment repo, never from inside
  another skill's folder.** The templates those docs are rendered from travel inside
  the setup skill (`assets/docs/`) because the skills CLI installs nothing outside a
  skill directory; every other skill depends on the *deployment repo* `/setup-coolify-devops`
  produced, not on the setup skill's files. A skill that needs a fact not in `docs/`
  gets it added to a runbook template, not to its own folder.
- **When a skill and a doc disagree, the doc wins — then fix the skill** (also in
  `CLAUDE.md`). Skills are updated in the same commit as the lesson that earned the
  update.
- **No secrets anywhere in this repo**, including `instance.yaml`. The MCP token comes
  from the shell.
{{#IS_LIBRARY}}- **The split is physical.** Anything under `library/` must hold on a stranger's
  instance: no domains, IPs, uuids, volume names, inventory, recorded scopes, policy
  state, or named resources of this instance. State lives in `docs/` and `stacks/`
  here and is never copied into `library/`. This repo learned it by pushing its whole
  deployment state to a public GitHub repo (2026-09-08) — hence the next rule.
- **This repo has no push remote.** Its only remote is `library`, and the only thing
  pushed to it is the `library/` subtree, by `npm run publish-library` (a leak guard,
  then `git subtree split` + push). `git push` with no arguments fails on purpose.
- **Rendered files are outputs.** `CLAUDE.md` and the runbooks in `docs/` are rendered
  from `library/skills/setup-coolify-devops/assets/` by `npm run render` in `library/`; an edit to a
  rendered file is lost at the next render and never reaches a consumer's repo.
{{/IS_LIBRARY}}
## Trialing a skill

A skill is tested by an agent that did not write it:

1. **Spawn a fresh-context agent** with nothing but the repo and a realistic request —
   no hints about the target's quirks, so every stumble is a skill gap, not bad luck.
   The author running their own skill proves nothing; they patch holes from memory
   without noticing.
2. **The friction log is the primary deliverable**: every ambiguity, wrong or missing
   fact, contradiction between docs, surprising tool behaviour, and forced
   improvisation. "It went fine" with no detail is a failed report even when the task
   succeeded.
3. **Fold the log into the skills and docs in the same sitting, one commit** — the
   living-runbook rule applied while the lessons are fresh.
4. Trials are **real operations, not simulations** — get the user's go-ahead before
   one that mutates live state.

Trial status: `/host` has had a real trial (2026-08-25). **`/change-service`,
`/health`, `/grant-access`, and `/setup-coolify-devops` have not** — their first real use doubles as
their trial; friction log mandatory.

## Pivoting to another instance

The test of this structure: pointing the repo at a fresh Coolify instance should touch
facts, not procedures.

1. Point the Coolify MCP at the new instance — `.mcp.json` env or harness config,
   outside this repo; tokens never enter it.
2. Rewrite every `[pivot]`-marked key in `instance.yaml` and re-render.
3. **Validate before trusting**: via MCP, confirm the three named projects exist, the
   canary answers per `docs/internal-services.md`, and the observed version matches —
   then run `/health` as the acceptance test.
4. Reset the state docs — `docs/infrastructure.md` and `docs/tailnet-state.md` — to
   the new instance (the setup skill's skeletons in `assets/docs/` are the shape).
5. Prune `stacks/` to the resources that exist there.
6. Final drift check: grep the repo for the *old* domain suffixes — zero hits outside
   git history means the split held.
7. **Skills move unchanged.** If a pivot forces a skill edit, the skill was holding a
   fact it should not have — move the fact, don't fork the skill.
