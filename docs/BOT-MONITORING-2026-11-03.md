# Journal : raccordement de Protect, Game et Support

## Changements

- Suivi individuel des trois bots dans la vue d'ensemble administrative.
- Page `/admin/bots` : connexion Discord, latence, mémoire, serveurs, disponibilité et commandes reçues depuis le démarrage.
- Actualisation automatique et bouton de rafraîchissement, sur ordinateur et mobile.
- États distincts : connecté, déconnecté, signal trop ancien, indisponible ou non configuré.
- Signaux atomiques toutes les 15 secondes ; une mesure de plus de 45 secondes n'est plus considérée en ligne.
- API strictement en lecture et réservée à la permission `admin:read` ; membres et modérateurs ordinaires refusés.
- Aucun token, message, argument de commande, ticket ou donnée de joueur transmis.
- Aucune ouverture de port sur les bots ; backend toujours séparé de leurs bases.

## Livraison et vérifications

- Points d'entrée locaux comparés au VPS avant modification : empreintes identiques pour les trois bots.
- Ajout limité à l'observateur opérationnel, sans changer les règles du jeu, les commandes ou les sanctions.
- Sauvegardes cohérentes des bases et anciens fichiers prévues avant activation.
- Redémarrage séquentiel avec contrôle d'un signal Discord prêt avant le bot suivant.
- Tests : droits d'accès, refus des fichiers invalides et liens symboliques, délai de péremption, cache partagé, confidentialité et résistance à une panne d'écriture.
- Les tests navigateur vérifient la page et ses états sur mobile et ordinateur avec des données simulées.
- Les rapports et sauvegardes de production restent privés, hors Git.

## Périmètre restant

Cette liaison couvre la surveillance. Les profils Game, statistiques XP personnelles,
sanctions Protect, tickets Support et leur administration ne sont pas encore exposés
au site. Aucun droit Discord n'est automatiquement dérivé d'un rôle administratif du site.
Les éventuelles actions futures nécessiteront leurs contrôles propres, leur audit
et une validation explicite ; le connecteur actuel ne les permet pas.

Procédure et variables : [PLATFORM.md](PLATFORM.md#raccordement-de-surveillance-des-bots).
