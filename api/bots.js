const snapshot = require("./bots-data.json");

const DISCORD_API = "https://discord.com/api/v10";
const DEFAULT_INVITE_CODE = "warsnuto";
const DEFAULT_GUILD_ID = "1052863089692905493";
const STAFF_CACHE_MS = 60 * 1000;
const RESPONSE_CACHE_MS = 15 * 1000;
const DISCORD_TIMEOUT_MS = 5000;
const STAFF_TIMEOUT_MS = 45000;
const ROLE_DEFAULT_COLOR = "#8f98aa";
const EXCLUDED_STAFF_IDS = new Set(["974031935510818866"]);

const responseCache = new Map();
const responseInFlight = new Map();
const guildRolesCache = new Map();
const discordBlockedUntil = new Map();
let staffCache = null;
let staffInFlight = null;
let roleGuideCache = null;

const STAFF_TIER_DEFS = [
  {
    key: "creation",
    label: "Creation",
    icon: "WN",
    summary: "La tete de l'ecosysteme WarsNuto.",
    iconType: "crown",
    color: "#ffcc4d",
    roles: ["1052953841156497521", "1564350328252670013"],
    members: [{ id: "689040179943702547", name: "WarsNuto", role: "Leader", tag: "WarsNuto", iconType: "crown", color: "#ffcc4d" }],
  },
  {
    key: "administration",
    label: "Administration",
    roles: ["1052987822908391464"],
    icon: "AD",
    summary: "Gestion serveur, bots et equipe staff.",
    iconType: "tools",
    color: "#d84a4a",
    members: [
      {
        id: "1360350111611228450",
        name: "Soli",
        role: "Admin bot",
        tag: "1solitaire",
        note: "Developpement, maintenance et configuration des bots officiels.",
        color: "#d84a4a",
      },
      {
        id: "910972801362587659",
        name: "Killer_flow",
        role: "Admin serveur",
        tag: "killer_flow10",
        note: "Organisation globale du Discord, salons et decisions serveur.",
        color: "#d84a4a",
      },
      {
        id: "963503650314022922",
        name: "RSam",
        role: "Admin staff",
        tag: "riocat.chat",
        note: "Encadrement de l'equipe staff, moderation et suivi interne.",
        color: "#d84a4a",
      },
    ],
  },
  {
    key: "encadrement",
    label: "Encadrement",
    icon: "RG",
    summary: "Responsables et managers qui structurent les equipes.",
    iconType: "tools",
    color: "#4cadd0",
    roles: ["1498292470117830816", "1552331871021568143"],
    members: [
      {
        id: "1331389432494034999",
        name: "Wael",
        role: "Manager YouTube, partenariat, video",
        tag: "double_you350",
        note: "Coordination YouTube, partenariats et suivi video.",
        color: "#16d669",
      },
    ],
  },
  {
    key: "confirmed",
    label: "Moderation confirmee",
    icon: "CM",
    summary: "Les C-MODO qui gerent le terrain et accompagnent l'equipe.",
    iconType: "tools",
    color: "#e70de3",
    roles: ["1493872912552165486"],
  },
  {
    key: "moderation",
    label: "Moderation",
    icon: "MO",
    summary: "Les MODO actifs qui gardent les salons lisibles.",
    iconType: "tools",
    color: "#ffffff",
    roles: ["1465459339241193524"],
  },
  {
    key: "test",
    label: "Modo test",
    icon: "MT",
    summary: "Role d'essai pour les futurs moderateurs.",
    iconType: "tools",
    color: "#ff7800",
    roles: ["1052991598096560179"],
  },
];

const NAME_OVERRIDES = new Map([
  ["689040179943702547", "WarsNuto"],
  ["1360350111611228450", "Soli"],
  ["910972801362587659", "Killer_flow"],
  ["963503650314022922", "RSam"],
  ["1124329929031565423", "W-Sariel"],
  ["1331389432494034999", "Wael"],
  ["1183084353912307825", "Sha"],
  ["1438997182404366438", "AYDEN"],
  ["1060305188725989407", "Natrox"],
  ["1517190959534702664", "Zack X Nash"],
  ["1533958838930243745", "Alfaz"],
  ["1511526812361162792", "Jin"],
]);

const ROLE_LABEL_OVERRIDES = new Map([
  ["1498292470117830816", "Responsable moderation"],
  ["1493872912552165486", "C-MODO"],
  ["1465459339241193524", "MODO"],
  ["1052991598096560179", "Modo test"],
]);

