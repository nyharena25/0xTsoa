import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lintInstallSteps, RULES, type LintSeverity } from '../src/lib/install-lint';
import { configSchema, type ConfigData } from '../src/lib/schema';
import { translateCommand } from '../src/lib/install';

const REF = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function entry(commands: string[], distros: ConfigData['distros'] = ['arch']): ConfigData {
  return configSchema.parse({
    name: 'Demo Setup',
    author: { name: 'Alice', github: 'alice' },
    summary: 'A demo setup for the lint tests.',
    license: 'MIT',
    updatedAt: '2026-10-25',
    distros,
    category: 'dotfiles',
    wm: 'hyprland',
    displayServer: 'wayland',
    screenshots: [{ url: '/screenshots/placeholder.svg', alt: 'Demo screenshot' }],
    source: { repo: 'https://github.com/alice/demo', ref: REF },
    install: { steps: [{ id: 'deps', title: 'Steps', commands: commands.length ? commands : ['# nothing'] }] },
  });
}

const rules = (commands: string[], distros?: ConfigData['distros'], severity: LintSeverity = 'error') =>
  lintInstallSteps(entry(commands, distros))
    .filter((i) => i.severity === severity)
    .map((i) => i.rule);

// Each rule: commands it must catch, and close calls it must leave alone.
const CASES: Record<string, { bad: string[]; good: string[] }> = {
  'remote-exec': {
    // The schema already rejects these from unpinned URLs; the standard rejects them even when pinned,
    // because a pinned entry script can still download unpinned code (gogh.sh did).
    bad: [
      'curl -fsSL https://raw.githubusercontent.com/a/b/{{ref}}/i.sh | bash',
      'bash -c "$(curl -fsSL https://raw.githubusercontent.com/a/b/{{ref}}/a.sh)"',
      `sh <(wget -qO- https://raw.githubusercontent.com/a/b/${REF}/a.sh)`,
      'curl -s https://raw.githubusercontent.com/a/b/{{ref}}/a.py | sudo python3',
    ],
    good: ['curl -fsSLo font.zip https://github.com/a/b/releases/download/v1.0/font.zip'],
  },
  'unpinned-download': {
    bad: ['curl -fsSLo w.png https://raw.githubusercontent.com/a/b/main/w.png', 'wget https://example.com/latest.tar.gz'],
    good: ['curl -fsSLo w.png https://raw.githubusercontent.com/a/b/{{ref}}/w.png', `wget https://raw.githubusercontent.com/a/b/${REF}/w.png`, 'curl -LO https://github.com/a/b/releases/download/v2.1/x.tar.gz'],
  },
  destructive: {
    bad: ['rm -rf ~/.config/hypr', 'sudo rm -r /usr/share/themes/x', 'sudo dd if=x.img of=/dev/sda', 'chmod -R 777 ~/.config', 'sudo chown -R me /usr'],
    good: ['cp -r hypr ~/.config/', 'chmod +x ~/.config/hypr/scripts/run.sh'],
  },
  'overwrite-redirect': {
    bad: ['echo "theme" > ~/.config/gtk-3.0/settings.ini', 'cat x > /etc/environment', 'echo x | tee ~/.zshrc'],
    good: ['echo "source = x.conf" >> ~/.config/hypr/hyprland.conf', 'pgrep -x sway > /dev/null', 'make 2>/dev/null'],
  },
  'root-shell': {
    bad: ['sudo -s', 'sudo su', 'sudo bash install.sh', 'sudo -E ./install.sh'],
    good: ['sudo make install', 'sudo pacman -S --needed git'],
  },
  'sudo-home': {
    bad: ['sudo cp -r hypr ~/.config/', 'sudo mkdir -p $HOME/.themes'],
    good: ['sudo cp -r theme /usr/share/themes/'],
  },
  'hardcoded-home': {
    bad: ['cp -r hypr /home/alice/.config/', 'cp x /root/.bashrc'],
    good: ['cp -r hypr ~/.config/'],
  },
  interactive: {
    bad: ['nvim ~/.config/hypr/hyprland.conf', 'nano ~/.zshrc', 'htop'],
    good: ['nvim --headless "+Lazy! sync" +qa'],
  },
  'boot-config': {
    bad: ['sudo grub-mkconfig -o /boot/grub/grub.cfg', 'sudo update-grub', 'sudo mkinitcpio -P', 'sudo plymouth-set-default-theme -R rings'],
    good: ['sudo cp -r theme /usr/share/grub/themes/'],
  },
  'system-upgrade': {
    bad: ['sudo pacman -Syu --needed git', 'sudo pacman -Sy git', 'yay -Syu', 'sudo apt upgrade', 'sudo dnf upgrade'],
    good: ['sudo pacman -S --needed git', 'yay -S --needed walker', 'sudo apt install waybar'],
  },
  'security-off': {
    bad: ['sudo setenforce 0', 'echo "me ALL=(ALL) NOPASSWD: ALL" | sudo tee -a /etc/sudoers', 'sudo chmod u+s ~/bin/x', 'sudo dnf install --nogpgcheck x', 'curl -k -o x.png https://x/{{ref}}/x.png'],
    good: ['chmod +x setup.sh'],
  },
  'system-pip-npm': {
    bad: ['sudo pip install pywal', 'pip install --break-system-packages pywal', 'sudo npm install -g x'],
    good: ['pipx install pywal'],
  },
  'display-manager': {
    bad: ['sudo systemctl enable sddm', 'sudo systemctl enable --now greetd'],
    good: ['systemctl --user enable --now waybar'],
  },
};

