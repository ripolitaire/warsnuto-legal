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

- `/api/bots.json`: snapshot public statique servi par GitHub Pages.
- `/api/bots.json`: snapshot de secours utilisé si la route dynamique ne répond pas.

Note compteur membres:

- `WARSNUTO_INVITE_CODE`: code d'invitation Discord public, par défaut `warsnuto`.
- `WARSNUTO_GUILD_ID`: ID du serveur WarsNuto.
- `DISCORD_BOT_TOKEN`: token serveur uniquement si tu veux récupérer les compteurs via l'API Discord bot. Ne jamais l'exposer côté client.

## Déploiement Vercel

GitHub Pages sert le contenu depuis la branche `main`, dossier `/`:

- `/`
- `/protect.html`
- `/support.html`
- `/docs.html`
- `/privacy.html`
- `/terms.html`

Après publication, ajoute les liens dans le Discord Developer Portal de chaque application:

- Privacy Policy URL: `https://ripolitaire.github.io/warsnuto-legal/privacy.html`
- Terms of Service URL: `https://ripolitaire.github.io/warsnuto-legal/terms.html`

Ces pages sont informatives et doivent être adaptées si les bots ajoutent de nouvelles collectes de données ou changent de fonctionnement.
