## What does this change?

<!-- One or two sentences. For a project: what it is and why it belongs in the registry. -->

**Type** (keep the one that applies):
- [ ] New project (`configs/<github-user>/<slug>.json`)
- [ ] Update to an existing project (new `source.ref`, screenshots, fixes)
- [ ] Site, scripts or CI

> Easiest way to add a project: open a **Submit a Linux Desktop Project** issue and let the bot write this PR. Writing the JSON yourself? Start from `schema/minimal.config.json`; your editor shows help for every field.

---

### For projects

**File & identity**
- [ ] The file is `configs/<github-user>/<slug>.json` and `author.github` matches the folder name.
- [ ] `summary` says what it looks like or does in one sentence; `license` is an SPDX id.

**Filters**
- [ ] `category` is the desktop part, `wm` is `any` if not tied to one WM, `distros` lists only what was tested (`["any"]` for distro-independent work).
- [ ] `tags` name components and features only (no WM, distro, display server or theme style).

**Source & install**
- [ ] `source.ref` is a tag or full commit SHA, never a branch; `updatedAt` is that version's date.
- [ ] Commands are written as you would type them, and work on a clean system for one listed distro.
- [ ] Clones use `--filter=blob:none` + `git -C <dir> checkout {{ref}}`; copies name folders (`cp -r dots/hypr ~/.config/`) rather than `dots/* ~/.config/`.
- [ ] Nothing pipes a download into a shell unless the URL is pinned to a tag, commit or `{{ref}}`.

**Screenshots**
- [ ] 1–8 direct links on an allowed host, each with a meaningful `alt`.

**Checked locally** (optional but faster review)
```bash
npm run validate
npm run build:site && bash dist/configs/<github-user>/<slug>/install.sh --dry-run
```
<!-- Paste the dry-run plan below if the project changes files or runs an upstream installer. -->

---

### For site, scripts or CI
- [ ] `npm run typecheck`, `npm test` and `npm run validate` pass.
- [ ] If `src/lib/schema.ts` changed: `npm run schema` was run and existing configs still validate.
- [ ] If the installer changed (`src/lib/install.ts`, `src/lib/installer-runtime.sh`): tests in `tests/installer-runtime.test.ts` cover the new behaviour.
- [ ] Pull requests into `main` come from `dev`.
