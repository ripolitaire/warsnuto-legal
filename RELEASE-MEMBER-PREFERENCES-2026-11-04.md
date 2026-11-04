# XP Protect et préférences de l’espace membre

## Progression Protect

- Nouvelle rubrique **Mon XP Protect** et aperçu dans **Mon espace**, séparés de Game et des grades de modération.
- Niveau, XP du palier, XP totale, progression et dates des derniers gains par message ou en vocal.
- Sélection du serveur commun ; aucune consultation d’un autre joueur à partir d’un ID fourni au navigateur.
- Lecture du cache vivant de Protect, incluant l’XP en attente de sauvegarde. Le calcul utilise `getLevelStateFromTotalXp` avec la configuration réelle du serveur.
- Les profils spéciaux et le niveau maximum sont conservés. Un membre sans XP ne reçoit pas un compte ou un niveau inventé.
- Aucune modification des niveaux, sanctions, permissions ou classements. Aucun rôle de modération n’est nécessaire pour consulter sa propre XP.

## Préférences

- Thème sombre, clair ou suivant le système, commun au site public et au panel.
- Densité confortable ou compacte dans l’espace connecté.
- Réduction des animations, rafraîchissement automatique des statistiques, bannière Discord et masquage visuel des soldes Game.
- Aperçu du thème avant enregistrement, annulation et conservation sur le compte. Les anciens comptes héritent des valeurs par défaut sans migration destructive.
- Le masquage des soldes est un confort d’affichage, pas une suppression des données ni une protection contre leur consultation par le titulaire.
- Seuls le thème, la densité et la réduction des animations sont conservés en cache local pour le site public. Aucune identité, statistique ou session dans ce cache.
- Désactiver les actualisations statistiques ne désactive ni les vérifications de session, ni les délais d’expiration, ni l’actualisation manuelle.

## Sécurité et livraison

Les préférences sont validées par liste blanche et enregistrées pour le compte connecté avec les contrôles CSRF existants. La nouvelle API Protect conserve la vérification de membre effectuée dans le bot. Une panne ou un retrait du serveur efface l’ancienne progression affichée.

Seuls l’adaptateur Protect et le nouveau fichier `webProtectProfile.cjs` doivent être chargés dans Protect. Aucun changement du moteur XP, de la base du bot ou des secrets. Game et Support ne nécessitent pas de redémarrage.

Contrôles : tests serveur et navigateur ordinateur/mobile, thèmes clair/sombre/système, préférences persistantes, retour arrière de l’aperçu, API limitée au membre connecté et maintien des vérifications de session sans actualisation statistique.
