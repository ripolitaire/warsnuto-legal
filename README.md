# WarsNuto public site

Site public des bots Discord WarsNuto. Il présente Protect et Support, héberge les pages légales, et expose seulement des données publiques.

## Pages

- `/`
- `/bots`
- `/docs`
- `/privacy`
- `/terms`

## API

- `GET /api/bots`: données publiques du site et compteurs publics Discord via l'invitation du serveur.
- `GET /api/visits`: statistiques Vercel Web Analytics. Cette route doit être protégée avec `SITE_STATS_API_KEY`.

Le site ne doit jamais contenir le token Discord du bot. Les routes publiques ne pilotent aucune commande Discord et ne donnent pas accès à la base du bot.

## Chargement Discord

La page affiche d'abord les données locales ou un cache navigateur de 30 secondes maximum, sans attendre le scan des membres. Les compteurs (`/api/bots?live=1&staff=0`), les couleurs (`?roles=1`) et la hiérarchie (`?live=1`) sont ensuite chargés séparément. Les compteurs ne lisent ni les rôles ni la liste des membres.

Les compteurs s'actualisent toutes les 30 secondes, les rôles et le staff toutes les 60 secondes, et au retour dans l'onglet. Une requête déjà en cours est partagée, pas relancée. Une réponse de snapshot ou un scan lent ne peut pas écraser des compteurs Discord plus récents. Les fiches bots ne bloquent plus sur un widget Discord supplémentaire.

Le scan complet reste soumis aux délais et limites Discord. Ses quatre plages d'identifiants couvrent tous les membres, mais seuls les comptes ayant un rôle staff sont conservés en mémoire. Le compte CRB `974031935510818866` est exclu explicitement de la hiérarchie ; WarsNuto est identifié par `689040179943702547`. Aucun rôle ni compte Discord n'est modifié.

Tests : `node --test scripts/test-site-staff.js scripts/test-site-refresh.js scripts/test-economy-removal.js`.

## Variables Vercel

- `WARSNUTO_INVITE_CODE`: code d'invitation Discord public, par défaut `warsnuto`.
- `VERCEL_ANALYTICS_TOKEN`: token Vercel pour lire Web Analytics côté serveur.
- `VERCEL_ANALYTICS_PROJECT_ID`: ID du projet Vercel.
- `VERCEL_ANALYTICS_TEAM_ID`: ID de l'équipe Vercel si le projet est dans une équipe.
- `VERCEL_ANALYTICS_TEAM_SLUG`: slug de l'équipe Vercel si nécessaire.
- `SITE_STATS_API_KEY`: clé privée partagée avec le bot pour `/site-stats`.

## Liens Developer Portal

- Privacy Policy URL: `https://warsnuto.com/privacy`
- Terms of Service URL: `https://warsnuto.com/terms`

Ces pages doivent être mises à jour si les bots ajoutent de nouvelles données collectées ou changent de fonctionnement.

