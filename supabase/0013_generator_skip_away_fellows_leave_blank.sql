-- Applied to live DB 2026-08-17 as 20260817134039_generator_skip_away_fellows_leave_blank
-- When a fellow is away/on vacation, the schedule generator now leaves that day
-- blank (no placeholder "Away" row, nothing flagged) instead of inserting a row
-- that the grid marks red. The client-side "fellow marked away after publishing"
-- warning still works for its intended case: away dates added after publishing.

create or replace function public.generate_clinic_schedule(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d date; created int := 0;
  f record; slot record; ct record; eff_ct record; alt record; dc record; cand record;
  active_tmpl uuid; assigned uuid[]; cnt int; used_this_month int;
  chosen_site text; chosen_provider uuid; chosen_pname text;
  v_designated date[]; v_reason text; v_ok boolean;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role in ('director','admin')) then
    raise exception 'not authorized';
  end if;
  if p_to < p_from or p_to > p_from + interval '13 months' then
    raise exception 'range must be forward and at most ~1 year';
  end if;

  d := p_from;
  while d <= p_to loop
    if extract(isodow from d) between 1 and 5 then
      assigned := '{}';

      -- 0) Date-specific clinics: auto-assign available fellows first.
      --    cnt starts from any existing assignments on that date (e.g. a
      --    manual placement), so capacity is a true per-day ceiling.
      for dc in
        select * from public.clinic_template
        where recurrence = 'dates' and d = any(specific_dates)
      loop
        if dc.provider_id is not null and exists (
             select 1 from public.provider_away_dates pad
             where pad.provider_id = dc.provider_id and pad.away_date = d) then
          continue; -- provider away on their own clinic date: skip it
        end if;
        cnt := public.clinic_day_count(d, dc.site_code, dc.provider_id, dc.provider_name);
        for cand in
          select u.id, u.full_name
          from public.users u
          where u.role = 'fellow' and u.status = 'active'
            and not (u.id = any(assigned))
            and not exists (select 1 from public.fellow_away_dates fa
                            where fa.fellow_id = u.id and fa.away_date = d)
            and not exists (select 1 from public.fellow_template_slots s
                            where s.template_id = public.fellow_active_template(u.id, d)
                              and s.weekday = extract(isodow from d)::smallint
                              and s.slot_type = 'protected')
          order by (select count(*) from public.clinic_rotations cr
                    where cr.fellow_id = u.id
                      and cr.site_code = dc.site_code
                      and cr.rotation_date >= public.ay_start(d)) asc,
                   u.full_name
        loop
          exit when cnt >= dc.fellow_capacity;
          insert into public.clinic_rotations
            (fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id, is_draft, is_protected)
          values (cand.id, cand.full_name, d, dc.site_code, dc.provider_name, dc.provider_id, true, false);
          assigned := assigned || cand.id;
          created := created + 1; cnt := cnt + 1;
        end loop;
      end loop;

      -- 1) Weekly template pass for everyone else
      for f in
        select u.id, u.full_name
        from public.users u
        where u.role = 'fellow' and u.status = 'active'
        order by u.full_name
      loop
        -- Fellow away: leave the day blank (no placeholder row, nothing to clear)
        if exists (select 1 from public.fellow_away_dates fa where fa.fellow_id = f.id and fa.away_date = d) then
          continue;
        end if;

        if f.id = any(assigned) then continue; end if; -- already in a date-specific clinic

        active_tmpl := public.fellow_active_template(f.id, d);
        if active_tmpl is null then continue; end if;

        select * into slot from public.fellow_template_slots
          where template_id = active_tmpl and weekday = extract(isodow from d)::smallint;
        if not found then continue; end if;

        if slot.slot_type = 'protected' then
          insert into public.clinic_rotations
            (fellow_id, fellow_label, rotation_date, site_code, is_draft, is_protected)
          values (f.id, f.full_name, d, 'PROTECTED', true, true);
          created := created + 1;
          continue;
        end if;

        select * into ct from public.clinic_template where id = slot.clinic_template_id;
        if not found then continue; end if;

        eff_ct := ct;
        if slot.monthly_cap is not null then
          -- assignments to the capped clinic already made this calendar month
          select count(*) into used_this_month
          from public.clinic_rotations cr
          where cr.fellow_id = f.id
            and cr.status <> 'cancelled'
            and cr.rotation_date >= date_trunc('month', d)::date
            and cr.rotation_date <  (date_trunc('month', d) + interval '1 month')::date
            and cr.site_code = ct.site_code
            and cr.supervisor_id is not distinct from ct.provider_id
            and (ct.provider_id is not null or cr.provider_name is not distinct from ct.provider_name);

          -- Pick the "designated" date(s) for the capped clinic this month:
          -- among this weekday's occurrences (from p_from onward, where the
          -- capped clinic's provider and the fellow are both available),
          -- prefer dates on which the fallback clinic's provider is away,
          -- then earliest date. Take monthly_cap of them.
          select coalesce(array_agg(picked.dt), '{}'::date[]) into v_designated
          from (
            select days.dt
            from (
              select gs::date as dt
              from generate_series(
                     date_trunc('month', d)::date,
                     (date_trunc('month', d) + interval '1 month' - interval '1 day')::date,
                     interval '1 day') gs
              where extract(isodow from gs) = extract(isodow from d)
            ) days
            where days.dt >= p_from
              and (ct.provider_id is null or not exists (
                     select 1 from public.provider_away_dates pad
                     where pad.provider_id = ct.provider_id and pad.away_date = days.dt))
              and not exists (select 1 from public.fellow_away_dates fa
                              where fa.fellow_id = f.id and fa.away_date = days.dt)
            order by
              (slot.fallback_clinic_template_id is not null and exists (
                 select 1 from public.clinic_template fb
                 join public.provider_away_dates pad
                   on pad.provider_id = fb.provider_id and pad.away_date = days.dt
                 where fb.id = slot.fallback_clinic_template_id
                   and fb.provider_id is not null)) desc,
              days.dt asc
            limit slot.monthly_cap
          ) picked(dt);

          if used_this_month >= slot.monthly_cap or not (d = any(v_designated)) then
            if slot.fallback_clinic_template_id is null then
              continue; -- not a designated day, no fallback: nothing scheduled
            end if;
            select * into eff_ct from public.clinic_template where id = slot.fallback_clinic_template_id;
            if not found then continue; end if;
          end if;
        end if;

        -- Resolve availability and capacity of the chosen clinic
        chosen_site := eff_ct.site_code; chosen_provider := eff_ct.provider_id; chosen_pname := eff_ct.provider_name;
        v_ok := true; v_reason := null;

        if eff_ct.provider_id is not null and exists (
             select 1 from public.provider_away_dates pad
             where pad.provider_id = eff_ct.provider_id and pad.away_date = d) then
          v_ok := false; v_reason := 'Provider away — needs manual reassignment';
        elsif public.clinic_day_count(d, eff_ct.site_code, eff_ct.provider_id, eff_ct.provider_name) >= eff_ct.fellow_capacity then
          v_ok := false; v_reason := 'Clinic at fellow capacity — needs manual reassignment';
        end if;

        if not v_ok then
          -- substitute: another weekly clinic today whose provider is present
          -- and which still has room for a fellow
          select ct2.* into alt from public.clinic_template ct2
            where ct2.recurrence = 'weekly'
              and ct2.weekday = extract(isodow from d)::smallint
              and ct2.id <> eff_ct.id
              and (ct2.provider_id is null or not exists (
                    select 1 from public.provider_away_dates p2
                    where p2.provider_id = ct2.provider_id and p2.away_date = d))
              and public.clinic_day_count(d, ct2.site_code, ct2.provider_id, ct2.provider_name) < ct2.fellow_capacity
            order by (ct2.fellow_capacity - public.clinic_day_count(d, ct2.site_code, ct2.provider_id, ct2.provider_name)) desc
            limit 1;
          if found then
            chosen_site := alt.site_code; chosen_provider := alt.provider_id; chosen_pname := alt.provider_name;
          else
            insert into public.clinic_rotations
              (fellow_id, fellow_label, rotation_date, site_code, provider_name, is_draft, is_protected, has_conflict, notes)
            values (f.id, f.full_name, d, coalesce(eff_ct.site_code, ''), eff_ct.provider_name, true, false, true, v_reason);
            created := created + 1;
            continue;
          end if;
        end if;

        insert into public.clinic_rotations
          (fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id, is_draft, is_protected)
        values (f.id, f.full_name, d, chosen_site, chosen_pname, chosen_provider, true, false);
        created := created + 1;
      end loop;
    end if;
    d := d + 1;
  end loop;

  return created;
end;
$function$;
