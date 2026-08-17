async function loadBotData() {
  const response = await fetch("./api/bots.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`API unavailable: ${response.status}`);
  }
  return response.json();
}

function renderHomeStats(data) {
  const target = document.querySelector("[data-bot-stats]");
  if (!target) return;

  target.innerHTML = data.bots
    .map(
      (bot) => `
        <article class="live-card ${bot.theme}">
          <span class="section-number">${bot.badge}</span>
          <h2>${bot.name}</h2>
          <p>${bot.short}</p>
          <dl>
            <div><dt>Statut</dt><dd>${bot.status}</dd></div>
            <div><dt>Base</dt><dd>${bot.storage}</dd></div>
            <div><dt>Modules</dt><dd>${bot.modules.length}</dd></div>
          </dl>
          <a class="inline-link" href="/docs">Voir la fiche</a>
        </article>
      `
    )
    .join("");
}

function renderDocs(data) {
  const target = document.querySelector("[data-docs-grid]");
  if (!target) return;

  target.innerHTML = data.bots
    .map(
      (bot) => `
        <article class="docs-card ${bot.theme}">
          <div class="docs-card-head">
            <span class="section-number">${bot.badge}</span>
            <strong>${bot.status}</strong>
          </div>
          <h2>${bot.name}</h2>
          <p>${bot.description}</p>
          <h3>Modules</h3>
          <ul>${bot.modules.map((item) => `<li>${item}</li>`).join("")}</ul>
          <h3>Commandes clés</h3>
          <p class="command-list">${bot.commands.map((item) => `<code>${item}</code>`).join("")}</p>
          <h3>Données utilisées</h3>
          <p>${bot.dataUse}</p>
        </article>
      `
    )
    .join("");
}

function renderUpdatedDate(data) {
  const target = document.querySelector("[data-site-updated]");
  if (!target || !data.updatedAt) return;

  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${data.updatedAt}T00:00:00`));

  target.textContent = `Dernière mise à jour: ${date}`;
}

loadBotData()
  .then((data) => {
    renderHomeStats(data);
    renderDocs(data);
    renderUpdatedDate(data);
  })
  .catch(() => {
    document.querySelectorAll("[data-bot-stats], [data-docs-grid]").forEach((node) => {
      node.innerHTML = `
        <article class="live-card">
          <span class="section-number">Info</span>
          <h2>Données indisponibles</h2>
          <p>La documentation reste accessible, mais l'API publique ne répond pas pour le moment.</p>
        </article>
      `;
    });
  });
