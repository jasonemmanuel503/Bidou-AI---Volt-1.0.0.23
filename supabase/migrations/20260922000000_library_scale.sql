-- ============================================================================
-- Migration: Library scale indexes for server-side pagination & projects
-- Timestamp: 20260922000000_library_scale.sql
-- ============================================================================

create index if not exists idx_generation_job_variants_user_status_created
  on generation_job_variants (user_id, status, created_at desc);

create index if not exists idx_project_items_project_position
  on project_items (project_id, position);
