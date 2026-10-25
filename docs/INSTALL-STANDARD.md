# Install-step standard

Every entry's `install.steps` become two things: the manual steps on its page, and a generated `install.sh` that other people run on their own machines. Entries come from many developers, so the steps follow one standard. CI checks it on every pull request (`src/lib/install-lint.ts`, run by `npm run validate`), and the issue bot sends errors back to the issue before any pull request is opened.

- **Errors** fail CI. Fix them, or turn the command into a `#` note.
- **Warnings** are shown on the pull request. They are fine when there is no better option, but the reviewer reads them.
- **`#` notes are never checked.** Anything risky, interactive or distro-specific belongs in a note: the page shows it, and the installer prints it as `[manual]` for the reader to do.

To see what your entry gets, run `npm run validate -- --only configs/<you>/<slug>.json`, then build the site and try the generated script with `bash install.sh --dry-run` on a fresh user account.

## How commands become an installer

Write commands as you would type them, one per line. The installer recognises them and wraps each one:

| You write | The installer does |
| --- | --- |
| `sudo pacman -S --needed a b`, `sudo apt install a b`, `sudo dnf install a b` | Installs `a b` with the reader's own package manager, skipping packages already installed. Lists them so `--rollback` can print the command that removes them. |
| `yay -S a` or `paru -S a` | Same, from the AUR, on Arch-based distros only. |
| `git clone URL dest` then `git -C dest checkout {{ref}}` | Clones into the download cache (or `dest`), with a conflict check. |
| `cp -r dots/hypr ~/.config/` | Copies, backing up anything it replaces. Existing files that differ are kept unless the reader agrees. |
| `echo "line" >> ~/.config/x.conf` | Appends the line once, after backing the file up. |
| `./install.sh`, `bash setup.sh`, `make install` | The project's own installer. The usual config folders are backed up before it runs. |
| `hyprctl reload`, `swaymsg reload`, `i3-msg restart`, `qdbus … reconfigure` | Reloads the running session if there is one. Never fails the install: people often install from a TTY. |
| other `sudo …` | A system change, shown in the plan and not undone by `--rollback`. |
| `# text`, a command with a `<placeholder>`, `xdg-open URL`, `reboot` | Printed for the reader; never run. |

Steps have three ids: `deps` (packages and downloads), `dotfiles` (put the files in place) and `reload` (apply them).

## Errors

| Rule | Not allowed | Write instead |
| --- | --- | --- |
| `remote-exec` | Running downloaded code: `curl … \| bash`, `bash -c "$(curl …)"`, `sh <(wget …)`, also from pinned URLs | Clone the repository at `{{ref}}` and run the script from the clone, or use `install.script` (pinned URL and SHA-256). A script run from a pipe can still download unpinned code: Gogh's `gogh.sh` fetched its themes from `master` that way. |
| `unpinned-download` | `curl`/`wget` from a URL that can change (`…/main/…`, `latest`) | A URL with `{{ref}}`, a commit SHA, a version tag or `/releases/download/<tag>/`. |
| `unpinned-clone` | `git clone` of any repository (not only yours) left on its default branch | `git -C <dest> checkout <SHA, tag or {{ref}}>` right after, or `git clone --branch <tag>`. This includes AUR helpers built by hand (`git clone https://aur.archlinux.org/yay.git`). |
| `destructive` | `rm -r`/`rm -f`, `dd`, `mkfs`, `wipefs`, `shred`, partitioning tools, `chown -R`, `chmod 777` | Copy files: the installer backs up what it replaces, and `--force` replaces conflicts. Never delete the reader's files. |
| `overwrite-redirect` | `> ~/file`, `> /etc/file`, `tee ~/file` (overwrite without a backup) | Ship the file in the repository and `cp` it, or append with `echo "…" >> file`. |
| `root-shell` | `sudo -s`, `sudo -i`, `sudo -E`, `sudo su`, `sudo bash script` | `sudo` on the one command that needs it. The installer refuses to run as root. |
| `sudo-home` | `sudo cp/mv/mkdir/ln … ~/…` | The same command without `sudo`: files in the home folder must belong to the reader. |
| `hardcoded-home` | `/home/alice/…`, `/root/…` | `~/…` |
| `interactive` | Opening `nvim`, `vim`, `nano`, `less`, `htop`… mid-install | A `#` note: "Open Neovim and run :colorscheme x". `nvim --headless …` is fine. |
| `boot-config` | `grub-mkconfig`, `update-grub`, `grub2-mkconfig`, `mkinitcpio`, `dracut`, `update-initramfs`, `bootctl`, `efibootmgr`, `plymouth-set-default-theme -R` | A `#` note with the command for each distro family (see GRUB below). These differ per distro and a mistake can leave a system unbootable. |
| `system-upgrade` | `pacman -Syu`, `pacman -Sy` (a partial upgrade breaks Arch), `yay -Syu`, `apt upgrade`, `dnf upgrade`, `zypper dup` | `sudo pacman -S --needed …` for the packages you need. Upgrading the system is the reader's decision. |
| `security-off` | `setenforce 0`, disabling a firewall or AppArmor, editing `/etc/sudoers`, `NOPASSWD`, setuid (`chmod u+s`), `--nogpgcheck`, `--skippgpcheck`, `--allow-unauthenticated`, `SigLevel = Never`, `curl -k`, `apt-key add` | Nothing. A desktop setup never needs these. |
| `system-pip-npm` | `sudo pip install`, `--break-system-packages`, `sudo npm install -g` | The distro package (`python-pywal`), `pipx install`, or a user-level install. |
| `display-manager` | `systemctl enable sddm` (or gdm, lightdm, ly, greetd) | A `#` note: the reader has to disable their current display manager first. |

