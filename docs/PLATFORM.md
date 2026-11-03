# Plateforme privée WarsNuto

## Périmètre et état

Le site reste dans `ripolitaire/warsnuto-legal`, dossier local
`WarsNuto Univers/legal-site`. Les changements publics préexistants sont conservés
dans le commit de base `861e1e6`. Ni CRB Corp ni Protect, Game et Support ne sont
modifiés. Le code nécessite encore configuration et recette sur l'hébergement cible.
Sans secrets de liaison, Vercel refuse les espaces privés avec 503 ; le site public
reste disponible. Ne pas configurer les secrets de production dans les previews.

## Architecture

- Dix pages publiques HTML, CSS, animations et trois API publiques conservées.
- `platform.js` : menu utilisateur et interfaces privées ; `platform.css` : thème isolé.
- `server/app.cjs` : routes Express et contrôles HTTP.
- `server/auth.cjs` : OAuth Discord et sessions persistantes.
- `server/permissions.cjs` : plafonds de permissions.
- `server/service.cjs` : comptes, paramètres, actions transactionnelles et audit.
- `server/database.cjs` et `server/migrations/` : base et migrations versionnées.
- `api/platform.js` : passerelle HTTPS Vercel à routes limitées.
- Backend et base SQLite dédiés, sans connexion aux bases des bots ni au Gateway Discord.

Vercel publie seulement les fichiers publics générés dans `dist/`, plus les fonctions
API. SQLite reste sur le disque persistant du VPS. Le backend utilise Node 24 LTS
indépendamment du Node 20 des bots : ne pas changer leur runtime ni leur démon PM2.
Les icônes sont un sous-ensemble Lucide construit localement, sans CDN JavaScript.

## Variables à ajouter après publication du code

Backend uniquement, `.env.web` privé, permissions 600 :

| Variable | Valeur |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_BASE_URL` | `https://warsnuto.com` |
| `DISCORD_OAUTH_CLIENT_ID` | ID de l'application OAuth choisie |
| `DISCORD_OAUTH_CLIENT_SECRET` | Secret OAuth, jamais le token du bot |
| `SESSION_SECRET` | Au moins 32 octets aléatoires encodés en base64url |
| `WEB_ORIGIN_SECRET` | 32 octets aléatoires en hexadécimal, identiques côté Vercel |
| `WEB_REQUIRE_HTTPS_PROXY` | `true` |
| `WEB_DATABASE_PATH` | Base dédiée, par exemple `/opt/warsnuto-web/data/web.sqlite` |
| `WEB_HOST` | `127.0.0.1` |
| `WEB_PORT` | Port local libre, par défaut `3100` |

Sur Vercel, pour Production uniquement :

| Variable | Valeur |
| --- | --- |
| `APP_BASE_URL` | Même origine publique canonique que le backend |
| `WEB_BACKEND_ORIGIN` | Origine HTTPS réelle du backend, sans chemin ni query |
| `WEB_ORIGIN_SECRET` | Même secret de liaison que le backend |

Les secrets OAuth et de session ne sont pas placés dans Vercel ni dans le frontend.
Ne pas utiliser de préfixe public pour des secrets. Générer les valeurs avec
`node:crypto.randomBytes`, jamais avec un exemple du chat. Les fichiers `.env*`
sont ignorés sauf `.env.example`, qui ne contient que les noms et exemples publics.

## Discord OAuth

Dans Developer Portal, application choisie, OAuth2, enregistrer exactement :

`https://warsnuto.com/auth/discord/callback`

Pour le développement, utiliser une application distincte et une URI localhost
exacte : `http://127.0.0.1:3100/auth/discord/callback`, par exemple.

Seul `identify` est demandé, sans email, messages ou installation de bot. Le flux
Authorization Code utilise PKCE S256, un `state` lié au navigateur, à usage unique
et valable dix minutes, et vérifie `iss=https://discord.com`. `oauth4webapi` valide
les réponses. Le vérificateur PKCE temporaire est chiffré AES-256-GCM dans SQLite.
Le token est utilisé pour `/users/@me`, puis sa révocation est tentée. Il n'est
conservé ni en session, ni en base, ni dans le navigateur. La révocation Discord
peut échouer pendant une panne ; le site ne conserve néanmoins pas le token.
Actualiser les informations Discord demande une nouvelle autorisation.

## Sessions et contrôle d'accès

