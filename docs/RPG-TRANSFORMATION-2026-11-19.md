# WarsNuto RPG navigateur : audit et premier combat

Date : 19 novembre 2026. Ce rapport ne declare pas la transformation complete.
Reference de mission : document transmis dans la conversation, version du
repertoire de piece jointe 3bd57bd0-7226-4d10-89ed-d4340088d423.

## 1. Perimetre et sources verifiees

- Site : WarsNuto Univers/legal-site, depot warsnuto-legal sur ripolitaire.
- Game local : dossier voisin warsnuto-game-bot, pas de .git trouve.
- Game production : /opt/warsnuto-game-bot, PM2 warsnuto-game-bot.
- Web production : /opt/warsnuto-web/current, systemd warsnuto-web.
- Le domaine sert un frontend Vercel et une API relayee vers le VPS.
- Base Game : data/game.sqlite, better-sqlite3, WAL et transactions immediate.
- Base web distincte : sessions, OAuth, droits et audit du site.
- Bridge candidat : ops/bot-config/webAdventure.cjs ; ne pas remplacer le
  moteur Game par la version locale.
- Aucune modification de Protect, Support, CRB ou des .env.
- La reference https://bffr.fr/systeme a ete tentee et n'etait pas accessible
  avec l'outil web. Aucun code, asset ou fonctionnement non observable copie.

## 2. Divergence locale / production : ne pas ecraser

Comparaison SHA-256 et diff effectues en lecture seule.

| Fichier | Local | VPS |
| --- | --- | --- |
| src/gameService.js | e0093340bb9ef479d312d8287dcfdefab4f649b5f811707145ad661454c58138 | 7608d3ba8e3b4c574aabed3fa03062733de10a45f1667a491accb6e52800745d |
| src/gameData.js | 51ea24e43f64f2be5c47f0b96183d763a4c676e0731334a20e2f3f8ff79f95ea | identique |
| src/combatRules.js | 1b81d03985784159ff5f66bc03136a886fee7767755347796c11ac7ca5d06c6a | identique |

Le local possede une mise a l'echelle des PV, degats et recompenses du boss
d'equipage absente du VPS. Cette divergence n'a pas ete resolue en faveur de
l'une ou l'autre version : aucun changement d'equilibrage effectue.
Le bridge Game local est aussi plus ancien que le bridge canonique du site.

## 3. Inventaire existant et couverture actuelle

Le catalogue source contient 10 classes, 27 zones, 6 missions, 16 boss solo,
1 boss d'equipage, 11 boss serveur, 11 fruits, 50 objets et 15 succes.

| Systeme | Existant | Etat navigateur / travail restant |
| --- | --- | --- |
| Connexion | OAuth Discord, sessions, CSRF et droits | Conserve ; /play et API limites aux administrateurs du site |
| Progression | Niveau, XP, prime, berrys, energie, classe | Recuperee du moteur ; pas de recalcul client des gains |
| Combat solo | attack, heavy, defend, heal, flee ; cible unique | Nouvelle scene 2D et resolution serveur fonctionnelles |
| Combat equipe / serveur | Sessions et moteur commun | Le rendu generique peut afficher une session ; generalisation multijoueur non validee |
| Fruits et equipement | Inventaire, maitrise, eveil, arme, accessoire | Actions web existantes conservees ; illustrations et comparaisons a enrichir |
| Missions / exploration | Conditions, couts, tirages et recompenses moteur | Ecrans existants conserves ; mise en scene specifique a refaire |
| Grand Line | Routes, rencontres, cargo, retour au port | Actions existantes conservees ; nouveau rendu de combat non generalise aux rencontres |
| Equipages | Creation, invitations, membres, coffre, navire, expedition | Interface existante conservee ; UX complete a revoir |
| Raids | Amis/equipage, preparation, tours, fils Discord | Consultation/reprise existantes ; creation web toujours absente |
| Echanges | Offres, pret, confirmation, transfert atomique | Flux existant conserve ; pas de refonte integrale de cette page dans ce lot |
| Halloween | Mode infini et raids saisonniers | Desactive selon la configuration existante ; objets conserves |
| Cartes / arcade | Tirages, catalogue, collection, echanges | Non modifies ; parcours du site verifies par la suite existante |
| Administration | Reglages Game et Admin Mod | Acces existant conserve, aucun reset et aucune ouverture publique |
| Discord | Commandes et interactions de gameplay | Aucune suppression ni desactivation dans ce lot |

Ce tableau est l'inventaire du moteur et des routes examines, pas la preuve
que toutes les commandes Discord ont ete rejouees individuellement en ligne.

## 4. Realisations de ce lot

- adventure-combat.js : rendu separe du transport, utilisable par un futur
  client PC sans dupliquer les regles.
- Scene maritime, avatar original en pied, boss visible, noms et barres PV.
- Animations de frappe, riposte, impact, garde, soin et etat de fin.
- Choix de vitesse normal, x2 et instantane ; reduction des mouvements
  systeme et preference utilisateur respectees.
- Boutons limites aux cinq actions moteur. Pas de ciblage multiple, de
  pouvoirs fictifs ni d'attaques elementaires inventees.
- Etat de potion accessible : absente, PV maximum, deja utilisee.
- Recompenses terminales et derniers tours conserves dans les recus existants.
- Animation declenchee seulement apres une reponse validee, jamais lors du
  rejouement d'un recu ou d'un simple rechargement.
- Journal des derniers tours de la session ; conservation affichee bornee
  aux douze derniers recus de combat du profil, pas un historique illimite.
- Audio : volume general ajoute, mute arrete aussi les effets actifs,
  nombre d'effets simultanes borne, nouvel essai apres geste utilisateur.
