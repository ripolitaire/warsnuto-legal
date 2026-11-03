# Configuration des bots depuis le site

## Accès

Page : `https://warsnuto.com/admin/configuration`.
Choisir le bot, un serveur Discord accessible et la rubrique de configuration.
Les changements sont appliqués dans le bot concerné après confirmation et motif,
puis les valeurs réellement enregistrées sont relues. Aucun redémarrage n'est
nécessaire pour modifier ces réglages.

Soli, premier OWNER, reçoit la permission `bots:configure`. Les autres
administrateurs du site ne la reçoivent pas automatiquement : un OWNER peut
l'attribuer au rôle ADMIN dans « Équipe et permissions ». Les permissions
personnelles sont relues à chaque requête. USER et MODERATOR ne peuvent pas
recevoir cette permission.

Le compte doit aussi posséder **Administrateur sur le serveur Discord choisi**, ou
en être le propriétaire. Le bot vérifie cette permission directement auprès de
Discord, y compris juste avant une écriture. Le rôle OWNER du site ne contourne
pas les autorisations Discord. Une connexion Discord au site datant de moins de
dix minutes est nécessaire pour enregistrer ; sinon, confirmer à nouveau avec
Discord depuis le lien affiché.

## Réglages disponibles

Protect : équipes et accès, validation des sanctions, salons et journaux,
anti-double-compte, présentation, exclusions de classement, XP écrit/vocal,
formule de niveaux, annonces, caisses, rôles et bonus XP, logs XP, AutoMod,
attribution automatique des rôles et MP de bienvenue.

Game : activation du jeu, salons, rôles de l'équipe, multiplicateurs de gains,
XP, rareté et dégâts de boss, notes boutique/saison, boss automatiques,
événements, Halloween et rôles de progression/notifications. Les clés internes,
les migrations et les paramètres volontairement figés dans le jeu ne sont pas
présentés comme des options modifiables.

Support : catégorie et salons, équipes et gestionnaires, présentation du panneau,
fonctionnement des tickets et types de demandes avec leurs équipes dédiées.
Les modifications de présentation et de types actualisent un panneau Discord
existant. Sa publication initiale reste dans Discord ; le site ne crée pas de
messages publics silencieusement.

Les salons et rôles sont sélectionnés par leur nom. Les références sont vérifiées
dans le serveur, jamais acceptées depuis un autre serveur. Les rôles attribués
automatiquement doivent être sous le bot et ne peuvent pas donner des permissions
de modération ou d'administration.

## Liaison privée

Chaque bot charge un observateur de configuration distinct de la surveillance :

```js
void require('./utils/webDashboard.cjs').startBotDashboard(client, 'protect', __dirname);
```

Le second argument est `game` ou `support` dans les autres bots.
Les fichiers canoniques sont dans `ops/bot-config/` ; les fichiers installés sont
`utils/webDashboard.cjs`, `utils/webDashboardSchema.cjs` et
`utils/webDashboardAdapter.cjs` (adaptateur propre au bot).

Variable non secrète côté bots :

```text
WARSNUTO_DASHBOARD_DIRECTORY=/run/warsnuto-bot-config
```

Variable non secrète côté backend web uniquement :

```text
WEB_BOT_SOCKET_DIRECTORY=/run/warsnuto-bot-config
```

Le répertoire est créé par `ops/warsnuto-bot-config.conf` via systemd-tmpfiles,
en `root:warsnutoweb`, mode 2750. Les trois sockets Unix sont en 660. Aucun port
HTTP public n'est ouvert sur les bots et aucun token de bot n'est ajouté à Vercel.
L'identité de l'acteur est imposée par la session du backend, pas par le navigateur.
Le backend reste interdit d'accès aux répertoires et bases des bots.

## Contrôles

La permission du site, CSRF, l'origine et la fraîcheur de connexion sont contrôlés
avant d'appeler un bot. Chaque bot expose seulement ses rubriques et champs
autorisés ; impossible de lire une variable d'environnement, exécuter une commande
système ou envoyer une requête à une URL choisie par le navigateur.

Une empreinte des valeurs protège contre les écrasements : si les réglages ont
changé dans Discord ou une autre session, l'enregistrement est refusé en 409.
Les écritures sont sérialisées par serveur, les limites numériques et les
relations minimum/maximum sont contrôlées. Les sauvegardes utilisent les méthodes
des bots pour conserver leurs caches et leurs données existantes.

Le journal du site conserve demande, succès, refus ou résultat incertain avec
acteur, bot, serveur, rubrique, noms des champs et identifiant d'opération ; il ne
copie ni secrets ni valeurs de configuration. Le bot conserve également une trace
locale. Si le délai de réponse expire, aucune réussite n'est inventée et aucune
nouvelle tentative d'écriture n'est lancée automatiquement : actualiser pour
vérifier les valeurs présentes.

Cette livraison n'ajoute pas de bannissement, give, reset de comptes ou traitement
de tickets depuis le site. Ce sont des actions distinctes des réglages ; elles
restent dans Discord. Les commandes slash existantes sont conservées.
