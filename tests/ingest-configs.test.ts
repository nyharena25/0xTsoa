import { describe, it, expect, vi } from 'vitest';
import {
  parseGitHubRepo,
  fetchReadmeHtml,
  fetchRootScreenshots,
  ingestConfig,
  type UserSubmittedConfig,
} from '../scripts/ingest-configs';

describe('Ingest Configs Backend', () => {
  describe('parseGitHubRepo', () => {
    it('correctly parses standard https GitHub repository URLs', () => {
      const parsed = parseGitHubRepo('https://github.com/nyharena25/0xtsoa');
      expect(parsed).toEqual({ owner: 'nyharena25', repo: '0xtsoa' });
    });

    it('handles trailing slashes and .git extensions', () => {
      const parsed = parseGitHubRepo('https://github.com/hyprwm/Hyprland.git/');
      expect(parsed).toEqual({ owner: 'hyprwm', repo: 'Hyprland' });
    });

    it('handles git ssh URLs', () => {
      const parsed = parseGitHubRepo('git@github.com:swaywm/sway.git');
      expect(parsed).toEqual({ owner: 'swaywm', repo: 'sway' });
    });

    it('handles shorthand owner/repo strings', () => {
      const parsed = parseGitHubRepo('torvalds/linux');
      expect(parsed).toEqual({ owner: 'torvalds', repo: 'linux' });
    });

    it('throws descriptive error on invalid URLs', () => {
      expect(() => parseGitHubRepo('https://gitlab.com/user/project')).toThrow(/Invalid GitHub repository URL/);
      expect(() => parseGitHubRepo('')).toThrow(/Repository URL must be a non-empty string/);
    });
  });

  describe('fetchReadmeHtml', () => {
    it('requests application/vnd.github.html and returns HTML body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<article class="markdown-body"><h1>My Setup</h1></article>'),
      });

      const html = await fetchReadmeHtml('owner', 'repo', 'main', 'test-token', mockFetch as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/readme?ref=main',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.html',
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(html).toContain('<h1>My Setup</h1>');
    });

    it('handles 404 gracefully without crashing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const html = await fetchReadmeHtml('owner', 'repo', undefined, undefined, mockFetch as any);
      expect(html).toContain('[INFO] No README found');
    });
  });

  describe('fetchRootScreenshots', () => {
    it('filters for image extensions and maps to raw download_urls', async () => {
      const mockContents = [
        { name: 'README.md', path: 'README.md', type: 'file', download_url: 'https://raw.github.../README.md' },
        { name: 'desktop.png', path: 'desktop.png', type: 'file', download_url: 'https://raw.github.../desktop.png' },
        { name: 'terminal.webp', path: 'terminal.webp', type: 'file', download_url: 'https://raw.github.../terminal.webp' },
        { name: 'code.py', path: 'code.py', type: 'file', download_url: 'https://raw.github.../code.py' },
        { name: 'assets', path: 'assets', type: 'dir', download_url: null },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockContents),
      });

      const screenshots = await fetchRootScreenshots('owner', 'repo', 'v1.0.0', undefined, mockFetch as any);

      expect(screenshots).toHaveLength(2);
      expect(screenshots[0]).toEqual({
        url: 'https://raw.github.../desktop.png',
        name: 'desktop.png',
        alt: 'desktop.png screenshot for repo',
        caption: 'DESKTOP.RAW',
      });
      expect(screenshots[1].name).toBe('terminal.webp');
    });
  });

  describe('ingestConfig', () => {
    it('merges user config with fetched readme and discovered screenshots', async () => {
      const mockConfig: UserSubmittedConfig = {
        name: 'Test Setup',
        source: {
          repo: 'https://github.com/tester/setup-dots',
          ref: 'main',
        },
        screenshots: [
          { url: 'https://cdn.example.com/existing.png', alt: 'Existing screenshot' },
        ],
      };

      const mockFetch = vi.fn((url: string) => {
        if (url.includes('/readme')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('<div class="readme">Rendered Readme</div>'),
          });
        }
        if (url.includes('/contents')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { name: 'discovered.jpg', type: 'file', download_url: 'https://raw.github.../discovered.jpg' },
            ]),
          });
        }
        return Promise.reject(new Error('Unknown url'));
      });

      const result = await ingestConfig(mockConfig, 'tester/setup-dots', 'fake-token', mockFetch as any);

      expect(result.id).toBe('tester/setup-dots');
      expect(result.github.owner).toBe('tester');
      expect(result.github.repo).toBe('setup-dots');
      expect(result.readmeHtml).toBe('<div class="readme">Rendered Readme</div>');
      expect(result.discoveredScreenshots).toHaveLength(1);
      expect(result.screenshots).toHaveLength(2);
      expect(result.screenshots[0].url).toBe('https://cdn.example.com/existing.png');
      expect(result.screenshots[1].url).toBe('https://raw.github.../discovered.jpg');
      expect(result.ingestedAt).toBeDefined();
    });
  });
});
