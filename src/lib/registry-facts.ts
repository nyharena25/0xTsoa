/**
 * Counts over the whole registry for guides ("41 of 163 installs use sudo"), computed at build
 * time from the same classification as the installer, so a guide's numbers never go stale.
 */
import type { ConfigData } from './schema';
import { installDifficulty, installImpact } from './install';
import { maintenanceForConfig } from './stats';

export const REGISTRY_STATS = {
  entries: 'every entry',
  installers: 'entries with a generated installer',
  packages: 'installs that add packages',
  aur: 'installs that use the AUR',
  'upstream-installer': "installs that run the project's own installer",
  sudo: 'installs that use sudo outside package installs',
  'full-rollback': 'installs that --rollback fully undoes (files only)',
  archived: 'entries whose upstream repository is archived',
} as const;

export type RegistryStatKind = keyof typeof REGISTRY_STATS;

export function registryStat(kind: RegistryStatKind, entries: { id: string; data: ConfigData }[]): number {
  const installable = entries.filter((e) => installDifficulty(e.data) !== null);
  switch (kind) {
    case 'entries':
      return entries.length;
    case 'installers':
      return installable.length;
    case 'packages':
      return installable.filter((e) => installImpact(e.data).packages.length + installImpact(e.data).aurPackages.length > 0).length;
    case 'aur':
      return installable.filter((e) => installImpact(e.data).aurPackages.length > 0).length;
    case 'upstream-installer':
      return installable.filter((e) => e.data.install?.script || installImpact(e.data).upstreamCommands.length).length;
    case 'sudo':
      return installable.filter((e) => installImpact(e.data).systemCommands.length).length;
    case 'full-rollback':
      return installable.filter((e) => installDifficulty(e.data) === 'easy').length;
    case 'archived':
      return entries.filter((e) => maintenanceForConfig(e.id, e.data.tags) === 'archived').length;
  }
}
