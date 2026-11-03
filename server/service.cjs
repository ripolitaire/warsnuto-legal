const { error, object, text, snowflake } = require('./security.cjs');
const { transaction, audit } = require('./database.cjs');
const { publicUser } = require('./auth.cjs');
const { CEILINGS, staffActor, requirePermission } = require('./permissions.cjs');
const integer = (value, max = 1000000) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) throw error(400, 'Nombre invalide.'); return value; };
function pagination(query) {
  const raw = query.get('page') || '1'; if (!/^[1-9]\d{0,4}$/.test(raw)) throw error(400, 'Page invalide.');
  return { page: Number(raw), limit: 25, offset: (Number(raw) - 1) * 25 };
}
function createService(db, config) {
  const now = config.now;
  function user(id) {
    if (!snowflake(id)) throw error(400, 'Identifiant Discord invalide.');
    const row = db.prepare('SELECT u.*,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE discord_id=?').get(id);
    if (!row) throw error(404, 'Compte introuvable.'); return row;
  }
  function confirmed(body, id) {
    if (body.confirmation !== 'CONFIRMER ' + id || typeof body.reason !== 'string') throw error(400, 'Confirmation et motif requis.');
    return text(body.reason, 300, 3);
  }
  function mutateTarget(actor, id, input, fields, operation) {
    object(input, ['confirmation', 'reason', 'version', ...fields]);
    const reason = confirmed(input, id), version = integer(input.version);
    return transaction(db, () => {
      const target = user(id);
      if (actor.user.id === id) throw error(403, 'Tu ne peux pas modifier tes propres privilèges ou accès.');
      if (target.version !== version) throw error(409, 'Le compte a changé. Actualise avant de recommencer.');
      if (actor.user.role !== 'OWNER' && ['ADMIN', 'OWNER'].includes(target.role)) throw error(403, 'Un propriétaire doit gérer ce compte.');
      operation(target, reason);
      db.prepare('UPDATE users SET version=version+1 WHERE id=?').run(target.id);
      db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(now(), target.id);
      return { user: publicUser(user(id)) };
    });
  }
  return {
    publicSettings() { return db.prepare('SELECT name,description,announcement,maintenance FROM site_settings WHERE id=1').get(); },
    overview() {
      return { users: db.prepare('SELECT count(*) n FROM users').get().n,
        recentLogins: db.prepare("SELECT count(*) n FROM audit_logs WHERE action='auth.login' AND created_at>=?").get(now() - 86400000).n,
        administrators: db.prepare("SELECT count(*) n FROM user_roles r JOIN users u ON r.user_id=u.id WHERE r.role IN ('ADMIN','OWNER') AND u.status='active'").get().n,
        activeSessions: db.prepare("SELECT count(*) n FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.revoked_at IS NULL AND s.expires_at>? AND s.last_seen_at>? AND u.status='active'").get(now(), now() - config.sessionIdleMs).n,
        activity: db.prepare('SELECT actor_id,action,target_id,created_at,result FROM audit_logs ORDER BY id DESC LIMIT 8').all(),
        applicationErrors: db.prepare("SELECT count(*) n FROM audit_logs WHERE action='application.error' AND created_at>=?").get(now() - 86400000).n,
        services: [{ name: 'Backend web', status: 'available' }, { name: 'Base du site', status: 'available' },
          { name: 'Protect / Game / Support', status: 'not_connected' }] };
    },
    users(query, staff = false) {
      const { page, limit, offset } = pagination(query), search = text(query.get('q') || '', 100);
      const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      const clause = `WHERE (u.discord_id=? OR u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')` + (staff ? " AND r.role<>'USER'" : '');
      const args = [search, pattern, pattern];
      return { page, total: db.prepare('SELECT count(*) n FROM users u JOIN user_roles r ON r.user_id=u.id ' + clause).get(...args).n,
        users: db.prepare('SELECT u.*,r.role FROM users u JOIN user_roles r ON r.user_id=u.id ' + clause + ' ORDER BY u.id DESC LIMIT ? OFFSET ?').all(...args, limit, offset).map(publicUser) };
    },
    detail(id) {
      const target = user(id);
      return { user: publicUser(target), permissions: db.prepare('SELECT permission FROM role_permissions WHERE role=? ORDER BY permission').all(target.role).map(row => row.permission),
        history: db.prepare('SELECT actor_id,action,target_id,created_at,result,context FROM audit_logs WHERE target_id=? ORDER BY id DESC LIMIT 25').all(id) };
    },
    sessions(session) {
      return db.prepare('SELECT token_hash,created_at,last_seen_at,expires_at,browser FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND last_seen_at>? ORDER BY created_at DESC LIMIT 10')
        .all(session.userId, now(), now() - config.sessionIdleMs).map(({ token_hash, ...row }) => ({ ...row, current: token_hash === session.hash }));
    },
    revokeOthers(session) { return transaction(db, () => {
      const result = db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND token_hash<>? AND revoked_at IS NULL').run(now(), session.userId, session.hash);
      audit(db, now(), session.user.id, 'session.revoke_others', session.user.id, { count: Number(result.changes) }); return { ok: true };
    }); },
    preferences(session, input) {
      object(input, ['reducedMotion']); if (typeof input.reducedMotion !== 'boolean') throw error(400, 'Préférence invalide.');
      db.prepare('UPDATE users SET preferences=? WHERE id=?').run(JSON.stringify(input), session.userId); return { ok: true };
    },
    role(actor, id, input) {
      staffActor(actor);
      if (!Object.hasOwn(CEILINGS, input?.role)) throw error(400, 'Rôle invalide.');
      return mutateTarget(actor, id, input, ['role'], (target, reason) => {
        if (target.role === 'OWNER' && input.role !== 'OWNER' && db.prepare("SELECT count(*) n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='OWNER' AND u.status='active'").get().n <= 1) throw error(409, 'Le dernier propriétaire actif doit être conservé.');
        if (input.role === 'OWNER' && target.status !== 'active') throw error(409, 'Réactive le compte avant de lui attribuer ce rôle.');
        db.prepare('UPDATE user_roles SET role=? WHERE user_id=?').run(input.role, target.id);
        audit(db, now(), actor.user.id, 'staff.role', id, { from: target.role, to: input.role, reason });
      });
    },
    status(actor, id, input) {
      requirePermission(actor, 'users:moderate');
      if (!['active', 'suspended'].includes(input?.status)) throw error(400, 'Statut invalide.');
      return mutateTarget(actor, id, input, ['status'], (target, reason) => {
        if (target.role === 'OWNER' && input.status === 'suspended' && db.prepare("SELECT count(*) n FROM users u JOIN user_roles r ON r.user_id=u.id WHERE r.role='OWNER' AND u.status='active'").get().n <= 1) throw error(409, 'Le dernier propriétaire actif doit être conservé.');
        db.prepare('UPDATE users SET status=? WHERE id=?').run(input.status, target.id);
        audit(db, now(), actor.user.id, 'user.status', id, { from: target.status, to: input.status, reason });
      });
    },
    revoke(actor, id, input) { requirePermission(actor, 'users:moderate'); return mutateTarget(actor, id, input, [], (target, reason) => audit(db, now(), actor.user.id, 'user.sessions_revoke', id, { reason })); },
    logs(query) {
      const { page, limit, offset } = pagination(query), actor = query.get('actor') || '', target = query.get('target') || '', action = text(query.get('action') || '', 60);
      if ((actor && !snowflake(actor)) || (target && !snowflake(target)) || (action && !/^[a-z_.]+$/.test(action))) throw error(400, 'Filtre invalide.');
      const where = "WHERE (?='' OR actor_id=?) AND (?='' OR target_id=?) AND (?='' OR action=?)", args = [actor, actor, target, target, action, action];
      return { page, total: db.prepare('SELECT count(*) n FROM audit_logs ' + where).get(...args).n,
        logs: db.prepare('SELECT * FROM audit_logs ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?').all(...args, limit, offset),
        actions: db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action LIMIT 100').all().map(row => row.action) };
    },
    settings() { return db.prepare('SELECT * FROM site_settings WHERE id=1').get(); },
    updateSettings(actor, input) {
      requirePermission(actor, 'settings:write');
      object(input, ['name', 'description', 'announcement', 'maintenance', 'version', 'confirmation']);
      if (input.confirmation !== 'PUBLIER' || typeof input.maintenance !== 'boolean') throw error(400, 'Confirmation et paramètres valides requis.');
      const name = text(input.name, 80, 1), description = text(input.description, 300), announcement = text(input.announcement, 800), version = integer(input.version);
      return transaction(db, () => {
        const previous = db.prepare('SELECT * FROM site_settings WHERE id=1').get();
        if (previous.version !== version) throw error(409, 'Les réglages ont changé. Actualise la page.');
        if (Boolean(previous.maintenance) !== input.maintenance && actor.user.role !== 'OWNER') throw error(403, 'Seul un propriétaire peut changer la maintenance.');
        db.prepare('UPDATE site_settings SET name=?,description=?,announcement=?,maintenance=?,version=version+1 WHERE id=1').run(name, description, announcement, Number(input.maintenance));
        audit(db, now(), actor.user.id, 'site.settings', null, { name, maintenance: input.maintenance, version: version + 1 }); return { ok: true };
      });
    },
    grants() { return { ceilings: CEILINGS, versions: Object.fromEntries(db.prepare('SELECT name,version FROM roles').all().map(row => [row.name, row.version])), grants: Object.fromEntries(Object.keys(CEILINGS).map(role => [role, db.prepare('SELECT permission FROM role_permissions WHERE role=? ORDER BY permission').all(role).map(row => row.permission)])) }; },
    updateGrants(actor, input) {
      staffActor(actor); object(input, ['role', 'permissions', 'confirmation', 'reason', 'version']);
      if (!['ADMIN', 'MODERATOR'].includes(input.role) || !Array.isArray(input.permissions) || input.permissions.length > 10 || new Set(input.permissions).size !== input.permissions.length || input.permissions.some(permission => !CEILINGS[input.role].includes(permission))) throw error(400, 'Permissions hors du périmètre autorisé.');
      if (input.confirmation !== 'CONFIRMER ' + input.role) throw error(400, 'Confirmation requise.');
      const reason = text(input.reason, 300, 3);
      const version = integer(input.version);
      transaction(db, () => {
        if (db.prepare('SELECT version FROM roles WHERE name=?').get(input.role).version !== version) throw error(409, 'Les permissions ont changé. Actualise la page.');
        db.prepare('DELETE FROM role_permissions WHERE role=?').run(input.role);
        for (const permission of input.permissions) db.prepare('INSERT INTO role_permissions(role,permission) VALUES(?,?)').run(input.role, permission);
        db.prepare('UPDATE roles SET version=version+1 WHERE name=?').run(input.role);
        db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id IN (SELECT user_id FROM user_roles WHERE role=?) AND revoked_at IS NULL').run(now(), input.role);
        audit(db, now(), actor.user.id, 'staff.permissions', null, { role: input.role, permissions: input.permissions, reason });
      }); return { ok: true };
    }
  };
}
module.exports = { createService, pagination };