Le cookie contient un identifiant aléatoire signé ; SQLite conserve son SHA-256.
En HTTPS : `__Host-wn_session`, sans Domain, `HttpOnly; Secure; SameSite=Lax; Path=/`.
Le cookie OAuth a les mêmes protections. Les cookies en développement HTTP restent
limités à localhost. L'identifiant est renouvelé à chaque connexion et l'ancienne
session du navigateur est révoquée. Au plus dix sessions sont actives par compte.

Durée absolue : deux heures ; inactivité : trente minutes. Les appels de fond ne
prolongent pas la session. L'activité humaine envoie un POST protégé par origine
et CSRF. La révocation des autres sessions et la déconnexion sont persistantes.
Changer `SESSION_SECRET` invalide les cookies et flux OAuth en cours.

Les rôles sont relus à chaque requête sensible. Changement de rôle, suspension et
réduction de permissions révoquent les sessions concernées. Les actions critiques
exigent une autorisation Discord datant de moins de dix minutes. Cela ne prouve
pas un second facteur récent : activer la 2FA Discord est recommandé. Aucune
authentification WebAuthn/TOTP propre au site n'est implémentée.

| Rôle | Accès par défaut |
| --- | --- |
| USER | Profil, préférences et ses sessions |
| MODERATOR | Compte personnel et espace de modération séparé |
| ADMIN | Vue d'ensemble, comptes, suspension USER/MODERATOR, journal et réglages publics |
| OWNER | Accès ADMIN, équipe, permissions et maintenance |

La liste publique du staff Discord ne donne aucun droit sur le site. Les rôles du
navigateur ne sont jamais une autorité. `user_roles` et `role_permissions` sont la
source fiable ; les plafonds du code interdisent d'étendre ADMIN/MODERATOR aux
fonctions OWNER. Un OWNER peut restreindre leurs permissions, pas modifier les
plafonds OWNER/USER. Aucun compte ne peut modifier son propre rôle ou suspendre
son propre accès. Un ADMIN ne peut pas agir sur un ADMIN/OWNER. Le dernier OWNER
actif ne peut être suspendu ni rétrogradé. Aucune API de suppression n'est exposée.

## Premier OWNER

Sur le backend, contre sa base dédiée et avec un ID Discord vérifié :

```sh
npm run owner -- ID_DISCORD_VERIFIE --confirm
```

Cette opération CLI refuse d'agir si un OWNER existe déjà. Elle peut préparer le
compte avant sa première connexion, sans fabriquer de pseudo, avatar ou date de
connexion. Se connecter ensuite avec le compte Discord correspondant. Les autres
propriétaires sont attribués dans `/admin/users`. Ne pas modifier les tables à la
main pour contourner la hiérarchie. Conserver les accès système de récupération.

## Données et migration

- `users` : ID interne, Discord ID unique, profil public, dates, préférences, statut, version.
- `roles`, `role_permissions`, `user_roles` : rôles et attributions.
- `sessions`, `oauth_states` : connexion, expiration et révocation.
- `audit_logs`, `site_settings` : audit et paramètres publics.
- `rate_limits` : compteurs temporaires, avec empreintes techniques plutôt que cookies/tokens.

Les Snowflakes restent des chaînes. Migration SQL et seed des rôles sont
transactionnels. `user_version=1` et `application_id` identifient la base web : une
base existante d'un autre projet est refusée sans migration ; un schéma plus récent
est aussi refusé. Aucun import des données de jeu, sanctions ou tickets n'est fait.

Les changements de comptes, permissions et réglages utilisent des versions et des
transactions `BEGIN IMMEDIATE`. Les requêtes sont paramétrées. Les métadonnées
d'audit sont limitées aux champs autorisés : acteur, action, cible, date, résultat,
motif ou révision. Aucun secret, token, cookie ou requête OAuth n'est journalisé.

Audit : 180 jours. Métadonnées des sessions révoquées/expirées : sept jours de marge
technique. Les flux OAuth et limites périmés sont nettoyés chaque minute. Les comptes
ne sont pas supprimés par cette maintenance. L'audit des réglages conserve l'acteur,
le nom, la maintenance et la révision, pas les anciennes descriptions complètes.

## Pages et intégrations

