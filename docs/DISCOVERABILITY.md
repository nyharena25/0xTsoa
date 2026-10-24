# Off-Site Entity & Brand Discoverability Checklist

This checklist is ordered by **impact** on search engine knowledge graphs (Google Knowledge Graph, Bing Entity Index) and LLM retrieval pipelines (ChatGPT Search, Perplexity, Gemini, Microsoft Copilot).

## Canonical Disambiguation Sentence

Use this exact wording across every profile, README, launch post, and directory submission so crawlers and LLMs associate the project, its spoken alias, and its creator as a single unambiguous entity:

> 0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer.

---

## 1. Bing Webmaster Tools & IndexNow (Highest Immediate LLM Impact)

ChatGPT Search, Microsoft Copilot, Perplexity, and DuckDuckGo rely heavily on Bing's index.

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
2. Choose **Import from Google Search Console** to verify `https://www.0xtsoa.dev` automatically (or copy the `<meta name="msvalidate.01" content="...">` verification token and replace `TODO_BING_VERIFICATION_CODE` in `src/layouts/Base.astro`).
3. Under **Sitemaps**, submit:
   ```text
   https://www.0xtsoa.dev/sitemap-index.xml
   ```
4. Once deployed to Vercel (so `https://www.0xtsoa.dev/4f8b2e9a1c7d6035e8a4b2c9d1f7063a.txt` is live), trigger an immediate IndexNow push of all sitemap URLs:
   ```bash
   npm run indexnow
   ```

---

## 2. LinkedIn Profile & Announcement Post (Strongest Person ↔ Project Signal)

LinkedIn is one of the highest-authority identity sources for linking a creator's full name to a software project.

