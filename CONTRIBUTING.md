# Contributing to 0xTsoa

Thank you for contributing to **0xTsoa** (`https://0xtsoa.vercel.app`).

0xTsoa is an open-source, zero-database community registry for reproducible Linux desktop environments, dotfiles, and window manager setups (Wayland and X11). Every entry in the catalogue is backed by a validated JSON specification inside `configs/<author>/<slug>.json`. This guide covers every way you can contribute, the complete JSON schema specification, security validation rules, the community voting engine, local development, and pull request conventions.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/git-pull-request-dark.svg"><img src=".github/assets/icons/git-pull-request.svg" width="20" height="20" align="top" alt="Ways to Contribute icon"></picture> Ways to Contribute

You can contribute to 0xTsoa in several ways:

1. **Submit a Desktop Setup or Component (No Git Required)**: Fill out the [Submit a Linux Desktop Project](https://github.com/nyharena25/0xTsoa/issues/new?template=new-config.yml) issue form (`new-config` label). Our GitHub Actions bot converts your form into a validated JSON file and opens a pull request automatically.
2. **Submit a Setup via Direct Pull Request**: Fork the repository, add or update `configs/<author>/<slug>.json`, validate locally with `npm run validate`, and open a pull request.
3. **Vote and Sign Off on Setups**: Visit any setup's `[0xTsoa] <author>/<slug>` vote issue and add a `+1` reaction to endorse setups that work cleanly.
4. **Improve the Platform Code**: Fix bugs, improve accessibility, refine the Astro components in `src/`, or expand the Vitest test suite in `tests/`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/cpu-dark.svg"><img src=".github/assets/icons/cpu.svg" width="20" height="20" align="top" alt="Issue Form Workflow icon"></picture> Submitting a Setup via the Issue Form (`new-config.yml`)

The fastest way to add a project is through `.github/ISSUE_TEMPLATE/new-config.yml` ([open form](https://github.com/nyharena25/0xTsoa/issues/new?template=new-config.yml)).

### What You Provide in the Form
- **Identity**: Project Name (`3` to `80` chars), URL Slug (`3` to `48` lowercase characters, digits, and hyphens), Short Summary (`10` to `200` chars), optional Description (up to `2000` chars), and SPDX License (defaults to `MIT` if left empty).
- **Environment**: Desktop Part (`category`), Window Manager (`wm`), Theme Style (`themeStyle`), Display Server (`wayland`, `x11`, or `both`), tested Distributions (`distros`, up to 8), and optional Tags (up to 10).
- **Screenshots**: 1 to 8 direct `https://` image URLs (one per line) hosted on an allowed domain.
- **Source and Installation**: Source repository URL (`github.com`, `gitlab.com`, or `codeberg.org`), a Git ref (40-character commit SHA or version tag), required `Install: Dependencies` shell commands, optional `Install: Deploy` and `Install: Reload` commands, and an optional pinned `.sh` script URL and SHA-256 hash.
- **Components (Optional)**: Status Bar, Terminal, Launcher, Shell, and Theme names.

### How `issue-to-pr.yml` Turns Your Issue into a Pull Request
When you open an issue with the `new-config` label (or when a maintainer adds the `regenerate` label after you edit the issue), `.github/workflows/issue-to-pr.yml` runs automatically:

1. **Safe Input Handling**: The workflow writes `github.event.issue.body` to `temp_issue_body.md` via an environment variable (`ISSUE_BODY`) so untrusted markdown is never interpolated into a shell command.
2. **Conversion (`scripts/issue-to-config.ts`)**: The script runs `npm run issue-to-config -- temp_issue_body.md "$ISSUE_AUTHOR"` and writes `issue-to-config-result.json` (`{ status, mode, path, errors }`):
   - Parses all `### <Heading>` sections from the issue body.
   - Maps dropdown labels back to schema enum keys (`CATEGORY_LABELS`, `WM_LABELS`, `STYLE_LABELS`).
   - Credits the GitHub user who opened the issue as both `author.name` and `author.github`.
   - If you supplied an `Install Script URL` without a 64-character `Script SHA-256`, the script downloads the remote `.sh` file (up to 1 MiB) and calculates its SHA-256 digest automatically.
   - Validates the generated object against `configSchema` (`src/lib/schema.ts`) and writes `configs/<issue-author>/<slug>.json`.
3. **Error Reporting or Pull Request Creation**:
   - If `status` is `error`, the workflow posts the validation error list as a comment on your issue and asks you to edit the issue so a maintainer can re-run it with the `regenerate` label.
   - If `status` is `ok`, the workflow runs `npm run validate`, opens or updates branch `config/issue-<number>` via `peter-evans/create-pull-request` (using `secrets.BOT_TOKEN` so `validate.yml` runs on the bot PR), and comments on the issue with the PR link.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/file-json-dark.svg"><img src=".github/assets/icons/file-json.svg" width="20" height="20" align="top" alt="JSON Specification icon"></picture> Configuration JSON Specification (`schema/config.schema.json`)

Every configuration file lives at `configs/<author.github>/<slug>.json`.
- The folder `<author.github>` must match `author.github` (case-insensitive check in `scripts/validate-configs.ts`).
- The filename `<slug>` must match `SLUG_RE`: `^[a-z0-9][a-z0-9-]{2,47}$` (`3` to `48` characters, starting with a lowercase letter or digit, followed by lowercase letters, digits, or hyphens).
- The schema sets `"additionalProperties": false` (`.strict()` in Zod): unknown keys are rejected.

### Top-Level Fields

| Field | Type | Required | Default | Constraints and Allowed Values |
| :--- | :--- | :--- | :--- | :--- |
| `$schema` | `string` | Optional | None | Relative path to schema: `"../../schema/config.schema.json"` |
| `name` | `string` | **Required** | None | `minLength: 3`, `maxLength: 80` |
| `author` | `object` | **Required** | None | Contains required `name` and `github` properties (see nested table below) |
| `lang` | `string` | Optional | `"en"` | Enum: `"fr"`, `"en"` |
| `summary` | `string` | **Required** | None | One-sentence summary: `minLength: 10`, `maxLength: 200` |
| `description` | `string` | Optional | None | Extended technical overview: `maxLength: 2000` |
| `license` | `string` | **Required** | None | SPDX license expression matching `^[A-Za-z0-9.+-]+( (AND\|OR\|WITH) [A-Za-z0-9.+-]+)*$` (e.g. `"MIT"`, `"GPL-3.0-only"`) |
| `version` | `string` | Optional | None | `maxLength: 40` (set by `sync-upstream.ts` only when a version-like tag's peeled commit equals `source.ref`) |
| `updatedAt` | `string` | **Required** | None | ISO date `YYYY-MM-DD` matching `^\d{4}-\d{2}-\d{2}$` |
| `distros` | `string[]` | **Required** | None | `1` to `8` items from: `"arch"`, `"endeavouros"`, `"manjaro"`, `"fedora"`, `"nixos"`, `"debian"`, `"ubuntu"`, `"mint"`, `"void"`, `"opensuse"`, `"gentoo"`, `"alpine"`, `"any"` |
| `category` | `string` | Optional | `"dotfiles"` | Desktop part enum: `"dotfiles"`, `"wm"`, `"bar"`, `"widgets"`, `"launcher"`, `"notifications"`, `"dock"`, `"icons"`, `"cursors"`, `"gtk-theme"`, `"colorscheme"`, `"login"`, `"lockscreen"`, `"boot"`, `"extension"`, `"tool"`, `"resource"` |
| `wm` | `string` | **Required** | None | Window manager / DE enum: `"hyprland"`, `"sway"`, `"river"`, `"niri"`, `"wayfire"`, `"labwc"`, `"i3"`, `"bspwm"`, `"awesome"`, `"qtile"`, `"xmonad"`, `"dwm"`, `"herbstluftwm"`, `"openbox"`, `"gnome"`, `"kde"`, `"xfce"`, `"cinnamon"`, `"cosmic"`, `"any"`, `"other"` |
| `themeStyle` | `string` | Optional | `"minimalist"` | Palette / aesthetic enum: `"minimalist"`, `"cyberpunk"`, `"nord"`, `"gruvbox"`, `"dracula"`, `"tokyo-night"`, `"catppuccin"`, `"solarized"`, `"monochrome"`, `"rose-pine"`, `"material"`, `"macos"`, `"dynamic"`, `"other"` |
| `displayServer` | `string` | **Required** | None | Enum: `"wayland"`, `"x11"`, `"both"` |
| `tags` | `string[]` | Optional | `[]` | Up to `10` items matching `^[a-z0-9][a-z0-9-]{0,29}$`. Tag components and features (`waybar`, `rofi`, `quickshell`), not duplicates of `wm`, `distros`, or `themeStyle` |
| `specs` | `object` | Optional | `{}` | Optional component strings (`bar`, `terminal`, `launcher`, `notifications`, `theme`, `shell`, `editor`) |
| `screenshots` | `object[]` | **Required** | None | `1` to `8` screenshot objects (`url`, `alt`, optional `caption`) |
| `source` | `object` | **Required** | None | Upstream repository pointer (`repo`, `ref`, optional `readme`) |
| `install` | `object` | **Required** | None | Installation instructions (`steps`, optional `script`, optional `packages`) |
| `keybindings` | `object[]` | Optional | `[]` | Up to `30` shortcut objects (`keys`, `action`, optional `effect`) |
| `review` | `object` | Optional | None | Maintainer install review metadata (`installReviewed`, optional `reviewedBy`, optional `reviewedAt`) |
| `example` | `boolean` | Optional | `false` | Marks synthetic example entries (`false` for all real community submissions) |

### Nested Object Fields

| Parent.Field | Type | Required | Default | Constraints and Description |
| :--- | :--- | :--- | :--- | :--- |
| `author.name` | `string` | **Required** | None | Display name (`minLength: 1`, `maxLength: 60`) |
| `author.github` | `string` | **Required** | None | GitHub handle matching `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`; must match folder name |
| `specs.bar` | `string` | Optional | None | Status bar name (`maxLength: 60`) |
| `specs.terminal` | `string` | Optional | None | Terminal emulator (`maxLength: 60`) |
| `specs.launcher` | `string` | Optional | None | Application launcher (`maxLength: 60`) |
| `specs.notifications` | `string` | Optional | None | Notification daemon (`maxLength: 60`) |
| `specs.theme` | `string` | Optional | None | Theme or color palette name (`maxLength: 80`) |
| `specs.shell` | `string` | Optional | None | Command shell (`maxLength: 60`) |
| `specs.editor` | `string` | Optional | None | Text editor (`maxLength: 60`) |
| `screenshots[].url` | `string` | **Required** | None | Local path under `public/` (`/screenshots/...`) or `https://` URL on an allowed image host |
| `screenshots[].alt` | `string` | **Required** | None | Accessible description (`minLength: 5`, `maxLength: 200`) |
| `screenshots[].caption` | `string` | Optional | None | Short caption label (`maxLength: 60`, e.g. `"01_DESKTOP.RAW"`) |
| `source.repo` | `string` | **Required** | None | `https://` repository URL on `github.com`, `gitlab.com`, or `codeberg.org` |
| `source.ref` | `string` | **Required** | None | 40-char lowercase hex commit SHA (`^[0-9a-f]{40}$`, immutable — earns **Source pinned**) or version tag (`v1.0.0`, `release-1`, mutable). Moving branches (`main`, `master`, `dev`, `develop`, `HEAD`, `latest`, `trunk`) are forbidden |
| `source.readme` | `string` | Optional | `"README.md"` | Path to markdown README matching `^[\w./-]+\.(md\|markdown)$` |
| `install.steps` | `object[]` | **Required** | None | `1` to `3` step objects; each `id` may appear only once. If any command runs `git clone` of `source.repo`, it must not use `--depth` and a later command must contain `checkout {{ref}}` |
| `install.steps[].id` | `string` | **Required** | None | Enum: `"deps"` (install packages or clone), `"dotfiles"` (deploy config or theme), `"reload"` (apply or restart) |
| `install.steps[].title` | `string` | **Required** | None | Step heading (`minLength: 3`, `maxLength: 80`) |
| `install.steps[].commands` | `string[]` | **Required** | None | `1` to `30` shell commands (`1` to `500` chars each; `#` lines render as comments; `{{ref}}` is replaced with `source.ref`, e.g. `git -C <dir> checkout {{ref}}`) |
| `install.script.url` | `string` | **Required** (if `script` set) | None | Raw `https://` URL pinned to a 40-char commit SHA or version tag on GitHub, GitLab, or Codeberg |
| `install.script.sha256` | `string` | **Required** (if `script` set) | None | 64-character lowercase hex SHA-256 digest (`^[0-9a-f]{64}$`) |
| `install.script.shell` | `string` | Optional | `"bash"` | Enum: `"sh"`, `"bash"` |
| `install.packages` | `object[]` | Optional | `[]` | Up to `6` package links with `type` (`"tar.gz"`, `"zip"`, `"deb"`, `"rpm"`, `"aur"`, `"nix"`, `"flatpak"`) and `https://` `url` |
| `keybindings[].keys` | `string` | **Required** (per item) | None | Key combination (`maxLength: 40`, e.g. `"SUPER + Return"`) |
| `keybindings[].action` | `string` | **Required** (per item) | None | Dispatched WM command (`maxLength: 80`, e.g. `"exec, kitty"`) |
| `keybindings[].effect` | `string` | Optional | None | Human-readable description (`maxLength: 120`) |
| `review.installReviewed` | `boolean` | Optional | `false` | Whether a maintainer manually reviewed `install.steps` |
| `review.reviewedBy` | `string` | Optional | None | GitHub handle of the reviewer |
| `review.reviewedAt` | `string` | Optional | None | Review date (`YYYY-MM-DD`) |

### Reference JSON Example (`schema/example.config.json`)

```json
{
  "$schema": "../../schema/config.schema.json",
  "name": "My Clean Setup",
  "author": {
    "name": "My Name",
    "github": "my-handle"
  },
  "lang": "en",
  "summary": "Minimal Hyprland desktop with Waybar and Kitty on Arch Linux.",
  "description": "Optional long description: layout philosophy, workflow, ergonomics tips.",
  "license": "MIT",
  "version": "v1.0.0",
  "updatedAt": "2026-10-15",
  "distros": [
    "arch"
  ],
  "category": "dotfiles",
  "wm": "hyprland",
  "themeStyle": "monochrome",
  "displayServer": "wayland",
  "tags": [
    "waybar",
    "kitty"
  ],
  "specs": {
    "bar": "Waybar",
    "terminal": "Kitty",
    "launcher": "Rofi",
    "notifications": "Dunst",
    "theme": "Paper Monochrome",
    "shell": "zsh",
    "editor": "Neovim"
  },
  "screenshots": [
    {
      "url": "https://raw.githubusercontent.com/my-handle/dots/v1.0.0/preview.png",
      "alt": "Screenshot of my desktop",
      "caption": "01_DESKTOP.RAW"
    }
  ],
  "source": {
    "repo": "https://github.com/my-handle/dots",
    "ref": "v1.0.0",
    "readme": "README.md"
  },
  "install": {
    "script": {
      "url": "https://raw.githubusercontent.com/my-handle/dots/v1.0.0/install.sh",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "shell": "bash"
    },
    "steps": [
      {
        "id": "deps",
        "title": "Install dependencies",
        "commands": [
          "sudo pacman -S --needed hyprland waybar kitty rofi-wayland dunst"
        ]
      },
      {
        "id": "dotfiles",
        "title": "Deploy dotfiles",
        "commands": [
          "git clone --filter=blob:none https://github.com/my-handle/dots ~/dots",
          "git -C ~/dots checkout {{ref}}",
          "cp -r ~/dots/.config/* ~/.config/"
        ]
      },
      {
        "id": "reload",
        "title": "Reload Hyprland",
        "commands": [
          "hyprctl reload"
        ]
      }
    ],
    "packages": []
  },
  "keybindings": [
    {
      "keys": "SUPER + Return",
      "action": "exec, kitty",
      "effect": "Open terminal"
    },
    {
      "keys": "SUPER + Q",
      "action": "killactive",
      "effect": "Close window"
    }
  ]
}
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/shield-check-dark.svg"><img src=".github/assets/icons/shield-check.svg" width="20" height="20" align="top" alt="Security Rules icon"></picture> Security and Validation Rules

All configurations are checked by `scripts/validate-configs.ts` and `src/lib/schema.ts`:

### 1. Pinned Upstream References (`source.ref`)
- `source.repo` must be hosted on `github.com`, `gitlab.com`, or `codeberg.org`.
- `source.ref` must pass `isPinnedRef()`: either a 40-character lowercase hex SHA-1 (`^[0-9a-f]{40}$`) or a version tag (`^(v?\d+(\.\d+)*([-+._][0-9A-Za-z.-]+)?|release-[0-9A-Za-z.-]+)$`).
- Moving branch names (`main`, `master`, `dev`, `develop`, `HEAD`, `latest`, `trunk`) are explicitly blocked.
- Because Git tags can be moved by upstream authors, **only a 40-character commit SHA is immutable** and earns the **Source pinned** assurance badge.
- Any `install.steps` command that runs `git clone` of `source.repo` must not use `--depth`, and a subsequent command must contain `checkout {{ref}}` (enforced by `validateCloneSteps()` in `src/lib/schema.ts`).
- `.github/workflows/sync-upstream.yml` runs `npm run sync-upstream` nightly at `02:23 UTC` to check upstream default-branch HEAD commits, leave `updatedAt` untouched, set `version` only when a version-like tag's peeled commit matches the new ref, update `src/generated/repo-stats.json`, and open a pull request on branch `bot/upstream-sync` with a markdown summary and compare links.

### 2. Install Script Pinning and SHA-256 Checksums (`install.script`)
- If `install.script` is provided, `extractRawRef(url)` verifies that `url` is a raw file URL pinned to a commit SHA or version tag on one of the four supported patterns:
  - `https://raw.githubusercontent.com/<owner>/<repo>/<sha-or-tag>/<path>` (or `/refs/tags/<tag>/<path>`)
  - `https://github.com/<owner>/<repo>/raw/<sha-or-tag>/<path>`
  - `https://gitlab.com/<group-or-owner>/<repo>/-/raw/<sha-or-tag>/<path>`
  - `https://codeberg.org/<owner>/<repo>/raw/commit/<sha>/<path>` (or `/raw/tag/<tag>/<path>`)
- `install.script.sha256` must be a 64-character lowercase hex SHA-256 digest (`sha256sum install.sh`).
- In CI (`npx tsx scripts/validate-configs.ts --scripts` and `--network`), `verifyScriptHash()` streams the script (up to `1 MiB` / `1,048,576` bytes with a 10-second timeout) and checks that the actual SHA-256 matches `install.script.sha256`.
- Install scripts must not invoke unverified binary blobs, obfuscated base64 payloads, or silent privilege escalation.

### 3. Allowed Screenshot Hosts (`ALLOWED_IMAGE_HOSTS`)
Every `screenshots[].url` must either be a local file inside `public/` (starting with `/` or `./`) or an `https://` URL whose hostname is in `ALLOWED_IMAGE_HOSTS` (`site.config.ts`):
- `raw.githubusercontent.com`
- `user-images.githubusercontent.com`
- `private-user-images.githubusercontent.com`
- `github.com`
- `i.imgur.com`
- `i.redd.it`
- `codeberg.org`
- `gitlab.com`

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/check-circle-dark.svg"><img src=".github/assets/icons/check-circle.svg" width="20" height="20" align="top" alt="Voting System icon"></picture> Community Voting and Sign-Off System

0xTsoa uses GitHub Issues as a zero-database voting backend (`src/lib/votes.ts`, `scripts/ensure-vote-issues.ts`, and `scripts/fetch-votes.ts`):

1. **One Vote Issue per Configuration**: During the nightly refresh or on push to `main` (`deploy.yml`), `npm run vote-issues` checks every `configs/<author>/<slug>.json` against open and closed issues labeled `vote`. If an entry lacks an issue titled `[0xTsoa] <author>/<slug>`, the script creates it automatically.
2. **+1 Reaction Counting**: Community members click the **Sign-Off** button on any configuration card or detail page, which takes them to that entry's `[0xTsoa] <author>/<slug>` issue. Reacting to the issue body with `+1` (thumbs up) counts as one vote per GitHub user.
3. **Build-Time Snapshot (`src/generated/votes.json`)**: Before every build (`prebuild`), `scripts/fetch-votes.ts` queries the GitHub Issues API (working with or without `GITHUB_TOKEN`), counts `+1` reactions per configuration, and writes `src/generated/votes.json`.
4. **Catalogue Ranking**: By default (`sort=votes`), the catalogue sorts entries by vote count descending, breaking ties by upstream repository star count (`src/generated/repo-stats.json`).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/terminal-dark.svg"><img src=".github/assets/icons/terminal.svg" width="20" height="20" align="top" alt="Local Development icon"></picture> Local Development and Testing

### Environment Setup
Node.js `>= 20` is required. Optional environment variables are documented in `.env.example`:
- `REPO_OWNER` (defaults to `nyharena25`)
- `REPO_NAME` (defaults to `0xTsoa`)
- `SITE_URL` (defaults to `https://0xtsoa.vercel.app`)
- `BASE_PATH` (defaults to `""`)
- `GA_MEASUREMENT_ID` (optional Google Analytics 4 measurement ID; omitted by default)
- `GITHUB_TOKEN` (optional GitHub Personal Access Token for higher API rate limits and creating vote issues)

### Verification Commands
Run these commands before submitting a pull request:

```bash
# Start the local Astro dev server at http://localhost:4321/
npm run dev

# Validate all JSON configs (schema, folder-to-author match, slug format, image hosts, {{ref}} checkout)
npm run validate

# Verify install.script SHA-256 hashes only
npx tsx scripts/validate-configs.ts --scripts

# Verify remote screenshot URLs, README reachability, and install script SHA-256 hashes
npx tsx scripts/validate-configs.ts --network

# If you edited src/lib/schema.ts, regenerate schema/config.schema.json
npm run schema

# Run Astro type-checking (astro check) and the Vitest unit test suite (vitest run)
npm run check

# Run Vitest unit tests only (tests/schema.test.ts, filters.test.ts, readme.test.ts, votes.test.ts, etc.)
npm test

# Run a full production build (fetches votes, builds static HTML to dist/, indexes with Pagefind)
npm run build
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/book-open-dark.svg"><img src=".github/assets/icons/book-open.svg" width="20" height="20" align="top" alt="Conventions and Review icon"></picture> Commit Message, Pull Request Conventions, and Review Process

### Commit Messages
Follow Conventional Commits formatting used across the repository and workflows:
- `feat(config): add <author>/<slug> configuration` (for new registry entries)
- `fix(config): update screenshots or install steps for <author>/<slug>`
- `feat: ...` / `fix: ...` / `docs: ...` / `chore: ...` / `test: ...` (for platform code, scripts, and documentation)

### Pull Request Checklist (`.github/PULL_REQUEST_TEMPLATE.md`)
Every configuration pull request is reviewed against `.github/PULL_REQUEST_TEMPLATE.md`:
- [ ] The file lives at `configs/<github-user>/<slug>.json` and `author.github` matches the folder name.
- [ ] `category` names the desktop part (`dotfiles`, `bar`, `launcher`, `icons`, `gtk-theme`, etc.), and `wm` is `any` if the project is not tied to one window manager.
- [ ] `tags` list components and features only (no WM, distro, display server, or theme-style duplicates).
- [ ] `install.steps` has at least a `deps` step, and any `git clone` of `source.repo` is followed by `checkout {{ref}}`.
- [ ] `source.ref` is a full 40-character commit SHA (recommended, immutable) or a version tag, never a branch name.
- [ ] Screenshots come from an allowed host (`raw.githubusercontent.com`, `github.com`, `user-images.githubusercontent.com`, `private-user-images.githubusercontent.com`, `i.imgur.com`, `i.redd.it`, `codeberg.org`, `gitlab.com`).
- [ ] Any `.sh` install script is pinned to a commit SHA or tag and includes its 64-character `sha256` checksum.
- [ ] `license` is a valid SPDX identifier.
- [ ] `npm run validate` passes.

### Review Process
1. **Automated CI Check**: When a pull request is opened, `.github/workflows/validate.yml` runs `npx tsx scripts/validate-configs.ts --scripts`, `npx tsx scripts/validate-configs.ts --network --only <changed-configs>`, `npm test`, and `npm run build`.
2. **Maintainer Review**: A maintainer reviews the JSON metadata and upstream attribution. If a maintainer manually audits the installation commands, they may set `review: { installReviewed: true, reviewedBy: "<handle>", reviewedAt: "YYYY-MM-DD" }`.
3. **Merge and Deployment**: Once approved and merged into `main`, `.github/workflows/deploy.yml` creates the `[0xTsoa] <author>/<slug>` vote issue and triggers the Vercel production deployment.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/section-divider-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/section-divider.svg">
  <img src=".github/assets/section-divider.svg" alt="Animated section divider" width="100%" height="12" />
</picture>

## <picture><source media="(prefers-color-scheme: dark)" srcset=".github/assets/icons/scale-dark.svg"><img src=".github/assets/icons/scale.svg" width="20" height="20" align="top" alt="Code of Conduct icon"></picture> Code of Conduct

0xTsoa adopts the [Contributor Covenant Code of Conduct v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

### Summary of Standards
- **Be Respectful and Constructive**: Welcome newcomers, offer helpful feedback on rices and pull requests, and respect differing desktop workflows and distribution preferences.
- **Respect Author Attribution and Licenses**: Only submit configurations you authored or properly credit the upstream creator and their SPDX license.
- **Zero Tolerance for Harassment or Malicious Code**: Harassment, personal attacks, doxxing, NSFW content, and deliberately harmful or obfuscated installation commands result in immediate removal and a permanent ban from the registry and community spaces.

### Reporting Violations
If you witness or experience unacceptable behavior, or discover a malicious configuration in the registry, please report it to the maintainers via `TODO(maintainer): insert moderation contact email or private reporting channel` or by opening a moderation ticket in our Discord server (`DISCORD_INVITE_URL`). All reports are reviewed promptly and confidentially.