const crypto = require("crypto");

const VERCEL_ANALYTICS_API = "https://api.vercel.com/v1/query/web-analytics";

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Vary", "Accept-Encoding");

  if (req.method && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const configuredKey = process.env.SITE_STATS_API_KEY;
  const allowPublicStats = process.env.ALLOW_PUBLIC_SITE_STATS === "true";
  if (!allowPublicStats && !configuredKey) {
    res.status(503).json({ ok: false, error: "site_stats_key_missing" });
    return;
  }

  if (configuredKey && !isSameSecret(getRequestKey(req), configuredKey)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const token = process.env.VERCEL_ANALYTICS_TOKEN || process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID || process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID || process.env.VERCEL_TEAM_ID;
  const slug = process.env.VERCEL_ANALYTICS_TEAM_SLUG;
  const days = clampDays(req.query?.days);
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);

  if (!token) {
    res.status(200).json({
      ok: false,
      status: "setup_required",
      message: "Configure VERCEL_ANALYTICS_TOKEN sur Vercel pour activer les statistiques live du site.",
      period: buildPeriod(days, since, until),
      source: "Vercel Web Analytics",
    });
    return;
  }

  if (!projectId) {
    res.status(200).json({
      ok: false,
      status: "setup_required",
      message: "Configure VERCEL_ANALYTICS_PROJECT_ID sur Vercel pour lire les statistiques du projet.",
      period: buildPeriod(days, since, until),
      source: "Vercel Web Analytics",
    });
    return;
  }

  try {
    const [views, topPages] = await Promise.all([
      fetchCount({ token, projectId, teamId, slug, since, until }),
      fetchTopPages({ token, projectId, teamId, slug, since, until }),
    ]);

    res.status(200).json({
      ok: true,
      source: "Vercel Web Analytics",
      project: "warsnuto-bots",
      period: buildPeriod(days, since, until),
      totals: {
        visits: views.visitors,
        pageViews: views.pageviews,
      },
      topPages,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: "analytics_unavailable",
      message: "Vercel Analytics did not return site stats.",
      period: buildPeriod(days, since, until),
      source: "Vercel Web Analytics",
    });
  }
};

async function fetchCount({ token, projectId, teamId, slug, since, until }) {
  const params = buildBaseParams({ projectId, teamId, slug, since, until });
  params.set("by", "day");

  const payload = await fetchVercel(`${VERCEL_ANALYTICS_API}/visits/aggregate?${params}`, token);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.reduce(
    (totals, row) => {
      const rowTotals = readVisitTotals(row);
      totals.pageviews += rowTotals.pageviews;
      totals.visitors += rowTotals.visitors;
      return totals;
    },
    { pageviews: 0, visitors: 0 }
  );
}

async function fetchTopPages({ token, projectId, teamId, slug, since, until }) {
  const params = buildBaseParams({ projectId, teamId, slug, since, until });
  params.set("by", "requestPath");
  params.set("limit", "5");

  try {
    const payload = await fetchVercel(`${VERCEL_ANALYTICS_API}/visits/aggregate?${params}`, token);
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.rows) ? payload.rows : [];
    return rows
      .map((row) => ({
        path: String(row.requestPath || row.path || row.key || row.name || "/"),
        visits: readVisitTotals(row).visitors,
        pageViews: readVisitTotals(row).pageviews,
      }))
      .filter((row) => row.visits > 0 || row.pageViews > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchVercel(url, token) {
  if (typeof fetch !== "function") {
    throw new Error("fetch_unavailable");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "WarsNuto-Site-Stats/1.0",
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `vercel_${response.status}`);
  }

  return payload;
}

function buildBaseParams({ projectId, teamId, slug, since, until }) {
  const params = new URLSearchParams();
  params.set("projectId", projectId);
  params.set("since", since.toISOString());
  params.set("until", until.toISOString());
  if (teamId) params.set("teamId", teamId);
  if (slug) params.set("slug", slug);
  return params;
}

function readVisitTotals(payload) {
  const data = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const pageviews = firstFiniteNumber([
    data?.pageviews,
    data?.pageViews,
    data?.views,
    data?.count,
    data?.total,
  ]);
  const visitors = firstFiniteNumber([
    data?.visitors,
    data?.visits,
    data?.uniqueVisitors,
    pageviews,
  ]);

  return {
    pageviews: Math.max(0, Math.floor(pageviews || 0)),
    visitors: Math.max(0, Math.floor(visitors || 0)),
  };
}

function firstFiniteNumber(values) {
  return values.map(Number).find((value) => Number.isFinite(value));
}

function clampDays(value) {
  const days = Math.floor(Number(value) || 7);
  return Math.min(90, Math.max(1, days));
}

function buildPeriod(days, since, until) {
  return {
    days,
    since: since.toISOString(),
    until: until.toISOString(),
  };
}

function getRequestKey(req) {
  return req.headers?.["x-site-stats-key"] || "";
}

function isSameSecret(input, expected) {
  const inputBuffer = Buffer.from(String(input || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer);
}
