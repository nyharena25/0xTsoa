import en from '../i18n/en.json';
import { BASE_PATH } from '../../site.config';

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

export function getLocalizedPath(pathname: string, _targetLocale?: string, search = ''): string {
  const base = BASE_PATH.replace(/\/$/, '');
  let pathWithoutBase = pathname;
  if (base && pathWithoutBase.startsWith(base)) {
    pathWithoutBase = pathWithoutBase.slice(base.length);
  }
  if (!pathWithoutBase.startsWith('/')) {
    pathWithoutBase = `/${pathWithoutBase}`;
  }

  // Strip legacy /en or /fr prefixes
  if (pathWithoutBase === '/en' || pathWithoutBase === '/en/' || pathWithoutBase === '/fr' || pathWithoutBase === '/fr/') {
    pathWithoutBase = '/';
  } else if (pathWithoutBase.startsWith('/en/')) {
    pathWithoutBase = pathWithoutBase.slice(3);
  } else if (pathWithoutBase.startsWith('/fr/')) {
    pathWithoutBase = pathWithoutBase.slice(3);
  }

  // Ensure trailing slash for directory routes
  let targetPath = pathWithoutBase;
  if (!targetPath.endsWith('/') && !targetPath.includes('.')) {
    targetPath = `${targetPath}/`;
  }

  const fullPath = `${base}${targetPath}`;
  if (search) {
    const cleanSearch = search.startsWith('?') ? search : `?${search}`;
    return `${fullPath}${cleanSearch}`;
  }

  return fullPath;
}
