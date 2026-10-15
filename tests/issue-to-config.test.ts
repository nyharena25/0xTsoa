import { describe, it, expect } from 'vitest';
import { parseIssueBody, convertIssueToConfig } from '../scripts/issue-to-config';

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
minimal, battery-tuned

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
});
