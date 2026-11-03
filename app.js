async function loadBotData() {
  const cached = readCachedBotData();
  if (cached) return cached;
  // The initial render must not wait for a complete Discord member scan.
  const data = await fetchBotPayload("/api/bots", 6000);
  writeCachedBotData(data);
  return data;
}

const BOT_DATA_CACHE_KEY = "warsnuto:bot-data:v13";
const BOT_DATA_CACHE_MS = 30 * 1000;
const botDataRequests = new Map();

function fetchBotPayload(url, timeoutMs = 6500) {
  if (botDataRequests.has(url)) return botDataRequests.get(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const pending = (async () => {
    const response = await fetch(url, { cache: "no-cache", signal: controller.signal });
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    if (!Array.isArray(data?.bots)) throw new Error("Invalid bot data");
    return data;
  })().finally(() => { clearTimeout(timer); botDataRequests.delete(url); });
  botDataRequests.set(url, pending);
  return pending;
}

function mergeBotData(previous, incoming) {
  if (!previous) return incoming;
  const data = { ...incoming, discord: { ...incoming.discord }, live: { ...incoming.live } };
  const oldCountsAt = Date.parse(previous.live?.countsFetchedAt || previous.live?.fetchedAt || "") || 0;
  const newCountsAt = Date.parse(incoming.live?.countsFetchedAt || incoming.live?.fetchedAt || "") || 0;
  if (previous.live?.source === "Discord Invite" && (incoming.live?.source !== "Discord Invite" || newCountsAt < oldCountsAt)) {
    data.bots = incoming.bots.map(bot => {
      const old = previous.bots.find(entry => entry.slug === bot.slug);
      if (!old) return bot;
      return { ...bot, community: { ...bot.community, membersLabel: old.community?.membersLabel, onlineLabel: old.community?.onlineLabel, membersSource: old.community?.membersSource } };
    });
    data.live.source = previous.live.source;
    data.live.countsFetchedAt = previous.live?.countsFetchedAt || previous.live?.fetchedAt;
  }
  for (const [section, source, expected] of [["staff", "staffSource", "Roles Discord lus automatiquement"], ["roleGuide", "roleSource", "Couleurs Discord lues automatiquement"]]) {
    if (previous.live?.[source] === expected && incoming.live?.[source] !== expected) {
      data.discord[section] = previous.discord?.[section]; data.live[source] = expected;
    }
  }
  return data;
}

function readCachedBotData() {
  try {
    const cached = JSON.parse(localStorage.getItem(BOT_DATA_CACHE_KEY) || "null");
    if (!Array.isArray(cached?.data?.bots) || !cached.cachedAt) return null;
    if (Date.now() - cached.cachedAt > BOT_DATA_CACHE_MS) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeCachedBotData(data) {
  try {
    localStorage.setItem(BOT_DATA_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {
    // Ignore storage limits/private mode.
  }
}

function refreshBotDataInBackground(onUpdate) {
  return fetchBotPayload("/api/bots?live=1&staff=0")
    .then((data) => {
      const merged = applyBotData(data);
      if (onUpdate) onUpdate(merged);
    })
    .catch(() => {});
}

function refreshStaffInBackground() {
  if (!document.querySelector("[data-staff-tree]")) return Promise.resolve();
  return fetchBotPayload("/api/bots?live=1", 50000).then(applyBotData).catch(() => {});
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
  if (!value) return "Non communique";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return "Date non communiquee";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeHexColor(value, fallback = "#ffcc4d") {
  const clean = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean : fallback;
}

function hexToRgb(value) {
  const hex = normalizeHexColor(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function staffIconStyle(value) {
  const color = normalizeHexColor(value);
  const { r, g, b } = hexToRgb(color);
  return [
    `--staff-color: ${color}`,
    `--staff-rgb: ${r}, ${g}, ${b}`,
    `color: ${color} !important`,
    `border-color: rgba(${r}, ${g}, ${b}, 0.78) !important`,
    `background: radial-gradient(circle at 35% 24%, rgba(${r}, ${g}, ${b}, 0.42), transparent 58%), rgba(${r}, ${g}, ${b}, 0.12) !important`,
    `box-shadow: 0 12px 28px rgba(${r}, ${g}, ${b}, 0.24), inset 0 0 0 1px rgba(255, 255, 255, 0.045) !important`,
  ].join("; ");
}

function staffCardStyle(value) {
  const color = normalizeHexColor(value);
  const { r, g, b } = hexToRgb(color);
  return [
    `--staff-color: ${color}`,
    `--staff-rgb: ${r}, ${g}, ${b}`,
    `border-color: rgba(${r}, ${g}, ${b}, 0.34)`,
    `box-shadow: 0 16px 38px rgba(0, 0, 0, 0.22), inset 3px 0 0 rgba(${r}, ${g}, ${b}, 0.5)`,
  ].join("; ");
}

function applyRoleColors(target) {
  target.querySelectorAll("[data-role-primary]").forEach((badge) => {
    const primary = normalizeHexColor(badge.dataset.rolePrimary, "#8f98aa");
    const { r, g, b } = hexToRgb(primary);
    const colors = [primary, badge.dataset.roleSecondary, badge.dataset.roleTertiary]
      .filter((value) => /^#[0-9a-f]{6}$/i.test(value || ""));
    // CSSOM assignments remain allowed under the site's strict style-src CSP.
    badge.style.setProperty("--role-color", primary);
    badge.style.setProperty("--role-rgb", `${r}, ${g}, ${b}`);
    badge.style.setProperty("--role-gradient", colors.length > 1 ? `linear-gradient(90deg, ${colors.join(", ")})` : primary);
    badge.classList.toggle("has-gradient", colors.length > 1);
  });
}

function staffIconSvg(type, value) {
  const color = normalizeHexColor(value);
  const shadowColor = "rgba(0, 0, 0, 0.24)";
  if (type === "crown") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="staff-crown-icon" style="color: ${color}; fill: ${color}; stroke: ${color};">
        <path d="M3.5 8.2 8.3 12l3.7-6.2L15.7 12l4.8-3.8-1.8 10H5.3l-1.8-10Z" fill="${color}" />
        <path d="M6 20h12" fill="none" stroke="${color}" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="staff-shield-icon" style="color: ${color}; fill: ${color}; stroke: none;">
      <path d="M12 2.4 20 5.2v6.1c0 5.1-3.25 8.95-8 10.3-4.75-1.35-8-5.2-8-10.3V5.2L12 2.4Z" fill="${color}" />
      <path d="M12 5.6v12.3c2.85-1.05 4.8-3.55 4.8-6.8V7.45L12 5.6Z" fill="${shadowColor}" />
    </svg>
  `;
}

function getBot(data, slug) {
  return data.bots.find((entry) => entry.slug === slug) || data.bots[0];
}

function renderHomeStats(data) {
  const target = document.querySelector("[data-bot-stats]");
  if (!target) return;
  const isV2 = document.body.classList.contains("site-v2");

  target.innerHTML = data.bots
    .map(
      (bot) => `
        <button class="${isV2 ? "v2-card" : "live-card"} bot-preview-card ${escapeHtml(bot.theme)}" type="button" data-product-switch="${escapeHtml(bot.slug)}" aria-pressed="false">
          <div class="card-topline">
            <span class="${isV2 ? "v2-kicker" : "section-number"}">${escapeHtml(bot.badge)}</span>
            <span class="live-status">${escapeHtml(bot.status)}</span>
          </div>
          <h2>${escapeHtml(bot.name)}</h2>
          <p>${escapeHtml(bot.short)}</p>
          <dl>
            <div><dt>Membres</dt><dd>${escapeHtml(bot.community?.membersLabel || "Non public")}</dd></div>
            <div><dt>En ligne</dt><dd>${escapeHtml(bot.community?.onlineLabel || "Non public")}</dd></div>
            <div><dt>Maj</dt><dd>${escapeHtml(formatDate(bot.lastUpdate?.date))}</dd></div>
          </dl>
        </button>
      `
    )
    .join("");
}

function renderHomeProduct(data, slug) {
  const selected = slug === "all" ? "all" : getBot(data, slug).slug;
  document.body.dataset.activeProduct = selected;
  document.body.classList.remove("product-swapped");
  window.requestAnimationFrame(() => document.body.classList.add("product-swapped"));

  document.querySelectorAll("[data-product-switch]").forEach((node) => {
    const active = node.dataset.productSwitch === selected;
    node.classList.toggle("is-active", active);
    node.setAttribute("aria-pressed", String(active));
  });

  renderLatestAdditions(data, selected);
}

function renderLatestAdditions(data, slug) {
  const target = document.querySelector("[data-release-list]");
  if (!target) return;

  const additions = (data.latestAdditions || [])
    .filter((item) => item.public !== false && (slug === "all" || !item.bot || item.bot === slug || item.bot === "all"))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);

  if (!additions.length) {
    target.innerHTML = "<p>Aucune nouveaute publique a afficher pour le moment.</p>";
    return;
  }

  target.innerHTML = additions
    .map(
      (item) => `
        <article class="release-item">
          <span>${escapeHtml(formatDate(item.date))}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `
    )
    .join("");
}

async function loadYouTubeVideos() {
  const target = document.querySelector("[data-youtube-videos]");
  if (!target) return;

  try {
    const response = await fetch("/api/youtube", { cache: "default" });
    const data = response.ok ? await response.json() : null;
    renderYouTubeVideos(data);
  } catch {
    renderYouTubeVideos(null);
  }
}

function renderYouTubeVideos(data) {
  const target = document.querySelector("[data-youtube-videos]");
  if (!target) return;

  const limit = Math.max(1, Math.min(6, Number(target.dataset.videoLimit) || 6));
  const videos = Array.isArray(data?.videos) ? data.videos.slice(0, limit) : [];
  if (!videos.length) {
    target.innerHTML = `
      <article class="youtube-video-card is-empty">
        <span>YouTube</span>
        <h3>Videos indisponibles pour le moment.</h3>
        <p>Le lien officiel reste accessible si le flux YouTube ne repond pas.</p>
        <a class="inline-link" href="https://www.youtube.com/@WarsNut0" target="_blank" rel="noopener noreferrer">Ouvrir la chaine</a>
      </article>
    `;
    return;
  }

  target.innerHTML = videos
    .map(
      (video, index) => `
        <a class="youtube-video-card ${index === 0 ? "is-featured" : ""}" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
          <span>${escapeHtml(formatDateTime(video.publishedAt))}</span>
          <img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" />
          <h3>${escapeHtml(video.title)}</h3>
          ${video.views ? `<p>${escapeHtml(formatNumberCompact(video.views))} vues</p>` : "<p>Nouvelle video YouTube</p>"}
        </a>
      `
    )
    .join("");
}

function formatNumberCompact(value) {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

let currentBotData = null;

function bindHomeInteractions() {
  document.addEventListener("click", (event) => {
    const node = event.target.closest("[data-product-switch]");
    if (!node || !currentBotData) return;
    renderHomeProduct(currentBotData, node.dataset.productSwitch);
    if (document.body.classList.contains("home-v2") && node.closest("[data-bot-stats]")) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.querySelector("#nouveautes")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    }
  });
}

function refreshHomeData() {
  return refreshBotDataInBackground();
}

function applyBotData(incoming) {
  const firstRender = !currentBotData;
  const data = mergeBotData(currentBotData, incoming);
  currentBotData = data;
  writeCachedBotData(data);
  const stats = document.querySelector("[data-bot-stats]");
  if (!stats?.contains(document.activeElement)) renderHomeStats(data);
  renderHomeProduct(data, document.body.dataset.activeProduct || "all");
  renderDiscordSnapshot(data);
  renderStaffTree(data);
  renderRoleGuide(data);
  if (firstRender) renderDocs(data);
  renderUpdatedDate(data);
  renderBotDetail(data);
  bindScrollReveal();
  if (firstRender) bindSectionSpy();
  return data;
}

function renderDiscordSnapshot(data) {
  const target = document.querySelector("[data-discord-snapshot]");
  if (!target) return;

  const discord = data.discord || {};
  const community = data.bots?.[0]?.community || {};
  const areas = (discord.areas || []).slice(0, 6);

  target.innerHTML = `
    <div class="server-snapshot-head">
      <div>
        <p class="v2-kicker">Serveur en direct</p>
        <h2>${escapeHtml(discord.name || community.name || "WarsNuto UNIVERS")}</h2>
        <p>${escapeHtml(discord.description || "Le Discord officiel de WarsNuto rassemble la communaute, les annonces, les videos et les animations du serveur.")}</p>
      </div>
      <dl class="server-metrics">
        <div><dt>Membres</dt><dd>${escapeHtml(community.membersLabel || "Non public")}</dd></div>
        <div><dt>En ligne</dt><dd>${escapeHtml(community.onlineLabel || "Non public")}</dd></div>
        <div><dt>Bots</dt><dd>${escapeHtml(discord.botsLabel || "19")}</dd></div>
      </dl>
    </div>
    <div class="server-area-grid">
      ${areas
        .map(
          (area) => `
            <article class="server-area-card">
              <h3>${escapeHtml(area.title)}</h3>
              <p>${escapeHtml(area.description)}</p>
              <div class="server-channel-tags">
                ${(area.channels || []).slice(0, 8).map((channel) => `<span># ${escapeHtml(channel)}</span>`).join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStaffTree(data) {
  const target = document.querySelector("[data-staff-tree]");
  if (!target) return;

  if (data.live?.staffSource !== "Roles Discord lus automatiquement") {
    if (!target.dataset.hasLiveStaff) target.innerHTML = `<div class="v2-section-head"><p class="v2-kicker">Staff</p><h2>Synchronisation de l'équipe</h2><p>La hiérarchie est vérifiée auprès de Discord. Elle s'actualisera automatiquement.</p></div>`;
    return;
  }
  target.dataset.hasLiveStaff = "true";
  const staff = data.discord?.staff || {};
  const tiers = staff.tiers || [];
  const legacyLevels = staff.levels || [];

  if (!tiers.length && !legacyLevels.length) {
    target.innerHTML = `
      <div class="v2-section-head">
        <p class="v2-kicker">Staff</p>
        <h2>Hierarchie du serveur.</h2>
        <p>L'organisation publique du staff n'est pas encore disponible.</p>
      </div>
    `;
    return;
  }

  const normalizedTiers = tiers.length
    ? tiers
    : legacyLevels.map((level) => ({
        label: level.role,
        summary: level.description,
        nodes: (level.members || []).map((member) => ({ name: member, role: level.role, note: level.description })),
      }));

  target.innerHTML = `
    <div class="v2-section-head">
      <p class="v2-kicker">Staff</p>
      <h2>${escapeHtml(staff.title || "Hierarchie du serveur")}</h2>
      <p>${escapeHtml(staff.description || "Organisation publique de l'equipe WarsNuto.")}</p>
    </div>
    <div class="staff-tree-wrap">
      <div class="staff-tree-meta">
        <span>${escapeHtml(staff.source || "Roles Discord")}</span>
        ${staff.updatedAt ? `<span>Mis a jour le ${escapeHtml(formatDate(staff.updatedAt))}</span>` : ""}
      </div>
      <div class="staff-tree" role="tree" aria-label="Hierarchie staff WarsNuto">
        ${normalizedTiers
        .map(
          (tier, index) => `
            <section class="staff-tier ${index === 0 ? "is-root" : ""}" role="group" aria-label="${escapeHtml(tier.label)}">
              <div class="staff-tier-label">
                <span style="${escapeHtml(staffIconStyle(tier.color))}">${staffIconSvg(tier.iconType, tier.color)}</span>
                <div>
                  <h3>${escapeHtml(tier.label)}</h3>
                </div>
              </div>
              <div class="staff-node-grid">
                ${(tier.nodes || []).length
                  ? tier.nodes
                      .map(
                        (member) => `
                          <article class="staff-node" role="treeitem" style="${escapeHtml(staffCardStyle(member.color || tier.color))}">
                            <span class="staff-node-icon" style="${escapeHtml(staffIconStyle(member.color || tier.color))}">${staffIconSvg(member.iconType || tier.iconType, member.color || tier.color)}</span>
                            <p class="v2-kicker">${escapeHtml(member.role || tier.label)}</p>
                            <h4>${escapeHtml(member.name)}</h4>
                            ${member.tag ? `<span class="staff-tag">@${escapeHtml(member.tag)}</span>` : ""}
                            <p>${escapeHtml(member.note || tier.summary || "")}</p>
                          </article>
                        `
                      )
                      .join("")
                  : `<article class="staff-node is-empty" role="treeitem" style="${escapeHtml(staffCardStyle(tier.color))}">
                      <span class="staff-node-icon" style="${escapeHtml(staffIconStyle(tier.color))}">${staffIconSvg(tier.iconType, tier.color)}</span>
                      <p class="v2-kicker">${escapeHtml(tier.label)}</p>
                      <h4>Aucun membre public</h4>
                      <p>Le role existe, mais aucun membre public n'est liste actuellement.</p>
                    </article>`}
              </div>
            </section>
          `
        )
        .join("")}
      </div>
    </div>
  `;
}

function renderRoleGuide(data) {
  const target = document.querySelector("[data-role-guide]");
  if (!target) return;

  const guide = data.discord?.roleGuide;
  const categories = guide?.categories || [];
  if (!categories.length) return;

  target.innerHTML = `
    <div class="v2-section-head">
      <p class="v2-kicker">Roles Discord</p>
      <h2>${escapeHtml(guide.title || "Les roles obtenables sur le serveur.")}</h2>
      <p>${escapeHtml(guide.description || "Liste publique des roles obtenables sur le serveur.")}</p>
      <div class="staff-tree-meta role-guide-meta">
        <span>${escapeHtml(guide.source || "Roles Discord")}</span>
        ${guide.updatedAt ? `<span>Mis a jour le ${escapeHtml(formatDate(guide.updatedAt))}</span>` : ""}
      </div>
    </div>

    <div class="role-guide-grid">
      ${categories
        .map(
          (category) => `
            <article class="role-guide-card ${category.wide ? "role-guide-card-wide" : ""}">
              <div class="role-guide-head">
                <span>${escapeHtml(category.number || "")}</span>
                <h3>${escapeHtml(category.title)}</h3>
              </div>
              ${category.note ? `<p class="role-guide-note">${escapeHtml(category.note)}</p>` : ""}
              <dl class="role-list ${category.wide ? "role-list-wide" : ""}">
                ${(category.roles || [])
                  .map(
                    (entry) => `
                      <div>
                        <dt class="role-badges">
                          ${(entry.names || [])
                            .map(
                              (role) => `
                                <span class="role-badge ${role.found ? "is-live" : ""}" data-role-primary="${escapeHtml(role.colors?.primary || role.color)}" data-role-secondary="${escapeHtml(role.colors?.secondary || "")}" data-role-tertiary="${escapeHtml(role.colors?.tertiary || "")}">
                                  <span class="role-label">@${escapeHtml(role.name)}</span>
                                </span>
                              `
                            )
                            .join("")}
                        </dt>
                        <dd>
                          ${escapeHtml(entry.description)}
                          ${entry.link ? ` <a href="${escapeHtml(entry.link)}" target="_blank" rel="noopener noreferrer">Ouvrir le formulaire</a>` : ""}
                        </dd>
                      </div>
                    `
                  )
                  .join("")}
              </dl>
            </article>
          `
        )
        .join("")}
    </div>
  `;
  applyRoleColors(target);
}

async function refreshDiscordRoles() {
  const target = document.querySelector("[data-role-guide]");
  if (!target) return;

  try {
    const data = await fetchBotPayload("/api/bots?roles=1");
    if (data?.discord?.roleGuide) {
      applyBotData(data);
    }
  } catch {
    // Keep the static snapshot when Discord is unavailable.
  }
}

function bindScrollReveal() {
  const nodes = Array.from(document.querySelectorAll(
    ".v2-hero-copy, .v2-hero-panel, .v2-stats, .v2-section, .v2-card, .v2-product, .release-item, .v2-community-strip, .server-area-card, .staff-node, .showcase-hero, .hero-orbit, .live-card, .community-feature, .community-grid article, .youtube-section, .youtube-card, .onepage-bot, .latest-card, .member-flow article, .legal-links, .notice-panel, .docs-card, .metric-card, .bot-hero"
  )).filter(node => !node.classList.contains("reveal"));

  if (!nodes.length) return;

  if (!("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  nodes.forEach((node) => {
    node.classList.add("reveal");
    observer.observe(node);
  });
}

function bindSectionSpy() {
  const navLinks = Array.from(document.querySelectorAll(".nav a[href^='#']"));
  const sections = navLinks
    .map((link) => ({ link, section: document.querySelector(link.getAttribute("href")) }))
    .filter((entry) => entry.section);

  if (!sections.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      navLinks.forEach((link) => link.classList.remove("is-active"));
      const active = sections.find((entry) => entry.section === visible.target);
      active?.link.classList.add("is-active");
    },
    {
      rootMargin: "-28% 0px -56% 0px",
      threshold: [0.08, 0.2, 0.42],
    }
  );

  sections.forEach((entry) => observer.observe(entry.section));
}

function renderDocs(data) {
  const target = document.querySelector("[data-docs-grid]");
  if (!target) return;

  target.innerHTML = data.bots
    .map(
      (bot) => `
        <article class="docs-card docs-bot-section ${escapeHtml(bot.theme)}" id="${escapeHtml(bot.slug)}-doc">
          <div class="docs-card-head">
            <span class="section-number">Documentation ${escapeHtml(bot.badge)}</span>
            <strong>${escapeHtml(bot.status)}</strong>
          </div>
          <h2>${escapeHtml(bot.name)}</h2>
          <p>${escapeHtml(bot.description)}</p>
          <div class="docs-bot-layout">
            <div>
              <h3>Modules</h3>
              <ul>${(bot.modules || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
            <div>
              ${(bot.commands || []).length ? `<h3>Commandes membres</h3><p class="command-list">${bot.commands.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</p>` : "<h3>Tickets</h3><p>Demandes accessibles depuis le panel de tickets du serveur.</p>"}
              <h3>Donnees utilisees</h3>
              <p>${escapeHtml(bot.dataUse)}</p>
              <a class="inline-link" href="${escapeHtml(bot.page)}">Voir la fiche ${escapeHtml(bot.badge)}</a>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderUpdatedDate(data) {
  const target = document.querySelector("[data-site-updated]");
  if (!target || !data.updatedAt) return;
  target.textContent = `Derniere mise a jour : ${formatDate(data.updatedAt)}`;
}

function renderBotDetail(data) {
  const slug = document.body.dataset.botPage;
  const target = document.querySelector("[data-bot-detail]");
  if (!slug || !target) return;

  const bot = getBot(data, slug);
  const onlineCount = bot.community?.onlineLabel ?? "Non public";
  const serverName = bot.community?.name || "WarsNuto UNIVERS";
  const memberLabel = bot.community?.membersLabel || "Non public";
  const sourceLabel = bot.community?.membersSource || "Snapshot public";
  const releases = (data.latestAdditions || [])
    .filter((item) => item.public !== false && (!item.bot || item.bot === slug || item.bot === "all"))
    .slice(0, 3);

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
        <div><dt>Derniere mise a jour</dt><dd>${escapeHtml(formatDate(bot.lastUpdate?.date))}</dd></div>
        <div><dt>Note</dt><dd>${escapeHtml(bot.lastUpdate?.label)}</dd></div>
      </dl>
    </article>

    <article class="docs-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Modules</span>
      <h2>Ce que fait ${escapeHtml(bot.badge)}</h2>
      <ul>${(bot.modules || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>

    <article class="docs-card ${escapeHtml(bot.theme)}">
      <span class="section-number">Derniers ajouts</span>
      <h2>Nouveautes publiques</h2>
      <div class="release-list compact">${releases.map((item) => `
        <article class="release-item">
          <span>${escapeHtml(formatDate(item.date))}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </article>`).join("") || "<p>Aucune nouveaute publique a afficher.</p>"}
      </div>
    </article>

    <article class="docs-card ${escapeHtml(bot.theme)}">
      <span class="section-number">${(bot.commands || []).length ? "Commandes" : "Tickets"}</span>
      ${(bot.commands || []).length ? `<h2>Commandes membres</h2><p class="command-list">${bot.commands.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</p>` : "<h2>Demandes de support</h2><p>Demandes accessibles depuis le panel de tickets du serveur.</p>"}
      <h3>Donnees utilisees</h3>
      <p>${escapeHtml(bot.dataUse)}</p>
      <h3>Usage WarsNuto</h3>
      <p>${escapeHtml(data.officialUse)}</p>
    </article>
  `;
}

function renderApiError() {
  document.querySelectorAll("[data-bot-stats], [data-docs-grid], [data-bot-detail]").forEach((node) => {
    node.innerHTML = `
      <article class="live-card api-state-card">
        <span class="section-number">Info</span>
        <h2>Donnees indisponibles</h2>
        <p>La documentation reste accessible, mais l'API publique ne repond pas pour le moment.</p>
        <a class="inline-link" href="/api/bots">Reessayer l'API</a>
      </article>
    `;
  });
}

function refreshAllDiscordData() {
  if (document.hidden) return;
  refreshHomeData();
  refreshDiscordRoles();
  refreshStaffInBackground();
}

bindHomeInteractions();
loadBotData().then(applyBotData).catch(renderApiError).finally(() => {
  refreshAllDiscordData();
  window.setInterval(() => { if (!document.hidden) refreshHomeData(); }, 30000);
  window.setInterval(refreshAllDiscordData, 60000);
  document.addEventListener("visibilitychange", refreshAllDiscordData);
});

loadYouTubeVideos();
