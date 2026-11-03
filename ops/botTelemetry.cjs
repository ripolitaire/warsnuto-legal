const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const attached = new WeakMap();
function snapshot(client, id, activity, now = Date.now()) {
  const ping = client.ws?.ping;
  return { version: 1, bot: id, sampledAt: now, pid: process.pid,
    startedAt: Math.floor(now - process.uptime() * 1000),
    gateway: { ready: client.isReady(), botUserId: client.user?.id || null,
      guildCount: client.guilds?.cache?.size || 0, latencyMs: Number.isFinite(ping) && ping >= 0 ? Math.round(ping) : null },
    runtime: { rssBytes: process.memoryUsage().rss },
    activity: { commandsSinceStart: activity.commandsSinceStart, lastCommandAt: activity.lastCommandAt } };
}
function startBotTelemetry(client, id, { directory = process.env.WARSNUTO_TELEMETRY_DIRECTORY, intervalMs = 15000, logger = console } = {}) {
  if (!directory) return () => {};
  if (!['protect', 'game', 'support'].includes(id) || !path.isAbsolute(directory)) {
    logger.warn('[WebTelemetry] Invalid configuration; monitoring disabled.'); return () => {};
  }
  if (attached.has(client)) return attached.get(client);
  const activity = { commandsSinceStart: 0, lastCommandAt: null };
  let writing = false, stopped = false, warned = false;
  async function publish() {
    if (writing || stopped) return;
    writing = true;
    const temporary = path.join(directory, '.' + id + '-' + process.pid + '-' + crypto.randomBytes(6).toString('hex'));
    try {
      // Atomic, allowlisted snapshot only: never serialize a Discord client or interaction.
      await fs.writeFile(temporary, JSON.stringify(snapshot(client, id, activity)), { mode: 0o640, flag: 'wx' });
      await fs.chmod(temporary, 0o640);
      if (!stopped) await fs.rename(temporary, path.join(directory, id + '.json'));
      warned = false;
    } catch {
      if (!warned) logger.warn('[WebTelemetry] Snapshot unavailable; bot operation is unchanged.');
      warned = true;
    } finally { await fs.unlink(temporary).catch(() => {}); writing = false; }
  }
  function command(interaction) {
    if (interaction.isChatInputCommand?.()) { activity.commandsSinceStart++; activity.lastCommandAt = Date.now(); }
  }
  client.on('interactionCreate', command);
  client.on('clientReady', publish);
  client.on('shardDisconnect', publish);
  client.on('shardResume', publish);
  const timer = setInterval(publish, intervalMs); timer.unref?.();
  const stop = () => {
    stopped = true; clearInterval(timer);
    client.removeListener('interactionCreate', command);
    for (const event of ['clientReady', 'shardDisconnect', 'shardResume']) client.removeListener(event, publish);
    attached.delete(client);
  };
  attached.set(client, stop); void publish(); return stop;
}
module.exports = { startBotTelemetry, snapshot };
