// /llms.txt: the hand-written summary in src/lib/llms-template.txt, with its Docs section built
// from the published guides and topic pages, so it never lists a page that does not exist.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import template from '../lib/llms-template.txt?raw';
import { liveTopics, topicDescription, topicPath, topicText } from '../lib/topics';
import { SITE_URL, withBase } from '../../site.config';

export const GET: APIRoute = async () => {
  const url = (p: string) => `${SITE_URL}${withBase(p)}`;
  const live = liveTopics(await getCollection('configs'));
  const guides = (await getCollection('guides', ({ data }) => !data.draft)).sort((a, b) => a.data.published.localeCompare(b.data.published));

  const docs = [
    '## Docs',
    '',
    `[Docs index](${url('/docs/')}). Guides explain how to do something (install safely, theme a desktop). Topic pages compare every entry of one window manager, desktop part or palette (works with, install difficulty, what it changes, upstream maintenance, stars), with an introduction, tips and FAQ; a topic is published once it has at least 5 entries.`,
    '',
    ...(guides.length ? ['### Guides', '', ...guides.map((g) => `- [${g.data.h1}](${url(topicPath(g.id))}): ${g.data.description}`), ''] : []),
    '### Topic pages',
    '',
    ...live.map(({ topic, entries }) => `- [${topicText(topic.h1)}](${url(topicPath(topic.slug))}): ${topicDescription(topic, entries.length)}`),
    '',
  ].join('\n');

  return new Response(template.replace('{{DOCS}}\n', `${docs}\n`), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