const ROLE_GUIDE_DEFS = [
  {
    key: "assignable",
    title: "Roles attribuables",
    note: "La plupart se reclament via un ticket dans # tickets.",
    roles: [
      { names: ["Membres"], description: "Role attribue a l'arrivee dans le serveur." },
      { names: ["Non abonnees", "Abonnees"], description: "Roles a choisir dans Chercher des salons." },
      { names: ["Wars_family"], description: "Mettre le tag du serveur." },
      { names: ["Kawaii"], description: "Ajouter | Kawaii derriere son pseudo." },
      { names: ["Soutiens"], description: "Mettre https://discord.gg/warsnuto en statut, pas en bio." },
      { names: ["E-Girl"], description: "Role a demander a l'equipe de moderation." },
      { names: ["Monteur", "Miniamaker"], description: "Ouvrir un ticket et deposer vos oeuvres." },
      { names: ["Membre Equipage"], description: "Condition non publique pour le moment." },
      { names: ["Voc Master"], description: "Avoir un total de plusieurs heures de vocal sur le serveur." },
    ],
  },
  {
    key: "media",
    title: "Images et GIF",
    roles: [
      { names: ["Prestige"], description: "Role special donnant des avantages visuels selon la configuration du serveur." },
      { names: ["WarsNuto Booster"], description: "Booster le serveur. Donne aussi acces au salon # video-en-avance." },
      { names: ["Vip"], description: "Role privilegie selon les conditions annoncees sur le serveur." },
      { names: ["Donateurs"], description: "Avoir fait un don en commentaire ou en live sur la chaine YouTube de WarsNuto." },
      { names: ["DragonSub Celeste"], description: "Avoir paye un abonnement sur la chaine YouTube de WarsNuto." },
      { names: ["Youtubeur"], description: "Avoir au minimum 10k abonnes sur YouTube ou faire plus de 3k vues par video." },
    ],
  },
  {
    key: "special",
    title: "Roles speciaux",
    roles: [
      { names: ["Noble Chevalier Anobli par Warsnuto"], description: "Donne par @WarsNuto | Kawaii. Donne acces au vocal # Temple." },
      { names: ["Gagnant event"], description: "Gagner un evenement du serveur." },
      { names: ["OG"], description: "Faire partie des 100 premiers membres du serveur. Role non obtenable." },
      { names: ["Ancien Moderateur"], description: "Avoir anciennement ete moderateur ou plus." },
      { names: ["Bebou"], description: "Role special non public." },
    ],
  },
  {
    key: "functions",
    title: "Roles a fonctions",
    wide: true,
    roles: [
      { names: ["Modo YTB"], description: "Moderateur des commentaires YouTube." },
      { names: ["Trade admin gift"], description: "Traders des admins gifts." },
      { names: ["Gerant admin gift"], description: "Gerant des trades des admins gifts." },
      { names: ["Helper-Test", "Helper"], description: "Deposer sa candidature avec le formulaire dyno.gg/form/603696b4.", link: "https://dyno.gg/form/603696b4" },
      { names: ["TOP Helper"], description: "Avoir fait le plus d'aide parmi les helpers." },
      { names: ["Responsable Helpers"], description: "Responsable de l'equipe des helpers." },
      { names: ["Cybersecurite"], description: "Responsable de la securite du serveur." },
      { names: ["Manageur"], description: "Manager partenariats et pubs de WarsNuto." },
    ],
  },
];

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=15, stale-while-revalidate=15");
  res.setHeader("Vary", "Accept-Encoding");

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  if (req.method && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const includeLive = shouldIncludeLive(req);
  const includeStaff = includeLive && shouldIncludeStaff(req);
  const includeRoles = shouldIncludeRoles(req) || includeStaff;
  const cacheKey = `${includeLive}:${includeRoles}:${includeStaff}`;
  const deliver = (value) => {
    const missingStaff = includeStaff && value.live.staffSource !== "Roles Discord lus automatiquement";
    const missingRoles = includeRoles && value.live.roleSource !== "Couleurs Discord lues automatiquement";
    if (missingStaff || missingRoles) res.setHeader("Cache-Control", "no-store");
    res.status(200).json(clone(value));
  };
  const cachedResponse = responseCache.get(cacheKey);
  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    deliver(cachedResponse.value);
    return;
  }
  let pending = responseInFlight.get(cacheKey);
  if (!pending) {
    pending = buildResponse(includeLive, includeRoles, includeStaff, cacheKey);
    responseInFlight.set(cacheKey, pending);
  }
  try { deliver(await pending); }
  finally { if (responseInFlight.get(cacheKey) === pending) responseInFlight.delete(cacheKey); }
};

