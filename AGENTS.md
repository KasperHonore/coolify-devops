# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Copilot, and the rest)
working in this repository. Read it before changing anything here.

## What this repository is

The public library of coolify-devops: five [Agent Skills](https://agentskills.io) that
operate a Coolify server through the Coolify MCP. It is installed with
`npx skills add KasperHonore/coolify-devops` or as a Claude Code plugin, and it is the
hosting companion to [AI Build Kit](https://github.com/gwpicard/ai-build-kit).

It is also the `library/` subtree of the author's private deployment repo, published
by a script that first runs every check in this file. Nothing here may name a real
instance: no domains, IPs, project names, resource names, volumes, or policy of any
server. The publish script refuses instance-looking strings. Skills read those values
from `instance.yaml` in the deployment repo they operate, by key.

## Layout

```
skills/
  <name>/                 one skill; the directory name is the skill name
    SKILL.md              required: frontmatter + instructions, under 500 lines
    scripts/              optional: executables the skill runs (setup-coolify-devops)
    assets/               optional: templates the skill renders (setup-coolify-devops)
    references/           optional: material loaded on demand, one level deep
.claude-plugin/           plugin.json and marketplace.json for the Claude Code route
scripts/                  repository tooling, not skill tooling
bin/publish-library.sh    the only path to the public repo; runs the checks first
skills.sh.json            how the skills are grouped on skills.sh
```

`skills/setup-coolify-devops/assets/` holds the templates that become a consumer's
`AGENTS.md`, `instance.yaml`, `.mcp.json`, and `docs/` runbooks, rendered by
`skills/setup-coolify-devops/scripts/scaffold.js`. They live inside that skill because
every install route delivers only skill directories. The other four skills read the
rendered `docs/` in the deployment repo and never reach into another skill's folder.

## Editing a skill

- **Frontmatter** carries `name` (must equal the directory name), `description`,
  `license: MIT`, `compatibility` (what the skill needs from its environment), and
  `metadata.author` / `metadata.version`. The version equals `package.json`'s;
  `npm run validate:versions` fails on drift.
- **Description** is what triggers the skill: say what it does, when to use it, and the
  phrases a user would type. Under 1024 characters, imperative, no implementation talk.
- **Body**: procedures, defaults with escape hatches, and gotchas. Add what the agent
  would get wrong without it; cut what it already knows. Under 500 lines; move
  reference material to `references/` and say *when* to load each file.
- **Skills state no instance values.** They name keys in `instance.yaml` or placeholders
  the renderer fills. A worked example describes a shape, never a named resource.
- **Runbook templates are the source.** A lesson about how the platform behaves goes in
  `skills/setup-coolify-devops/assets/docs/`, then the deployment repo re-renders.
  Skills follow the docs; when they disagree, the doc wins and the skill is fixed.
- **Skills are living runbooks.** When a session learns something the hard way, fold it
  into the skill that should have prevented it, in the same change as the fix.

## Checks

```bash
npm test                 # scaffold two sample repos, fail on any unrendered template tag
npm run validate         # skills-ref validate each skill, versions in sync, discovery index builds
npm run validate:plugin  # claude plugin validate (needs the claude CLI; local only)
npm run check            # test + validate; what CI and the publish script run
```

`validate:plugin` is strict for the marketplace manifest and the skills, and lenient
for `plugin.json` only because that walk warns about the root `CLAUDE.md`: a plugin
does not load it as context, which is true and irrelevant here, where it is the
contributor guide import for people cloning the repo.

## Releasing

Bump `version` in `package.json` and run `npm run validate:versions`; it tells you
which files to update. Publishing is `npm run publish-library` from the deployment
repo. On the public repo, every push to `main` that touches `skills/` publishes an
immutable GitHub release carrying an Agent Skills discovery index and one artifact per
skill, built by `scripts/build-discovery-index.mjs`.
