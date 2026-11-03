// Existing public-site regression suite, retained in its own repository.
const { test } = require("node:test");
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const code = fs.readFileSync(require.resolve("../app.js"), "utf8").split("function escapeHtml")[0];
function load(fetcher, storage = { getItem: () => null, setItem() {} }) {
  const context = { Date, URL, AbortController, setTimeout, clearTimeout, fetch: fetcher, localStorage: storage,
    document: { querySelector: () => null }, applyBotData: data => data };
  vm.runInNewContext(code, context); return context;
}
function data(source = "Discord Invite", stamp = "2026-10-29T00:00:00Z", members = "15500") {
  return { bots: [{ slug: "game", community: { membersLabel: members, onlineLabel: "1200", membersSource: source } }],
    discord: { staff: { tiers: [] }, roleGuide: { categories: [] } }, live: { source, countsFetchedAt: stamp, fetchedAt: stamp } };
}
test("static or roles-only replies never replace newer live Discord counters", () => {
  const app = load(() => {}), live = data();
  const result = app.mergeBotData(live, data("Snapshot local", "2026-10-29T00:00:30Z", "14986"));
  assert.equal(result.bots[0].community.membersLabel, "15500"); assert.equal(result.live.source, "Discord Invite");
  assert.equal(result.live.countsFetchedAt, live.live.countsFetchedAt);
});
test("a late hierarchy response cannot overwrite counters sampled more recently", () => {
  const app = load(() => {});
  const result = app.mergeBotData(data("Discord Invite", "2026-10-29T00:01:00Z", "15510"), data("Discord Invite", "2026-10-29T00:00:00Z", "15500"));
  assert.equal(result.bots[0].community.membersLabel, "15510");
});
test("light responses preserve verified staff and role colors instead of empty snapshots", () => {
  const app = load(() => {}), previous = data();
  previous.discord.staff = { tiers: [{ label: "Live" }] }; previous.discord.roleGuide = { categories: [{ name: "Colors" }] };
  previous.live.staffSource = "Roles Discord lus automatiquement"; previous.live.roleSource = "Couleurs Discord lues automatiquement";
  const result = app.mergeBotData(previous, data());
  assert.equal(result.discord.staff.tiers[0].label, "Live"); assert.equal(result.discord.roleGuide.categories[0].name, "Colors");
});
test("parallel calls for one endpoint share one fetch and release it after completion", async () => {
  let calls = 0, release;
  const response = new Promise(resolve => { release = resolve; });
  const app = load(async () => { calls++; await response; return { ok: true, json: async () => data() }; });
  const first = app.fetchBotPayload("/api/bots?live=1&staff=0"), second = app.fetchBotPayload("/api/bots?live=1&staff=0");
  assert.equal(first, second); assert.equal(calls, 1); release(); await first;
  await app.fetchBotPayload("/api/bots?live=1&staff=0"); assert.equal(calls, 2);
});
test("aborted requests are removed so the next refresh can recover", async () => {
  let fail = true;
  const app = load(async (_, options) => fail ? new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))) : { ok: true, json: async () => data() });
  await assert.rejects(app.fetchBotPayload("/api/bots", 5), /aborted/);
  fail = false; assert.ok((await app.fetchBotPayload("/api/bots")).bots);
});
test("browser cache expires after thirty seconds, not five minutes", () => {
  const app = load(() => {}, { getItem: () => JSON.stringify({ data: data(), cachedAt: Date.now() - 31000 }), setItem() {} });
  assert.equal(app.readCachedBotData(), null);
});