Reboots (`reboot`, `systemctl reboot`) and logouts (`hyprctl dispatch exit`) are turned into notes automatically, so the installer never cuts itself off.

## Warnings

| Rule | Shown when | What the reviewer checks |
| --- | --- | --- |
| `aur-other-distros` | AUR packages, and `distros` lists more than Arch, EndeavourOS or Manjaro | Fine for themes that run anywhere: the page says the installer covers Arch-based distros, and the installer stops elsewhere with a pointer to your repository. |
| `aur-git` | A `-git` AUR package | It builds the latest commit, not `source.ref`. Use the release package when there is one. |
| `system-change` | `sudo` writing outside the home folder (`/usr/share/themes`, `make install`) | Use a user folder when the project supports one: `~/.local/share/themes`, `~/.local/share/icons` or `~/.icons`, `~/.local/share/fonts`. |
| `upstream-installer` | The project's own installer runs | The entry's `description` says what it touches: shell, display manager, bootloader, other configs, drivers. |
| `services` | `systemctl enable/disable`, `chsh` | A `#` note says it, since `--rollback` does not undo it. |
| `cargo-go-unpinned` | `cargo install name` without `--locked`/`--version`, `go install …@latest` | Pin the version, or build from the pinned clone (`cargo install --path .`). |

## Distros

`distros` says where the project works, which can be wider than where the installer works.

- **`["any"]`** is for themes, icons, fonts and tools that run anywhere. If the steps use the AUR, that is still correct: the page adds "The installer covers Arch-based distros" and the installer stops elsewhere, before changing anything, with a link to your repository.
- **List real distros** for full desktops, and only the ones you or the project test.
- **Package names are Arch's.** The installer passes the names you write to apt, dnf, zypper, xbps or apk unchanged. When names differ, the install reports which package failed and exits with an error. If you know the names elsewhere, add a note: `# Debian/Ubuntu: sudo apt install waybar fonts-font-awesome`.
- **NixOS** has no package step: the installer tells the reader to add the packages to `configuration.nix`. Full NixOS setups use `sudo nixos-rebuild switch --flake .` (a system change) after a pinned clone.
- **Files from packages** (`cp /etc/sway/config ~/.config/sway/config`) depend on how a distro packages the program. If the file is missing, the installer reports it and carries on, so the rest of the setup still installs.

## Real cases

**Dotfiles.** Clone at `{{ref}}`, then copy each folder into place. One `cp` per program shows the reader exactly what changes:

```json
"commands": [
  "git clone --filter=blob:none https://github.com/you/dots ~/.local/share/you-dots",
  "git -C ~/.local/share/you-dots checkout {{ref}}",
  "cp -r ~/.local/share/you-dots/hypr ~/.config/",
  "cp -r ~/.local/share/you-dots/waybar ~/.config/"
]
```

**GTK themes, icons, cursors, fonts.** Prefer the distro or AUR package. Otherwise copy into the user folders (`~/.local/share/themes`, `~/.local/share/icons`, `~/.local/share/fonts`), which the installer backs up and `--rollback` restores. Applying a theme with `gsettings set …` is allowed and shown as a lasting change.

**GRUB and Plymouth themes.** Copying the theme into `/usr/share/grub/themes` is a system change and allowed. Editing `/etc/default/grub` and regenerating the config are notes:

```json
"# In /etc/default/grub, set GRUB_THEME=\"/usr/share/grub/themes/mytheme/theme.txt\"",
"# Regenerate the GRUB config, then reboot: sudo grub-mkconfig -o /boot/grub/grub.cfg (Arch), sudo update-grub (Debian, Ubuntu, Mint), sudo grub2-mkconfig -o /boot/grub2/grub.cfg (Fedora, openSUSE)"
```

If the project's own installer already regenerates the config (vinceliuice's `grub2-themes` does), say so in a note instead.

**Login screens.** Install the theme package and copy files. Switching display manager is a note.

**Reloading.** End with the session's reload command (`hyprctl reload`, `swaymsg reload`, `i3-msg restart`, `bspc wm -r`, `awesome-client 'awesome.restart()'`, `qdbus org.kde.KWin /KWin reconfigure`). It is skipped quietly when no session is running.

**The project's own installer.** Clone at `{{ref}}`, `cd` into the clone, run it (`./install.sh`, `bash setup.sh`). Describe what it changes in `description`. If it asks questions, that is fine: it runs in the reader's terminal.

**Building from source.** `meson setup build`, `ninja -C build`, then `sudo ninja -C build install` (a system change) from the pinned clone. Add the build dependencies to the `deps` step.

**Neovim and other editor themes.** Install with the plugin manager the reader uses, as notes: `# lazy.nvim: { "folke/tokyonight.nvim" }`, then `# Run :colorscheme tokyonight`.

**Wallpapers and other assets.** Ship them in the repository, or download them from a pinned URL (`…/{{ref}}/wallpapers/x.png`, `…/releases/download/v1.0/x.zip`).

## Before you submit

- [ ] Every clone and download is pinned to `{{ref}}`, a commit or a tag.
- [ ] Nothing is piped into a shell, deleted, overwritten with `>`, or run as a root shell.
- [ ] Bootloader, display-manager, editor and per-distro steps are `#` notes.
- [ ] `distros` lists where the project works, and notes cover package names you know differ.
- [ ] The `description` says what the project's own installer changes, if it runs one.
- [ ] `npm run validate -- --only configs/<you>/<slug>.json` shows no errors.
- [ ] The generated `install.sh --dry-run` shows the plan you expect on a fresh user account.
