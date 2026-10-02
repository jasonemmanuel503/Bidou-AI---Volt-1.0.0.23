import assert from 'assert';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('===============================================================');
  console.log('PHASE 6B - FIX 2 VERIFICATION: Lock Client Writes (RLS & Triggers)');
  console.log('===============================================================\n');

  // Test 1: Verify SQL Migration File
  console.log('[TEST 1] Verifying migration file 20261003000000_lock_client_writes.sql...');
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261003000000_lock_client_writes.sql');
  assert(fs.existsSync(migrationPath), 'Migration file must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Check 1.1: BEFORE UPDATE trigger on public.profiles
  assert(
    sql.includes('create or replace function public.protect_profile_system_columns()'),
    'Migration must declare protect_profile_system_columns function'
  );
  assert(
    sql.includes("coalesce(auth.role(), '') in ('anon', 'authenticated')"),
    'Function must inspect auth.role() for client roles'
  );
  assert(sql.includes('new.plan_tier := old.plan_tier;'), 'Must preserve plan_tier');
  assert(sql.includes('new.lifetime_spend_fcfa := old.lifetime_spend_fcfa;'), 'Must preserve lifetime_spend_fcfa');
  assert(sql.includes('new.affiliate_code := old.affiliate_code;'), 'Must preserve affiliate_code');
  assert(sql.includes('new.is_admin := old.is_admin;'), 'Must preserve is_admin');
  assert(
    sql.includes('create trigger trg_protect_profile_system_columns'),
    'Trigger must be attached to public.profiles'
  );

  // Check 1.2: Drop policies on generation_jobs and generation_job_variants
  assert(
    sql.includes('drop policy if exists "own generation jobs updatable" on public.generation_jobs;'),
    'Must drop "own generation jobs updatable"'
  );
  assert(
    sql.includes('drop policy if exists "own variants insertable" on public.generation_job_variants;'),
    'Must drop "own variants insertable"'
  );
  assert(
    sql.includes('drop policy if exists "own variants updatable" on public.generation_job_variants;'),
    'Must drop "own variants updatable"'
  );

  // Check 1.3: Restrict generation_jobs insert to 0-credit milestone marker
  assert(
    sql.includes('create policy "own generation jobs insertable" on public.generation_jobs'),
    'Must recreate "own generation jobs insertable"'
  );
  assert(
    sql.includes("status = 'completed'") &&
    sql.includes('coalesce(credits_reserved, 0) = 0') &&
    sql.includes('reservation_id is null') &&
    sql.includes('model_id is null'),
    'Must enforce status=completed, credits_reserved=0, reservation_id is null, model_id is null'
  );

  // Check 1.4: Drop policies on user_tier_badges
  assert(
    sql.includes('drop policy if exists "own tier badges insertable" on public.user_tier_badges;'),
    'Must drop "own tier badges insertable"'
  );
  assert(
    sql.includes('drop policy if exists "own tier badges updatable" on public.user_tier_badges;'),
    'Must drop "own tier badges updatable"'
  );
  console.log('  -> PASS: Migration SQL covers all 4 DB requirements with idempotent structure.\n');

  // Test 2: Client code inspection (saveProfile)
  console.log('[TEST 2] Verifying src/services/persistence.ts client payload...');
  const persistencePath = path.join(process.cwd(), 'src', 'services', 'persistence.ts');
  const persistenceContent = fs.readFileSync(persistencePath, 'utf8');

  // Verify saveProfile upsert object does not include plan_tier, lifetime_spend_fcfa, affiliate_code
  const saveProfileMatch = persistenceContent.match(/async saveProfile\(profile: UserProfile\)[\s\S]*?this\.client\.from\('profiles'\)\.upsert\(\{([\s\S]*?)\}\);/);
  assert(saveProfileMatch, 'saveProfile upsert block must be found in persistence.ts');
  const upsertBody = saveProfileMatch[1];
  assert(!upsertBody.includes('plan_tier:'), 'saveProfile upsert payload must NOT contain plan_tier');
  assert(!upsertBody.includes('lifetime_spend_fcfa:'), 'saveProfile upsert payload must NOT contain lifetime_spend_fcfa');
  assert(!upsertBody.includes('affiliate_code:'), 'saveProfile upsert payload must NOT contain affiliate_code');
  console.log('  -> PASS: Client saveProfile payload stripped of sensitive system columns.\n');

  // Test 3: Check LIVE-DB Status
  console.log('[TEST 3] LIVE-DB Acceptance Check:');
  console.log('  Per Rule 7 and Owner-Only Section 1: SQL migrations can only be executed by the owner in Supabase SQL Editor.');
  console.log('  Status: NOT TESTED (needs LIVE-DB migration execution by owner)');
  console.log('  Once the owner runs `supabase/migrations/20261003000000_lock_client_writes.sql` in the Supabase SQL Editor:');
  console.log('    - PATCH profiles set plan_tier="studio" -> will be forced to OLD.plan_tier by trigger');
  console.log('    - PATCH generation_jobs set status="completed" -> will be denied (0 rows affected)');
  console.log('    - PATCH generation_job_variants set credits_unit=0 -> will be denied (policy dropped)');
  console.log('    - INSERT generation_jobs with credits_reserved=100 -> will be denied (violates check)');
  console.log('    - INSERT generation_jobs with 0 credits/no model -> allowed (badges work)');
  console.log('    - grant_purchase via service_role -> updates plan_tier normally.\n');

  console.log('===============================================================');
  console.log('PHASE 6B FIX 2 VERIFICATION FINISHED');
  console.log('Code changes & Migration file: PASS [DEMO-MODE]');
  console.log('RLS Enforcement on Postgres: NOT TESTED (needs LIVE-DB)');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
