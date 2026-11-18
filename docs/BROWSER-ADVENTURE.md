# Aventure navigateur WarsNuto Game

## Etat

La page privee est /play. Elle utilise la connexion Discord existante, puis
interroge seulement le bot Game par la passerelle Unix deja en place. Son
ouverture est limitee aux comptes du site possedant la permission `admin:read`
(roles ADMIN et OWNER) : le controle est applique a la page et aux deux routes
API, pas seulement a l'interface.

Le navigateur ne calcule ni les degats, ni les recompenses, ni les probabilites.
Il envoie une action avec une revision et un identifiant UUID. Le moteur Game
enregistre un recu atomique : une action repetee retourne le resultat initial
au lieu de donner une recompense une seconde fois.

L'ouverture reste desactivee par defaut. Le bot Game doit recevoir :

~~~text
WARSNUTO_ADVENTURE_WEB_ENABLED=1
~~~

Optionnellement, WARSNUTO_ADVENTURE_WEB_TESTERS accepte une liste d'IDs Discord
separes par des virgules pour une ouverture limitee.

## Donnees

Deux tables additives sont creees par le moteur Game au premier usage :

- adventure_web_receipts : idempotence des actions navigateur.
- adventure_web_heads : sequence technique par profil.

Elles ne remplacent aucune table du jeu. Comptes, inventaires, monnaie,
equipement, combats et objets existants restent dans leurs tables actuelles.

## Contenu livre

- Personnage, classe, missions, exploration et combat solo.
- Inventaire, equipement, fruits, boutique et Grand Line.
- Equipages, echanges, statut des raids et boss serveur existants.
- Guide et historique de transactions.
- Carte des zones, images deja presentes dans Game et audio original optionnel.

La creation de raid collectif depuis le navigateur est volontairement absente
pour le moment : les raids existants dependent encore des fils Discord.
Le navigateur permet de consulter et de reprendre les activites deja liees au
profil, sans inventer une nouvelle regle de groupe.

## Publication controlee du connecteur Game

Une release web preparee contient les sources canoniques du bridge dans
ops/bot-config/. Elle ne modifie jamais Game automatiquement.

Sur le VPS, depuis la release web ciblee :

~~~sh
node ops/deploy-game-adventure.cjs prepare adventure-YYYYMMDDTHHMMSSZ
node ops/deploy-game-adventure.cjs activate adventure-YYYYMMDDTHHMMSSZ
~~~

La phase prepare :

1. verifie les sources et leur syntaxe ;
2. cree une sauvegarde SQLite de Game avec controle d'integrite ;
3. sauvegarde les quatre fichiers de bridge ;
4. refuse si le processus Game ou les sources changent.

La phase activate copie uniquement les fichiers de bridge, redemarre uniquement
warsnuto-game-bot, puis confirme un nouveau PID PM2 online. En cas d'echec,
elle restaure les fichiers precedents et redemarre le bot. Elle ne restaure
jamais une base active, ne modifie aucun .env et ne change pas les regles de
combat.

## Verification

~~~sh
node --test scripts/test-web-adventure.js
npm run check
~~~

Cote site :

~~~sh
npm test
npm run check
npm run build
~~~

Avant ouverture generale, tester avec un compte limite : connexion, creation,
classe, exploration, combat, rechargement de page et reprise de combat.
