const { createHash } = require('node:crypto');
const path = require('node:path');
const { ASSETS } = require('./assets');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status, publicMessage: message }); };
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const object = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail("Formulaire d'aventure invalide.");
};

function createWebAdventure({ store, game, catalog, voyage, halloween, enabled = false, testers = [], now = Date.now }) {
  const db = store.db;
  const one = (sql, ...args) => db.prepare(sql).get(...args) || null;
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const item = id => id?.startsWith('fruit:') ? catalog.FRUITS[id.slice(6)] : catalog.ITEMS[id];
  let webTablesReady = false;
  const bossImageAliases = {
    bandit_port: 'buggy',
    roi_des_mers: 'arlong',
    corsaire_dechu: 'crocodile',
    amiral_fugitif: 'lucci',
    yonko_rival: 'kaido',
    raid_marineford: 'akainu',
    big_mom_event: 'big_mom',
    barbe_noire_event: 'barbe_noire',
    saturn_event: 'saturn',
    imu_event: 'imu',
    ju_peter_event: 'ju_peter',
    mars_event: 'mars',
    warcury_event: 'warcury',
    nusjuro_event: 'nusjuro'
  };
  const bossImage = id => ASSETS.bosses[bossImageAliases[id] || id];
  const bossImages = Object.fromEntries([...Object.keys(catalog.BOSSES), ...Object.keys(catalog.CREW_BOSSES), ...Object.keys(catalog.SERVER_BOSSES)]
    .map(id => [id, bossImage(id) ? `/assets/adventure/bosses/${path.basename(bossImage(id))}` : null]));

  function ensureWebTables() {
    if (webTablesReady) return;
    db.exec(`CREATE TABLE IF NOT EXISTS adventure_web_receipts (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, operation_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(guild_id, user_id, operation_id)
    );
    CREATE TABLE IF NOT EXISTS adventure_web_heads (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, mode TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id, user_id, mode)
    );`);
    webTablesReady = true;
  }

  function access(guild, actor, mode) {
    if (!enabled || testers.length && !testers.includes(actor)) fail("L'aventure navigateur n'est pas encore ouverte a ce compte.", 403);
    if (!snowflake(guild) || !snowflake(actor) || !['normal', 'admin'].includes(mode)) fail("Profil d'aventure invalide.");
    if (store.isGameBlacklisted(guild, actor)) fail("Ton acces au jeu est bloque.", 403);
    if (store.getSetting(guild, 'game_enabled', '1') === '0') fail("L'aventure est en maintenance. Ta progression est conservee.", 503);
    const admin = store.isGameAdminMember(guild, actor);
    if (mode === 'admin' && !admin) fail('Le profil Admin Mod est reserve aux administrateurs Game.', 403);
    return { admin, partition: mode === 'admin' ? `adminmod|${guild}|${actor}` : guild };
  }

  function raw(guild, actor, mode, partition) {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    const crew = store.getCrewByUser(guild, actor);
    const raids = all(`SELECT r.* FROM team_raids r WHERE r.guild_id=? AND (r.owner_id=? OR r.thread_id IN
      (SELECT thread_id FROM team_raid_members WHERE guild_id=? AND user_id=?)) ORDER BY r.event_id DESC LIMIT 12`, guild, actor, guild, actor)
      .map(raid => ({ ...raid, members: all('SELECT * FROM team_raid_members WHERE guild_id=? AND thread_id=? ORDER BY position', guild, raid.thread_id) }));
    const trades = all(`SELECT * FROM player_trades WHERE guild_id=? AND (initiator_id=? OR target_id=?) ORDER BY created_at DESC LIMIT 12`, guild, actor, actor)
      .map(trade => ({ ...trade, offers: all('SELECT * FROM player_trade_offers WHERE trade_id=? ORDER BY user_id,item_id', trade.trade_id) }));
    const lock = tables.has('halloween_locks') ? one('SELECT * FROM halloween_locks WHERE guild_id=? AND user_id=?', guild, actor) : null;
    return {
      player: one('SELECT * FROM players WHERE guild_id=? AND user_id=?', partition, actor),
      modeRow: one('SELECT * FROM admin_profile_modes WHERE guild_id=? AND user_id=?', guild, actor),
      inventory: all('SELECT item_id,quantity FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_id', partition, actor),
      cooldowns: all('SELECT action,available_at FROM cooldowns WHERE guild_id=? AND user_id=? ORDER BY action', partition, actor),
      combats: all('SELECT * FROM combat_sessions WHERE user_id=? AND guild_id IN (?,?) ORDER BY scope', actor, guild, partition)
        .filter(combat => (combat.profile_guild_id || combat.guild_id) === partition),
      crew,
      crewMembers: crew ? store.getCrewMembers(guild, crew.crew_id) : [],
      crewInvite: one('SELECT * FROM crew_invites WHERE guild_id=? AND invited_user_id=?', guild, actor),
      raids: mode === 'normal' ? raids : [],
      trades: mode === 'normal' ? trades : [],
      voyage: voyage.getVoyage(partition, actor),
      voyageStats: one('SELECT * FROM infinite_stats WHERE guild_id=? AND user_id=?', partition, actor),
      halloween: {
        config: halloween.config(guild),
        run: tables.has('halloween_players') ? one('SELECT * FROM halloween_players WHERE guild_id=? AND user_id=?', partition, actor) : null,
        raid: lock ? one('SELECT * FROM halloween_raids WHERE guild_id=? AND id=?', guild, lock.raid_id) : null
      },
      event: store.getActiveServerBoss(guild),
      sequence: one('SELECT sequence FROM adventure_web_heads WHERE guild_id=? AND user_id=? AND mode=?', guild, actor, mode)?.sequence || 0
    };
  }

  function snapshot(guild, actor, mode = 'normal') {
    const { partition, admin } = access(guild, actor, mode);
    ensureWebTables();
    const source = raw(guild, actor, mode, partition);
    const player = source.player ? { ...source.player } : null;
    if (player) {
      player.energy = Math.min(player.max_energy, player.energy + Math.floor(Math.max(0, now() - player.last_energy_at) / 480000));
      player.maxHp = game.playerMaxHp(player);
      player.nextXp = 100 + (player.level - 1) * 55;
    }
    return {
      version: 1, guild, actor, mode, adminAvailable: admin, serverNow: now(), revision: hash(source),
      ...source, player,
      inventory: source.inventory.map(row => ({
        ...row,
        name: item(row.item_id)?.name || row.item_id,
        type: item(row.item_id)?.type || (row.item_id.startsWith('fruit:') ? 'fruit' : 'objet'),
        rarity: item(row.item_id)?.rarity || '',
        description: item(row.item_id)?.description || '',
        sellPrice: game.sellPrice(row.item_id)
      })),
      history: all('SELECT type,amount,reason,created_at FROM transactions WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 20', partition, actor),
      catalog: {
        classes: catalog.CLASSES, zones: catalog.ZONES, missions: catalog.MISSIONS, bosses: catalog.BOSSES,
        crewBosses: catalog.CREW_BOSSES, serverBosses: catalog.SERVER_BOSSES, fruits: catalog.FRUITS,
        items: catalog.ITEMS, shop: catalog.SHOP_ITEMS, achievements: catalog.ACHIEVEMENTS,
        exchanges: catalog.GRAND_LINE_EXCHANGE_OFFERS, milestones: catalog.GRAND_LINE_MILESTONES, bossImages
      },
      limits: { webRaidCreation: false, discordGameplayStillEnabled: true }
    };
  }

  const schemas = {
    enrol: [], class: ['id'], daily: [], mission: ['id'], explore: ['id'], 'boss.start': ['id'], 'crew.boss': [],
    combat: ['scope', 'sessionId', 'turn', 'action'], 'item.use': ['id'], 'fruit.identify': [], 'fruit.eat': ['id'], 'fruit.awaken': [], 'fruit.skill': [],
    'shop.buy': ['id', 'quantity'], 'shop.sell': ['id', 'quantity'],
    'voyage.start': [], 'voyage.advance': ['run', 'revision', 'route'], 'voyage.act': ['run', 'revision', 'action'], 'voyage.bank': ['run', 'revision'], 'voyage.exchange': ['id'],
    'crew.create': ['name'], 'crew.invite': ['user'], 'crew.accept': [], 'crew.leave': [], 'crew.kick': ['user'], 'crew.transfer': ['user'],
    'crew.deposit': ['amount'], 'crew.withdraw': ['amount'], 'crew.upgrade': [], 'crew.expedition': [],
    'server.start': ['bossId', 'createdAt'], 'raid.act': ['id', 'revision', 'action'],
    'trade.create': ['user'], 'trade.offer': ['id', 'item', 'quantity'], 'trade.remove': ['id', 'item'], 'trade.ready': ['id'], 'trade.confirm': ['id'], 'trade.cancel': ['id'],
    'halloween.world': ['action', 'revision'], 'halloween.create': ['kind', 'users'], 'halloween.raid': ['id', 'action', 'revision']
  };

  function validate(action, input) {
    if (!Object.hasOwn(schemas, action)) fail('Action inconnue.');
    object(input, schemas[action]);
    if (schemas[action].some(key => !Object.hasOwn(input, key))) fail('Un parametre est manquant.');
    for (const [key, value] of Object.entries(input)) {
      if (['quantity', 'amount', 'turn', 'revision', 'createdAt'].includes(key)) {
        if (!Number.isSafeInteger(value) || value < (key === 'revision' ? 0 : 1) || value > Number.MAX_SAFE_INTEGER) fail('Nombre invalide.');
      } else if (key === 'users') {
        if (!Array.isArray(value) || value.length > 9 || value.some(id => !snowflake(id)) || new Set(value).size !== value.length) fail('Liste de membres invalide.');
      } else if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\u0000-\u001f]/.test(value)) {
        fail('Parametre invalide.');
      }
      if (key === 'user' && !snowflake(value)) fail('Identifiant Discord invalide.');
    }
  }

  function invoke(guild, actor, mode, input, action, partition) {
    const personal = (method, ...args) => game[method](partition, actor, ...args);
    const activeAdmin = Boolean(one('SELECT enabled FROM admin_profile_modes WHERE guild_id=? AND user_id=?', guild, actor)?.enabled);
    if ((mode === 'admin') !== activeAdmin) fail('Le profil actif a change sur Discord. Selectionne le meme profil avant de jouer.', 409);
    if (mode === 'admin' && /^(crew\.|trade\.|raid\.|server\.|halloween\.(create|raid))/.test(action)) {
      fail('Cette activite collective utilise la progression normale. Desactive Admin Mod.', 403);
    }
    switch (action) {
      case 'enrol': return { ok: true, player: game.ensurePlayer(partition, actor) };
      case 'class': return personal('chooseClass', input.id);
      case 'daily': return personal('claimDaily');
      case 'mission': return personal('runMission', input.id);
      case 'explore': return personal('explore', input.id);
      case 'boss.start': return personal('startBossCombat', input.id);
      case 'combat': {
        if (!['solo', 'crew', 'server', 'admin'].includes(input.scope) || input.scope === 'admin' && mode !== 'admin') fail('Combat invalide.');
        const combatGuild = ['server', 'crew'].includes(input.scope) ? guild : partition;
        const session = store.getCombatSession(combatGuild, actor, input.scope);
        if (!session || (session.profile_guild_id || session.guild_id) !== partition) fail('Ce combat appartient a un autre profil.', 403);
        return game.combatAction(combatGuild, actor, input.scope, input.action, { sessionId: input.sessionId, turn: input.turn });
      }
      case 'item.use': return personal('useItem', input.id);
      case 'fruit.identify': return personal('identifyFruit');
      case 'fruit.eat': return personal('eatFruit', input.id);
      case 'fruit.awaken': return personal('awakenFruit');
      case 'fruit.skill': return personal('useFruitSkill');
      case 'shop.buy': return personal('buyItem', input.id, input.quantity);
      case 'shop.sell': return personal('sellItem', input.id, input.quantity);
      case 'voyage.start': return voyage.startVoyage(partition, actor);
      case 'voyage.advance': return voyage.advanceVoyage(partition, actor, input.route, input.run, input.revision);
      case 'voyage.act': return voyage.actVoyage(partition, actor, input.action, input.run, input.revision);
      case 'voyage.bank': return voyage.bankVoyage(partition, actor, input.run, input.revision);
      case 'voyage.exchange': return voyage.exchangeVoyageMarks(partition, actor, input.id);
      case 'crew.create': return personal('createPlayerCrew', input.name);
      case 'crew.invite': return personal('inviteCrewMember', input.user);
      case 'crew.accept': return personal('acceptCrewInvite');
      case 'crew.leave': return personal('leaveCrew');
      case 'crew.kick': return personal('kickCrewMember', input.user);
      case 'crew.transfer': return personal('transferCrewCaptain', input.user);
      case 'crew.deposit': return personal('depositCrewBerries', input.amount);
      case 'crew.withdraw': return personal('withdrawCrewBerries', input.amount);
      case 'crew.upgrade': return personal('upgradeCrewShip');
      case 'crew.expedition': return personal('crewExpedition');
      case 'crew.boss': return game.startCrewBossCombat(guild, actor);
      case 'server.start': return game.startServerBossCombat(guild, actor, { bossId: input.bossId, createdAt: input.createdAt });
      case 'raid.act': return game.teamRaidAction(guild, input.id, actor, input.action, input.revision);
      case 'trade.create': return game.createPlayerTrade(guild, actor, input.user);
      case 'trade.offer': return game.setTradeOffer(guild, actor, input.id, input.item, input.quantity);
      case 'trade.remove': return game.removeTradeOffer(guild, actor, input.id, input.item);
      case 'trade.ready': return game.toggleTradeReady(guild, actor, input.id);
      case 'trade.confirm': return game.confirmPlayerTrade(guild, actor, input.id);
      case 'trade.cancel': return game.cancelPlayerTrade(guild, actor, input.id);
      case 'halloween.world': return halloween.worldAction(guild, actor, input.action, input.revision);
      case 'halloween.create': return halloween.createRaid(guild, actor, input.kind, input.users);
      case 'halloween.raid': return halloween.raidAction(guild, actor, input.id, input.action, input.revision);
      default: fail('Action inconnue.');
    }
  }

  function execute(guild, actor, mode, body) {
    const { partition } = access(guild, actor, mode);
    ensureWebTables();
    object(body, ['operationId', 'revision', 'action', 'input']);
    if (!uuid(body.operationId) || !/^[a-f0-9]{64}$/.test(body.revision || '')) fail('Operation et revision requises.');
    validate(body.action, body.input);
    return db.transaction(() => {
      const fingerprint = hash({ mode, ...body });
      const saved = one('SELECT * FROM adventure_web_receipts WHERE guild_id=? AND user_id=? AND operation_id=?', guild, actor, body.operationId);
      if (saved) {
        if (saved.fingerprint !== fingerprint) fail('Cet identifiant designe une autre operation.', 409);
        return { ...snapshot(guild, actor, mode), result: JSON.parse(saved.result_json), replayed: true };
      }
      const before = snapshot(guild, actor, mode);
      if (body.revision !== before.revision) fail('La progression a change sur un autre ecran. Actualise avant de rejouer.', 409);
      const result = invoke(guild, actor, mode, body.input, body.action, partition);
      if (!result || result.ok === false) fail(result?.message || 'Action refusee.');
      const publicResult = {
        action: body.action,
        message: result.message || result.session?.log || result.raid?.log || 'Action enregistree.',
        victory: result.victory, failed: result.failed, completed: result.completed,
        berries: result.berries, xp: result.xp, prime: result.prime,
        foundItem: result.foundItem, foundBossItem: result.foundBossItem,
        foundBossFruit: result.foundBossFruit, damage: result.damage, bossDamage: result.bossDamage
      };
      db.prepare('INSERT INTO adventure_web_receipts VALUES(?,?,?,?,?,?)').run(guild, actor, body.operationId, fingerprint, JSON.stringify(publicResult), now());
      db.prepare('INSERT INTO adventure_web_heads VALUES(?,?,?,1) ON CONFLICT(guild_id,user_id,mode) DO UPDATE SET sequence=sequence+1').run(guild, actor, mode);
      return { ...snapshot(guild, actor, mode), result: publicResult, replayed: false };
    }).immediate();
  }

  return { snapshot, execute };
}

module.exports = { createWebAdventure };
