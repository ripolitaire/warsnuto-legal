const test = require('node:test'), assert = require('node:assert/strict');
const { createYouTubeHandler, parseVideos, parseChannelPage } = require('../api/youtube');
const channel = 'UCJj5mFbTiPgjgPH3Ao3f2Mw', id = 'j2tpYXhhuFM';
const entry = { contentId: id, contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', metadata: { lockupMetadataViewModel: { title: { content: 'Une vraie vidéo & un titre' }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'il y a 2 j' } }, { accessibilityLabel: '14 mille vues' }] }] } } } } };
const html = (externalId = channel) => '<script>var ytInitialData = ' + JSON.stringify({ metadata: { channelMetadataRenderer: { externalId } }, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: { contents: [{ richItemRenderer: { content: { lockupViewModel: entry } } }] } } } }] } } }) + ';</script>';
const rss = '<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>' + id + '</yt:videoId><title>Épisode &amp; &#233;té</title><published>2026-11-05T12:00:00Z</published></entry></feed>';
async function invoke(handler, method = 'GET') {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ method }, res); return res;
}
test('YouTube XML parser decodes Unicode/entities and rejects invalid video IDs', () => {
  assert.equal(parseVideos(rss)[0].title, 'Épisode & été');
  assert.equal(parseVideos(rss.replace(id, 'javascript:alert(1)')).length, 0);
});
test('YouTube channel fallback reads only structured videos of the expected channel', () => {
  const video = parseChannelPage(html(), channel)[0]; assert.equal(video.id, id); assert.equal(video.publishedAt, null); assert.equal(video.publishedLabel, 'il y a 2 j'); assert.equal(video.viewsLabel, '14 mille vues');
  assert.throws(() => parseChannelPage(html('UCaaaaaaaaaaaaaaaaaaaaaa'), channel), /Unexpected/);
  assert.throws(() => parseChannelPage('<script>var ytInitialData = alert(1);</script>', channel), /Unexpected/);
});
test('unavailable RSS recovers through the official public channel, sharing concurrent fetches', async () => {
  let calls = 0; const handler = createYouTubeHandler({ fetcher: async url => { calls++; await new Promise(r => setTimeout(r, 2)); return url.includes('/feeds/') ? new Response('', { status: 404 }) : new Response(html()); } });
  const responses = await Promise.all([invoke(handler), invoke(handler), invoke(handler)]);
  assert.equal(calls, 2); assert.ok(responses.every(r => r.statusCode === 200 && r.body.videos.length === 1)); assert.equal(responses[0].body.source, 'YouTube channel');
});
test('healthy RSS does not need channel HTML, HEAD/method handling does not fetch', async () => {
  let calls = 0; const handler = createYouTubeHandler({ fetcher: async () => { calls++; return new Response(rss); } });
  assert.equal((await invoke(handler, 'HEAD')).statusCode, 200); assert.equal((await invoke(handler, 'POST')).statusCode, 405); assert.equal(calls, 0);
  assert.equal((await invoke(handler)).body.source, 'YouTube RSS'); assert.equal(calls, 1);
});
test('upstream failures are not CDN cached and retries are bounded', async () => {
  let time = Date.now(), calls = 0; const handler = createYouTubeHandler({ now: () => time, fetcher: async () => { calls++; throw Error('secret upstream details'); } });
  const result = await invoke(handler); assert.equal(result.statusCode, 503); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.doesNotMatch(JSON.stringify(result.body), /secret/);
  await invoke(handler); assert.equal(calls, 2); time += 61000; await invoke(handler); assert.equal(calls, 4);
});
test('last successful videos stay visible temporarily but never beyond 24 hours', async () => {
  let time = Date.now(), offline = false; const handler = createYouTubeHandler({ now: () => time, fetcher: async () => { if (offline) throw Error('offline'); return new Response(rss); } });
  const initial = await invoke(handler); offline = true; time += 11 * 60000;
  const stale = await invoke(handler); assert.equal(stale.statusCode, 200); assert.equal(stale.body.stale, true); assert.equal(stale.body.fetchedAt, initial.body.fetchedAt);
  time += 25 * 3600000; assert.equal((await invoke(handler)).statusCode, 503);
});
test('only known YouTube redirects are followed, response sizes and environment URLs are bounded', async () => {
  const seen = []; const handler = createYouTubeHandler({ fetcher: async url => { seen.push(url); return url.includes('/feeds/') ? new Response('', { status: 404 }) : url.includes('consent') ? new Response(html()) : new Response('', { status: 302, headers: { location: 'https://consent.youtube.com/example' } }); } });
  assert.equal((await invoke(handler)).statusCode, 200); assert.equal(seen.length, 3);
  let external = false; const unsafe = createYouTubeHandler({ fetcher: async url => { if (!url.startsWith('https://www.youtube.com/')) external = true; return new Response('', { status: 302, headers: { location: 'http://127.0.0.1:3100' } }); } });
  assert.equal((await invoke(unsafe)).statusCode, 503); assert.equal(external, false);
  assert.equal((await invoke(createYouTubeHandler({ handle: '@bad/../../', fetcher: () => { throw Error('must not fetch'); } }))).statusCode, 503);
  assert.equal((await invoke(createYouTubeHandler({ fetcher: async () => new Response('a'.repeat(3 * 1024 * 1024 + 1)) }))).statusCode, 503);
});
