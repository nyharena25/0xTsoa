import crypto from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { configSchema } from '../src/lib/schema';
import { fetchLimited, SCRIPT_HOSTS } from '../src/lib/fetch-limited';
import { parseIssueBody, convertIssueToConfig, parseChecked, parseCommands } from '../scripts/issue-to-config';

describe('Issue Body Parser & Config Converter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleIssue = `
### Project Name
Hyprland Super Fast

### Slug
hyprland-super-fast

### Short Summary
Environnement de fenêtrage Wayland ultra rapide avec Kitty.

### Window Manager
Hyprland

### Display Server
wayland

### Distributions
Arch, Fedora

### Tags
minimal, waybar

### Screenshots URLs
https://raw.githubusercontent.com/test-user/dots/v1.0/screen.png

### Source Repository
https://github.com/test-user/dots

### Git Ref
v1.0.0

### Install: Dependencies
sudo pacman -S --needed hyprland kitty
`;

  it('parses markdown sections accurately', () => {
    const fields = parseIssueBody(sampleIssue);
    expect(fields['Project Name']).toBe('Hyprland Super Fast');
    expect(fields['Slug']).toBe('hyprland-super-fast');
    expect(fields['Window Manager']).toBe('Hyprland');
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
  const githubRendered = `### Project Name

Hyprland Super Fast

### Slug

hyprland-super-fast

### Short Summary

Environnement de fenêtrage Wayland ultra rapide avec Kitty.

### Description

_No response_

### Window Manager

Hyprland

### Display Server

wayland

### Distributions

- [X] Arch
- [ ] Fedora
- [X] NixOS
- [ ] Debian

### Screenshots URLs

https://raw.githubusercontent.com/test-user/dots/v1.0/screen.png

### Source Repository

https://github.com/test-user/dots

### Git Ref

v1.0.0

### Install Script URL

_No response_

### Script SHA-256

_No response_

### Install: Dependencies

\`\`\`bash
git clone --filter=blob:none https://github.com/test-user/dots ~/dots
git -C ~/dots checkout {{ref}}
\`\`\`
`;

  it('strips code fences from command textareas', () => {
    expect(parseCommands('```bash\nhyprctl reload\n\n```')).toEqual(['hyprctl reload']);
    expect(parseCommands('')).toEqual([]);
  });

  it('rejects a submission without install steps', async () => {
    const noInstall = githubRendered.replace(/### Install: Dependencies[\s\S]*$/, '');
    await expect(convertIssueToConfig('test-user', noInstall)).rejects.toThrow(/Install: Dependencies.*required/);
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
    expect(config.install?.steps).toEqual([
      { id: 'deps', title: 'Install dependencies', commands: ['sudo pacman -S --needed waybar', '# Other distros: see the README'] },
      { id: 'reload', title: 'Reload', commands: ['killall -SIGUSR2 waybar'] },
    ]);
    expect(config.distros).toEqual(['arch', 'opensuse']);
    expect(config.specs).toMatchObject({ shell: 'zsh' });
    expect(config.lang).toBe('en');
    const parsed = configSchema.safeParse(config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('accepts a "Lists & guides" entry without install steps and leaves install out', async () => {
    const readingList = englishRendered
      .replace('Bars & panels', 'Lists & guides')
      .replace(/### Install: Dependencies[\s\S]*?(?=### Install Script URL)/, '');
    const { config } = await convertIssueToConfig('test-user', readingList);
    expect(config.category).toBe('resource');
    expect(config.install).toBeUndefined();
    const parsed = configSchema.safeParse(config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('maps Display Server "both" to both', async () => {
    const bothIssue = englishRendered.replace(/### Display Server\n\nwayland/, '### Display Server\n\nboth');
    const { config } = await convertIssueToConfig('test-user', bothIssue);
    expect(config.displayServer).toBe('both');
  });

  it('dedupes tags, drops invalid ones, and keeps at most 10', async () => {
    const twelveTags = [
      'tag1', 'tag2', 'tag1', 'INVALID_TAG!!', '-badstart',
      'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10', 'tag11', 'tag12',
    ].join(', ');
    const issueWithTags = englishRendered.replace(/### Tags\n\nminimal, waybar/, `### Tags\n\n${twelveTags}`);
    const { config } = await convertIssueToConfig('test-user', issueWithTags);
    expect(config.tags).toHaveLength(10);
    expect(config.tags).toEqual(['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8', 'tag9', 'tag10']);
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('rejects a mismatching script SHA-256 hash', async () => {
    const scriptContent = '#!/usr/bin/env bash\necho "hello"\n';
    const wrongHash = 'a'.repeat(64);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(scriptContent, { status: 200 }),
    );

    const issueWithMismatch = englishRendered
      .replace(/### Install Script URL\n\n_No response_/, '### Install Script URL\n\nhttps://raw.githubusercontent.com/test-user/dots/v1.0.0/install.sh')
      .replace(/### Script SHA-256\n\n_No response_/, `### Script SHA-256\n\n${wrongHash}`);

    await expect(convertIssueToConfig('test-user', issueWithMismatch)).rejects.toThrow(/SHA-256 mismatch/i);
  });

  it('accepts an uppercase matching script SHA-256 and normalizes to lowercase', async () => {
    const scriptContent = '#!/usr/bin/env bash\necho "hello"\n';
    const realHash = crypto.createHash('sha256').update(scriptContent).digest('hex').toUpperCase();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(scriptContent, { status: 200 }),
    );

    const issueWithHash = englishRendered
      .replace(/### Install Script URL\n\n_No response_/, '### Install Script URL\n\nhttps://raw.githubusercontent.com/test-user/dots/v1.0.0/install.sh')
      .replace(/### Script SHA-256\n\n_No response_/, `### Script SHA-256\n\n${realHash}`);

    const { config } = await convertIssueToConfig('test-user', issueWithHash);
    expect(config.install?.script?.sha256).toBe(realHash.toLowerCase());
  });

  it('rejects a non-allowlisted or http:// script URL before any fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const httpIssue = englishRendered.replace(
      /### Install Script URL\n\n_No response_/,
      '### Install Script URL\n\nhttp://raw.githubusercontent.com/test-user/dots/v1.0.0/install.sh',
    );
    await expect(convertIssueToConfig('test-user', httpIssue)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();

    const evilHostIssue = englishRendered.replace(
      /### Install Script URL\n\n_No response_/,
      '### Install Script URL\n\nhttps://evil.example.com/test-user/dots/v1.0.0/install.sh',
    );
    await expect(convertIssueToConfig('test-user', evilHostIssue)).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchLimited aborts on an oversized body and on a redirect to a non-allowed host', async () => {
    let streamCancelled = false;
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array(60).fill(65));
        },
        cancel() {
          streamCancelled = true;
        },
      },
      { highWaterMark: 0 },
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(stream, { status: 200 }));

    await expect(
      fetchLimited('https://raw.githubusercontent.com/test-user/dots/v1.0.0/install.sh', {
        maxBytes: 100,
        timeoutMs: 5000,
        allowedHosts: SCRIPT_HOSTS,
      }),
    ).rejects.toThrow(/exceeds 100 bytes/);
    expect(streamCancelled).toBe(true);
    expect(pulls).toBe(2);

    const redirectFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.com/install.sh' },
      }),
    );

    await expect(
      fetchLimited('https://github.com/test-user/dots/raw/v1.0.0/install.sh', {
        maxBytes: 1024,
        timeoutMs: 5000,
        allowedHosts: SCRIPT_HOSTS,
      }),
    ).rejects.toThrow(/allowedHosts/);
    expect(redirectFetch).toHaveBeenCalledTimes(2); // 1 for oversized test + 1 for redirect test
  });
});

