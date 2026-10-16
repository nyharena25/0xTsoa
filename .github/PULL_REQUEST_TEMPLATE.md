### 0xTsoa: new or updated project

Thanks for contributing to the 0xTsoa registry!

#### Submission checklist
- [ ] The file lives at `configs/<github-user>/<slug>.json` and `author.github` matches the folder name.
- [ ] `category` names the desktop part (dotfiles, bar, launcher, icons, gtk-theme…), and `wm` is `any` if the project isn't tied to one WM.
- [ ] Tags list components and features only (no WM, distro, display server or theme-style duplicates).
- [ ] `install.steps` has at least a `deps` step, and the commands work on a clean system for one listed distro.
- [ ] `source.ref` is a full commit SHA or a tag, never a branch.
- [ ] Screenshots come from an allowed host (`raw.githubusercontent.com`, `github.com/user-attachments`, `i.imgur.com`, `i.redd.it`, `codeberg.org`, `gitlab.com`…).
- [ ] Any `.sh` install script is pinned to a tag or commit and has its `sha256`.
- [ ] `license` is a valid SPDX identifier.
- [ ] `npm run validate` passes.
