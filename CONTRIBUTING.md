# Contributing to 0xTsoa

Thank you for your interest in contributing to **0xTsoa**! 

0xTsoa is a community-curated, zero-database registry of Linux desktop projects: full dotfiles, but also every part of a rice (bars, launchers, icons, GTK themes, color schemes, login screens, lock screens, boot themes, DE extensions, tools and lists). We maintain strict standards of reproducibility, security, and aesthetics to ensure that every configuration published on the platform can be audited and deployed safely by users.

---

## 📋 Ways to Contribute

You can submit your setup in one of two ways:

1. **Option A: GitHub Issue Form (Recommended)**  
   Fill out the [New Project Submission Form](https://github.com/nyharena25/0xTsoa/issues/new?template=new-config.yml).  
   Our automated GitHub Actions bot (`issue-to-config`) will parse your form, validate the JSON schema, and open a Pull Request automatically on your behalf.

2. **Option B: Direct Pull Request**  
   Create your configuration file directly in the repository under:  
   `configs/<your-github-username>/<config-slug>.json`.

---

## 🛡️ Security & Quality Guidelines

Every submitted configuration must adhere to the following rules:

### 1. Immutable Upstream Reference
- Your configuration must point to an explicit Git commit hash or tagged release (`ref`) in your public GitHub repository:
  ```json
  "source": {
    "repo": "https://github.com/your-name/your-dotfiles",
    "ref": "a1b2c3d4e5f6...",
    "readme": "README.md"
  }
  ```
- Floating branch references such as `main` or `master` are disallowed in production configs to guarantee reproducibility.
- You don't need to bump it yourself: a nightly job (`npm run sync-upstream`) moves `ref` to your latest commit, refreshes `updatedAt`, sets `version` to your newest version tag (`v1.2.0`, `2.0`…) and records your star count.

### 2. Desktop Part (`category`)
Every entry belongs to exactly one part of the desktop. It is the main catalogue filter:

| `category` | Use it for |
|---|---|
| `dotfiles` | Full rices and personal dotfiles |
| `wm` | Window managers and compositors |
| `bar` | Status bars and panels |
| `widgets` | Widget engines and desktop shells (eww, AGS, Quickshell) |
| `launcher` | Launchers, menus, dmenu replacements |
| `notifications` | Notification daemons and centers |
| `dock` | Docks |
| `icons` / `cursors` | Icon and cursor themes |
| `gtk-theme` | GTK, GNOME Shell and Qt themes |
| `colorscheme` | Palettes and color generators (pywal, matugen…) |
| `login` / `lockscreen` / `boot` | Display managers & greeters, lock screens, GRUB / Plymouth |
| `extension` | GNOME Shell extensions, KWin scripts, Plasma widgets |
| `tool` | Dotfile managers and ricing utilities |
| `resource` | Awesome lists and guides |

Use `"wm": "any"` for projects that are not tied to one window manager.

### 3. Tags
- Up to 10 lowercase tags (`a-z`, digits, `-`).
- Tag the **components and features** people search for: `waybar`, `rofi`, `quickshell`, `material-you`, `auto-install`, `archived`.
- Don't repeat what is already a filter: no WM names, distro names, `wayland` / `x11`, or the theme style.

### 4. Installation & Deployment (required)
Every entry must ship at least one install step. Steps render as **02. Installation & Deployment** on the project page and as the downloadable `install.sh`.

```json
"install": {
  "steps": [
    { "id": "deps",     "title": "Install packages",  "commands": ["sudo pacman -S --needed waybar"] },
    { "id": "dotfiles", "title": "Deploy the config", "commands": ["cp -r waybar ~/.config/"] },
    { "id": "reload",   "title": "Restart the bar",   "commands": ["killall -SIGUSR2 waybar"] }
  ]
}
```

- `deps` (install packages or clone) is required; `dotfiles` (deploy / run the installer / apply the theme) and `reload` (restart, regenerate GRUB, enable the extension) are optional.
- Each `id` appears at most once, with 1–30 commands of up to 500 characters. Lines starting with `#` are shown as comments.
- Commands must work on a clean system for at least one listed distribution. Prefer real package names (official repos first, then AUR) over ad-hoc scripts.

### 5. Installation Integrity & Checksums
- If providing a custom shell install script, an authentic **SHA-256 checksum** is mandatory:
  ```json
  "script": {
    "url": "https://raw.githubusercontent.com/user/dots/commit/install.sh",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "shell": "bash"
  }
  ```
- Install scripts must not invoke unverified binary blobs, obfuscated base64 payloads, or silent privilege escalations.

### 6. Allowed Screenshot Hosts
To protect users against tracking and cross-site scripting:
- Screenshots must be hosted on:
  - `https://raw.githubusercontent.com/...`
  - `https://user-images.githubusercontent.com/...`
  - `https://github.com/user-attachments/assets/...`
  - `https://i.imgur.com/...`
  - `https://i.redd.it/...`
  - `https://codeberg.org/...` and `https://gitlab.com/...` (raw files pinned to a commit)
- Images should feature clean desktop workspaces, bar previews, or terminal fastfetch outputs at standard resolutions (1080p / 1440p).

---

## 🧪 Local Testing & Verification Workflow

Before opening a Pull Request, verify your changes locally:

```bash
# 1. Install project dependencies
npm install

# 2. Run the automated schema validator
npm run validate

# 3. Run the unit test suite
npm test

# 4. Test the full production build
npm run build
```

---

## 📐 JSON Specification Example

Below is a complete specification. Only `name`, `author`, `summary`, `license`, `updatedAt`, `distros`, `wm`, `displayServer`, `screenshots`, `source` and `install` are required; `category` defaults to `dotfiles`.

```json
{
  "$schema": "../../schema/config.schema.json",
  "name": "Nordic Minimal Wayland",
  "author": {
    "name": "Jane Doe",
    "github": "janedoe"
  },
  "lang": "en",
  "summary": "Lightweight, keyboard-driven Hyprland desktop with Waybar and Foot.",
  "description": "A focus-oriented desktop configuration for Arch Linux featuring bespoke Catppuccin color accents, dynamic workspace transitions.",
  "license": "MIT",
  "version": "v1.2.0",
  "updatedAt": "2026-10-15",
  "distros": ["arch", "fedora"],
  "category": "dotfiles",
  "wm": "hyprland",
  "themeStyle": "nord",
  "displayServer": "wayland",
  "tags": ["waybar", "foot", "mako", "auto-install"],
  "specs": {
    "bar": "Waybar",
    "terminal": "Foot",
    "launcher": "Rofi (Wayland)",
    "notifications": "Mako",
    "theme": "Nordic Frost",
    "shell": "fish",
    "editor": "Neovim"
  },
  "screenshots": [
    {
      "url": "https://raw.githubusercontent.com/janedoe/dots/commit/assets/desktop.png",
      "alt": "Full desktop overview with tiling layout",
      "caption": "01_DESKTOP_OVERVIEW.RAW"
    }
  ],
  "source": {
    "repo": "https://github.com/janedoe/dots",
    "ref": "2f2a376fdb2ad738bf55f693dd0b474b64bb0ab8",
    "readme": "README.md"
  },
  "install": {
    "steps": [
      {
        "id": "deps",
        "title": "Install packages",
        "commands": ["sudo pacman -S --needed hyprland waybar foot mako rofi-wayland"]
      },
      {
        "id": "dotfiles",
        "title": "Deploy the dotfiles",
        "commands": ["git clone --branch v1.2.0 https://github.com/janedoe/dots ~/.dotfiles", "cp -r ~/.dotfiles/.config/* ~/.config/"]
      },
      {
        "id": "reload",
        "title": "Reload Hyprland",
        "commands": ["hyprctl reload"]
      }
    ]
  },
  "keybindings": [
    {
      "keys": "SUPER + RETURN",
      "action": "exec, foot",
      "effect": "Open Foot terminal"
    }
  ],
  "example": false
}
```

---

## ⚖️ Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Be respectful, provide constructive feedback during code review, and respect upstream author licenses.