describe('install-step rules', () => {
  it('cover every single-command error rule with cases', () => {
    const errorRules = RULES.filter((r) => r.severity === 'error').map((r) => r.id);
    expect(Object.keys(CASES).sort()).toEqual(errorRules.sort());
  });

  for (const [rule, { bad, good }] of Object.entries(CASES)) {
    it(`${rule}: catches the risky command and leaves the safe one`, () => {
      for (const cmd of bad) expect(rules([cmd]), cmd).toContain(rule);
      for (const cmd of good) expect(rules([cmd]), cmd).not.toContain(rule);
    });
  }

  it('never checks # notes or commands that become notes (placeholders)', () => {
    expect(rules(['# Then run: sudo grub-mkconfig -o /boot/grub/grub.cfg', 'sudo plymouth-set-default-theme -R <theme>'])).toEqual([]);
  });

  it('requires every clone to be pinned, not only source.repo', () => {
    expect(rules(['git clone https://github.com/other/fonts ~/fonts'])).toContain('unpinned-clone');
    expect(rules(['git clone https://github.com/other/fonts ~/fonts', `git -C ~/fonts checkout ${REF}`])).not.toContain('unpinned-clone');
    expect(rules(['git clone --branch v2.3 https://github.com/other/fonts'])).not.toContain('unpinned-clone');
    expect(rules(['git clone --branch main https://github.com/other/fonts'])).toContain('unpinned-clone');
    expect(rules(['git clone https://aur.archlinux.org/yay.git', 'cd yay', 'makepkg -si'])).toContain('unpinned-clone');
  });

  it('warns when AUR packages meet non-Arch distros, and about -git packages and system changes', () => {
    expect(rules(['yay -S walker'], ['any'], 'warning')).toContain('aur-other-distros');
    expect(rules(['yay -S walker'], ['arch', 'endeavouros'], 'warning')).not.toContain('aur-other-distros');
    expect(rules(['paru -S hyprpanel-git'], ['arch'], 'warning')).toContain('aur-git');
    expect(rules(['sudo cp -r theme /usr/share/themes/'], ['arch'], 'warning')).toContain('system-change');
  });

  it('turns reboots and logouts into notes, so the installer never cuts itself off', () => {
    for (const cmd of ['reboot', 'sudo reboot', 'systemctl reboot', 'systemctl poweroff', 'hyprctl dispatch exit']) {
      expect(translateCommand(cmd, entry([])), cmd).toMatch(/^note /);
    }
  });
});

describe('the registry', () => {
  it('has no install-step errors in any entry', () => {
    const errors: string[] = [];
    for (const author of fs.readdirSync('configs', { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const file of fs.readdirSync(path.join('configs', author.name)).filter((f) => f.endsWith('.json'))) {
        const data = configSchema.parse(JSON.parse(fs.readFileSync(path.join('configs', author.name, file), 'utf8')));
        for (const issue of lintInstallSteps(data)) if (issue.severity === 'error') errors.push(`${author.name}/${file}: ${issue.rule} ${issue.command}`);
      }
    }
    expect(errors).toEqual([]);
  });
});