- `/profile`, `/profile/settings` : profil, actualisation Discord, préférences et sessions.
- `/admin` : compteurs SQL réels, activité récente et disponibilité backend/base.
- `/admin/users` : liste paginée, recherche, fiche, rôles et actions confirmées.
- `/admin/staff` : équipe privilégiée et permissions ADMIN/MODERATOR.
- `/admin/logs` : filtres par action, acteur, cible et pagination.
- `/admin/settings` : nom, description, annonce ; maintenance réservée OWNER.
- `/admin/moderation` : emplacement protégé, connecteur non activé, aucune sanction inventée.

Les données et la surveillance des trois bots ne sont pas connectées. Les états
éditoriaux historiques du site public ne deviennent pas des tests de santé. Le nom
et la description configurés actualisent la présentation au chargement ; les
métadonnées SEO statiques restent à maintenir séparément. Les annonces sont rendues
comme texte. La maintenance bloque les espaces membres sauf OWNER, pas la vitrine.

## Tests et développement

```sh
npm ci
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Les tests API utilisent des bases temporaires et Discord simulé. Ils ne chargent
pas de `.env` ou de données des bots. Les tests navigateur utilisent un serveur de
fixtures exclu de production et bloquent les ressources externes ; ils ne prouvent
pas une connexion OAuth réelle. Seules les fixtures navigateur réinitialisent les
limites de débit, testées séparément par l'API. Les captures restent dans
`test-results/`, ignoré par Git et Vercel. La CI utilise Node 24 sur Linux.

Pour le vrai développement, créer un nouveau `.env.web` à partir de `.env.example`,
avec un secret local aléatoire et l'application OAuth de développement, puis
`npm run build` et `npm run dev`. Sans OAuth configuré, la vitrine reste accessible
et la connexion est refusée explicitement. Ne jamais utiliser une base de production
pour tester ou lancer un deuxième bot de production.

## Publication et exploitation

1. Vérifier la branche et le dépôt ; lancer les tests et sauvegarder une éventuelle
   base web existante avec `npm run backup:web`.
2. Après autorisation, installer dans un dossier distinct, par exemple
   `/opt/warsnuto-web`, avec un utilisateur sans accès aux bases des bots.
3. Installer Node 24 dans un chemin indépendant. Ne pas remplacer Node système,
   ne pas mettre à jour le démon PM2 ni redémarrer les autres applications.
4. Créer `.env.web` privé, lancer `npm ci` et `npm run build`. Configurer le proxy
   TLS vers `127.0.0.1:3100`, avec certificat valide et remplacement de
   `X-Forwarded-Proto` par `https`. Ne jamais désactiver la validation TLS.
5. Définir `WEB_NODE_BINARY` vers Node 24 lors du chargement de
   `ecosystem.web.config.cjs`, puis démarrer seulement `warsnuto-web`.
6. Enregistrer l'URI Discord, créer le premier OWNER, configurer les variables
   Vercel de Production et réaliser une recette réelle avant l'ouverture.
7. Vérifier cookies, révocation, réponses 401/403, expirations, permissions disque,
   logs et conservation des comptes après redémarrage.

Le reverse proxy ne doit journaliser ni en-têtes/cookies ni query OAuth. Utiliser
un format limité à `$request_method $uri $status`, sans `$request` ni `$args`, avec
une rétention contrôlée. Examiner aussi les logs Vercel. Ne pas exposer le port HTTP
du backend. `WEB_ORIGIN_SECRET` reste serveur-à-serveur. La passerelle n'accepte
aucune destination utilisateur, ne suit pas les redirections et refuse un host
Vercel différent de `APP_BASE_URL`. Les DNS, certificats et liaison HTTPS réels
ne sont pas mis en place par un simple push Git.

`backup:web` utilise l'API SQLite online et vérifie l'intégrité de la copie.
Conserver des sauvegardes externes privées avec une rotation contrôlée. Pour
restaurer : arrêter seulement le backend web, garder la base actuelle et ses WAL,
vérifier la copie et restaurer hors ligne sans mélanger les WAL. Un rollback de code
ne doit jamais écraser des comptes récents.

## Limites

OAuth réel non validé sans secrets et callback configurés. Pas de test d'endurance
ni de charge de 130 000 utilisateurs simultanés. SQLite vise une instance sur disque
local ; son débit doit être mesuré avant montée en charge. Sauvegardes externes,
TLS, isolation système et surveillance demandent une installation explicite.
La politique légale doit être relue par le responsable avant activation ; aucun
engagement de conformité juridique globale n'est déduit des tests techniques.
