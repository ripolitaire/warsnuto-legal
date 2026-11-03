const { error } = require('./security.cjs');
const CEILINGS = Object.freeze({
  USER: [], MODERATOR: ['moderation:read'],
  ADMIN: ['admin:read', 'moderation:read', 'users:read', 'users:moderate', 'audit:read', 'settings:write'],
  OWNER: ['admin:read', 'moderation:read', 'users:read', 'users:moderate', 'audit:read', 'settings:write', 'staff:manage', 'permissions:manage', 'settings:critical']
});
function permissions(db, userId, role) {
  const rows = db.prepare('SELECT permission FROM role_permissions WHERE role=? ORDER BY permission').all(role);
  return rows.map(row => row.permission).filter(permission => CEILINGS[role]?.includes(permission));
}
function requirePermission(session, permission) {
  if (!session) throw error(401, 'Connecte-toi avec Discord.');
  if (!session.permissions.includes(permission)) throw error(403, 'Tu ne disposes pas de cette autorisation.');
}
function staffActor(session) { requirePermission(session, 'staff:manage'); if (session.user.role !== 'OWNER') throw error(403, 'Accès propriétaire requis.'); }
module.exports = { CEILINGS, permissions, requirePermission, staffActor };
