# Acces Protect et charte commune

## Hierarchie reconnue

Le site reprend `getMemberAccessLevel` et `canUseCommand` du bot Protect, pas une copie des permissions maintenue a part.

| Niveau | Grade Protect | Acces du site |
| --- | --- | --- |
| 0 | Membre | Espace personnel |
| 1 | Moderateur test | Espace de moderation du serveur |
| 2 | Moderateur ou moderateur confirme | Espace de moderation du serveur |
| 3 | Responsable moderation | Espace de moderation du serveur |
| 4 | Administrateur Protect / administrateur Discord / proprietaire | Moderation et configuration des bots autorises |

Les commandes Discord affichees sont celles autorisees par le bot pour ce membre. Par exemple, les permissions de gestion de roles et de bannissement ne sont pas attribuees au grade test par une simple comparaison approximative.

Le role interne du compte web n'est pas promu : un moderateur Discord ne recoit ni la gestion des comptes web, ni celle des permissions du site. Les grades sont limites a leur serveur. Ils sont visibles dans Mes serveurs, Mon espace et Moderation.

La consultation des droits de moderation reverifie le membre dans Discord, sans reutiliser une ancienne attribution de session. Le cache de navigation est court et n'autorise aucune donnee ni action. Une panne Protect masque ces droits sans empecher la connexion personnelle.

Les sanctions et leurs dossiers restent dans Discord. Cette livraison ne cree pas de nouvelle route web de sanction.

## Style

`theme.css` fournit les couleurs, la police et les formes de controles communes au site public et au panel. Le fond noir, les accents dores et les boutons reprennent la charte du site, sans importer les animations de la vitrine dans les formulaires.

## Deploiement

Integration Protect : `webDashboard.cjs`, adaptateur `webDashboardAdapter.cjs` et nouveau `webProtectAccess.cjs`. Aucun changement du moteur de permissions du bot, des identifiants de roles, des secrets ou des donnees de jeu.

Seul Protect doit redemarrer pour charger ces fonctions. Les integrations Game et Support restent compatibles avec le protocole existant et ne necessitent pas de redemarrage.
