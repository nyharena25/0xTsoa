# 0xTsoa — Registre d'Architecture Linux Desktop

> **Plateforme web communautaire open source (architecture Jamstack / site statique) répertoriant des configurations, designs et personnalisations Linux (dotfiles, thèmes, scripts d'installation).**

---

## ⚡ Caractéristiques clés

- **100% Décentralisé & Sans Base de Données** : Pas de serveur d'authentification, pas de tracking. Les configurations sont de simples fichiers JSON stockés dans `configs/<auteur>/<slug>.json`.
- **Contributions par GitHub** :
  - **Pull Requests** directes avec validation CI automatique.
  - **Formulaires GitHub Issues** convertis automatiquement en Pull Requests par bot GitHub Actions.
- **Sécurité & Intégrité** : Condensats cryptographiques SHA-256 obligatoires sur les scripts d'installation externes, URL épinglées de manière immuable et filtrage des hôtes d'images.
- **Vote & Sign-Off Transparent** : Les votes de la communauté reposent sur les réactions 👍 des GitHub Discussions publiques associées à chaque configuration, synchronisées à chaque build statique.
- **Esthétique Néo-Brutaliste « Paper & Ink »** : Contrastes nets, contours d'encre noire continus, typographies soignées (*Space Grotesk*, *Geist*, *JetBrains Mono*) et réactivité binaire instantanée (0ms).
- **Internationalisation bilingue** : Interface native en Français (par défaut) et en Anglais.

---

## 🛠️ Stack Technique

- **Générateur statique** : [Astro 5+](https://astro.build/) avec TypeScript strict.
- **Styles & Design System** : [Tailwind CSS v4](https://tailwindcss.com/) avec les design tokens Paper & Ink.
- **Validation des données** : [Zod](https://zod.dev/) et JSON Schema officiel ([`schema/config.schema.json`](./schema/config.schema.json)).
- **Moteur de recherche** : [Pagefind](https://pagefind.app/) statique et filtres client en TypeScript pur.
- **Hébergement & CI/CD** : GitHub Pages & GitHub Actions.

---

## 🚀 Démarrage Rapide

```bash
# 1. Cloner le projet
git clone https://github.com/nyharena25/0xtsoa.git
cd 0xtsoa

# 2. Installer les dépendances
npm install

# 3. Lancer en local
npm run dev

# 4. Valider les configurations
npm run validate

# 5. Compiler le site statique
npm run build
```

---

## 📂 Structure du Répertoire

```text
0xTsoa/
├── configs/                      # Configurations des contributeurs (CC-BY-4.0)
│   └── <github-user>/<slug>.json
├── featured.json                 # Configurations épinglées pour le Top 5
├── schema/config.schema.json     # Schéma JSON officiel pour autocomplétion
├── scripts/
│   ├── validate-configs.ts       # Validation CI (schémas, hash, réseau)
│   ├── ensure-discussions.ts     # Initialisation des discussions GitHub
│   ├── fetch-votes.ts            # Récupération des réactions 👍 via GraphQL
│   └── issue-to-config.ts        # Conversion Issue Form -> JSON
├── src/
│   ├── content.config.ts         # Collection de contenu Astro
│   ├── lib/                      # Utilitaires (schémas, votes, filtres, readme)
│   ├── components/               # Composants UI Néo-brutalistes
│   ├── layouts/Base.astro        # Layout racine avec SEO et styles
│   └── pages/                    # Vitrine, catalogue, fiches et miroir i18n
├── tests/                        # Tests unitaires Vitest
└── .github/                      # Workflows CI/CD et templates d'issues
```

---

## 📄 Licences

- **Code source de la plateforme** : [MIT License](./LICENSE)
- **Données et configurations (`configs/`)** : [Creative Commons Attribution 4.0 International (CC BY 4.0)](./configs/LICENSE)
- *Chaque configuration conserve la licence logicielle spécifique de ses dotfiles d'origine.*
