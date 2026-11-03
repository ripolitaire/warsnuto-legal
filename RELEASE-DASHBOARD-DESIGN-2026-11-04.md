# Refonte visuelle des espaces WarsNuto

## Configuration

- Onglets Protect, Game et Support avec les visuels existants des bots.
- Serveur actif visible dans le contexte de configuration.
- Navigation des rubriques sur ordinateur, menu compact sur mobile.
- Menus de roles et de salons avec recherche, selections lisibles, suppression individuelle et fermeture au clavier ou au clic exterieur.
- Limites de selection et champs obligatoires conserves ; memes valeurs et memes routes d'enregistrement.
- Interrupteurs, espacements, contrastes, icones, navigation et hierarchie typographique harmonises.
- La confirmation et le motif, le controle de revision, les droits Discord, la protection CSRF et la connexion recente restent inchanges.

## Moderation

La page remplace le grand bloc vide par un choix de serveur et des raccourcis vers les rubriques Protect reellement disponibles : securite, equipes et journaux. Une indisponibilite efface les anciens liens et propose une actualisation.

Le site ne pretend pas afficher les dossiers de sanctions : leur historique et les actions restent dans Discord. Aucune nouvelle route de sanction ou permission n'a ete ajoutee.

## Verification

Tests navigateur sur ordinateur et mobile : navigation, recherche et retrait de roles, enregistrement puis rechargement, menus de salons, annulation des modifications, changement de rubrique et de bot au clavier, etat de panne, liens de moderation et absence de debordement horizontal.

Deploiement du site et de son rendu serveur uniquement. Aucun redemarrage de bot, changement de secret ou reinitialisation de donnees n'est necessaire.
