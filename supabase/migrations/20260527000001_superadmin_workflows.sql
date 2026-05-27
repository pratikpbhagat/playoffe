-- Superadmin workflow gaps: extend admin_invites for manager invite type
-- Supports: new_club_owner (existing flow) + existing_club_manager (new)

alter table admin_invites
  add column club_id     uuid references clubs(id) on delete cascade,
  add column invite_type text not null default 'new_club_owner'
    check (invite_type in ('new_club_owner', 'existing_club_manager'));

comment on column admin_invites.club_id is
  'For existing_club_manager invites: the club the invitee will join as manager. Null for new_club_owner.';

comment on column admin_invites.invite_type is
  'new_club_owner: creates a brand-new club (existing flow). existing_club_manager: adds user as manager to an existing club.';
