# Prisons et YouTube dans le panel WarsNuto

Extension locale du 7 novembre 2026, à livrer avec les nouveaux services du dépôt Protect. Aucun changement en production pendant cette mission.

## Accès et configuration

Mes serveurs, choix du serveur, WarsNuto Protect, puis Prisons ou YouTube. Les réglages utilisent la même configuration SQLite que le dashboard Discord. Les deux modules sont désactivés par défaut.

Les administrateurs configurent les modules. Les Admins et R Modo autorisés par ID gèrent les prisons via `/admin/prisons?guild=ID`. Un grade de modérateur ordinaire ou un rôle d'administrateur du site seul ne suffit pas. Le R Modo confirmé de WarsNuto UNIVERS est `1498292470117830816` ; sa valeur initiale est limitée à ce serveur et peut être révoquée dans Protect.

La page Prisons propose groupes de membres par IDs Discord, dossiers actifs, rôles sauvegardés, exclusions, historique et décisions individuelles. Chaque mutation exige motif, confirmation et connexion Discord récente. Le bot exécute l'opération après une nouvelle vérification du membre staff, sans se fier aux droits affichés dans le navigateur.

L'identifiant d'opération permet de retrouver le résultat après rechargement. « À vérifier » n'est pas un échec garanti de Discord : consulter le dossier et utiliser Réparer ou Constater un bannissement, sans relancer une sanction à l'aveugle. Une libération ne restaure pas les rôles dérankés, supprimés ou devenus plus privilégiés.
Le classement d'une vérification incertaine exige une décision explicite et n'est accepté que sans ban ou timeout actif. Il ne transforme jamais le résultat d'origine en sanction prouvée. Une ancienne réponse réseau ne peut plus remplacer le dossier ou le suivi de l'opération suivante ; les erreurs 503 conservent un résultat d'audit incertain.

YouTube sépare vidéos, Shorts, lives et diffusions programmées. Les salons et mentions sont indépendants ; aperçus et tests n'envoient aucun ping. L'état présente chaîne résolue, clé présente/manquante, publications, envois, erreurs et opérations récentes. La réconciliation exige la référence d'une annonce incertaine et l'ID du message réellement envoyé par Protect.

## Liaison privée

API web : `/api/platform/admin/features/:guild/prison` ou `youtube`, détails de dossier et résultats `/job/:uuid`. L'identité provient uniquement de la session serveur. Les mutations sont protégées par CSRF, origine, fraîcheur de connexion, liste fermée de champs et limites de requête.

Le backend appelle uniquement la socket Protect, route `/features/:guild/:module`. L'adaptateur canonique `ops/bot-config/protect.cjs` délègue aux services du bot. Aucun accès direct à sa base, aucune commande système ni URL arbitraire n'est accepté.

La nouvelle clé `YOUTUBE_API_KEY` appartient uniquement à l'environnement **Protect**, jamais à Vercel, `.env.web` ou un formulaire. Les variables de liaison existantes et les sessions ne changent pas. La présence de la clé est affichée, sa valeur n'est jamais transmise.

Avant livraison, installer ensemble les services Protect et les adaptateurs canoniques du site ; conserver le bootstrap de socket existant. Ne pas écraser les copies locales ou les modifications précédentes de démarrage sans revue. La recette Linux/socket et Discord réelle reste à effectuer sur un environnement de test autorisé.

## Fichiers et vérification

Frontend : `feature-dashboard.js`, intégration `bot-configuration.js`, `platform.js`, `platform.css`, icônes Lucide existantes. Backend : routes Express/proxy Vercel, navigation, permissions de session et broker de configuration.

`tests/feature-schema.json` est une fixture des champs canoniques du bot, pas une deuxième configuration de production. Le runner Protect compare ce contrat quand le checkout du site est disponible.

```text
npm test
npm run check
npm run build
npm run test:browser
```

Les tests couvrent authentification, refus des grades insuffisants, dégradation immédiate des droits, acteur imposé par la session, CSRF, confirmations, affichage ordinateur/mobile et parcours de configuration. Les fixtures n'utilisent ni données de production ni vrai token.

Les règles de rôles, schéma SQLite, limites Discord/YouTube et procédures de reprise sont documentés dans `docs/PRISON-YOUTUBE.md` du dépôt Protect ; l'audit source CRB MOD est dans `docs/PRISON-YOUTUBE-AUDIT.md` de ce même dépôt. La présente documentation décrit uniquement la partie web pour éviter de dupliquer ces procédures.
