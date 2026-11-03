# Livraison : dashboard de configuration des bots

- Nouvelle page `/admin/configuration`, séparée de la surveillance.
- Sélection du bot, du serveur accessible et de la rubrique ; 28 rubriques réelles au total.
- Protect : 14 rubriques, dont XP, AutoMod, journaux, équipes, anti-double-compte, rôles et bienvenue.
- Game : 9 rubriques, dont activation, salons, accès, équilibrage, événements et rôles de progression.
- Support : 5 rubriques, dont équipes, salons, types de tickets, présentation et fonctionnement.
- Enregistrement dans les réglages existants du bot, relecture des valeurs et actualisation des caches internes.
- Permission `bots:configure`, accordée initialement aux OWNER uniquement ; délégation ADMIN possible.
- Vérification indépendante de la permission Administrateur Discord et confirmation de connexion récente avant écriture.
- Validation des valeurs, salons et rôles ; protection contre les modifications concurrentes.
- Journal des demandes et résultats sans copie des valeurs ; résultat incertain signalé en cas de délai dépassé.
- Connexions Unix privées : aucun port public ni token supplémentaire pour le site.
- Les trois bots ont été redémarrés séquentiellement et se sont reconnectés.
- Les 28 rubriques ont été lues sur les vrais bots ; Game et Support ont aussi validé un enregistrement sans changement de valeur sur un serveur de test.
- Les quatre bases ont des sauvegardes cohérentes et compressées, intégrité vérifiée ; aucune réinitialisation.
- Tests API et transport Unix sur Linux, formulaires et enregistrement sur ordinateur et mobile.
- Les commandes slash, sanctions, tickets et progressions des membres sont conservés.

La première publication du panneau de tickets, les sanctions et les commandes de
jeu restent dans Discord. Les réglages de panneaux Support existants sont
actualisés depuis le dashboard. Aucun changement de paramètres de production
n'a été effectué à la place de l'administrateur pendant la vérification.

Voir [BOT-CONFIGURATION.md](BOT-CONFIGURATION.md) pour les droits et l'exploitation.
