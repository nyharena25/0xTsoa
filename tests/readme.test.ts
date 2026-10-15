import { describe, it, expect } from 'vitest';
import {
  parseGitHubRepo,
  normalizeGitHubImageUrl,
  normalizeGitHubLinkUrl,
  extractScreenshotsFromReadme,
} from '../src/lib/readme';

describe('README URL Normalization and Asset Extraction', () => {
  describe('parseGitHubRepo', () => {
    it('parses valid github urls', () => {
      expect(parseGitHubRepo('https://github.com/end-4/dots-hyprland')).toEqual({
        owner: 'end-4',
        repo: 'dots-hyprland',
      });
      expect(parseGitHubRepo('end-4/dots-hyprland')).toEqual({
        owner: 'end-4',
        repo: 'dots-hyprland',
      });
    });
  });

  describe('normalizeGitHubImageUrl', () => {
    const readmeRawDir = 'https://raw.githubusercontent.com/end-4/dots-hyprland/main/.github/';
    const repoRawRoot = 'https://raw.githubusercontent.com/end-4/dots-hyprland/main/';

    it('rewrites expiring private-user-images containing UUID to permanent user-attachments', () => {
      const expiringUrl =
        'https://private-user-images.githubusercontent.com/97237370/576998753-5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4.png?jwt=eyJ0eXAi...';
      const normalized = normalizeGitHubImageUrl(expiringUrl, readmeRawDir, repoRawRoot);
      expect(normalized).toBe(
        'https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4'
      );
    });

    it('rewrites legacy repository asset URLs to permanent user-attachments', () => {
      const assetUrl =
        'https://github.com/end-4/dots-hyprland/assets/97237370/09533e64-b6d7-47eb-a840-ee90c6776adf';
      const normalized = normalizeGitHubImageUrl(assetUrl, readmeRawDir, repoRawRoot);
      expect(normalized).toBe(
        'https://github.com/user-attachments/assets/09533e64-b6d7-47eb-a840-ee90c6776adf'
      );
    });

    it('resolves relative images with the readme directory base', () => {
      const relativeUrl = 'assets/illogical-impulse.svg';
      const normalized = normalizeGitHubImageUrl(relativeUrl, readmeRawDir, repoRawRoot);
      expect(normalized).toBe(
        'https://raw.githubusercontent.com/end-4/dots-hyprland/main/.github/assets/illogical-impulse.svg'
      );
    });

    it('resolves root-relative images with the repository root base', () => {
      const rootRelativeUrl = '/assets/logo.png';
      const normalized = normalizeGitHubImageUrl(rootRelativeUrl, readmeRawDir, repoRawRoot);
      expect(normalized).toBe(
        'https://raw.githubusercontent.com/end-4/dots-hyprland/main/assets/logo.png'
      );
    });

    it('preserves external image URLs and data URLs', () => {
      const badgeUrl = 'https://img.shields.io/badge/dynamic/json?query=stars';
      expect(normalizeGitHubImageUrl(badgeUrl, readmeRawDir, repoRawRoot)).toBe(badgeUrl);
    });
  });

  describe('normalizeGitHubLinkUrl', () => {
    const readmeBlobDir = 'https://github.com/end-4/dots-hyprland/blob/main/.github/';
    const repoBlobRoot = 'https://github.com/end-4/dots-hyprland/blob/main/';

    it('rewrites private user image links to user-attachments', () => {
      const expiring =
        'https://private-user-images.githubusercontent.com/97237370/576998753-5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4.png?jwt=abc';
      expect(normalizeGitHubLinkUrl(expiring, readmeBlobDir, repoBlobRoot)).toBe(
        'https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4'
      );
    });

    it('resolves relative markdown links with readme folder', () => {
      expect(normalizeGitHubLinkUrl('docs/setup.md', readmeBlobDir, repoBlobRoot)).toBe(
        'https://github.com/end-4/dots-hyprland/blob/main/.github/docs/setup.md'
      );
    });

    it('resolves root-relative links with repo root', () => {
      expect(normalizeGitHubLinkUrl('/LICENSE', readmeBlobDir, repoBlobRoot)).toBe(
        'https://github.com/end-4/dots-hyprland/blob/main/LICENSE'
      );
    });

    it('preserves anchors and external links', () => {
      expect(normalizeGitHubLinkUrl('#overview', readmeBlobDir, repoBlobRoot)).toBe('#overview');
      expect(normalizeGitHubLinkUrl('https://hyprland.org', readmeBlobDir, repoBlobRoot)).toBe('https://hyprland.org');
    });
  });

  describe('extractScreenshotsFromReadme', () => {
    it('extracts real screenshots while filtering badges, charts, and svgs', () => {
      const sampleHtml = `
        <div>
          <img src="https://img.shields.io/badge/test-badge-blue" alt="Shield Badge" />
          <img src="https://starchart.cc/user/repo.svg" alt="Stargazers" />
          <img src="https://raw.githubusercontent.com/user/repo/main/assets/logo.svg" alt="logo" />
          <img src="https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4" alt="AI Settings App" />
          <img src="https://private-user-images.githubusercontent.com/97237370/576998753-6a32395f-9437-4192-8faf-2951a9e84cbe.png?jwt=xyz" alt="Widgets Panel" />
          <img src="https://raw.githubusercontent.com/user/repo/main/preview.png" alt="Desktop Preview" />
        </div>
      `;

      const extracted = extractScreenshotsFromReadme(sampleHtml);
      expect(extracted).toHaveLength(3);
      expect(extracted[0].url).toBe('https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4');
      expect(extracted[0].alt).toBe('AI Settings App');
      expect(extracted[0].caption).toBe('AI_SETTINGS_APP.RAW');

      expect(extracted[1].url).toBe('https://github.com/user-attachments/assets/6a32395f-9437-4192-8faf-2951a9e84cbe');
      expect(extracted[1].alt).toBe('Widgets Panel');

      expect(extracted[2].url).toBe('https://raw.githubusercontent.com/user/repo/main/preview.png');
      expect(extracted[2].alt).toBe('Desktop Preview');
    });

    it('deduplicates identical URLs', () => {
      const sampleHtml = `
        <img src="https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4" alt="One" />
        <img src="https://github.com/user-attachments/assets/5d4e7d07-d0b4-4406-a4c9-ed7ba90e3fe4" alt="Duplicate" />
      `;
      const extracted = extractScreenshotsFromReadme(sampleHtml);
      expect(extracted).toHaveLength(1);
    });
  });
});