1. On [linkedin.com/in/rnyharena-dev/](https://www.linkedin.com/in/rnyharena-dev/), open **Add profile section → Additional → Add projects**:
   - **Project name:** `0xTsoa (ZeroTsoa)`
   - **Description:** `0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer.`
   - **Project URL:** `https://www.0xtsoa.dev`
2. Add `https://www.0xtsoa.dev` to your **Featured** section with the title `0xTsoa — Reproducible Linux Desktop Registry`.
3. Publish one public LinkedIn post announcing `0xTsoa` (`ZeroTsoa`), including:
   - The canonical sentence verbatim
   - How the name `0xTsoa` comes from `0x` + `Tsoa` (from `RAVELOMANANTSOA`)
   - Links to `https://www.0xtsoa.dev` and `https://github.com/nyharena25/0xTsoa`

---

## 3. GitHub Repository & Profile Metadata

1. Update the `nyharena25/0xTsoa` repository description, homepage, and topics with GitHub CLI:
   ```bash
   gh repo edit nyharena25/0xTsoa \
     --description "0xTsoa (pronounced ZeroTsoa) is an open-source registry of reproducible Linux desktop configurations, created by Ny Harena RAVELOMANANTSOA, a Malagasy developer." \
     --homepage "https://www.0xtsoa.dev" \
     --add-topic dotfiles,linux,ricing,hyprland,wayland,unixporn,desktop-customization,astro,registry,madagascar
   ```
2. On your GitHub profile ([github.com/nyharena25](https://github.com/nyharena25)):
   - Set **Website** to `https://www.0xtsoa.dev/about/` (this completes the bidirectional `rel="me"` / `sameAs` verification loop with `/about/`).
   - Pin `nyharena25/0xTsoa` as the first pinned repository.
   - In your profile repository (`nyharena25/nyharena25` `README.md`), include the canonical sentence and a link to `https://www.0xtsoa.dev`.

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
- [0xTsoa](https://www.0xtsoa.dev) - Open-source, zero-database registry of reproducible Linux desktop configurations and dotfiles with pinned Git refs and SHA-256 verified install scripts. ([Source](https://github.com/nyharena25/0xTsoa))
```

---

## 5. Community Launch Posts

Include the canonical sentence and a link to `https://www.0xtsoa.dev` (and `https://github.com/nyharena25/0xTsoa`) in each launch post:

- **Hacker News:** Submit `Show HN: 0xTsoa – a static registry of reproducible Linux rices` pointing to `https://www.0xtsoa.dev` with an introductory comment explaining the zero-database Git architecture, SHA-256 script verification, and the canonical sentence.
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
   - **Website:** `https://www.0xtsoa.dev`
2. Once those profiles exist, add their exact URLs to:
   - The `TODO` comments in `sameAs` inside `src/pages/index.astro` (`#founder` and `#org`)
   - The `sameAs` array in `src/pages/about.astro`
   - `<link rel="me" href="...">` in `src/layouts/Base.astro`

---

## 8. Backlinks from Featured Config Authors (`public/badge.svg`)

When notifying maintainers that their dotfiles or desktop component is indexed on 0xTsoa, offer them this optional badge snippet for their repository `README.md`:

```markdown
[![Indexed on 0xTsoa](https://www.0xtsoa.dev/badge.svg)](https://www.0xtsoa.dev/configs/<author>/<slug>/)
```

Each README badge creates a high-relevance GitHub backlink directly to that configuration's specification page on `www.0xtsoa.dev`.

---

## 9. Custom Domain (`www.0xtsoa.dev`)

The canonical host is `https://www.0xtsoa.dev`. Every URL the site publishes (canonical tags, `og:url`, structured data, sitemap, `robots.txt`, `llms.txt`, IndexNow) comes from `SITE_URL` in `site.config.ts`, so it must name the host that answers **200** directly. A canonical or sitemap URL that redirects sends search engines mixed signals: Bing then reports pages as "Discovered but not crawled".

Redirects are configured in Vercel Project Settings → **Domains**, not in `vercel.json`:

| Host | Setting |
| :--- | :--- |
| `www.0xtsoa.dev` | Production (primary, answers 200) |
| `0xtsoa.dev` | Redirect **308** → `www.0xtsoa.dev` |
| `0xtsoa.vercel.app` | Redirect **308** → `www.0xtsoa.dev` (a 302 is temporary: search engines keep the old URL, and Google's Change of address tool rejects it) |

After each deploy that touches URLs:

1. If `SITE_URL` is set in the Vercel production environment variables, it must be exactly `https://www.0xtsoa.dev` (or unset, to use the default).
2. Check that `https://www.0xtsoa.dev/` has `<link rel="canonical" href="https://www.0xtsoa.dev/">`, and that `robots.txt` and `sitemap-index.xml` only list `https://www.0xtsoa.dev/` URLs.
3. Check that `/`, `/catalogue/`, one `/configs/<author>/<slug>/` page and `/sitemap-index.xml` on `0xtsoa.vercel.app` and on `0xtsoa.dev` each reach the matching `www.0xtsoa.dev` URL in a single 308 redirect.
4. **Google Search Console:** verify `0xtsoa.dev` as a **Domain** property (DNS TXT record; it covers `www`) and submit `https://www.0xtsoa.dev/sitemap-index.xml`. In the old `0xtsoa.vercel.app` property, run **Settings → Change of address** once the redirect is a 308. Keep the old property.
5. **Bing Webmaster Tools:** in the `www.0xtsoa.dev` site, remove any sitemap that lists `0xtsoa.vercel.app` URLs, submit `https://www.0xtsoa.dev/sitemap-index.xml`, run `npm run indexnow`, then use **URL Inspection → Request indexing** on the home page and the catalogue.

---

## 10. Wikidata Items (Only After Independent Coverage Exists)

Do **not** create Wikidata entries immediately (self-created items without third-party sources are routinely deleted). Once `0xTsoa` has independent third-party coverage (tech articles, news mentions, or notable directory inclusions), create:

- A Wikidata item for **0xTsoa** (`instance of: free and open-source software / website`, `author / founder: Ny Harena RAVELOMANANTSOA`, `source code repository URL`, `official website`).
- Link the Wikidata Q-ID in the `sameAs` array of `#org` in `src/pages/index.astro`.

---

## 11. Timeline Expectations & Query Monitoring

- **Bing Index & ChatGPT/Perplexity:** Usually reflects IndexNow and Bing Webmaster submissions within **3–14 days**.
- **Google Knowledge Graph & AI Overviews:** Entity disambiguation (`0xTsoa` vs. unrelated social media reels; `ZeroTsoa` vs. `zerotosa`) typically updates over **3–8 weeks** as backlinks and structured data are recrawled.
- **Main metric: non-brand searches.** People who already know the name are not the goal. In Google Search Console (**Performance → Search results**), add a Query filter → **Custom (regex)** → *Doesn't match regex* with `0xtsoa|zero ?tsoa|harena|ravelomanantsoa`, and track those clicks and impressions every week. Watch topic queries such as:
  - `hyprland dotfiles`
  - `waybar themes`
  - `gtk themes`
  - `linux icon themes`
  - `install dotfiles safely`
- **Brand queries** (`0xtsoa`, `zerotsoa`, `Ny Harena RAVELOMANANTSOA`) are a secondary check that the entity signals in this document are working.
