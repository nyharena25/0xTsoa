import { describe, it, expect } from 'vitest';
import { repoPathsInSteps } from '../src/lib/schema';
import { missingRepoPaths } from '../scripts/repo-tree';
import { formatSyncSummary } from '../scripts/sync-upstream';

const steps = (...commands: string[][]) => ({
  source: { repo: 'https://github.com/alice/dots' },
  install: { steps: commands.map((c) => ({ commands: c })) },
});
const clone = (dest = '') => [`git clone --filter=blob:none https://github.com/alice/dots${dest ? ` ${dest}` : ''}`, `git -C ${dest || 'dots'} checkout {{ref}}`];

describe('repoPathsInSteps', () => {
  it('finds paths under the clone folder, quoted or not', () => {
    expect(repoPathsInSteps(steps([...clone('~/.config/hypr/catppuccin'), 'cp ~/.config/hypr/catppuccin/themes/catppuccin-mocha.lua ~/.config/hypr/themes/']))).toEqual([
      'themes/catppuccin-mocha.lua',
    ]);
    expect(repoPathsInSteps(steps([...clone('~/c'), 'echo "source = ~/c/themes/mocha.conf" >> ~/.config/hypr/hyprland.conf']))).toEqual(['themes/mocha.conf']);
  });

  it('follows cd into the clone for ./scripts and bash file', () => {
    expect(repoPathsInSteps(steps([...clone('~/HyDE'), 'cd ~/HyDE/Scripts', './install.sh']))).toEqual(['Scripts/install.sh']);
    expect(repoPathsInSteps(steps([...clone(), 'cd dots', 'bash setup']))).toEqual(['setup']);
    expect(repoPathsInSteps(steps([...clone('~/d'), 'cd ~/d && sudo ./install.sh --all']))).toEqual(['install.sh']);
  });

  it('ignores the outside world, notes, globs, brace expansions and other repositories', () => {
    expect(
      repoPathsInSteps(
        steps([
          ...clone('~/d'),
          '# cp ~/d/not-run.conf ~/x',
          'cp -r ~/d/{.config,.local} ~/',
          'cp ~/d/*.conf ~/x',
          'cd /tmp',
          './elsewhere.sh',
          'git clone https://github.com/other/repo ~/other',
          'cp /usr/share/hypr/hyprland.lua ~/.config/hypr/',
        ]),
      ),
    ).toEqual([]);
  });

  it('returns nothing without a clone of source.repo', () => {
    expect(repoPathsInSteps(steps(['sudo pacman -S hyprland', './setup.sh']))).toEqual([]);
    expect(repoPathsInSteps({ source: { repo: 'https://github.com/alice/dots' } })).toEqual([]);
  });
});

describe('missingRepoPaths', () => {
  it('lists the paths the tree lacks', () => {
    expect(missingRepoPaths(['a.lua', 'Scripts/install.sh'], new Set(['a.lua', 'Scripts', 'Scripts/other.sh']))).toEqual(['Scripts/install.sh']);
  });
});

describe('formatSyncSummary held back', () => {
  const held = { id: 'catppuccin/hyprland-theme', repo: 'https://github.com/catppuccin/hyprland', oldRef: 'a'.repeat(40), newRef: 'b'.repeat(40), missing: ['themes/mocha.conf'] };
  it('lists held-back configs with what they lack', () => {
    const md = formatSyncSummary([], [held]);
    expect(md).toContain('### Held back');
    expect(md).toContain('**catppuccin/hyprland-theme**: `bbbbbbb` lacks `themes/mocha.conf`');
  });
  it('adds no section when nothing was held back', () => {
    expect(formatSyncSummary([])).not.toContain('Held back');
  });
});
