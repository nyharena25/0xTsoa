import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { buildInstallScript } from '../../../../lib/install';

export async function getStaticPaths() {
  const configs = await getCollection('configs');
  return configs.map((entry) => {
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
