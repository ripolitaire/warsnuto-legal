# WarsNuto legal site

Mini-site statique pour publier les pages légales et la documentation publique des bots Discord:

- `index.html`
- `docs.html`
- `privacy.html`
- `terms.html`
- `api/bots.json`
- `styles.css`
- `app.js`

Contact officiel utilisé dans les pages: `solitaire.blox@gmail.com`.

## Déploiement Vercel conseillé

Le repo peut être importé sur Vercel depuis GitHub. Le fichier `vercel.json` active les URLs propres:

- `/`
- `/docs`
- `/privacy`
- `/terms`
- `/api/bots.json`

Après publication, ajoute les liens dans le Discord Developer Portal de chaque application:

- Privacy Policy URL: `https://ton-domaine.vercel.app/privacy`
- Terms of Service URL: `https://ton-domaine.vercel.app/terms`

Ces pages sont informatives et doivent être adaptées si les bots ajoutent de nouvelles collectes de données ou changent de fonctionnement.
