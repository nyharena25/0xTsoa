import fs from 'node:fs';
import path from 'node:path';
import { REPO_OWNER, REPO_NAME, VOTES_CATEGORY, discussionTitle, SITE_URL, BASE_PATH } from '../site.config';

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || REPO_OWNER === 'CHANGE_ME') {
    console.log('ℹ GITHUB_TOKEN not provided or REPO_OWNER unset. Skipping ensure-discussions.');
    return;
  }

  // 1. Find all config files
  const configsDir = path.resolve(process.cwd(), 'configs');
  if (!fs.existsSync(configsDir)) return;

  const authors = fs.readdirSync(configsDir);
  const configIds: string[] = [];

  for (const author of authors) {
    const authorDir = path.join(configsDir, author);
    if (!fs.statSync(authorDir).isDirectory()) continue;
    const files = fs.readdirSync(authorDir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      configIds.push(`${author}/${f.replace(/\.json$/, '')}`);
    }
  }

  console.log(`Found ${configIds.length} configs. Ensuring GitHub Discussions exist...`);

  // 2. Fetch repository ID and category ID
  const infoQuery = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        discussionCategories(first: 20) {
          nodes {
            id
            name
          }
        }
        discussions(first: 100) {
          nodes {
            id
            title
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': '0xTsoa-Discussions-Sync/1.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: infoQuery,
      variables: { owner: REPO_OWNER, repo: REPO_NAME },
    }),
  });

  if (!res.ok) {
    console.error(`GraphQL error: ${res.status} ${res.statusText}`);
    return;
  }

  const data = (await res.json()) as any;
  const repoId = data?.data?.repository?.id;
  const categories = data?.data?.repository?.discussionCategories?.nodes ?? [];
  const existingDiscussions = data?.data?.repository?.discussions?.nodes ?? [];

  const targetCategory = categories.find(
    (c: any) => c.name.toLowerCase() === VOTES_CATEGORY.toLowerCase(),
  );

  if (!targetCategory) {
    console.warn(`Category "${VOTES_CATEGORY}" not found in Discussions. Please create it first.`);
    return;
  }

  const existingTitles = new Set(existingDiscussions.map((d: any) => d.title));

  const createMutation = `
    mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repositoryId,
        categoryId: $categoryId,
        title: $title,
        body: $body
      }) {
        discussion {
          id
          url
        }
      }
    }
  `;

  for (const id of configIds) {
    const title = discussionTitle(id);
    if (existingTitles.has(title)) {
      continue;
    }

    const configUrl = `${SITE_URL}${BASE_PATH}/configs/${id}/`;
    const body = `### [0xTsoa] Vote & Community Sign-Off: \`${id}\`\n\n` +
      `Cette discussion sert de registre de vote transparent pour la configuration **${id}**.\n\n` +
      `- 📋 **Fiche complète sur 0xTsoa** : [Voir sur le site](${configUrl})\n` +
      `- 👍 **Pour voter** : Ajoutez une réaction **👍 (Thumbs Up)** sur ce message initial.\n\n` +
      `Les votes sont comptabilisés à chaque rebuild automatique du site statique.`;

    console.log(`Creating discussion for ${id}...`);
    try {
      const createRes = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': '0xTsoa-Discussions-Sync/1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: createMutation,
          variables: {
            repositoryId: repoId,
            categoryId: targetCategory.id,
            title,
            body,
          },
        }),
      });

      if (!createRes.ok) {
        console.warn(`Failed to create discussion for ${id}: ${createRes.status}`);
      } else {
        console.log(`✓ Discussion created for ${id}`);
      }
    } catch (e) {
      console.warn(`Error creating discussion for ${id}:`, e);
    }
  }
}

main().catch(console.error);
