const cheerio = require('cheerio');
const DEFAULT_CHANNEL_ID = 'UCJj5mFbTiPgjgPH3Ao3f2Mw';
const videoId = value => /^[A-Za-z0-9_-]{11}$/.test(value || '');
const youtubeText = value => value?.simpleText || value?.runs?.map(run => run.text).join('') || '';
const video = (id, title, extra = {}) => ({ id, title: title.slice(0, 300), url: 'https://www.youtube.com/watch?v=' + id, thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', publishedAt: null, views: null, ...extra });

function parseVideos(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('entry').toArray().flatMap(entry => {
    const node = $(entry), id = node.find('yt\\:videoId').text().trim(), title = node.find('title').first().text().trim();
    if (!videoId(id) || !title) return [];
    const date = node.find('published').text(), views = Number(node.find('media\\:statistics').attr('views'));
    return [video(id, title, { publishedAt: Number.isFinite(Date.parse(date)) ? date : null, views: views > 0 ? views : null, description: node.find('media\\:description').text().slice(0, 220) })];
  }).slice(0, 6);
}
function parseChannelPage(html, channelId) {
  const $ = cheerio.load(html); let data;
  for (const script of $('script').toArray()) {
    const source = $(script).text().trim(), prefix = 'var ytInitialData = ';
    if (!source.startsWith(prefix)) continue;
    try { data = JSON.parse(source.slice(prefix.length).replace(/;\s*$/, '')); } catch { continue; }
    break;
  }
  // Only the channel's selected Videos tab, never recommendations or another channel.
  if (data?.metadata?.channelMetadataRenderer?.externalId !== channelId) throw Error('Unexpected YouTube channel');
  const selected = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.map(tab => tab.tabRenderer).find(tab => tab?.selected);
  const entries = selected?.content?.richGridRenderer?.contents || [];
  return entries.flatMap(entry => {
    const content = entry.richItemRenderer?.content, old = content?.videoRenderer, current = content?.lockupViewModel;
    if (old && videoId(old.videoId)) return [video(old.videoId, youtubeText(old.title), { publishedLabel: youtubeText(old.publishedTimeText), viewsLabel: youtubeText(old.viewCountText) })];
    if (current?.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO' || !videoId(current.contentId)) return [];
    const metadata = current.metadata?.lockupMetadataViewModel, title = metadata?.title?.content;
    if (!title) return [];
    const parts = metadata.metadata?.contentMetadataViewModel?.metadataRows?.flatMap(row => row.metadataParts || []) || [];
    return [video(current.contentId, title, { publishedLabel: parts.find(part => /^(?:il y a|diffusé|première|streamed|\d+.*ago)/i.test(part.accessibilityLabel || part.text?.content || ''))?.text?.content || '',
      viewsLabel: parts.find(part => /vues?|views?/i.test(part.accessibilityLabel || part.text?.content || ''))?.accessibilityLabel || '' })];
  }).filter(item => item.title).slice(0, 6);
}
function createYouTubeHandler({ fetcher = fetch, now = Date.now, channelId = process.env.YOUTUBE_CHANNEL_ID || DEFAULT_CHANNEL_ID, handle = process.env.YOUTUBE_CHANNEL_HANDLE || '@WarsNut0' } = {}) {
  const channel = { id: channelId, handle, url: 'https://www.youtube.com/' + handle };
  const valid = /^UC[A-Za-z0-9_-]{22}$/.test(channelId) && /^@[A-Za-z0-9_.-]{3,40}$/.test(handle);
  let cache, pending, retryAt = 0, freshUntil = 0;
  async function fetchText(url, xml = false) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4500); timeout.unref?.();
    try {
      let response;
      for (let hop = 0; hop < 5; hop++) {
        response = await fetcher(url, { headers: { 'User-Agent': 'WarsNuto-Legal-Site/1.0', 'Accept-Language': 'fr-FR,fr;q=0.9', Accept: xml ? 'application/atom+xml,application/xml' : 'text/html' }, signal: controller.signal, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        await response.body?.cancel();
        const next = new URL(response.headers.get('location'), url);
        if (next.protocol !== 'https:' || !['www.youtube.com', 'consent.youtube.com'].includes(next.hostname) || next.username || next.password || next.port) throw Error('Unexpected YouTube redirect');
        url = next.href;
      }
      if (!response.ok) { await response.body?.cancel(); throw Error('YouTube unavailable'); }
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 3 * 1024 * 1024) throw Error('YouTube response too large'); chunks.push(Buffer.from(value)); } }
      finally { await reader.cancel().catch(() => {}); }
      return Buffer.concat(chunks).toString('utf8');
    } finally { clearTimeout(timeout); }
  }
  async function refresh() {
    if (!valid) throw Error('Invalid channel configuration');
    let videos, source = 'YouTube RSS';
    try { videos = parseVideos(await fetchText('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId, true)); if (!videos.length) throw Error('Empty RSS'); }
    catch {
      videos = parseChannelPage(await fetchText(channel.url + '/videos'), channelId); source = 'YouTube channel';
      if (!videos.length) throw Error('No public videos');
    }
    cache = { ok: true, channel, videos, source, fetchedAt: new Date(now()).toISOString() }; freshUntil = retryAt = now() + 10 * 60000;
    return cache;
  }
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'HEAD') return res.status(200).end();
    if (req.method && req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    const usable = () => cache && now() - Date.parse(cache.fetchedAt) <= 24 * 3600000;
    try {
      if (!cache || now() >= retryAt) {
        if (now() < retryAt) throw Error('Retry later');
        if (!pending) pending = refresh().catch(error => { retryAt = now() + 60000; throw error; }).finally(() => { pending = null; });
        await pending;
      }
      if (!usable()) throw Error('Expired cache');
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ ...cache, stale: now() >= freshUntil });
    } catch {
      if (usable()) { res.setHeader('Cache-Control', 'public, s-maxage=60'); return res.status(200).json({ ...cache, stale: true }); }
      return res.status(503).json({ ok: false, channel, videos: [], message: 'Les vidéos YouTube sont temporairement indisponibles.' });
    }
  };
}
module.exports = createYouTubeHandler();
module.exports.createYouTubeHandler = createYouTubeHandler;
module.exports.parseVideos = parseVideos;
module.exports.parseChannelPage = parseChannelPage;
