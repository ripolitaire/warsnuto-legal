async function loadBotData() {
  const urls = [`/api/bots?ts=${Date.now()}`, `api/bots?ts=${Date.now()}`];

  for (const url of urls) {
    const response = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (response?.ok) return response.json();
  }

  throw new Error("API unavailable");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
        <article class="live-card ${escapeHtml(bot.theme)}">
          <div class="card-topline">
            <span class="section-number">${escapeHtml(bot.badge)}</span>
            <span class="live-status">En production</span>
          </div>
          <h2>${escapeHtml(bot.name)}</h2>
          <p>${escapeHtml(bot.short)}</p>
          <dl>
            <div><dt>Statut</dt><dd>${escapeHtml(bot.status)}</dd></div>
            <div><dt>Serveur</dt><dd>${escapeHtml(bot.community?.membersLabel || "Non public")} membres</dd></div>
            <div><dt>Mise à jour</dt><dd>${escapeHtml(formatDate(bot.lastUpdate?.date))}</dd></div>
          </dl>
          <a class="inline-link" href="${escapeHtml(bot.page)}">Ouvrir la page ${escapeHtml(bot.badge)}</a>
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
        <article class="docs-card ${escapeHtml(bot.theme)}">
          <div class="docs-card-head">
            <span class="section-number">${escapeHtml(bot.badge)}</span>
            <strong>${escapeHtml(bot.status)}</strong>
          </div>
          <h2>${escapeHtml(bot.name)}</h2>
          <p>${escapeHtml(bot.description)}</p>
          <h3>Modules</h3>
          <ul>${(bot.modules || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <h3>Commandes clés</h3>
          <p class="command-list">${(bot.commands || []).map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</p>
          <h3>Données utilisées</h3>
          <p>${escapeHtml(bot.dataUse)}</p>
          <a class="inline-link" href="${escapeHtml(bot.page)}">Voir la page dédiée</a>
        </article>
      `
    )
    .join("");
}

function renderUpdatedDate(data) {
  const target = document.querySelector("[data-site-updated]");
  if (!target || !data.updatedAt) return;
  target.textContent = `Dernière mise à jour : ${formatDate(data.updatedAt)}`;
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
  const onlineCount = bot.community?.onlineLabel || widget?.presence_count || "Non public";
  const serverName = widget?.name || bot.community?.name || "WarsNuto";
  const memberLabel = bot.community?.membersLabel || "Non public";
  const sourceLabel = bot.community?.membersSource || (widget ? "Discord Widget" : "Snapshot public");

  target.innerHTML = `
    <article class="metric-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Serveur</span>
      <h2>${escapeHtml(serverName)}</h2>
      <dl>
        <div><dt>Membres</dt><dd>${escapeHtml(memberLabel)}</dd></div>
        <div><dt>En ligne</dt><dd>${escapeHtml(onlineCount)}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(sourceLabel)}</dd></div>
      </dl>
    </article>

    <article class="metric-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Bot</span>
      <h2>${escapeHtml(bot.status)}</h2>
      <dl>
        <div><dt>Stockage</dt><dd>${escapeHtml(bot.storage)}</dd></div>
        <div><dt>Dernière mise à jour</dt><dd>${escapeHtml(formatDate(bot.lastUpdate?.date))}</dd></div>
        <div><dt>Note</dt><dd>${escapeHtml(bot.lastUpdate?.label)}</dd></div>
      </dl>
    </article>

    <article class="docs-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Modules</span>
      <h2>Ce que fait ${escapeHtml(bot.badge)}</h2>
      <ul>${(bot.modules || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>

    <article class="docs-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Commandes</span>
      <h2>Commandes principales</h2>
      <p class="command-list">${(bot.commands || []).map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</p>
      <h3>Données utilisées</h3>
      <p>${escapeHtml(bot.dataUse)}</p>
      <h3>Usage officiel</h3>
      <p>${escapeHtml(data.officialUse)}</p>
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
        <article class="live-card api-state-card">
          <span class="section-number">Info</span>
          <h2>Données indisponibles</h2>
          <p>La documentation reste accessible, mais l'API publique ne répond pas pour le moment.</p>
          <a class="inline-link" href="/api/bots">Réessayer l'API</a>
        </article>
      `;
    });
  });
