-- Migration: Ensure stuck credit reservations are always auto-swept
--
-- 0010_projects_and_trash.sql only schedules the `sweep-reservations`
-- pg_cron job when the pg_cron extension already happens to be enabled
-- at migration time. On most Supabase projects pg_cron isn't enabled yet
-- at that point, so the schedule silently never gets created -- and any
-- reservation left open by a dispatch-path bug, a crash, or a redeploy
-- mid-request stays stuck forever, with credits deducted from the
-- wallet and never returned.
--
-- This migration:
--   1. Enables pg_cron if it isn't already.
--   2. (Re)schedules the sweep job -- cron.schedule() upserts by job
--      name, so this is safe to run even if it's already scheduled.
--   3. Runs one sweep immediately, so anything already stuck and past
--      its expiry (default: 15 minutes after reservation) is settled
--      the moment this migration runs, with no manual SQL needed.

create extension if not exists pg_cron;

select cron.schedule(
  'sweep-reservations',
  '*/10 * * * *',
  $$select sweep_expired_reservations()$$
);


select sweep_expired_reservations();
-- Catch anything already stuck and past expiry right now.
