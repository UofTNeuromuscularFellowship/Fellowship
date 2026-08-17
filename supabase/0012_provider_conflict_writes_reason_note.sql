-- Applied to live DB 2026-08-15 as 20260815170425_provider_conflict_writes_reason_note
-- When a provider adds an away date that collides with already-published clinic
-- assignments, the trigger now also writes a human-readable reason into notes
-- (shown as the red-cell tooltip/explanation on the clinic grid), in addition
-- to flagging has_conflict and emailing the director/admin.

create or replace function public.flag_provider_conflict()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare hit int; portal text; a record;
begin
  update public.clinic_rotations
    set has_conflict = true,
        notes = coalesce(notes, 'Provider set an away date after publishing — needs reassignment')
  where supervisor_id = new.provider_id
    and rotation_date = new.away_date
    and is_draft = false;
  get diagnostics hit = row_count;

  if hit > 0 then
    select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
    for a in select email, full_name from public.users where role in ('director','admin') and status = 'active' and email is not null loop
      perform public.enqueue_email(
        'provconflict-' || new.provider_id || '-' || new.away_date || '-' || a.email,
        a.email,
        'Schedule conflict: a provider set a new away date',
        '<p>A provider has set an away date of <strong>' || to_char(new.away_date, 'FMDay, Mon DD, YYYY') ||
        '</strong> that conflicts with ' || hit || ' already-published clinic assignment' || case when hit = 1 then '' else 's' end ||
        '.</p><p>These are flagged in red on the <a href="' || coalesce(portal, '') || '/clinic">clinic schedule</a> for you to reassign.</p>'
      );
    end loop;
  end if;
  return new;
end;
$function$;
