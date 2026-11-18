# Discord and site permissions

Authenticated non-owner accounts derive their effective site role from Protect's
configured permission tiers on WarsNuto UNIVERS (`1052863089692905493`).

- `admin` -> `ADMIN` and the site's configured ADMIN permission ceiling.
- `responsible-mod`, `mod`, `mod-test` -> `MODERATOR`.
- Missing membership, unknown tier or unavailable Protect -> `USER`.

Role names are never used as authorization evidence. The private bot connector
resolves the actor from the authenticated session. Roles on other guilds do not
grant site administration. Existing bot configuration routes still enforce
their own guild-specific Discord permissions.

Derived roles are request-scoped, not permanently written to `user_roles`.
Reads share the existing five-second Protect access cache; mutations request a
fresh check. Existing OWNER accounts remain explicitly managed by the site and
cannot be granted through Discord. Suspensions and session expiration remain
enforced before role resolution.

The local user list reports stored site roles; authorization and the signed-in
account's displayed role use the effective Discord-derived role. Test fixtures
that exercise independent site-role management disable synchronization; the
dedicated integration suite enables it and tests promotion and revocation.
