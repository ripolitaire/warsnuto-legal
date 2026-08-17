async function loadBotData() {
  const response = await fetch("/api/bots.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`API unavailable: ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  if (!value) return "Non communiqué";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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
            <div><dt>Communauté</dt><dd>${bot.community.membersLabel}</dd></div>
            <div><dt>Mise à jour</dt><dd>${formatDate(bot.lastUpdate.date)}</dd></div>
          </dl>
          <a class="inline-link" href="${bot.page}">Ouvrir la page ${bot.badge}</a>
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
          <a class="inline-link" href="${bot.page}">Voir la page dédiée</a>
        </article>
      `
    )
    .join("");
}

function renderUpdatedDate(data) {
  const target = document.querySelector("[data-site-updated]");
  if (!target || !data.updatedAt) return;
  target.textContent = `Dernière mise à jour: ${formatDate(data.updatedAt)}`;
}

async function fetchDiscordWidget(bot) {
  if (!bot.community?.widgetUrl) return null;
  try {
    const response = await fetch(bot.community.widgetUrl, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function renderBotDetail(data) {
  const slug = document.body.dataset.botPage;
  const target = document.querySelector("[data-bot-detail]");
  if (!slug || !target) return;

  const bot = data.bots.find((entry) => entry.slug === slug);
  if (!bot) return;

  const widget = await fetchDiscordWidget(bot);
  const onlineCount = widget?.presence_count ?? "Non public";
  const serverName = widget?.name || bot.community.name;
  const memberLabel = bot.community.membersLabel;

  target.innerHTML = `
    <article class="metric-card ${bot.theme}">
      <span class="section-number">Serveur</span>
      <h2>${serverName}</h2>
      <dl>
        <div><dt>Membres</dt><dd>${memberLabel}</dd></div>
        <div><dt>En ligne</dt><dd>${onlineCount}</dd></div>
        <div><dt>Source</dt><dd>${widget ? "Discord Widget" : bot.community.membersSource}</dd></div>
      </dl>
    </article>

    <article class="metric-card ${bot.theme}">
      <span class="section-number">Bot</span>
      <h2>${bot.status}</h2>
      <dl>
        <div><dt>Stockage</dt><dd>${bot.storage}</dd></div>
        <div><dt>Dernière mise à jour</dt><dd>${formatDate(bot.lastUpdate.date)}</dd></div>
        <div><dt>Note</dt><dd>${bot.lastUpdate.label}</dd></div>
      </dl>
    </article>

    <article class="docs-card ${bot.theme}">
      <span class="section-number">Modules</span>
      <h2>Ce que fait ${bot.badge}</h2>
      <ul>${bot.modules.map((item) => `<li>${item}</li>`).join("")}</ul>
    </article>

    <article class="docs-card ${bot.theme}">
      <span class="section-number">Commandes</span>
      <h2>Commandes principales</h2>
      <p class="command-list">${bot.commands.map((item) => `<code>${item}</code>`).join("")}</p>
      <h3>Données utilisées</h3>
      <p>${bot.dataUse}</p>
    </article>
  `;
}

loadBotData()
  .then((data) => {
    renderHomeStats(data);
    renderDocs(data);
    renderUpdatedDate(data);
    renderBotDetail(data);
  })
  .catch(() => {
    document.querySelectorAll("[data-bot-stats], [data-docs-grid], [data-bot-detail]").forEach((node) => {
      node.innerHTML = `
        <article class="live-card">
          <span class="section-number">Info</span>
          <h2>Données indisponibles</h2>
          <p>La documentation reste accessible, mais l'API publique ne répond pas pour le moment.</p>
        </article>
      `;
    });
  });
