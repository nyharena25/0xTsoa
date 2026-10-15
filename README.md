
<div align="center">

  <a href="https://nyharena25.github.io/0xtsoa">
    <img src=".github/assets/logo.png" alt="0xTsoa Linux Registry Logo" width="480" />
  </a>

  <h3>LINUX DESKTOP ARCHITECTURE MADE SIMPLE.</h3>

  <p>
    An open-source, zero-database community registry for reproducible Linux desktop environments, dotfiles, and window manager architectures (Wayland & X11).
  </p>

  <p>
    <!-- Live Platform Link -->
    <a href="https://nyharena25.github.io/0xtsoa">
      <img src="https://img.shields.io/badge/LIVE_PLATFORM-nyharena25.github.io%2F0xtsoa-86dbce?style=for-the-badge&logo=googlechrome&logoColor=1E202B&labelColor=1E202B" alt="Live Platform" />
    </a>
    <!-- Dynamic Last Commit Badge -->
    <a href="https://github.com/nyharena25/0xtsoa/commits/main">
      <img src="https://img.shields.io/github/last-commit/nyharena25/0xtsoa?style=for-the-badge&color=8ad7eb&logo=git&logoColor=D9E0EE&labelColor=1E202B" alt="Last Commit" />
    </a>
    <!-- GitHub Stars Badge -->
    <a href="https://github.com/nyharena25/0xtsoa/stargazers">
      <img src="https://img.shields.io/github/stars/nyharena25/0xtsoa?style=for-the-badge&logo=github&color=86dbd7&logoColor=D9E0EE&labelColor=1E202B" alt="Stars" />
    </a>
    <!-- Dynamic JSON Indexed Configs Badge -->
    <a href="https://nyharena25.github.io/0xtsoa/index.json">
      <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fnyharena25.github.io%2F0xtsoa%2Findex.json&query=%24.length&label=CONFIGS%20INDEXED&style=for-the-badge&color=86dbce&logo=linux&logoColor=D9E0EE&labelColor=1E202B" alt="Dynamic JSON Configs Badge" />
    </a>
    <!-- License Badge -->
    <a href="./LICENSE">
      <img src="https://img.shields.io/github/license/nyharena25/0xtsoa?style=for-the-badge&color=8ad7eb&labelColor=1E202B" alt="License" />
    </a>
  </p>

  <p>
    <a href="https://nyharena25.github.io/0xtsoa/"><b>Explore Platform ↗</b></a> •
    <a href="https://nyharena25.github.io/0xtsoa/catalogue"><b>Browse Catalogue</b></a> •
    <a href="#-interactive-showcase--preview"><b>Visual Showcase</b></a> •
    <a href="#-core-architecture"><b>Architecture</b></a> •
    <a href="#-quick-start"><b>Quick Start</b></a> •
    <a href="./CONTRIBUTING.md"><b>Submit a Setup</b></a>
  </p>

</div>

---

## ⚡ Key Highlights

- **100% Serverless & Decentralized**: No database, no backend session servers, no telemetry. Every desktop environment specification lives in an audit-ready, typed JSON file inside `configs/<author>/<slug>.json`.
- **Cryptographically Verified Deployments**: Strict SHA-256 integrity checksums for external install scripts, pinned Git commit hashes, and host-whitelisted screenshot assets.
- **GitHub Issues Sign-Off Engine**: Each config gets one `vote` issue; community approval is the 👍 ❤️ 🎉 reactions on it, compiled into static snapshots at build time.
- **Live Markdown Synchronizer**: Automatically fetches and rewrites author dotfile READMEs, translating volatile GitHub user attachment URLs into permanent assets and resolving relative path hierarchies.
- **Neo-Brutalist « Paper & Ink » Design**: High-contrast, accessibility-focused UI built with *Space Grotesk*, *Geist*, *JetBrains Mono*, and authentic *BD Brick* glyph typography.
- **Full Offline Client Search**: Instant sub-millisecond local filtering across window managers, idle memory footprints (<300 MiB), battery profiles, and aesthetic styles powered by Pagefind.

---

## 📸 Interactive Showcase & Preview

<div align="center">

### 01. Landing & Brutalist Identity
<p>Modern hero section with instant search query parsing and live system status indicators.</p>
<img src=".github/assets/01-hero-landing.png" alt="0xTsoa Landing Page" width="100%" />

<br/><br/>

### 02. Spotlight Interactive Showcase
<p>Integrated desktop preview cycle, hardware resource telemetry (RAM idle / Fastfetch), and one-click shell install.</p>
<img src=".github/assets/02-spotlight-showcase.png" alt="0xTsoa Spotlight Showcase" width="100%" />

