import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getVotesForConfig } from '../lib/votes';
import { getStarsForConfig } from '../lib/stats';
import { renderCommand } from '../lib/install';
import type { CatalogueItem } from '../lib/filters';

export const GET: APIRoute = async () => {
  const allConfigs = await getCollection('configs');

  const items: CatalogueItem[] = allConfigs.map((entry) => {
    const data = entry.data;
    const votes = getVotesForConfig(entry.id);
    const primaryShot = data.screenshots[0];

    return {
      id: entry.id,
      name: data.name,
      author: {
        name: data.author.name,
        github: data.author.github,
      },
      summary: data.summary,
      category: data.category,
      distros: data.distros,
      wm: data.wm,
      themeStyle: data.themeStyle,
      displayServer: data.displayServer,
      tags: data.tags,
      specs: {
        bar: data.specs.bar,
        terminal: data.specs.terminal,
        launcher: data.specs.launcher,
        theme: data.specs.theme,
        shell: data.specs.shell,
      },
      source: {
        repo: data.source.repo,
        ref: data.source.ref,
      },
      ...(data.install ? {
        install: {
          steps: data.install.steps.map((step) => ({
            id: step.id,
            title: step.title,
            commands: step.commands.map((cmd) => renderCommand(cmd, data)),
          })),
          ...(data.install.script ? { script: data.install.script } : {}),
        },
      } : {}),
      thumbUrl: primaryShot?.url || '',
      thumbAlt: primaryShot?.alt || data.name,
      version: data.version,
      updatedAt: data.updatedAt,
      votes,
      stars: getStarsForConfig(entry.id),
    };
  });

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