async function buildResponse(includeLive, includeRoles, includeStaff, cacheKey) {
  const data = clone(snapshot);
  const community = data.bots?.[0]?.community || {};
  const inviteCode = process.env.WARSNUTO_INVITE_CODE || community.inviteCode || DEFAULT_INVITE_CODE;
  const snapshotMembers = parseMemberLabel(community.membersLabel);
  const [rawCounts, liveStaff, liveRoleGuide] = await Promise.all([
    includeLive ? fetchInviteCounts(inviteCode) : null,
    includeStaff ? withTimeout(fetchLiveStaffTree(), STAFF_TIMEOUT_MS, null) : null,
    includeRoles ? withTimeout(fetchLiveRoleGuide(), DISCORD_TIMEOUT_MS, null) : null,
  ]);
  const counts = normalizeCounts(rawCounts, snapshotMembers, community);
  if (counts?.members) {
    for (const bot of data.bots) {
      bot.community.membersLabel = formatNumber(counts.members);
      bot.community.membersSource = counts.source;
      if (counts.online !== null && counts.online !== undefined) {
        bot.community.onlineLabel = formatNumber(counts.online);
      }
    }
  }

  data.discord.staff = liveStaff || {
    title: "Equipe staff", description: "La hiérarchie sera affichée après sa vérification auprès de Discord.",
    source: "Vérification Discord en attente", updatedAt: null, tiers: [],
  };

  data.discord.roleGuide = liveRoleGuide || buildRoleGuide();

  data.live = {
    source: counts?.source || "Snapshot local",
    staffSource: liveStaff ? liveStaff.source : "Snapshot local",
    roleSource: liveRoleGuide ? liveRoleGuide.source : "Snapshot local",
    fetchedAt: new Date().toISOString(),
    countsFetchedAt: counts?.fetchedAt || null,
    mode: includeLive ? "live" : includeRoles ? "roles" : "snapshot",
  };

  responseCache.set(cacheKey, {
    expiresAt: Date.now() + RESPONSE_CACHE_MS,
    value: data,
  });

  return data;
}

function shouldIncludeLive(req) {
  try {
    const url = new URL(req.url || "/", "https://warsnuto.com");
    return url.searchParams.get("live") === "1";
  } catch {
    return false;
  }
}

function shouldIncludeStaff(req) {
  try { return new URL(req.url || "/", "https://warsnuto.com").searchParams.get("staff") !== "0"; }
  catch { return true; }
}

function shouldIncludeRoles(req) {
  try {
    const url = new URL(req.url || "/", "https://warsnuto.com");
    return url.searchParams.get("roles") === "1";
  } catch {
    return false;
  }
}

