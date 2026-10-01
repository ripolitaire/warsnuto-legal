const snapshot = require("./bots-data.json");

const DISCORD_API = "https://discord.com/api/v10";
const DEFAULT_INVITE_CODE = "warsnuto";

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  const data = clone(snapshot);
  const community = data.bots?.[0]?.community || {};
  const guildId = process.env.WARSNUTO_GUILD_ID || community.guildId;
  const inviteCode = process.env.WARSNUTO_INVITE_CODE || community.inviteCode || DEFAULT_INVITE_CODE;

  const counts = (await fetchInviteCounts(inviteCode)) || (await fetchGuildCounts(guildId));
  if (counts?.members) {
    for (const bot of data.bots) {
      bot.community.membersLabel = formatNumber(counts.members);
      bot.community.membersSource = counts.source;
      if (counts.online !== null && counts.online !== undefined) {
        bot.community.onlineLabel = formatNumber(counts.online);
      }
    }

    data.live = {
      source: counts.source,
      fetchedAt: new Date().toISOString(),
    };
  } else {
    data.live = {
      source: "Snapshot local",
      fetchedAt: new Date().toISOString(),
    };
  }

  res.status(200).json(data);
};

async function fetchInviteCounts(inviteCode) {
  if (!inviteCode || typeof fetch !== "function") return null;

  try {
    const response = await fetch(`${DISCORD_API}/invites/${encodeURIComponent(inviteCode)}?with_counts=true`, {
      headers: {
        "User-Agent": "WarsNuto-Legal-Site/1.0",
      },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const members = Number(payload.approximate_member_count);
    if (!Number.isFinite(members) || members <= 0) return null;

    return {
      members,
      online: numberOrNull(payload.approximate_presence_count),
      source: "Discord Invite",
    };
  } catch {
    return null;
  }
}

async function fetchGuildCounts(guildId) {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!guildId || !token || typeof fetch !== "function") return null;

  try {
    const response = await fetch(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, {
      headers: {
        Authorization: `Bot ${token}`,
        "User-Agent": "WarsNuto-Legal-Site/1.0",
      },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const members = Number(payload.approximate_member_count || payload.member_count);
    if (!Number.isFinite(members) || members <= 0) return null;

    return {
      members,
      online: numberOrNull(payload.approximate_presence_count),
      source: "Discord API",
    };
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
