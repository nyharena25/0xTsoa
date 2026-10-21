import en from '../i18n/en.json';

export type Locale = 'en';

function getNestedValue(obj: unknown, path: string): string | null {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

export function useTranslations(_locale?: string) {
  return function t(path: string, fallback?: string): string {
    const val = getNestedValue(en, path);
    if (val !== null && val !== '') return val;
    return fallback ?? path;
  };
}
