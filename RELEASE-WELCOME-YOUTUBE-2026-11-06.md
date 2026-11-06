# Accueil Protect et vidéos YouTube

## Accueil commun

La rubrique **Accueil des membres** propose désormais les activations MP et salon séparées, le salon d’accueil, trois salons importants facultatifs, le format V2 ou texte, le titre, le message, la couleur et le pied de carte.

Les droits administrateur du bot restent nécessaires et vérifiés dans Discord. Les changements sont appliqués à la configuration existante de Protect ; aucun salon n’est choisi ou activé par la livraison. Le message est commun à tous les membres et n’effectue aucun ping.

## YouTube

Le flux RSS officiel de la chaîne renvoyait HTTP 404, y compris avec le bon identifiant de chaîne. La page publique des vidéos restait disponible.

- Le RSS reste la source principale. Une panne du RSS déclenche la lecture des métadonnées structurées de l’onglet Vidéos de la chaîne officielle.
- Le contenu est traité par un parseur HTML/XML et `JSON.parse`, sans exécuter de script distant. Seuls les identifiants vidéo et les métadonnées publiques de la chaîne attendue sont conservés.
- Les dates relatives réellement affichées par YouTube restent relatives ; aucune date de publication n’est inventée.
- Les réponses valides sont mises en cache, les appels simultanés mutualisés et les derniers résultats conservés au maximum 24 heures en cas de panne. Les échecs sans résultat valide ne sont pas mis en cache CDN pendant trente minutes.
- Les redirections sont limitées aux domaines officiels YouTube ; délais, taille des réponses et fréquence des nouvelles tentatives sont bornés.
- Les titres sont échappés dans le navigateur. L’état indisponible reste honnête si les deux sources échouent.

Aucune clé API ou nouveau secret nécessaire. Tests unitaires RSS, HTML, cache, pannes, redirections et permissions existantes ; tests navigateur du formulaire d’accueil et des vidéos, sur ordinateur et mobile.
