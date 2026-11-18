# Deploiement de la refonte communautaire

Autorisation explicite recue apres validation de la livraison locale.
Site public : https://warsnuto.com. Activation backend : 16 novembre 2026,
14:54:24 UTC (15:54:24, Europe/Paris).

## Versions

- Vercel : `dpl_39LcspcGWEsWX6JfbL8Jhsq2S334`, statut READY, promu sur warsnuto.com.
- URL technique : https://warsnuto-bots-f61i54u1g-rip-solitaires-projects.vercel.app.
- Backend : `/opt/warsnuto-web/releases/community-20261116145120670`.
- Pointeur : `/opt/warsnuto-web/current`, remplacement atomique.
- Sauvegarde SQLite coherente et controlee :
  `/opt/warsnuto-web-backups/community-20261116145120670/web.sqlite`.
- Manifestes, rapport Linux et activation : meme repertoire de sauvegarde.
- Paquet : 522 fichiers verifies par SHA256. Aucune migration SQL.

## Precautions

La comparaison avec la production a confirme les memes fichiers auth, permissions,
securite, configuration et dependances. Le fichier app ne change que les ressources
publiques autorisees et le service local du catalogue. Les vues et la presentation
sont celles de la refonte testee.

Vercel a ete construit depuis un dossier isole ne contenant que les sources
publiques, scripts de build, icones et API. Aucun .env, base, certificat, fichier de
test ou repertoire artifacts dans l'envoi. Les exclusions .vercelignore sont
renforcees pour les publications futures.

Le candidat Vercel a ete construit sans affecter le domaine, puis promu apres
preparation et tests Linux. Les URL techniques sont redirigees vers le domaine
canonique par les regles existantes ; les controles finaux ont donc ete faits
directement sur warsnuto.com, apres la promotion.

## Verification

- Vercel : build reussi, 29 fichiers publics et assets, dependances installees.
- VPS Linux : 132 tests reussis, aucun echec ni test ignore.
- Base de sauvegarde : `PRAGMA integrity_check` = ok.
- Backend : systemd actif, zero erreur de demarrage detectee dans le journal.
- Acces direct au backend sans secret d'origine : 403.
- Session anonyme via le site : 200, OAuth configure, utilisateur null.
- Administration anonyme : 401 ; connexion Discord : redirection 303 correcte.
- Accueil, community.css, community.js, cards.js et catalogue : octets identiques
  aux sources locales, types MIME corrects.
- Playwright sur le domaine reel : accueil, Game, catalogue et documentation sur
  desktop 1440x1000 et mobile 390x844, sans erreur JavaScript ni debordement.
- Catalogue Royale : cinq cartes, ouverture de fiche et chargement image verifies.
- Compteurs Discord et videos YouTube reels charges ; illustrations et icones
  verifiees apres chargement. Captures locales dans artifacts/deployed-*.
- Aucun compte de production cree pour les tests ; pas de connexion OAuth humaine
  simulee. La recette d'un compte reel reste a faire par son titulaire.

## Bots et donnees

Protect PID 556073, Game PID 550425, Support PID 538363 : tous online et identiques
avant/apres. Aucun redemarrage de bot ni modification de leur configuration.
Le fichier runtime.env est identique par empreinte ; sessions, comptes, collections
et bases conserves. Aucun commit ou push Git pour cette publication.

## Retour arriere

Ancien frontend : `dpl_4Fs6XgqLxub9rpJwk3osjGLpxrSA`, URL
https://warsnuto-bots-3v2sbymtn-rip-solitaires-projects.vercel.app.
Le promouvoir a nouveau avec Vercel en cas de regression.

Ancien backend conserve : `/opt/warsnuto-web/releases/personal-collection-20261112`.
Rebasculer le lien current atomiquement vers cette release, puis redemarrer
uniquement warsnuto-web. Ne pas restaurer la base pour ce rollback : aucune
migration n'a ete appliquee, et les donnees recentes doivent rester intactes.
