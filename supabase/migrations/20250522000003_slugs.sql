-- Add URL-friendly slugs to tournaments and tournament_categories
-- Slugs are derived from the name, lowercased, spaces → hyphens, special chars stripped.

-- ── helpers ───────────────────────────────────────────────────────────────────

create or replace function slugify(val text)
returns text language sql immutable as $$
  select lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(val, '[^a-zA-Z0-9\s\-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- ── tournaments.slug ──────────────────────────────────────────────────────────

alter table tournaments add column if not exists slug text;

create or replace function generate_tournament_slug(base_name text)
returns text language plpgsql as $$
declare
  base      text := slugify(base_name);
  candidate text := base;
  counter   int  := 2;
begin
  loop
    exit when not exists (select 1 from tournaments where slug = candidate);
    candidate := base || '-' || counter;
    counter   := counter + 1;
  end loop;
  return candidate;
end;
$$;

create or replace function set_tournament_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := generate_tournament_slug(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_slug on tournaments;
create trigger tournaments_slug
  before insert on tournaments
  for each row execute function set_tournament_slug();

-- Populate existing rows that have no slug
update tournaments
   set slug = generate_tournament_slug(name)
 where slug is null;

alter table tournaments alter column slug set not null;
create unique index if not exists tournaments_slug_idx on tournaments (slug);

-- ── tournament_categories.slug ────────────────────────────────────────────────

alter table tournament_categories add column if not exists slug text;

create or replace function generate_category_slug(tid uuid, base_name text)
returns text language plpgsql as $$
declare
  base      text := slugify(base_name);
  candidate text := base;
  counter   int  := 2;
begin
  loop
    exit when not exists (
      select 1 from tournament_categories
       where tournament_id = tid and slug = candidate
    );
    candidate := base || '-' || counter;
    counter   := counter + 1;
  end loop;
  return candidate;
end;
$$;

create or replace function set_category_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := generate_category_slug(new.tournament_id, new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_categories_slug on tournament_categories;
create trigger tournament_categories_slug
  before insert on tournament_categories
  for each row execute function set_category_slug();

-- Populate existing rows
update tournament_categories
   set slug = generate_category_slug(tournament_id, name)
 where slug is null;

alter table tournament_categories alter column slug set not null;
create unique index if not exists tournament_categories_slug_idx
  on tournament_categories (tournament_id, slug);
