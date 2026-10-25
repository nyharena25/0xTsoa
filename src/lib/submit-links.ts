/**
 * "Submit your setup" prompts. GitHub can prefill only the text fields of an issue form from the URL,
 * not its dropdowns, so a page names the dropdown answers that match it instead. The answers are the
 * site labels, which are also the form's options (.github/ISSUE_TEMPLATE/new-config.yml; a test checks).
 */
import { CATEGORY_LABELS, STYLE_LABELS, WM_LABELS, type ConfigData } from './schema';

export interface FormPick {
  /** The dropdown's label in the form. */
  field: 'Desktop Part' | 'Window Manager' | 'Theme Style';
  option: string;
}

export interface SubmitContext {
  category?: ConfigData['category'];
  wm?: ConfigData['wm'];
  style?: ConfigData['themeStyle'];
}

export function formPicks({ category, wm, style }: SubmitContext): FormPick[] {
  const picks: FormPick[] = [];
  if (category) picks.push({ field: 'Desktop Part', option: CATEGORY_LABELS[category] });
  if (wm && wm !== 'other') picks.push({ field: 'Window Manager', option: WM_LABELS[wm] });
  if (style && style !== 'other') picks.push({ field: 'Theme Style', option: STYLE_LABELS[style] });
  return picks;
}
