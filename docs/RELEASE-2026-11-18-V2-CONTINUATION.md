# Livraison complémentaire du 18 novembre 2026

Suite au premier lot, sans réinitialisation ni changement de règles métier.

## Site

- Configuration : onglets/rubriques bloqués pendant les opérations, état de
  chargement accessible et touches de recherche corrigées.
- Message d'accès aligné sur les autorisations effectives du bot.
- Thème public/privé, catalogue de 205 cartes et collection personnelle conservés.
- Journaux locaux exclus de Git.

Vérification : 130 tests applicatifs réussis, 2 ignorés, 138 parcours navigateur
desktop/mobile réussis ; analyse de syntaxe et build statique réussis.

Backend publié : `community-20261118030750445`.
Vercel : `dpl_Gc9x7cNc5rkmGYivtRwsJH8HWach`, alias `https://warsnuto.com`.
Les quatre assets publics centraux ont été comparés par SHA-256 avec la source
locale. L'origine privée refuse les appels sans secret, et l'API admin refuse
les visiteurs non connectés. Les secrets, sessions et données n'ont pas été
embarqués dans le frontend.

## Écosystème

Game étend le V2 aux sorties RPG, administration, raids, guides et journaux ;
Protect modernise les confirmations de notifications ; Support expose toutes les
pièces jointes sans toucher aux transcriptions. Les bots sont actifs sous la
release `rework-20261118-03`, testée sous Linux avant activation.

Les messages déjà envoyés ne sont pas réécrits en masse. Les emojis disponibles
restent statiques : la prise en charge des médias animés est testée, mais aucun
nouveau pack GIF n'est annoncé comme livré. L'écart local d'équilibrage des boss
Game reste volontairement hors publication.

Les détails privés d'exploitation et les preuves de données restent dans le
dossier d'audit du dépôt Protect, pas dans ce dépôt public.
