import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { formPicks } from '../src/lib/submit-links';
import { CATEGORY_LABELS, STYLE_LABELS, WM_LABELS } from '../src/lib/schema';
import { TOPICS } from '../src/lib/topics';

const form = fs.readFileSync('.github/ISSUE_TEMPLATE/new-config.yml', 'utf-8');

/** Options of the dropdown whose label is `field`, read from the form YAML. */
function dropdownOptions(field: string): string[] {
  const block = form.split(/\n  - type: /).find((b) => b.startsWith('dropdown') && b.includes(`label: ${field}\n`));
  if (!block) throw new Error(`No dropdown labelled ${field}`);
  const list = block.slice(block.indexOf('options:'), block.indexOf('validations:'));
  return [...list.matchAll(/^\s+- (.+)$/gm)].map((m) => m[1].trim());
}

describe('submit prompts', () => {
  it('names form answers that exist, for every label the site can show', () => {
    expect(dropdownOptions('Desktop Part')).toEqual(Object.values(CATEGORY_LABELS));
    expect(dropdownOptions('Window Manager')).toEqual(Object.values(WM_LABELS));
    expect(dropdownOptions('Theme Style')).toEqual(Object.values(STYLE_LABELS));
  });

  it('turns page facets into form answers, skipping "Other"', () => {
    expect(formPicks({ category: 'dotfiles', wm: 'hyprland' })).toEqual([
      { field: 'Desktop Part', option: 'Dotfiles & full rices' },
      { field: 'Window Manager', option: 'Hyprland' },
    ]);
    expect(formPicks({ wm: 'other', style: 'other' })).toEqual([]);
    expect(formPicks({ style: 'catppuccin' })).toEqual([{ field: 'Theme Style', option: 'Catppuccin' }]);
    expect(formPicks({})).toEqual([]);
  });

  it('gives every topic page one answer to pick', () => {
    for (const topic of TOPICS) {
      expect(formPicks({ [topic.facet.kind]: topic.facet.value }), topic.slug).toHaveLength(1);
    }
  });
});
