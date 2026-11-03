const fs = require('node:fs'), path = require('node:path');
const BOTS = { protect: 'WarsNuto Protect', game: 'WarsNuto Game', support: 'WarsNuto Support' };
const FRESH_MS = 45000, CACHE_MS = 5000, MAX_BYTES = 8192;
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
function normalize(row, id, now) {
  const gateway = row?.gateway, runtime = row?.runtime, activity = row?.activity;
  if (row?.version !== 1 || row.bot !== id || !integer(row.pid) || row.pid === 0 ||
    !integer(row.sampledAt) || row.sampledAt > now + 5000 || !integer(row.startedAt) || row.startedAt > row.sampledAt ||
    typeof gateway?.ready !== 'boolean' || !integer(gateway.guildCount, 1000000) ||
    !(gateway.botUserId === null || (typeof gateway.botUserId === 'string' && /^\d{17,20}$/.test(gateway.botUserId))) ||
    !(gateway.latencyMs === null || integer(gateway.latencyMs, 300000)) ||
    !integer(runtime?.rssBytes, 2 ** 48) || !integer(activity?.commandsSinceStart) ||
    !(activity.lastCommandAt === null || integer(activity.lastCommandAt, row.sampledAt))) throw Error('Invalid telemetry snapshot');
  return { id, name: BOTS[id], status: now - row.sampledAt > FRESH_MS ? 'stale' : gateway.ready ? 'available' : 'disconnected',
    sampledAt: row.sampledAt, startedAt: row.startedAt, botUserId: gateway.botUserId,
    latencyMs: gateway.latencyMs, guildCount: gateway.guildCount, rssBytes: runtime.rssBytes,
    commandsSinceStart: activity.commandsSinceStart, lastCommandAt: activity.lastCommandAt };
}
function createBotMonitor(config) {
  let cached, pending;
  async function one(id, now) {
    const empty = { id, name: BOTS[id], status: config.telemetryDirectory ? 'unavailable' : 'not_connected' };
    if (!config.telemetryDirectory) return empty;
    let file;
    try {
      const filename = path.join(config.telemetryDirectory, id + '.json');
      if (!(await fs.promises.lstat(filename)).isFile()) return empty;
      file = await fs.promises.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = await file.stat(); if (!stat.isFile() || stat.size > MAX_BYTES) return empty;
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > MAX_BYTES) return empty;
      return normalize(JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')), id, now);
    } catch { return empty; } finally { await file?.close().catch(() => {}); }
  }
  return async function read() {
    const now = config.now();
    if (cached && now >= cached.checkedAt && now - cached.checkedAt < CACHE_MS) return cached;
    if (pending) return pending;
    pending = (async () => {
      const bots = [];
      for (const id of Object.keys(BOTS)) bots.push(await one(id, now));
      cached = { checkedAt: now, refreshAfterMs: 15000, staleAfterMs: FRESH_MS, bots };
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
module.exports = { createBotMonitor, normalize, BOTS, FRESH_MS };
