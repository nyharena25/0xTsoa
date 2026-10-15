# Contribuer à 0xTsoa

Bienvenue ! 0xTsoa est un registre communautaire open source décentralisé et statique répertoriant des configurations, dotfiles, thèmes et personnalisations Linux.

## Principes fondamentaux
- **Zéro base de données, zéro inscription** : Tout le contenu est versionné dans Git au format JSON standardisé dans le dossier `configs/<auteur>/<slug>.json`.
- **Validation CI stricte** : Chaque proposition fait l'objet de vérifications de sécurité automatisées (schéma Zod, URL de captures autorisées, scripts d'installation vérifiés par hash SHA-256).
- **Reproductibilité** : Les références vers les dépôts externes doivent pointer vers des commits immuables ou des tags de version fixes.

---

## Deux manières de soumettre votre configuration

### Option 1 : Via Pull Request (Recommandée aux développeurs)
1. Forkez le dépôt `0xTsoa`.
2. Créez votre fichier `configs/<votre-user-github>/<slug>.json`.
3. Assurez-vous que le nom du dossier correspond exactement à votre nom d'utilisateur GitHub.
4. Lancez la validation locale :
   ```bash
   npm run validate
   ```
5. Ouvrez une Pull Request vers la branche `main`.

### Option 2 : Via Formulaire GitHub Issue (Sans manipuler de JSON)
1. Rendez-vous sur l'onglet **Issues** du dépôt.
2. Choisissez **Nouvelle configuration Linux (Submission)**.
3. Remplissez les champs (nom, distribution, captures d'écran, repo dotfiles...).
4. Notre GitHub Action analysera automatiquement votre ticket, calculera les condensats de sécurité et ouvrira une PR à votre nom.

---

## Schéma JSON & Spécifications

Le schéma de validation officiel se trouve dans [`schema/config.schema.json`](./schema/config.schema.json).
Pour régénérer le schéma après modification des types TypeScript :
```bash
npm run schema
```

### Règles de sécurité :
1. **Captures d'écran** : Hébergées sur des hôtes autorisés (`raw.githubusercontent.com`, `user-images.githubusercontent.com`, `i.imgur.com`, `i.redd.it`).
2. **Scripts d'installation (.sh)** : Si vous fournissez une commande `curl | bash`, l'URL doit être HTTPS et fixée à un commit SHA ou tag fixe, accompagnée de son condensat `sha256` exact de 64 caractères hexadécimaux.

---

## Développement local

```bash
# Installation des dépendances
npm install

# Lancement du serveur de développement Astro
npm run dev

# Exécution des tests unitaires
npm test

# Validation des configurations
npm run validate

# Build de production statique et index Pagefind
npm run build
```
