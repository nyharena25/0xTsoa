# Off-Site Entity & Brand Discoverability Checklist

This checklist is ordered by **impact** on search engine knowledge graphs (Google Knowledge Graph, Bing Entity Index) and LLM retrieval pipelines (ChatGPT Search, Perplexity, Gemini, Microsoft Copilot).

## Canonical Disambiguation Sentence

Use this exact wording across every profile, README, launch post, and directory submission so crawlers and LLMs associate the project, its spoken alias, and its creator as a single unambiguous entity:

> 0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer.

---

## 1. Bing Webmaster Tools & IndexNow (Highest Immediate LLM Impact)

ChatGPT Search, Microsoft Copilot, Perplexity, and DuckDuckGo rely heavily on Bing's index.

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
2. Choose **Import from Google Search Console** to verify `https://0xtsoa.vercel.app` automatically (or copy the `<meta name="msvalidate.01" content="...">` verification token and replace `TODO_BING_VERIFICATION_CODE` in `src/layouts/Base.astro`).
3. Under **Sitemaps**, submit:
   ```text
   https://0xtsoa.vercel.app/sitemap-index.xml
   ```
4. Once deployed to Vercel (so `https://0xtsoa.vercel.app/4f8b2e9a1c7d6035e8a4b2c9d1f7063a.txt` is live), trigger an immediate IndexNow push of all sitemap URLs:
   ```bash
   npm run indexnow
   ```

---

## 2. LinkedIn Profile & Announcement Post (Strongest Person ↔ Project Signal)

LinkedIn is one of the highest-authority identity sources for linking a creator's full name to a software project.

