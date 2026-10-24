# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

0xTsoa is an open registry of Linux desktop configurations (dotfiles, themes, bars, launchers…). It is a static Astro 7 site (Tailwind 4, Zod 4, Pagefind search) with no database: each registry entry is a JSON file at `configs/<author>/<slug>.json`, and GitHub Issues plus Actions do the rest (submissions, votes, upstream sync). Deployed on Vercel at https://www.0xtsoa.dev (root path); `0xtsoa.dev` and `0xtsoa.vercel.app` redirect there through Vercel's domain settings. `SITE_URL` must stay the host that answers 200 (www), or canonicals and the sitemap point at redirects. Node >= 20 (CI uses 22).

## Commands

```bash
npm run dev            # Astro dev server, http://localhost:4321/
npm run validate       # validate every configs/**/*.json (schema, folder/author match, slug, image hosts, ID collisions)
npm run validate -- --scripts                     # also verify install.script SHA-256 hashes (network)
npm run validate -- --network --only configs/a/b.json  # full remote checks (screenshots, README, scripts) for given files
npm run schema         # regenerate schema/config.schema.json after editing src/lib/schema.ts
npm run typecheck      # astro check
npm test               # vitest run
npx vitest run tests/install.test.ts        # one test file
npx vitest run -t "rollback"                # tests matching a name
npm run check          # typecheck + tests
npm run build          # prebuild (fetch votes) → astro build → pagefind --site dist
npm run build:site     # astro build only (no vote fetch, no search index)
npm run preview        # serve dist/ (also the "preview" entry in .claude/launch.json)
```

CI (`.github/workflows/validate.yml`) runs typecheck, `validate -- --scripts`, network validation of changed configs, tests, a full build, and ShellCheck:

```bash
shellcheck -s bash -S style src/lib/installer-runtime.sh
shellcheck -S warning -e SC2088 dist/configs/*/*/install.sh
```

`GITHUB_TOKEN` (optional, see `.env.example`) raises GitHub API rate limits for vote fetching and README fetching during builds. `package.json` lists an `ingest` script, but `scripts/ingest-configs.ts` does not exist.

## Architecture

**`src/lib/schema.ts` is the single source of truth** for the config format. The Astro content collection (`src/content.config.ts`, a glob loader over `configs/*/*.json` with id `<author>/<slug>`), the CI validator (`scripts/validate-configs.ts`), the issue→PR bot (`scripts/issue-to-config.ts`) and the generated JSON Schema all use it. Keep it free of dependencies beyond zod, `site.config.ts` and `./strings` so it runs both in Node scripts and in Astro. Zod drops `.refine()` on JSON Schema export, so refinements are mirrored as regex `pattern`s through `.meta()`. If you change a refinement, update its mirror and run `npm run schema`. The Zod checks are the ones CI enforces.

Key schema invariants (also covered by `tests/schema.test.ts`):
- `source.ref` must be pinned: a 40-char SHA or a version-like tag. Moving branch names (`main`, `master`, `dev`, `HEAD`…) are rejected.
- `install.script` URLs must be raw-file URLs pinned to a SHA or tag on GitHub, GitLab or Codeberg, with a `sha256`.
- Screenshots must be local paths or come from `ALLOWED_IMAGE_HOSTS` in `site.config.ts`. The same list feeds Astro's image `domains`.
- A `git clone` of `source.repo` in install steps must be followed by `checkout {{ref}}` (`validateCloneSteps`). `{{ref}}` is replaced by `source.ref` when commands are rendered.
- Install step ids are `deps` / `dotfiles` / `reload`. Only `category: "resource"` (reading lists) may leave out `install`.

**Generated installers.** `src/pages/configs/[author]/[slug]/install.sh.ts` emits a static `install.sh` for every entry that has install steps. It calls `buildInstallScript` in `src/lib/install.ts`, which classifies each command into an `InstallAction` (package, clone, copy, append, upstream, system, exec, note) and wraps the result in `src/lib/installer-runtime.sh` (imported with `?raw`). The runtime is identical in every script; only the `OXT_*` header values and the `oxt_steps` function change per config. It promises dry-run with no side effects, backups before changes, conflict prompts and `--rollback`. `tests/installer-runtime.test.ts` checks those promises by running real generated scripts in a throwaway HOME with a stubbed `sudo`. Keep that test passing and the runtime ShellCheck-clean at `style` level.

**Build-time data.** `src/lib/readme.ts` fetches each upstream README at build time, renders it with marked, sanitizes it with sanitize-html and rewrites relative links. Responses are cached in `node_modules/.cache/0xtsoa-readme`. `src/lib/fetch-limited.ts` provides size- and time-limited fetches with host allowlists. `scripts/fetch-votes.ts` (the `prebuild` step) writes `src/generated/votes.json` (gitignored). `src/generated/repo-stats.json` (star counts) is committed and updated by the sync bot. Catalogue sorting and filtering live in `src/lib/filters.ts`. `featured.json` pins entries for the home page.

**Votes.** Each config has one GitHub issue titled `[0xTsoa] <author>/<slug>` with the `vote` label (`scripts/ensure-vote-issues.ts`, run by `deploy.yml`). Votes are 👍 reactions on that issue, counted by `src/lib/votes.ts`.

**Automation** (`.github/workflows/`):
- `issue-to-pr.yml` turns a `new-config` issue form into a PR on `config/issue-<n>` through `scripts/issue-to-config.ts`.
- `sync-upstream.yml` runs every night. It bumps `source.ref` to the upstream HEAD SHA and leaves `updatedAt` untouched. It sets `version` only when a version tag points at that commit, and opens a PR on `bot/upstream-sync`.
- `deploy.yml` runs on push to main and every night. It ensures the vote issues exist and triggers the Vercel deploy hook.
- `release.yml` publishes a registry snapshot when a `registry-*` tag is pushed.

**Site config.** `site.config.ts` holds repo owner/name, `SITE_URL`, `BASE_PATH` and the image hosts, all overridable via env. Build internal links with `withBase()` and don't hardcode paths. The site sets a strict CSP in `astro.config.mjs`, so new inline scripts or external origins must be allowed there. UI strings live in `src/i18n/en.json`.

## Conventions

- **Branches:** PRs target `dev`. `main` only accepts PRs from `dev`, and the `main-gate.yml` required check enforces this. `production` (the live site) is fast-forwarded from `main` on release.
- **Commits:** Conventional Commits. Use `feat(config): add <author>/<slug> configuration` and `fix(config): …` for registry entries, and `feat:` / `fix:` / `docs:` / `chore:` / `test:` for platform code.
- **New config files:** the file lives at `configs/<github-user>/<slug>.json`, and `author.github` must match the folder. Slugs match `^[a-z0-9][a-z0-9-]{2,47}$`. Set `"$schema": "../../schema/config.schema.json"`. `tags` list components and features only, never WM, distro or theme duplicates. Use `wm: "any"` when the entry isn't tied to a WM. Start from `schema/minimal.config.json` or `schema/example.config.json`. The full field reference is in `CONTRIBUTING.md`.
