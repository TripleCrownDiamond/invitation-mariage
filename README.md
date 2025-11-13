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