async function fetchInviteCounts(inviteCode) {
  if (!inviteCode || typeof fetch !== "function") return null;

  try {
    const response = await fetchWithTimeout(`${DISCORD_API}/invites/${encodeURIComponent(inviteCode)}?with_counts=true`, {
      headers: {
        "User-Agent": "WarsNuto-Legal-Site/1.0",
      },
    }, DISCORD_TIMEOUT_MS);
    if (!response.ok) return null;

    const payload = await response.json();
    const members = Number(payload.approximate_member_count);
    if (!Number.isFinite(members) || members <= 0) return null;

    return {
      members,
      online: numberOrNull(payload.approximate_presence_count),
      source: "Discord Invite",
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchLiveStaffTree() {
  if (staffInFlight) return staffInFlight;
  staffInFlight = fetchLiveStaffTreeUnshared();
  try { return await staffInFlight; } finally { staffInFlight = null; }
}

async function fetchLiveStaffTreeUnshared() {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const guildId = process.env.WARSNUTO_GUILD_ID || process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;

  if (!token || !guildId || typeof fetch !== "function") return null;
  if (staffCache && staffCache.expiresAt > Date.now()) return clone(staffCache.value);

  try {
    const [roles, members] = await Promise.all([
      fetchGuildRoles(guildId, token),
      fetchGuildMembers(guildId, token, true),
    ]);

    if (!Array.isArray(roles) || !Array.isArray(members)) return null;

    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const memberMap = new Map(members.map((member) => [member.user.id, member]));
    const shown = new Set();
    const tiers = STAFF_TIER_DEFS.map((tier) => ({
      label: tier.label,
      icon: tier.icon,
      iconType: tier.iconType,
      color: tier.color,
      summary: tier.summary,
      nodes: buildTierNodes(tier, roleMap, memberMap, shown),
    }));

    const value = {
      title: "Equipe staff",
      description: "Une lecture publique de l'organisation du serveur avec les roles staff lus automatiquement.",
      source: "Roles Discord lus automatiquement",
      updatedAt: new Date().toISOString().slice(0, 10),
      syncedAt: new Date().toISOString(),
      tiers,
    };

    staffCache = {
      expiresAt: Date.now() + STAFF_CACHE_MS,
      value,
    };
    return clone(value);
  } catch {
    return null;
  }
}

async function fetchGuildRoles(guildId, token) {
  const cached = guildRolesCache.get(guildId);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (cached?.pending) return cached.pending;
  const pending = discordFetch(`/guilds/${guildId}/roles`, token);
  guildRolesCache.set(guildId, { pending });
  try {
    const value = await pending;
    if (!Array.isArray(value)) throw new Error("Invalid Discord roles");
    guildRolesCache.set(guildId, { value, expiresAt: Date.now() + STAFF_CACHE_MS });
    return value;
  } catch (error) { guildRolesCache.delete(guildId); throw error; }
}

async function fetchLiveRoleGuide() {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const guildId = process.env.WARSNUTO_GUILD_ID || process.env.DISCORD_GUILD_ID || DEFAULT_GUILD_ID;

  if (!token || !guildId || typeof fetch !== "function") return null;
  if (roleGuideCache && roleGuideCache.expiresAt > Date.now()) return clone(roleGuideCache.value);

  try {
    const roles = await fetchGuildRoles(guildId, token);
    if (!Array.isArray(roles)) return null;

    const value = buildRoleGuide(roles);
    roleGuideCache = {
      expiresAt: Date.now() + STAFF_CACHE_MS,
      value,
    };
    return clone(value);
  } catch {
    return null;
  }
}

function buildRoleGuide(roles = []) {
  const roleMap = new Map();
  for (const role of roles) {
    roleMap.set(normalizeRoleLookup(role.name), role);
  }

  return {
    title: "Les roles obtenables sur le serveur.",
    description: "La plupart des roles se reclament via un ticket dans # tickets. Les couleurs sont lues automatiquement depuis Discord quand l'API est disponible.",
    source: roles.length ? "Couleurs Discord lues automatiquement" : "Liste publique du serveur",
    updatedAt: new Date().toISOString().slice(0, 10),
    categories: ROLE_GUIDE_DEFS.map((category, index) => ({
      key: category.key,
      title: category.title,
      number: String(index + 1).padStart(2, "0"),
      note: category.note || "",
      wide: Boolean(category.wide),
      roles: category.roles.map((entry) => ({
        names: entry.names.map((name) => normalizeGuideRole(name, roleMap)),
        description: entry.description,
        link: entry.link || "",
      })),
    })),
  };
}

function normalizeGuideRole(name, roleMap) {
  const key = normalizeRoleLookup(name);
  const found = roleMap.get(key);
  const hex = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffff
    ? `#${value.toString(16).padStart(6, "0")}` : null;
  const primary = found?.colors?.primary_color ?? found?.color ?? 0;
  const colors = {
    primary: primary ? hex(primary) : null,
    secondary: hex(found?.colors?.secondary_color),
    tertiary: hex(found?.colors?.tertiary_color),
  };
  return {
    name: found?.name || name,
    color: colors.primary || ROLE_DEFAULT_COLOR,
    colors,
    hasColor: Boolean(colors.primary),
    id: found?.id || "",
    found: Boolean(found),
  };
}

function normalizeRoleLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "")
    .toLowerCase();
}

function buildTierNodes(tier, roleMap, memberMap, shown) {
  const nodes = [];

  const descriptions = new Map((tier.members || []).map(member => [member.id,member.note]));
  // Curated names and biographies never grant or retain a Discord staff grade.
  for (const roleId of tier.roles || []) {
    const role = roleMap.get(roleId);
    if (!role) continue;
    const roleMembers = Array.from(memberMap.values())
      .filter((member) => member.roles?.includes(roleId) && !member.user?.bot && !EXCLUDED_STAFF_IDS.has(member.user?.id))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "fr"));

    for (const member of roleMembers) {
      const id = member.user.id;
      if (shown.has(id)) continue;
      nodes.push(normalizeStaffMember({
        id,
        role: ROLE_LABEL_OVERRIDES.get(roleId) || cleanRoleName(role.name),
        color: role.color ? intToHexColor(role.color) : tier.color,
        iconType: tier.iconType,
        note: descriptions.get(id),
        member,
      }));
      shown.add(id);
    }
  }

  return nodes;
}

