# WarsNuto public site

Site public pour présenter les bots Discord WarsNuto, publier les pages légales et exposer une API légère sans donnée sensible.

- `index.html`
- `protect.html`
- `support.html`
- `docs.html`
- `privacy.html`
- `terms.html`
- `api/bots.js`
- `api/bots.json`
- `styles.css`
- `app.js`

Contact officiel: `solitaire.blox@gmail.com`.

## API publique

- `/api/bots`: route dynamique Vercel. Elle essaie de lire le compteur public Discord via l'invite `warsnuto`, puis via `DISCORD_BOT_TOKEN` si la variable existe, puis revient au snapshot.
- `/api/bots.json`: snapshot de secours utilisé si la route dynamique ne répond pas.

Variables Vercel optionnelles:

- `WARSNUTO_INVITE_CODE`: code d'invitation Discord public, par défaut `warsnuto`.
- `WARSNUTO_GUILD_ID`: ID du serveur WarsNuto.
- `DISCORD_BOT_TOKEN`: token serveur uniquement si tu veux récupérer les compteurs via l'API Discord bot. Ne jamais l'exposer côté client.

## Déploiement Vercel

Le fichier `vercel.json` active les URLs propres:

- `/`
- `/protect`
- `/support`
- `/docs`
- `/privacy`
- `/terms`
- `/api/bots`

Après publication, ajoute les liens dans le Discord Developer Portal de chaque application:

- Privacy Policy URL: `https://ton-domaine.vercel.app/privacy`
- Terms of Service URL: `https://ton-domaine.vercel.app/terms`

Ces pages sont informatives et doivent être adaptées si les bots ajoutent de nouvelles collectes de données ou changent de fonctionnement.
