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
npm run check-live     # check the deployed site: self-canonicals, sitemap hosts, 308s from REDIRECT_HOSTS
npm run indexnow -- --changed-since <sha> --dry-run   # list the URLs IndexNow would get (omit --dry-run to send)
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

**Generated installers.** `src/pages/configs/[author]/[slug]/install.sh.ts` emits a static `install.sh` for every entry that has install steps. It calls `buildInstallScript` in `src/lib/install.ts`, which classifies each command into an `InstallAction` (package, clone, copy, append, upstream, system, exec, note) and wraps the result in `src/lib/installer-runtime.sh` (imported with `?raw`). The runtime is identical in every script; only the `OXT_*` header values and the `oxt_steps` function change per config. The generated file starts with a plain-language summary of the steps (comments), then the `OXT_*` values and `oxt_steps`, then the runtime. `OXT_PINNED` (from `usesPinnedSource`) is 0 for package-only setups, so the banner does not claim the pinned commit. It promises dry-run with no side effects, backups before changes, conflict prompts and `--rollback`. Packages already installed are skipped, the rollback names the packages an install added with the command to remove them, packages that cannot be installed (no supported package manager, no sudo/doas, AUR off Arch) stop the run before any change unless `--force`, and a failed package install makes the script exit 1 after the other steps. Session reloads (`hyprctl reload`, `swaymsg reload`, `qdbus … reconfigure`…, `SESSION_RELOAD_RES`) run as best effort, since installs often run from a TTY, and a system file to copy that a distro's package does not provide (`/etc/…`) is reported as a failure without stopping the run; a missing file from the pinned download still stops it. Command classification lives in `src/lib/commands.ts` (no `?raw` import, so tsx scripts can load it); `install.ts` re-exports it.

**Install-step standard.** `docs/INSTALL-STANDARD.md` is the contributor-facing standard and `src/lib/install-lint.ts` enforces it: errors (remote code piped into a shell even when pinned, unpinned clones of any repo or downloads, deletion, `>` overwrites, root shells, sudo into home, hard-coded home paths, interactive programs, bootloader/initramfs commands, system upgrades, disabling security checks, system pip/npm, enabling a display manager) fail `npm run validate` and the issue bot; warnings (AUR on non-Arch distros, `-git` packages, system changes, upstream installers, services, unpinned cargo/go) print for `--only` files. `#` notes and placeholder commands are never checked. `tests/install-lint.test.ts` has a catching and a passing case for every error rule and asserts the registry has no errors. When adding a rule, add it to the doc's tables and to the test's `CASES`. Use `[[ … ]]` for tests in the runtime (SonarCloud flags `[`). Keep the runtime free of `$(` and with balanced single quotes on every line: `tests/install.test.ts` relies on both for its injection check. `tests/installer-runtime.test.ts` checks those promises by running real generated scripts in a throwaway HOME with a stubbed `sudo`. Keep that test passing and the runtime ShellCheck-clean at `style` level.

**Build-time data.** `src/lib/readme.ts` fetches each upstream README at build time, renders it with marked, sanitizes it with sanitize-html and rewrites relative links. Responses are cached in `node_modules/.cache/0xtsoa-readme`. `src/lib/fetch-limited.ts` provides size- and time-limited fetches with host allowlists. `scripts/fetch-votes.ts` (the `prebuild` step) writes `src/generated/votes.json` (gitignored). `src/generated/repo-stats.json` (stars, `archived`, `pushedAt` per entry) is committed and updated by the sync bot. Catalogue sorting and filtering live in `src/lib/filters.ts`. The home page spotlight shows the five entries most recently pushed upstream (`recentlyUpdated` in `src/lib/stats.ts`), with screenshots resized to WebP at build time.

**Config pages.** `src/pages/configs/[author]/[slug].astro` shows one H1, then "At a glance" (`AtAGlance.astro`): difficulty from `installDifficulty` (manual / easy / moderate / advanced, derived from the same command classification as the installer), maintenance from `maintenanceForConfig` in `src/lib/stats.ts` (falls back to the `archived` tag until the sync has data), undo, pinned version. Search titles and meta descriptions come from `src/lib/seo.ts` (titles stay within 51 characters because `Base.astro` appends " — 0xTsoa"; a test checks every entry). The upstream README is shown as an excerpt (`readmeExcerpt`) with a link to the forge, so the page is not a copy of GitHub. Related entries and archived-project alternatives come from `src/lib/related.ts`.

