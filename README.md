# Invitation au mariage traditionnel

Site statique prêt à être déployé sur Vercel.

## Personnalisation

- Ouvrez `index.html` et remplacez les **noms**, **date**, **lieu** et liens (RSVP, Google Maps).
- Ajustez les couleurs/typographie dans `styles.css` si besoin.
- Facultatif: générez un lien Google Forms pour le RSVP et remplacez `https://forms.gle/votre-formulaire`.

## Aperçu local

Vous pouvez utiliser n’importe quel serveur statique, par exemple:

```bash
npx serve -l 5173
```

Puis ouvrez `http://localhost:5173`.

## Déploiement gratuit sur Vercel

### Option A — via GitHub
- Créez un dépôt Git avec ces fichiers.
- Sur Vercel, cliquez sur `New Project` puis importez le dépôt.
- Vercel détecte automatiquement un site statique (`index.html`).

### Option B — via Vercel CLI
- Installez la CLI: `npm i -g vercel`
- Dans ce dossier, exécutez `vercel` puis suivez les étapes (project name, scope).
- Pour déployer à nouveau: `vercel --prod`.

## Fichier calendrier

`event.ics` fournit un événement à ajouter au calendrier. Mettez à jour la date/heure selon votre cérémonie.

## Backend (Supabase + fallback SQLite)

Le projet inclut une API RSVP (dossier `server/`). Elle peut utiliser Postgres (Supabase) si `DATABASE_URL` est défini. Sans cette variable, elle bascule en SQLite pour le développement local.

Si votre projet Supabase n’expose pas de “connection string” Postgres, vous pouvez utiliser l’API Supabase via `@supabase/supabase-js` côté serveur (mode REST) avec `SUPABASE_URL` et une clé serveur.

### Démarrer en local (SQLite)
- `cd server`
- `npm install`
- `npm start`
- Optionnel: définir `DB_DIR` ou `DB_PATH` pour choisir l'emplacement du fichier `rsvp.db`.

### Passer à Supabase (Postgres)
- Créez un projet Supabase.
- Récupérez la chaîne de connexion Postgres (format `postgres://user:pass@host:port/dbname`).
- Sur votre service backend (ex: Render), ajoutez la variable d’environnement `DATABASE_URL` avec cette valeur.
- Au démarrage, l’API crée automatiquement les tables `rsvp` et `visits` si elles n’existent pas.

### Passer à Supabase (API REST via supabase-js)
- Dans `Project Settings > API`, récupérez `SUPABASE_URL`.
- Récupérez la clé côté serveur, idéalement `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) ou `SUPABASE_ANON_KEY` si vos policies l’autorisent.
- Sur votre backend (Render), définissez:
  - `SUPABASE_URL=<votre url supabase>`
  - `SUPABASE_SERVICE_ROLE_KEY=<votre clé service role>`
- Créez les tables via le SQL editor Supabase (le mode REST ne crée pas le schéma automatiquement).

### SQL — Création des tables (à exécuter dans Supabase)
```sql
create table if not exists public.rsvp (
  id serial primary key,
  nom text not null,
  prenom text not null,
  contact text not null,
  invitePar text not null,
  presence text not null,
  createdAt timestamptz not null
);

create table if not exists public.visits (
  id serial primary key,
  path text not null,
  ua text not null,
  ts timestamptz not null
);
```

### Tables utilisées
- `rsvp`: `id`, `nom`, `prenom`, `contact`, `invitePar`, `presence`, `createdAt`.
- `visits`: `id`, `path`, `ua`, `ts`.

### Déploiement Render
- Recommandé: utiliser `DATABASE_URL` pour éviter la perte de données liée au disque éphémère.
- Si vous restez en SQLite: ajoutez un disque persistant et définissez `DB_DIR=/data`.
 - Si vous utilisez supabase-js: ajoutez `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.