- 3 sons originaux : impact, garde et soin. Boucles precedentes conservees.
- Icones Sword, Flag et Trophy integrees au bundle Lucide.
- Rafraichissement identique ne detruit plus la scene toutes les dix secondes.
- Les messages de combat ne recouvrent plus la scene via le toast general.
- Confirmation protege aussi contre un second envoi apres fermeture du dialogue.

Principaux fichiers : adventure.js, adventure-combat.js, adventure.css,
adventure-audio.js, server/adventure.cjs, ops/bot-config/webAdventure.cjs,
ui/icons.js et listes de fichiers publics/build/release.

## 5. Visuels et droits

Deux images originales creees et integrees : assets/adventure/rpg/harbour.webp
et adventurer.webp, environ 489 Ko au total. Prompts et provenance dans
assets/adventure/rpg/SOURCES.md. Les PNG sources n'ont pas ete publies.

Les anciens portraits de boss restent utilises pour cette version locale.
Certains contiennent encore le graphisme d'une carte collection. Ils ne sont
pas des sprites de combat finaux et leurs droits ne sont pas etablis par ce
lot. Il reste a produire/autoriser les ennemis en pied, les variantes de
classes, les decors d'iles, les effets propres aux fruits et les objets.

## 6. Tests executes

- npm run check : syntaxe et configuration Vercel.
- npm run build : build statique et bundle Lucide.
- npm test : suite du site, 141 reussites et 3 cas ignores explicitement.
- Integration Game optionnelle : 10 tests passes sous Windows et Linux.
- Playwright : 156 parcours passes, ordinateur et mobile.
- Apercu avec vrai moteur : connexion locale isolee, lancement de Buggy et
  passage au tour 2 depuis Chromium ; capture en artifacts/rpg-live-engine-desktop.png.

Les 10 tests d'integration utilisent une base NEUVE dans le repertoire
temporaire : creation, revisions perimees, combat, reprise avec nouvelle
instance de bridge, victoire, recu idempotent, potion, defaite, sauvegarde
ouverte et integrity_check, profils separes et deux processus concurrents.
Un test parent regroupe neuf scenarios, d'ou le total Node de dix tests.
Sous Linux ils chargent le vrai moteur du VPS sans modifier ses fichiers.

Les tests navigateur de rendu utilisent des reponses de test controlees ;
ils ne suffisent pas seuls a prouver le gameplay. Le test du moteur et le
parcours supplementaire de l'apercu reel completent cette verification.
Le son est verifie par chargement/lecture navigateur et trace des appels ;
pas de jugement auditif humain ni certification sur un telephone physique.
Le restart de PM2 en production n'a PAS ete teste : seule la reprise avec
reouverture du bridge et reutilisation de la base de test est couverte ici.

Corrections pendant la verification : normalisation JSON du recu dans les
assertions et quantite initiale de potions pouvant inclure un butin aleatoire.
Ces echecs de test sont corriges ; aucun echec restant dans les suites indiquees.

Commandes d'integration :

```powershell
$env:WARSNUTO_GAME_TEST_ROOT='C:\Users\Math\Desktop\warsnuto-game-bot'
node --test tests/adventure-engine.test.cjs
```

```sh
NODE_ENV=test WARSNUTO_GAME_TEST_ROOT=/opt/warsnuto-game-bot node --test tests/adventure-engine.test.cjs
```

## 7. Publication et limites

Version de travail uniquement : aucun nouveau deploiement web ou Game dans
ce lot, aucune ouverture generale. Le VPS conserve la release
community-20261119094724149 et Game conserve le PID 609859 observe avant/apres
les tests. Hashes du moteur controles inchanges apres le test Linux.
Les .env, comptes et donnees actives ne sont pas utilises par les tests.
Pas de migration de schema dans ce lot : seuls les JSON des nouveaux recus
portent les etats de presentation supplementaires.

L'autorisation Vercel a echoue au lot precedent ; elle n'a pas ete retestee
ni contournee ici. Ne pas annoncer que cette nouvelle scene est sur le domaine.
La creation de raids sans fils Discord, toutes les pages graphiques et une
identite sonore complete sont encore necessaires pour achever la mission.

## 8. Apercu local et retour arriere

```text
node scripts/preview-rpg.cjs "chemin/vers/warsnuto-game-bot" 4320
http://127.0.0.1:4320/__rpg-preview
```

Apercu developpeur : connexion Discord simulee, mais moteur de combat reel
et progression jetable. Aucun token ni fichier .env charge. Ecoute uniquement
127.0.0.1 et refus de fonctionner en NODE_ENV=production. Ce n'est ni le
compte du joueur ni le serveur en ligne. L'avatar de test commence niveau 2.
Le script de preview n'est pas dans l'allowlist de livraison du serveur web.

Pas de rollback de production necessaire puisque rien n'est deploye. Pour
une future alpha, utiliser prepare/activate de deploy-community.cjs, puis
deploy-game-adventure.cjs avec sauvegarde verifiee. Les ajouts du bridge sont
compatibles avec l'ancien frontend. Revenir aux anciens fichiers ne demande
pas de restaurer une base active : conserver les recus deja ecrits.

## 9. Suite prioritaire

1. Portraits de boss et sprites de classes autorises, decors par environnement.
2. Validation visuelle du duel et des consequences de chaque action.
3. Appliquer la mise en scene a Grand Line puis aux raids sans changer les regles.
4. Remplacer progressivement les layouts administratifs du monde/inventaire.
5. Creation de raids web et reprise multijoueur independantes des fils Discord.
6. Finir le traitement des coupures/rechargements pendant un envoi, auditer
   toutes les actions restantes et realiser un vrai test de redemarrage isole.
7. Activation admin limitee et reversible apres resolution de la publication.

L'ancienne aventure Discord reste disponible. La mission globale n'est pas terminee.
