import { describe, it, expect } from 'vitest';
import { configSchema } from '../src/lib/schema';
import { parseIssueBody, convertIssueToConfig, parseChecked, parseCommands } from '../scripts/issue-to-config';

describe('Issue Body Parser & Config Converter', () => {
  const sampleIssue = `
### Nom de la configuration
Hyprland Super Fast

### Identifiant court (slug)
hyprland-super-fast

### Résumé court (1 phrase)
Environnement de fenêtrage Wayland ultra rapide avec Kitty.

### Gestionnaire de fenêtres / Compositeur
Hyprland

### Serveur d'affichage
wayland

### Distributions supportées
Arch, Fedora

### Tags / Mots-clés
minimal, waybar

### URLs des captures d'écran
https://raw.githubusercontent.com/test-user/dots/v1.0/screen.png

### Dépôt source des dotfiles (GitHub/GitLab/Codeberg)
https://github.com/test-user/dots

### Commit SHA ou Tag fixe
v1.0.0
`;

  it('parses markdown sections accurately', () => {
    const fields = parseIssueBody(sampleIssue);
    expect(fields['Nom de la configuration']).toBe('Hyprland Super Fast');
    expect(fields['Identifiant court (slug)']).toBe('hyprland-super-fast');
    expect(fields['Gestionnaire de fenêtres / Compositeur']).toBe('Hyprland');
  });

  it('converts parsed issue into valid ConfigInput', async () => {
    const { config, author, slug } = await convertIssueToConfig('test-user', sampleIssue);
    expect(author).toBe('test-user');
    expect(slug).toBe('hyprland-super-fast');
    expect(config.name).toBe('Hyprland Super Fast');
    expect(config.wm).toBe('hyprland');
    expect(config.distros).toContain('arch');
    expect(config.distros).toContain('fedora');
  });

  // Exact markdown GitHub renders for our issue form: checkboxes and empty optional fields.
  const githubRendered = `### Nom de la configuration

Hyprland Super Fast

### Identifiant court (slug)

hyprland-super-fast

### Résumé court (1 phrase)

Environnement de fenêtrage Wayland ultra rapide avec Kitty.

### Description détaillée (facultatif)

_No response_

### Gestionnaire de fenêtres / Compositeur

Hyprland

### Serveur d'affichage

wayland

### Distributions supportées

- [X] Arch
- [ ] Fedora
- [X] NixOS
- [ ] Debian

### URLs des captures d'écran

https://raw.githubusercontent.com/test-user/dots/v1.0/screen.png

### Dépôt source des dotfiles (GitHub/GitLab/Codeberg)

https://github.com/test-user/dots

### Commit SHA ou Tag fixe

v1.0.0

### URL du script d'installation (.sh)

_No response_

### Condensat SHA-256 du script

_No response_

### Install: Dependencies

\`\`\`bash
git clone --depth 1 https://github.com/test-user/dots ~/dots
\`\`\`
`;

  it('strips code fences from command textareas', () => {
    expect(parseCommands('```bash\nhyprctl reload\n\n```')).toEqual(['hyprctl reload']);
    expect(parseCommands('')).toEqual([]);
  });

  it('rejects a submission without install steps', async () => {
    const noInstall = githubRendered.replace(/### Install: Dependencies[\s\S]*$/, '');
    const { config } = await convertIssueToConfig('test-user', noInstall);
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it('keeps only checked checkboxes', () => {
    expect(parseChecked('- [X] Arch\n- [ ] Fedora\n- [x] Void')).toEqual(['Arch', 'Void']);
    expect(parseChecked('Arch, Fedora')).toEqual(['Arch', 'Fedora']);
  });

  it('converts a GitHub-rendered issue (no response fields, checkboxes) into a valid config', async () => {
    const { config } = await convertIssueToConfig('test-user', githubRendered);
    expect(config.distros).toEqual(['arch', 'nixos']);
    expect(config.description).toBeUndefined();
    expect(config.install?.script).toBeUndefined();
    const parsed = configSchema.safeParse(config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  // Headings must match the labels in .github/ISSUE_TEMPLATE/new-config.yml.
  const englishRendered = `### Project Name

Hyprland Paper Minimal

### Slug

hyprland-paper-minimal

### Short Summary

Blazing-fast Wayland desktop on Arch Linux with Waybar and Kitty.

### Description

_No response_

### License (SPDX)

GPL-3.0-only

### Desktop Part

Bars & panels

### Window Manager

Any WM / DE

### Theme Style

Rosé Pine

### Display Server

wayland

### Distributions

- [X] Arch
- [X] openSUSE
- [ ] Mint

### Tags

minimal, waybar

### Screenshots URLs

https://raw.githubusercontent.com/test-user/dots/v1.0.0/screen.png

### Source Repository

https://github.com/test-user/dots

### Git Ref

v1.0.0

### Install: Dependencies

\`\`\`bash
sudo pacman -S --needed waybar
# Other distros: see the README
\`\`\`

### Install: Deploy

_No response_

### Install: Reload

\`\`\`bash
killall -SIGUSR2 waybar
\`\`\`

### Install Script URL

_No response_

### Script SHA-256

_No response_

### Shell

zsh

### Submission Checklist

- [X] My Git ref is a commit SHA or a tag, not a branch.
`;

  it('converts the English issue form into a valid config', async () => {
    const { config, slug } = await convertIssueToConfig('test-user', englishRendered);
    expect(slug).toBe('hyprland-paper-minimal');
    expect(config.license).toBe('GPL-3.0-only');
    expect(config.wm).toBe('any');
    expect(config.category).toBe('bar');
    expect(config.themeStyle).toBe('rose-pine');
    expect(config.install.steps).toEqual([
      { id: 'deps', title: 'Install dependencies', commands: ['sudo pacman -S --needed waybar', '# Other distros: see the README'] },
      { id: 'reload', title: 'Reload', commands: ['killall -SIGUSR2 waybar'] },
    ]);
    expect(config.distros).toEqual(['arch', 'opensuse']);
    expect(config.specs).toMatchObject({ shell: 'zsh' });
    expect(config.lang).toBe('en');
    const parsed = configSchema.safeParse(config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });
});
