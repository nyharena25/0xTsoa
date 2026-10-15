# Contributing to 0xTsoa

Thank you for your interest in contributing to **0xTsoa**! 

0xTsoa is a community-curated, zero-database Linux desktop architecture registry. We maintain strict standards of reproducibility, security, and aesthetics to ensure that every configuration published on the platform can be audited and deployed safely by users.

---

## 📋 Ways to Contribute

You can submit your setup in one of two ways:

1. **Option A: GitHub Issue Form (Recommended)**  
   Fill out the [New Configuration Submission Form](https://github.com/nyharena25/0xtsoa/issues/new?template=new-config.yml).  
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

### 2. Installation Integrity & Checksums
- If providing a custom shell install script, an authentic **SHA-256 checksum** is mandatory:
  ```json
  "script": {
    "url": "https://raw.githubusercontent.com/user/dots/commit/install.sh",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "shell": "bash"
  }
  ```
- Install scripts must not invoke unverified binary blobs, obfuscated base64 payloads, or silent privilege escalations.

### 3. Allowed Screenshot Hosts
To protect users against tracking and cross-site scripting:
- Screenshots must be hosted on:
  - `https://raw.githubusercontent.com/...`
  - `https://user-images.githubusercontent.com/...`
  - `https://github.com/user-attachments/assets/...`
  - `https://i.imgur.com/...`
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

Below is a minimal valid specification template:

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
  "description": "A focus-oriented desktop configuration for Arch Linux featuring bespoke Catppuccin color accents, dynamic workspace transitions, and sub-300 MiB idle RAM footprint.",
  "license": "MIT",
  "version": "v1.2.0",
  "updatedAt": "2026-10-15",
  "distros": ["arch", "fedora"],
  "wm": "hyprland",
  "themeStyle": "minimalist",
  "displayServer": "wayland",
  "tags": ["hyprland", "waybar", "foot", "minimalist"],
  "specs": {
    "bar": "Waybar",
    "terminal": "Foot",
    "launcher": "Rofi (Wayland)",
    "notifications": "Mako",
    "theme": "Nordic Frost",
    "shell": "fish",
    "editor": "Neovim",
    "ramIdleMiB": 240,
    "batteryProfile": true
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
        "id": "clone",
        "title": "Clone dotfiles repository",
        "commands": ["git clone https://github.com/janedoe/dots ~/.dotfiles"]
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