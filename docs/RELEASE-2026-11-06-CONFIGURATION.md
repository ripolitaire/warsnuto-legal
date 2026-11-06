# Correctifs de configuration et d’accueil — 6 novembre 2026

## Site

- Les sélecteurs de salons ne créent plus de référence vide « Introuvable » et ne retirent plus la sélection lorsqu’on choisit à nouveau le même salon.
- Les menus restent dans la zone visible, passent au-dessus des autres contrôles et proposent une recherche sans distinction d’accents et une navigation clavier.
- Les rubriques sont regroupées et recherchables ; le module choisi est conservé lors du retour sur un bot.
- L’accueil est organisé en quatre groupes : diffusion, salons importants, message et apparence. Une activation publique sans salon est refusée avant l’envoi.
- Après reconnexion, le serveur, le bot et la rubrique sont conservés dans un lien de retour strictement validé.
- Les routes Vercel des pages privées sont explicites : une capture de route ne peut plus écraser le paramètre de la rubrique sélectionnée.
- Une réponse privée arrivée après expiration ne peut plus remplacer l’écran de reconnexion. Le nom du compte et l’indicateur de session active sont retirés.
- La limite de dix sessions conserve toujours la nouvelle connexion, y compris lorsque plusieurs connexions ont exactement le même horodatage.
- Une erreur d’actualisation des serveurs ne laisse plus le bouton désactivé lorsqu’on clique sur son icône.

## Protect

- La bienvenue reste en Components V2 avec l’emoji du pack dans le titre et montre maintenant la photo du membre en miniature.
- Quatre repères configurables : vérification, règlement, annonces et discussion. Les réglages sont disponibles sur Discord et sur le site.
- Un salon choisi par un administrateur peut figurer dans les repères même s’il nécessite la vérification. Les permissions Discord restent inchangées ; aucun contenu du salon n’est publié.
- Le texte reste commun à tous les membres, les mentions ne déclenchent pas de notification, et les activations MP et salon restent indépendantes.

## Vérification Et Livraison

Les tests utilisent des comptes et bases isolés : sélection vide, sauvegarde, permissions, expiration, reconnexion, conflits de révision et affichage ordinateur/mobile. Le déploiement conserve les secrets, les données et les réglages personnalisés. Aucun envoi public de bienvenue n’est déclenché par les tests. Game et Support ne sont pas modifiés.
