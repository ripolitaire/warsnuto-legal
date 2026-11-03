const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UCJj5mFbTiPgjgPH3Ao3f2Mw";
const CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE || "@WarsNut0";
const CHANNEL_URL = `https://www.youtube.com/${CHANNEL_HANDLE}`;
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CACHE_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3500;

let cache = null;

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
  res.setHeader("Vary", "Accept-Encoding");

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  if (req.method && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  if (cache && cache.expiresAt > Date.now()) {
    res.status(200).json(cache.value);
    return;
  }

  try {
    const response = await fetchWithTimeout(RSS_URL, {
      headers: {
        "User-Agent": "WarsNuto-Legal-Site/1.0",
        Accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube RSS ${response.status}`);
    }

    const xml = await response.text();
    const videos = parseVideos(xml).slice(0, 6);
    const value = {
      ok: true,
      channel: {
        id: CHANNEL_ID,
        handle: CHANNEL_HANDLE,
        url: CHANNEL_URL,
        feed: RSS_URL,
      },
      videos,
      source: "YouTube RSS",
      fetchedAt: new Date().toISOString(),
    };

    cache = {
      expiresAt: Date.now() + CACHE_MS,
      value,
    };

    res.status(200).json(value);
  } catch (error) {
    const fallback = cache?.value || {
      ok: false,
      channel: {
        id: CHANNEL_ID,
        handle: CHANNEL_HANDLE,
        url: CHANNEL_URL,
      },
      videos: [],
      source: "YouTube RSS",
      message: error.message || "Flux YouTube indisponible.",
      fetchedAt: new Date().toISOString(),
    };

    res.status(cache?.value ? 200 : 503).json(fallback);
  }
};

function parseVideos(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries
    .map((entry) => {
      const id = textBetween(entry, "yt:videoId");
      const title = decodeXml(textBetween(entry, "title"));
      const publishedAt = textBetween(entry, "published");
      const updatedAt = textBetween(entry, "updated");
      const url = id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : textBetween(entry, "link");
      const thumbnail = attr(entry, "media:thumbnail", "url") || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "");
      const description = decodeXml(textBetween(entry, "media:description")).trim();
      const views = Number(attr(entry, "media:statistics", "views")) || null;

      if (!id || !title) return null;

      return {
        id,
        title,
        url,
        thumbnail,
        publishedAt,
        updatedAt,
        description: description.slice(0, 220),
        views,
      };
    })
    .filter(Boolean);
}

function textBetween(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  return xml.match(pattern)?.[1]?.trim() || "";
}

function attr(xml, tag, name) {
  const pattern = new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"[^>]*>`, "i");
  return decodeXml(xml.match(pattern)?.[1] || "");
}

function decodeXml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timeout.unref?.();

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
