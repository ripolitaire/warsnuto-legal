# Espace membre et serveurs WarsNuto

## Parcours

- `/servers` rassemble les serveurs communs avec Protect, Game et Support. Les bots absents ou indisponibles ne sont pas presentes comme connectes.
- `/admin/configuration` commence par le choix d'un serveur. Les reglages existants restent disponibles ensuite, pour ce serveur et uniquement pour les bots que l'utilisateur peut administrer.
- `/profile/game` affiche le personnage normal et, si le joueur y est autorise, son propre profil Admin Mod dans un espace distinct. `/profile` contient aussi un resume Game.

## Droits

Le proprietaire du serveur ou un membre ayant la permission Discord Administrateur peut configurer ses bots. Les roles administrateurs deja configures dans Protect, les gestionnaires Support et les administrateurs Game existants sont egalement reconnus, chacun pour son bot. Un simple role de moderateur n'accorde pas ces droits.

Les roles internes du site restent distincts. Un administrateur Discord ne devient pas administrateur global du site et ne peut pas gerer les comptes, les permissions ou les sessions des autres utilisateurs.

Les permissions sont relues sur Discord pour chaque lecture de configuration et chaque modification. Les confirmations, le motif, la protection CSRF, la connexion recente, le controle de revision et l'audit sont conserves. Le navigateur ne choisit ni l'identite de l'acteur, ni une adresse de bot.

## Donnees Game

Niveau, XP, classe, XP de classe, fruit et maitrise, eveil, equipement, equipage, berrys, prime, energie et inventaire proviennent du bot. La lecture utilise des SELECT limites au joueur connecte et a sa partition. Elle n'appelle pas les fonctions du jeu qui creent un personnage ou regenerent son energie en base.

L'energie affichee tient compte de la regeneration normale sans ecriture. Aucun compte, inventaire ou reglage de jeu n'est cree ou reinitialise lors de la consultation.

L'evolution est un historique d'observations web, pas une reconstitution inventee des anciennes parties. Un point par demi-heure consultee, conservation 30 jours, plafond global 100 000 points ; seuls les 48 derniers points du profil sont renvoyes. Aucun token, message ou argument de commande n'est collecte. Le profil normal et Admin Mod ont des historiques separes.

## Exploitation

Les trois bots communiquent via les sockets Unix prives existants. Aucun nouveau secret ou port public. Les listes sont mutualisees et mises en cache brievement par utilisateur ; les donnees personnelles ne sont jamais partagees entre sessions de joueurs differents. Une panne d'un bot ne masque pas les serveurs des autres.

Nouveau fichier d'integration Game : `utils/webGameProfile.cjs`, copie de `ops/bot-config/webGameProfile.cjs`. Les autres integrations utilisent les fichiers canoniques de ce meme dossier. Toujours sauvegarder les bases avant le remplacement et verifier chaque redemarrage avant de passer au bot suivant.
