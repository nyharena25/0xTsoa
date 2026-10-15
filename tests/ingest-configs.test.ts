import { describe, it, expect, vi } from 'vitest';
import {
  parseGitHubRepo,
  fetchReadmeHtml,
  fetchRootScreenshots,
  ingestConfig,
  parseShowcaseIssueBody,
  fetchIssueReactions,
  calculatePopularityScore,
  fetchShowcaseIssues,
  processShowcaseIssue,
  sortTopSetups,
  type UserSubmittedConfig,
  type GitHubIssue,
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

  describe('parseShowcaseIssueBody', () => {
    const validIssueMarkdown = `
### Project Name
Hyprland Paper Monochrome

### Author GitHub Username
@nyharena25

### Repository URL
https://github.com/nyharena25/0xTsoa

### Linux Distribution
Arch

### Window Manager / Desktop Environment
Hyprland

### Short Description
A clean, minimalist black-and-white tiling workflow for high productivity.
`;

    it('extracts all 6 structured metadata fields correctly', () => {
      const parsed = parseShowcaseIssueBody(validIssueMarkdown);
      expect(parsed).toEqual({
        projectName: 'Hyprland Paper Monochrome',
        authorGithub: 'nyharena25',
        repoUrl: 'https://github.com/nyharena25/0xTsoa',
        distribution: 'Arch',
        wm: 'Hyprland',
        shortDescription: 'A clean, minimalist black-and-white tiling workflow for high productivity.',
      });
    });

    it('strips leading @ from author username', () => {
      const parsed = parseShowcaseIssueBody('### Author GitHub Username\n@octocat\n### Project Name\nDots');
      expect(parsed.authorGithub).toBe('octocat');
    });

    it('filters out _No response_ placeholders and handles empty input gracefully', () => {
      const parsed = parseShowcaseIssueBody('### Project Name\n_No response_\n### Author GitHub Username\nNone');
      expect(parsed.projectName).toBe('');
      expect(parsed.authorGithub).toBe('');

      const empty = parseShowcaseIssueBody('');
      expect(empty.projectName).toBe('');
      expect(empty.repoUrl).toBe('');
    });

    it('validates that repoUrl matches github.com', () => {
      const parsedValid = parseShowcaseIssueBody('### Repository URL\nhttps://github.com/user/dots');
      expect(parsedValid.repoUrl).toBe('https://github.com/user/dots');

      const parsedInvalid = parseShowcaseIssueBody('### Repository URL\nhttps://gitlab.com/user/dots');
      expect(parsedInvalid.repoUrl).toBe('');
    });
  });

  describe('calculatePopularityScore', () => {
    it('accurately tallies only positive reactions (+1, heart, hooray)', () => {
      const reactions = [
        { content: '+1' },
        { content: '+1' },
        { content: 'heart' },
        { content: 'hooray' },
        { content: '-1' },
        { content: 'laugh' },
        { content: 'confused' },
        { content: 'eyes' },
        { content: 'rocket' },
      ];
      const score = calculatePopularityScore(reactions);
      expect(score).toBe(4); // 2 '+1' + 1 'heart' + 1 'hooray'
    });

    it('returns 0 for empty or invalid reaction lists', () => {
      expect(calculatePopularityScore([])).toBe(0);
      expect(calculatePopularityScore(null as any)).toBe(0);
      expect(calculatePopularityScore([{ content: '-1' }, { content: 'eyes' }])).toBe(0);
    });
  });

  describe('fetchIssueReactions', () => {
    it('calls reactions endpoint with squirrel-girl-preview header and authorization', async () => {
      const mockReactions = [
        { id: 1, content: '+1', user: { login: 'user1' } },
        { id: 2, content: 'heart', user: { login: 'user2' } },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockReactions),
      });

      const res = await fetchIssueReactions('nyharena25', '0xTsoa', 42, 'test-token', mockFetch as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/nyharena25/0xTsoa/issues/42/reactions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.squirrel-girl-preview+json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(res).toEqual(mockReactions);
    });

    it('returns empty array on non-ok HTTP responses without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Rate Limited',
      });

      const res = await fetchIssueReactions('nyharena25', '0xTsoa', 42, undefined, mockFetch as any);
      expect(res).toEqual([]);
    });
  });

  describe('fetchShowcaseIssues', () => {
    it('fetches open issues with showcase-submission label and filters out PRs', async () => {
      const mockIssues: GitHubIssue[] = [
        {
          id: 101,
          number: 1,
          title: '[Showcase]: Setup A',
          body: '### Project Name\nSetup A',
          state: 'open',
          labels: [{ name: 'showcase-submission' }],
        },
        {
          id: 102,
          number: 2,
          title: 'PR submission',
          body: '...',
          state: 'open',
          labels: [{ name: 'showcase-submission' }],
          pull_request: {}, // Should be filtered out
        },
        {
          id: 103,
          number: 3,
          title: '[Showcase]: Setup B',
          body: '### Project Name\nSetup B',
          state: 'open',
          labels: ['showcase-submission'],
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockIssues),
      });

      const issues = await fetchShowcaseIssues('nyharena25', '0xTsoa', 'test-token', mockFetch as any);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/nyharena25/0xTsoa/issues?labels=showcase-submission&state=open&per_page=100',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(issues).toHaveLength(2);
      expect(issues.map((i) => i.number)).toEqual([1, 3]);
    });
  });

  describe('processShowcaseIssue', () => {
    it('processes issue body and reactions into a validated submission payload', async () => {
      const issue: GitHubIssue = {
        id: 555,
        number: 12,
        title: '[Showcase]: Stellar Sway',
        body: `
### Project Name
Stellar Sway

### Author GitHub Username
swayfan

### Repository URL
https://github.com/swayfan/stellar-sway

### Linux Distribution
Fedora

### Window Manager / Desktop Environment
Sway

### Short Description
Fast and fluid Sway setup.
`,
        state: 'open',
        labels: [{ name: 'showcase-submission' }],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { content: '+1' },
          { content: 'heart' },
          { content: 'hooray' },
          { content: 'rocket' },
        ]),
      });

      const processed = await processShowcaseIssue(issue, 'nyharena25', '0xTsoa', 'test-token', mockFetch as any);

      expect(processed).not.toBeNull();
      expect(processed?.issueNumber).toBe(12);
      expect(processed?.id).toBe('swayfan/stellar-sway');
      expect(processed?.popularityScore).toBe(3); // +1, heart, hooray
      expect(processed?.config.name).toBe('Stellar Sway');
      expect(processed?.config.wm).toBe('sway');
      expect(processed?.config.distros).toEqual(['fedora']);
      expect(processed?.config.displayServer).toBe('wayland');
    });

    it('returns null if issue body has neither project name nor repo url', async () => {
      const issue: GitHubIssue = {
        id: 777,
        number: 14,
        title: 'Empty Issue',
        body: 'Just a random message with no form headers',
        state: 'open',
        labels: [{ name: 'showcase-submission' }],
      };

      const processed = await processShowcaseIssue(issue, 'nyharena25', '0xTsoa');
      expect(processed).toBeNull();
    });
  });

  describe('sortTopSetups', () => {
    it('sorts setups descending by popularity score and returns top N', () => {
      const setups = [
        { id: 'setup-c', popularityScore: 5 },
        { id: 'setup-a', popularityScore: 100 },
        { id: 'setup-e', popularityScore: 2 },
        { id: 'setup-b', popularityScore: 50 },
        { id: 'setup-d', popularityScore: 10 },
        { id: 'setup-f', popularityScore: 1 },
      ];

      const top5 = sortTopSetups(setups, 5);

      expect(top5.map((s) => s.id)).toEqual([
        'setup-a',
        'setup-b',
        'setup-d',
        'setup-c',
        'setup-e',
      ]);
      expect(top5).toHaveLength(5);
    });

    it('breaks ties deterministically using setup id', () => {
      const setups = [
        { id: 'bravo', popularityScore: 10 },
        { id: 'alpha', popularityScore: 10 },
      ];

      const sorted = sortTopSetups(setups);
      expect(sorted.map((s) => s.id)).toEqual(['alpha', 'bravo']);
    });
  });
});