function normalizeStaffMember({ id, name, role, tag, note, color, iconType, member }) {
  return {
    id,
    name: NAME_OVERRIDES.get(id) || name || cleanDisplayName(displayName(member)),
    role,
    tag: tag || member?.user?.username || "",
    note,
    color: color || "#ffcc4d",
    iconType: iconType || "tools",
  };
}

function intToHexColor(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return `#${number.toString(16).padStart(6, "0")}`;
}

async function fetchGuildMembers(guildId, token, staffOnly = false) {
  // Disjoint user-ID ranges retain every member while loading four pages at once.
  // Boundaries are generic Discord account creation dates, never member fixtures.
  const snowflake = (date) => (BigInt(Date.parse(date) - 1420070400000) << 22n).toString();
  const year = new Date().getUTCFullYear();
  const staffRoles = new Set(STAFF_TIER_DEFS.flatMap(tier => tier.roles || []));
  const boundaries = ["0", ...[`${year - 5}-01-01`, `${year - 3}-01-01`, `${year - 1}-01-01`]
    .map(snowflake).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1), null];
  const ranges = await Promise.all(boundaries.slice(0, -1).map(async (lower, index) => {
    const upper = boundaries[index + 1];
    const members = [];
    let after = lower;
    for (let page = 0; page < 100; page++) {
      const batch = await discordFetch(`/guilds/${guildId}/members?limit=1000&after=${after}`, token);
      if (!Array.isArray(batch)) throw new Error("Invalid Discord member page");
      if (!batch.length) return members;
      let highest = BigInt(after);
      for (const member of batch) {
        const id = BigInt(member.user.id);
        if (id > highest) highest = id;
        if (id > BigInt(lower) && (upper === null || id <= BigInt(upper))
          && (!staffOnly || !member.user.bot && !EXCLUDED_STAFF_IDS.has(member.user.id) && member.roles?.some(role => staffRoles.has(role)))) members.push(member);
      }
      if (highest <= BigInt(after)) throw new Error("Discord member pagination did not advance");
      if (batch.length < 1000 || (upper !== null && highest >= BigInt(upper))) return members;
      after = highest.toString();
    }
    throw new Error("Discord member pagination exceeded its limit");
  }));
  return [...new Map(ranges.flat().map((member) => [member.user.id, member])).values()];
}

async function discordFetch(path, token) {
  const bucket = path.split("?")[0];
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = (discordBlockedUntil.get(bucket) || 0) - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const response = await fetchWithTimeout(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}`, "User-Agent": "WarsNuto-Legal-Site/1.0" },
    }, DISCORD_TIMEOUT_MS);
    if (response.headers?.get("x-ratelimit-remaining") === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset-after"));
      if (Number.isFinite(reset) && reset >= 0 && reset <= 15) discordBlockedUntil.set(bucket, Date.now() + Math.ceil(reset * 1000) + 50);
    }
    if (response.status === 429) {
      const body = await response.json();
      const retry = Number(body.retry_after ?? response.headers?.get("retry-after"));
      if (!Number.isFinite(retry) || retry < 0 || retry > 15) throw new Error("Discord API rate limit");
      discordBlockedUntil.set(bucket, Date.now() + Math.ceil(retry * 1000) + 50);
      continue;
    }
    if (!response.ok) throw new Error(`Discord API ${response.status}`);
    return response.json();
  }
  throw new Error("Discord API rate limit retry exhausted");
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function withTimeout(promise, timeoutMs, fallback) {
  let timeout;
  const timer = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(fallback), timeoutMs);
    timeout.unref?.();
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    clearTimeout(timeout);
  }
}

function cleanDisplayName(value) {
  return String(value || "Membre staff")
    .replace(/^\[[^\]]+\]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function cleanRoleName(value) {
  return String(value || "Staff").replace(/[-_]+/g, " ").trim();
}

function displayName(member) {
  return member?.nick || member?.user?.global_name || member?.user?.username || "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function parseMemberLabel(value) {
  const number = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeCounts(counts, snapshotMembers, community) {
  if (!counts?.members) {
    return snapshotMembers
      ? {
          members: snapshotMembers,
          online: numberOrNull(community.onlineLabel),
          source: "Snapshot local",
        }
      : null;
  }

  return counts;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
