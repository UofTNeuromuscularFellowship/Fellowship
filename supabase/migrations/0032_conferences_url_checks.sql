-- ---------------------------------------------------------------------------
-- Coordinator-entered links must be web links.
--
-- Zoom, payment and hotel-booking links are shown as clickable links on the
-- public event page, which is served from the portal's own origin
-- (app.neuromuscular.ca) - the same origin that holds every signed-in
-- member's session. A "javascript:" link typed into one program's event
-- would therefore run with the session of whoever clicked it, including a
-- signed-in member of a DIFFERENT program opening an invitation. Only
-- http(s) links are accepted, at the database, so no page has to remember.
-- The front end also refuses to render anything else (safeUrl).
--
-- Two function changes made at the same time live in 0031 itself, which
-- was edited in place and re-applied with CREATE OR REPLACE (production
-- history: conf_speaker_link_path, conf_waitlist_tiebreak):
--   * conf_request_disclosures links to /speaker/<token>, not /s/<token> -
--     /s/:groupId is already the portal's section-overview route.
--   * conf_promote_waitlist and conf_public_event break waitlist ties on id,
--     so two people waitlisted in the same instant (a CSV import) still get
--     distinct, stable places in line.
-- ---------------------------------------------------------------------------

alter table public.conf_events
  add constraint conf_events_zoom_url_web
    check (zoom_url is null or zoom_url ~* '^https?://[^[:space:]<>"]+$'),
  add constraint conf_events_payment_url_web
    check (payment_url is null or payment_url ~* '^https?://[^[:space:]<>"]+$');

alter table public.conf_sessions
  add constraint conf_sessions_zoom_url_web
    check (zoom_url is null or zoom_url ~* '^https?://[^[:space:]<>"]+$');

alter table public.conf_accommodations
  add constraint conf_accommodations_booking_url_web
    check (booking_url is null or booking_url ~* '^https?://[^[:space:]<>"]+$');
