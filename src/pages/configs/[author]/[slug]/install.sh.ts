import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { buildInstallScript } from '../../../../lib/install';
import { hasInstallSteps } from '../../../../lib/schema';

export async function getStaticPaths() {
  const configs = await getCollection('configs');
  // Reading lists (no steps) have nothing to install.
  return configs.filter((entry) => hasInstallSteps(entry.data)).map((entry) => {
    const [author, slug] = entry.id.split('/');
    return { params: { author, slug }, props: { entry } };
  });
}

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: CollectionEntry<'configs'> };
  return new Response(buildInstallScript(entry.data, entry.id), {
    headers: { 'Content-Type': 'text/x-shellscript; charset=utf-8' },
  });
};
