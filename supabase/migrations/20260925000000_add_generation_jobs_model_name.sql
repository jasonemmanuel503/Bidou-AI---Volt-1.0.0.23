-- Migration: Add missing model_name column to generation_jobs
alter table generation_jobs
  add column if not exists model_name text;

update generation_jobs g
set model_name = m.display_name
from ai_models m
where g.model_id = m.id
  and g.model_name is null;

notify pgrst, 'reload schema';
