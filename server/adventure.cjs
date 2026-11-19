const { escape } = require('./views.cjs');
function page(session) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
    <title>L’aventure · WarsNuto Game</title><link rel="icon" href="/assets/game-logo.png"><link rel="stylesheet" href="/adventure.css">
    <script src="/assets/platform-icons.js" defer></script><script src="/adventure-audio.js" defer></script><script src="/adventure-combat.js" defer></script><script src="/adventure.js" defer></script></head>
    <body><a class="skip" href="#game-main">Aller à l’aventure</a>
    <header class="game-header"><a class="game-brand" href="/profile"><img src="/assets/game-logo.png" alt=""><span>WARSNUTO<small>ONE PIECE · L’AVENTURE</small></span></a>
      <label class="guild-picker"><span class="sr-only">Serveur de jeu</span><select id="game-guild"><option value="">Chargement des serveurs…</option></select></label>
      <div class="header-actions"><button id="game-refresh" title="Actualiser la progression" aria-label="Actualiser la progression"><i data-lucide="refresh-cw"></i></button>
      <button id="game-audio" title="Son et ambiance" aria-label="Son et ambiance"><i data-lucide="volume-x"></i></button>
      <a class="account" href="/profile/settings"><img src="${escape(session.user.avatar)}" alt=""><span>${escape(session.user.displayName)}</span></a></div></header>
    <div id="game-hud" class="game-hud" aria-label="Ressources du personnage"></div>
    <div class="game-shell"><nav class="game-nav" aria-label="L’aventure">
      ${[['world','compass','Le monde'],['missions','scroll-text','Missions'],['bosses','swords','Combats'],['character','user-round','Personnage'],['inventory','backpack','Inventaire'],['shop','store','Marchand'],['voyage','ship','Grand Line'],['crew','users-round','Équipage'],['raids','flame','Raids'],['trades','arrow-left-right','Échanges'],['guide','book-open','Le guide']].map(([id, icon, label]) => `<button data-view="${id}" aria-label="${label}"${id === 'world' ? ' aria-current="page"' : ''}><i data-lucide="${icon}"></i><span>${label}</span></button>`).join('')}
      <a href="/profile/cards"><i data-lucide="layers"></i><span>Mes cartes</span></a><a href="/"><i data-lucide="house"></i><span>Le site</span></a>
    </nav><main id="game-main" tabindex="-1" aria-busy="true"><div class="opening"><img src="/assets/game-logo.png" alt=""><h1>Ton aventure t’attend.</h1><p>Connexion à ton personnage…</p></div></main></div>
    <div id="game-notice" role="status" aria-live="polite"></div>
    <dialog id="audio-dialog" aria-labelledby="audio-title"><form method="dialog"><div class="dialog-heading"><h2 id="audio-title">Son et ambiance</h2><button aria-label="Fermer"><i data-lucide="x"></i></button></div>
      <label class="switch"><input type="checkbox" id="audio-enabled">Activer le son</label>
      ${[['master','Général'],['music','Musique'],['effects','Effets'],['ambience','Ambiances']].map(([id,label]) => `<label class="volume">${label}<input type="range" id="audio-${id}" min="0" max="100" step="1" value="35"><output id="audio-${id}-value">35 %</output></label>`).join('')}
      <label class="switch"><input type="checkbox" id="game-motion">Réduire les animations</label><button class="primary">Terminer</button></form></dialog>
    <dialog id="game-confirm" aria-labelledby="game-confirm-title"><form method="dialog"><h2 id="game-confirm-title">Confirmer</h2><p id="game-confirm-text"></p><div class="actions"><button value="cancel">Annuler</button><button value="confirm" class="primary">Confirmer</button></div></form></dialog>
    </body></html>`;
}
module.exports = { page };
