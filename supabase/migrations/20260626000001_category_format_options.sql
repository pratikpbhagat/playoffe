-- Replace category_type_enum (purpose-based) with skill-level values, in display order.
-- Add 'team_event' to play_format_enum. Remove unused draw formats (double_elimination, swiss).

create type category_type_enum_new as enum ('open', 'pro', 'advanced', 'intermediate', 'beginner');

alter table tournament_categories
  alter column type type category_type_enum_new
  using (case type::text
    when 'open' then 'open'
    else 'open' -- no existing rows use skill/age/gender
  end::category_type_enum_new);

drop type category_type_enum;
alter type category_type_enum_new rename to category_type_enum;

alter type play_format_enum add value 'team_event';

create type draw_format_enum_new as enum ('group_stage_knockout', 'round_robin', 'single_elimination');

alter table tournament_categories
  alter column draw_format type draw_format_enum_new
  using draw_format::text::draw_format_enum_new;

drop type draw_format_enum;
alter type draw_format_enum_new rename to draw_format_enum;