**Docs.** Two kinds of page share `/docs/<slug>/` (build links with `topicPath`), and a guide slug may never be a topic slug (the build and `tests/guides.test.ts` both check).
- *Topic pages* (`src/pages/docs/[topic].astro`): one per entry in `TOPICS` (`src/lib/topics-data.ts`, content only and excluded from SonarCloud duplicate detection in `.sonarcloud.properties`; the logic is in `src/lib/topics.ts`: a window manager, category or theme-style facet, plus a hand-written title, intro, tips and FAQ), built only once it has `MIN_TOPIC_ENTRIES` (5) entries. `{year}` in a title or h1 becomes the build year (`topicText`). `updated` is the date the text was last reviewed; `topicModified` (the later of it and the entries' `updatedAt`) feeds dateModified and the sitemap, so bump it when you edit a topic's text. Optional `picks` ("Picks by need": the first candidate that is in the topic, not retired and not already picked) and `retired` (entries to move away from although not archived; archived ones are detected) render above and below the comparison table. Suggested replacements come from `maintainedAlternatives` in `src/lib/related.ts`, which keeps them on the same display server.
- *Guides* (`src/pages/docs/[guide].astro`): hand-written MDX articles in `guides/<slug>.mdx` (a content collection; frontmatter checked by `guideSchema` in `src/lib/guides.ts`; start from `guides/_template.mdx`, and `_` files are never published; `draft: false` renders only in `astro dev`). They embed live data without imports: `<Compare ids={[…]} />` (`src/components/docs/CompareTable.astro`, the same table topic pages use), `<WhatItChanges id="…" />` and `<RegistryStat kind="…" />` (`src/lib/registry-facts.ts`). Root-relative links and embedded ids must exist, which `tests/guides.test.ts` checks. Code blocks use Prism, because Shiki's inline styles would break the CSP.
- `src/pages/docs/index.astro` lists guides under "Start here", then topics by `TOPIC_GROUPS`. `TopicLinks.astro` links topics from the home page, catalogue sidebar and footer; config pages use `primaryTopic` for their breadcrumb (dotfiles under their WM, other parts under their category). `/llms.txt` is generated by `src/pages/llms.txt.ts` from `src/lib/llms-template.txt`, with its Docs section built from the published guides and topics.

**Votes.** Each config has one GitHub issue titled `[0xTsoa] <author>/<slug>` with the `vote` label (`scripts/ensure-vote-issues.ts`, run by `deploy.yml`). New vote issues are closed right after creation (never locked) so open issues stay for real reports. Votes are 👍 reactions on that issue, counted by `src/lib/votes.ts`.

**Automation** (`.github/workflows/`):
- `issue-to-pr.yml` turns a `new-config` issue form into a PR on `config/issue-<n>` through `scripts/issue-to-config.ts`. The entry is credited to the GitHub owner of `source.repo`, never to the issue opener, and gets `author.verified` when the opener owns the repository (or is a public member of the owning org); a non-owner cannot replace an existing entry. The ownership rule lives in `scripts/ownership.ts` and is shared by the claim bot and `entry-change.yml` (labels edit/removal requests `owner-verified` or `needs-review`). `tests/issue-forms.test.ts` checks that every form field is read by the bot and the reverse. The form's Desktop Part, Window Manager and Theme Style options must equal `CATEGORY_LABELS`, `WM_LABELS` and `STYLE_LABELS` (`tests/submit-links.test.ts`): GitHub cannot prefill dropdowns from a URL, so the "Submit your setup" box (`SubmitCta.astro`, on config, topic and catalogue pages) names the options to pick instead.
- `claim-to-pr.yml` turns a `claim` issue form into a PR on `claim/issue-<n>` that sets `author.verified` (`by`, `at`, `issue`) through `scripts/claim-entry.ts`. The opener must own the GitHub repo in `source.repo` or be a public member of the org that owns it; anything else gets a `needs-review` label. `issue-to-config.ts` keeps `author.verified` on updates while `source.repo` is unchanged. Config pages show it in "At a glance" and in the "For the author" box (`AuthorBox.astro`), which also links to the claim and `entry-change` forms.
- `sync-upstream.yml` runs every night. It bumps `source.ref` to the upstream HEAD SHA and leaves `updatedAt` untouched. Entries installed only from released distro packages (`installsReleasePackages` in `src/lib/schema.ts`: package installs, no clone of `source.repo`, no `-git` packages) go to the commit of their latest release tag instead, since that is what users install; without a release tag they keep following the branch. Before moving a ref it lists the new commit's files (`scripts/repo-tree.ts`, a blobless depth-1 fetch) and holds the ref back if a repository path the install steps use (`repoPathsInSteps` in `src/lib/schema.ts`) is gone; `validate -- --network` runs the same check on changed configs. Paths outside the clone, such as files installed by a distro package, are not covered. It sets `version` only when a version tag points at that commit, and opens a PR on `bot/upstream-sync`.
- `deploy.yml` runs on push to main and every night. It ensures the vote issues exist and triggers the Vercel deploy hook.
- `check-live.yml` runs after every successful Vercel production deploy (`deployment_status`, so it must live on main) and nightly. It runs `check-live`, then submits pages changed since the previous production deploy to IndexNow (`selectIndexNowUrls`: a config sends its page plus home and catalogue, a guide sends its page plus `/docs/`, any other change under `src/` sends every page).
- `release.yml` publishes a registry snapshot when a `registry-*` tag is pushed.

**Site config.** `site.config.ts` holds repo owner/name, `SITE_URL`, `BASE_PATH` and the image hosts, all overridable via env. Build internal links with `withBase()` and don't hardcode paths. The site sets a strict CSP in `astro.config.mjs`, so new inline scripts or external origins must be allowed there. UI strings live in `src/i18n/en.json`.

## Conventions

- **Branches:** PRs target `dev`. `main` only accepts PRs from `dev`, and the `main-gate.yml` required check enforces this. `production` (the live site) is fast-forwarded from `main` on release.
- **Commits:** Conventional Commits. Use `feat(config): add <author>/<slug> configuration` and `fix(config): …` for registry entries, and `feat:` / `fix:` / `docs:` / `chore:` / `test:` for platform code.
- **New config files:** the file lives at `configs/<github-user>/<slug>.json`, and `author.github` must match the folder. Slugs match `^[a-z0-9][a-z0-9-]{2,47}$`. Set `"$schema": "../../schema/config.schema.json"`. `tags` list components and features only, never WM, distro or theme duplicates. Use `wm: "any"` when the entry isn't tied to a WM. Start from `schema/minimal.config.json` or `schema/example.config.json`. The full field reference is in `CONTRIBUTING.md`.