1. On [linkedin.com/in/rnyharena-dev/](https://www.linkedin.com/in/rnyharena-dev/), open **Add profile section → Additional → Add projects**:
   - **Project name:** `0xTsoa (ZeroTsoa)`
   - **Description:** `0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer.`
   - **Project URL:** `https://0xtsoa.vercel.app`
2. Add `https://0xtsoa.vercel.app` to your **Featured** section with the title `0xTsoa — Reproducible Linux Desktop Registry`.
3. Publish one public LinkedIn post announcing `0xTsoa` (`ZeroTsoa`), including:
   - The canonical sentence verbatim
   - How the name `0xTsoa` comes from `0x` + `Tsoa` (from `RAVELOMANANTSOA`)
   - Links to `https://0xtsoa.vercel.app` and `https://github.com/nyharena25/0xTsoa`

---

## 3. GitHub Repository & Profile Metadata

1. Update the `nyharena25/0xTsoa` repository description, homepage, and topics with GitHub CLI:
   ```bash
   gh repo edit nyharena25/0xTsoa \
     --description "0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer." \
     --homepage "https://0xtsoa.vercel.app" \
     --add-topic dotfiles,linux,ricing,hyprland,wayland,unixporn,desktop-customization,astro,registry,madagascar
   ```
2. On your GitHub profile ([github.com/nyharena25](https://github.com/nyharena25)):
   - Set **Website** to `https://0xtsoa.vercel.app/about/` (this completes the bidirectional `rel="me"` / `sameAs` verification loop with `/about/`).
   - Pin `nyharena25/0xTsoa` as the first pinned repository.
   - In your profile repository (`nyharena25/nyharena25` `README.md`), include the canonical sentence and a link to `https://0xtsoa.vercel.app`.

---

## 4. Curated "Awesome" Lists (High-Authority Contextual Backlinks)

Open a focused Pull Request adding `0xTsoa` to each of these verified repositories (check each repo's `CONTRIBUTING.md` before submitting):

- **awesome-hyprland:** [https://github.com/hyprland-community/awesome-hyprland](https://github.com/hyprland-community/awesome-hyprland)
- **awesome-wayland:** [https://github.com/rcalixte/awesome-wayland](https://github.com/rcalixte/awesome-wayland) (and [https://github.com/natpen/awesome-wayland](https://github.com/natpen/awesome-wayland))
- **awesome-dotfiles:** [https://github.com/webpro/awesome-dotfiles](https://github.com/webpro/awesome-dotfiles)
- **awesome-ricing:** [https://github.com/fosslife/awesome-ricing](https://github.com/fosslife/awesome-ricing) and [https://github.com/avtzis/awesome-linux-ricing](https://github.com/avtzis/awesome-linux-ricing)
- **awesome-linux:** [https://github.com/luong-komorebi/Awesome-Linux-Software](https://github.com/luong-komorebi/Awesome-Linux-Software)

Suggested list entry format:
```markdown
- [0xTsoa](https://0xtsoa.vercel.app) - Open-source, zero-database registry of reproducible Linux desktop configurations and dotfiles with pinned Git refs and SHA-256 verified install scripts. ([Source](https://github.com/nyharena25/0xTsoa))
```

---

## 5. Community Launch Posts

Include the canonical sentence and a link to `https://0xtsoa.vercel.app` (and `https://github.com/nyharena25/0xTsoa`) in each launch post:

- **Hacker News:** Submit `Show HN: 0xTsoa – a static registry of reproducible Linux rices` pointing to `https://0xtsoa.vercel.app` with an introductory comment explaining the zero-database Git architecture, SHA-256 script verification, and the canonical sentence.
- **Reddit:**
  - `r/unixporn`: Follow sub rules strictly (post a qualifying showcase screenshot or approved community resource thread and place the canonical description + link in the details comment).
  - `r/hyprland`: Share how Hyprland configurations are indexed with component specs and pinned refs.
  - `r/linux`: Focus on reproducibility, SHA-256 verification of install scripts, and zero-database static architecture.
  - `r/madagascar`: Share the project from a local creator perspective.
- **Lobsters (`lobste.rs`):** Submit with tags `linux`, `unix`, `web`.
- **dev.to:** Publish an engineering write-up authored by **Ny Harena RAVELOMANANTSOA** (e.g., *"Building 0xTsoa (ZeroTsoa): A Zero-Database Linux Dotfiles Registry with Astro and GitHub Actions"*), starting with the canonical sentence.
- **Mastodon (`fosstodon.org`):** Post an introduction thread with `#Linux`, `#Hyprland`, `#Wayland`, `#Dotfiles`, `#Unixporn`, `#OpenSource`.

---

## 6. Malagasy Tech Community Mentions

Independent regional mentions build strong entity co-occurrence between **Ny Harena RAVELOMANANTSOA**, **Madagascar**, and **0xTsoa** (**ZeroTsoa**):

- Share in Malagasy developer communities (GitHub Madagascar, local Linux user groups, Discord/Facebook developer groups, and tech blogs).
- Pitch the angle: *"A Malagasy developer builds 0xTsoa (ZeroTsoa), an open-source registry for reproducible Linux desktops."*

---

## 7. Matching External Profiles (`sameAs` Expansion)

1. Create accounts on **X (Twitter)**, **Mastodon (`fosstodon.org`)**, and **dev.to** using:
   - **Name:** `Ny Harena RAVELOMANANTSOA` (or `0xTsoa` for a dedicated project account)
   - **Bio:** `0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer.`
   - **Website:** `https://0xtsoa.vercel.app`
2. Once those profiles exist, add their exact URLs to:
   - The `TODO` comments in `sameAs` inside `src/pages/index.astro` (`#founder` and `#org`)
   - The `sameAs` array in `src/pages/about.astro`
   - `<link rel="me" href="...">` in `src/layouts/Base.astro`

---

## 8. Backlinks from Featured Config Authors (`public/badge.svg`)

When notifying maintainers that their dotfiles or desktop component is indexed on 0xTsoa, offer them this optional badge snippet for their repository `README.md`:

```markdown
[![Indexed on 0xTsoa](https://0xtsoa.vercel.app/badge.svg)](https://0xtsoa.vercel.app/configs/<author>/<slug>/)
```

Each README badge creates a high-relevance GitHub backlink directly to that configuration's specification page on `0xtsoa.vercel.app`.

---

## 9. Optional (High Long-Term Value): Custom Domain (`0xtsoa.dev`)

Moving from a shared `.vercel.app` subdomain to a dedicated root domain (such as `0xtsoa.dev` or `0xtsoa.org`) strengthens brand authority in Google and Bing:

1. Add the custom domain in Vercel Project Settings → **Domains**.
2. Configure a permanent **301 redirect** from `0xtsoa.vercel.app/*` to `https://0xtsoa.dev/$1`.
3. Set `SITE_URL=https://0xtsoa.dev` in your environment / `site.config.ts` and update the `@id` base URIs.
4. Verify the new domain in **Google Search Console** and **Bing Webmaster Tools**, then use Google Search Console → **Settings → Change of Address** to transfer signals from `0xtsoa.vercel.app` to the new domain.

---

## 10. Wikidata Items (Only After Independent Coverage Exists)

Do **not** create Wikidata entries immediately (self-created items without third-party sources are routinely deleted). Once `0xTsoa` has independent third-party coverage (tech articles, news mentions, or notable directory inclusions), create:

- A Wikidata item for **0xTsoa** (`instance of: free and open-source software / website`, `author / founder: Ny Harena RAVELOMANANTSOA`, `source code repository URL`, `official website`).
- Link the Wikidata Q-ID in the `sameAs` array of `#org` in `src/pages/index.astro`.

---

## 11. Timeline Expectations & Query Monitoring

- **Bing Index & ChatGPT/Perplexity:** Usually reflects IndexNow and Bing Webmaster submissions within **3–14 days**.
- **Google Knowledge Graph & AI Overviews:** Entity disambiguation (`0xTsoa` vs. unrelated social media reels; `ZeroTsoa` vs. `zerotosa`) typically updates over **3–8 weeks** as backlinks and structured data are recrawled.
- **Queries to monitor** in Google Search Console (**Performance → Search results**) and Bing Webmaster Tools:
  - `0xtsoa`
  - `zerotsoa`
  - `Ny Harena RAVELOMANANTSOA`