<br/><br/>

### 03. Faceted Filter Engine & Registry Catalogue
<p>Multi-attribute search filtering by Compositor (Hyprland, Niri, Sway, BSPWM, i3), style palettes, and distribution compatibility.</p>
<img src=".github/assets/03-catalogue-filters.png" alt="0xTsoa Catalogue and Filters" width="100%" />

<br/><br/>

### 04. Standardized Architecture Specifications
<p>In-depth technical profiling: component breakdowns, daemon footprints, and system service requirements.</p>
<img src=".github/assets/04-architecture-spec.png" alt="0xTsoa Architecture Specification" width="100%" />

<br/><br/>

### 05. Verifiable 1-Click Deployment Protocol
<p>Step-by-step accordion execution commands, raw shell script downloads, and checksum verification.</p>
<img src=".github/assets/05-install-protocol.png" alt="0xTsoa Deployment Protocol" width="100%" />

</div>

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Static Site Engine** | [Astro 5+](https://astro.build/) | Ultra-fast content-driven static generation with zero JS by default |
| **Styling & System** | [Tailwind CSS v4](https://tailwindcss.com/) | Custom Paper & Ink design tokens, accessible color contrasts (WCAG AAA) |
| **Schema & Validation** | [Zod](https://zod.dev/) & [JSON Schema](https://json-schema.org/) | Strict schema validation (`schema/config.schema.json`) for CI pipelines |
| **Search Engine** | [Pagefind](https://pagefind.app/) | Zero-infrastructure static indexer for sub-millisecond full-text lookups |
| **Markdown Engine** | [Marked](https://marked.js.org/) + [Sanitize-HTML](https://github.com/apostrophecms/sanitize-html) | Safe GitHub-flavored markdown parsing, alert containers, and URL rewriting |
| **Automation & CI/CD** | [GitHub Actions](https://github.com/features/actions) | Automatic issue-to-config conversion, vote-issue creation, and Pages deploy |

---

## 🚀 Quick Start

### Prerequisites
- Node.js `20.x` or higher
- `npm` or `pnpm`

### Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/nyharena25/0xtsoa.git
cd 0xtsoa

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Validate configuration files against JSON schema
npm run validate

# 5. Execute test suite
npm test

# 6. Build production static bundle and search index
npm run build
```

---

## 📂 Repository Structure

```text
0xTsoa/
├── .github/
│   ├── assets/                   # High-resolution screenshots, banners, and logos
│   ├── workflows/                # CI verification, issue bot, and GitHub Pages deploy
│   └── ISSUE_TEMPLATE/           # User configuration submission forms
├── configs/                      # Community configuration registry
│   ├── <author>/                 # Grouped by GitHub author namespace
│   │   └── <slug>.json           # Validated configuration specification
│   └── LICENSE                   # CC-BY-4.0 license governing specifications
├── public/                       # Static public assets, fonts (BD Brick), and icons
├── schema/
│   └── config.schema.json        # Official JSON schema specification
├── scripts/
│   ├── validate-configs.ts       # CI sanity & schema validation runner
│   ├── seed-real-configs.ts      # Real-world initial reference configs
│   ├── fetch-votes.ts            # Vote-issue reaction counter (works without a token)
│   └── issue-to-config.ts        # Automated Issue Form -> Config JSON converter
├── src/
│   ├── components/               # Accessible Neo-brutalist UI components
│   ├── layouts/                  # Base document layout & SEO headers
│   ├── lib/                      # URL rewriting, schema validators, vote parser
│   └── pages/                    # Astro routes (catalogue, config specs, index.json)
├── tests/                        # Vitest unit test suites
└── site.config.ts                # Central domain, path, and deployment config
```

---

## 🤝 Community & Contributing

We welcome community submissions of well-crafted, minimal, and reproducible Linux configurations.

- **Fast Track (No Git Required)**: Open a [New Configuration Issue Form](https://github.com/nyharena25/0xtsoa/issues/new?template=new-config.yml). Our automated GitHub Actions bot validates your submission and opens a Pull Request automatically.
- **Direct Pull Request**: Create `configs/<your-username>/<your-setup>.json` following [`schema/config.schema.json`](./schema/config.schema.json).

Read our full [Contribution Guidelines](./CONTRIBUTING.md) for field definitions, screenshot criteria, and security rules.

---

## 📄 License & Attribution

- **Platform Source Code**: [MIT License](./LICENSE) © 2026 0xTsoa Contributors.
- **Configuration Registry Data (`configs/`)**: [Creative Commons Attribution 4.0 International (CC BY 4.0)](./configs/LICENSE).
- *Each curated dotfiles configuration retains the original license specified by its upstream author.*