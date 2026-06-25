-- Per-club permission for the category-page Seeding panel (shown before the
-- draw is generated). Global default is enabled; super admins can override
-- per club from /superadmin/rbac to hide it for specific clubs only.

-- feature/sub_feature must match the entry added to the CATEGORIES map in
-- PermissionMatrix.tsx (tournament_management group) or it won't render as
-- a toggle on /superadmin/rbac even though the row exists.
INSERT INTO role_permissions (role, feature, sub_feature, is_enabled, can_read, can_write, scope)
VALUES ('admin', 'tournament_management', 'seeding_panel', true, true, true, 'global')
ON CONFLICT (role, feature, COALESCE(sub_feature, ''), scope) WHERE club_id IS NULL DO NOTHING;
