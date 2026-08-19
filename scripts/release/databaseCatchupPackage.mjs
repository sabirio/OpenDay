import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const APPLICATION_COMMIT = 'c79d45b104a0fe10b30c7b850b35949b615acba1';
export const PRODUCTION_PROJECT_REF = 'szgbkeqornkdngoegyso';
export const STAGING_PROJECT_REF = 'sdndsekarwhumdbcqxni';

const migrationPattern = /^(\d{3})_[a-z0-9_]+\.sql$/;

export function normalizedSha256(text) {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

export function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let state = 'normal';
  let dollarTag = '';
  let blockDepth = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'normal';
      }
      continue;
    }
    if (state === 'single-quote') {
      if (char === '\\') {
        index += 1;
      } else if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }
    if (state === 'double-quote') {
      if (char === '"' && next === '"') {
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        state = 'normal';
      }
      continue;
    }

    if (char === '-' && next === '-') {
      state = 'line-comment';
      index += 1;
    } else if (char === '/' && next === '*') {
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (char === "'") {
      state = 'single-quote';
    } else if (char === '"') {
      state = 'double-quote';
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        state = 'dollar-quote';
        index += dollarTag.length - 1;
      }
    } else if (char === ';') {
      statements.push(sql.slice(start, index + 1));
      start = index + 1;
    }
  }

  const trailing = sql.slice(start);
  if (trailing.trim()) statements.push(trailing);
  if (state !== 'normal' && state !== 'line-comment') {
    throw new Error(`Unterminated SQL lexical state: ${state}`);
  }
  return statements;
}

function withoutComments(statement) {
  return statement
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '')
    .trim();
}

export function removeTopLevelTransactionStatements(sql) {
  const removed = [];
  const kept = [];
  for (const statement of splitSqlStatements(sql.replace(/\r\n/g, '\n'))) {
    const code = withoutComments(statement);
    if (/^(?:BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(code)) {
      removed.push(code.replace(/;$/, '').toUpperCase());
    } else {
      kept.push(statement);
    }
  }
  return { sql: kept.join('').trim(), removed };
}

export function assertNoEmbeddedTransactions(sql) {
  const controls = splitSqlStatements(sql)
    .map(withoutComments)
    .filter((statement) => /^(?:BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(statement));
  if (controls.length) throw new Error(`Embedded transaction controls remain: ${controls.join(', ')}`);
}

export function migrationNumbersForTarget(target) {
  const numbers = [];
  if (target === 'staging') numbers.push(30, 31, 32, 33, 34, 35, 42, 43, 44, 45);
  for (let number = 59; number <= 146; number += 1) numbers.push(number);
  if (target !== 'staging' && target !== 'production') throw new Error(`Unsupported target: ${target}`);
  return numbers;
}

export function loadMigrations({ repoRoot, target }) {
  const migrationsDir = path.join(repoRoot, 'weekly-tracker', 'src', 'migrations');
  const migrationIndex = readdirSync(migrationsDir)
    .filter((name) => migrationPattern.test(name))
    .sort();
  const requested = migrationNumbersForTarget(target);
  return requested.map((number) => {
    const prefix = `${String(number).padStart(3, '0')}_`;
    const matches = migrationIndex.filter((name) => name.startsWith(prefix));
    if (matches.length !== 1) throw new Error(`Expected one migration for ${prefix}; found ${matches.join(', ') || 'none'}`);
    const filename = matches[0];
    const source = readFileSync(path.join(migrationsDir, filename), 'utf8').replace(/\r\n/g, '\n');
    const stripped = removeTopLevelTransactionStatements(source);
    assertNoEmbeddedTransactions(stripped.sql);
    return {
      number,
      filename,
      sha256: normalizedSha256(source),
      source,
      sql: stripped.sql,
      removedTransactions: stripped.removed,
    };
  });
}

function catalogFingerprintSql(expected) {
  return `
  SELECT count(*), md5(string_agg(concat_ws('|',table_name,ordinal_position,column_name,data_type,udt_name,is_nullable,coalesce(column_default,'')), E'\\n' ORDER BY table_name,ordinal_position))
    INTO v_count, v_hash
    FROM information_schema.columns WHERE table_schema='public';
  IF v_count <> ${expected.columns.count} OR v_hash IS DISTINCT FROM '${expected.columns.hash}' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_SCHEMA_DRIFT: columns % %', v_count, v_hash;
  END IF;
  SELECT count(*), md5(string_agg(concat_ws('|',p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),p.prosecdef,p.provolatile), E'\\n' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)))
    INTO v_count, v_hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
  IF v_count <> ${expected.functions.count} OR v_hash IS DISTINCT FROM '${expected.functions.hash}' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_SCHEMA_DRIFT: functions % %', v_count, v_hash;
  END IF;
  SELECT count(*), md5(string_agg(concat_ws('|',tablename,policyname,cmd,roles::text,coalesce(qual,''),coalesce(with_check,'')), E'\\n' ORDER BY tablename,policyname))
    INTO v_count, v_hash FROM pg_policies WHERE schemaname='public';
  IF v_count <> ${expected.policies.count} OR v_hash IS DISTINCT FROM '${expected.policies.hash}' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_SCHEMA_DRIFT: policies % %', v_count, v_hash;
  END IF;
  SELECT count(*), md5(string_agg(concat_ws('|',tablename,indexname,indexdef), E'\\n' ORDER BY tablename,indexname))
    INTO v_count, v_hash FROM pg_indexes WHERE schemaname='public';
  IF v_count <> ${expected.indexes.count} OR v_hash IS DISTINCT FROM '${expected.indexes.hash}' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_SCHEMA_DRIFT: indexes % %', v_count, v_hash;
  END IF;`;
}

function preflightSql(target, mode = 'remote') {
  const fingerprints = target === 'production'
    ? {
        columns: { count: 387, hash: 'c797808e5bf3c33a3f4f8d345c03fe29' },
        functions: { count: 51, hash: 'dd2fef7f3674c1fba005f580be814d8f' },
        policies: { count: 65, hash: '41044265b277f70a79f948f8ef806964' },
        indexes: { count: 75, hash: 'b149ac0c5020b64cc572ac6cbdacf227' },
      }
    : {
        columns: { count: 220, hash: '095708f2ff2e1ed9cbfec5ac55b6397e' },
        functions: { count: 29, hash: 'a67c3d2b6c3ea97b5488182c09599b6c' },
        policies: { count: 56, hash: 'a7f4a5f6d2e3542c2c2de8d369a92c55' },
        indexes: { count: 42, hash: 'd1c6aff0f9a305ecd7d6071ad8875a05' },
      };
  const targetSpecific = target === 'production'
    ? `
  IF to_regclass('public.snags') IS NULL OR to_regclass('public.snag_events') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_WRONG_TARGET_STATE: production snag foundation missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE id='e4ef4d98-5688-4d12-9fca-2d7cded88d29'::uuid) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_WRONG_TARGET_STATE: production master catalog missing';
  END IF;`
    : `
  IF to_regclass('public.snags') IS NOT NULL OR to_regclass('public.snag_events') IS NOT NULL THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_WRONG_TARGET_STATE: staging snag foundation unexpectedly present';
  END IF;
  IF EXISTS (SELECT 1 FROM public.templates WHERE id='e4ef4d98-5688-4d12-9fca-2d7cded88d29'::uuid) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_WRONG_TARGET_STATE: staging master catalog unexpectedly present';
  END IF;`;

  const fingerprintCheck = mode === 'remote' ? catalogFingerprintSql(fingerprints) : '';
  if (mode !== 'remote' && mode !== 'local-certification') throw new Error(`Unsupported preflight mode: ${mode}`);

  return `DO $openday_preflight$
DECLARE v_count bigint; v_hash text; v_body_hash text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'OPENDAY_PREFLIGHT_REQUIRES_POSTGRES'; END IF;
  IF to_regclass('public.contractor_report_scope_snapshots') IS NOT NULL
     OR to_regclass('public.work_ontology_versions') IS NOT NULL
     OR to_regclass('public.schema_migration_ledger') IS NOT NULL THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_ALREADY_OR_PARTIALLY_APPLIED';
  END IF;
  SELECT md5(p.prosrc) INTO v_body_hash
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='submit_contractor_report_atomic'
     AND pg_get_function_identity_arguments(p.oid)='p_project_id bigint, p_report_date date, p_wp_progress jsonb, p_meta jsonb, p_client_request_id uuid';
  IF v_body_hash IS DISTINCT FROM '53ddc257aaa05053822b30e8c7e8d72f' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_MIGRATION_058_MISMATCH: %', v_body_hash;
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN
      ('location_type','store_concept','sales_area_sqm','back_of_house_area_sqm','actual_construction_start_date','actual_construction_completion_date','actual_opening_date','budget','actual_cost','currency_code')) <> 10 THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_PROJECT_PROFILE_MISMATCH';
  END IF;
  IF to_regclass('public.project_schedule_versions') IS NULL
     OR to_regprocedure('public.create_contractor_managed_project(jsonb,text[],uuid)') IS NULL
     OR to_regprocedure('public.update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_SCHEDULE_STACK_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE id='dc92175a-251c-45ab-a4fd-c83c1c668ef4'::uuid) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_CANONICAL_V1_MISSING';
  END IF;
${fingerprintCheck}
${targetSpecific}
  IF EXISTS(SELECT 1 FROM public.contractor_reports report WHERE report.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id=report.project_id))
     OR EXISTS(SELECT 1 FROM public.contractor_report_wps item WHERE NOT EXISTS(SELECT 1 FROM public.contractor_reports report WHERE report.id=item.report_id AND report.project_id=item.project_id))
     OR EXISTS(SELECT 1 FROM public.site_visits visit WHERE visit.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id=visit.project_id))
     OR EXISTS(SELECT 1 FROM public.site_visit_wps item WHERE NOT EXISTS(SELECT 1 FROM public.site_visits visit WHERE visit.id=item.site_visit_id AND visit.project_id=item.project_id))
     OR EXISTS(SELECT 1 FROM public.site_visit_discrepancies discrepancy WHERE NOT EXISTS(SELECT 1 FROM public.site_visits visit WHERE visit.id=discrepancy.site_visit_id AND visit.project_id=discrepancy.project_id))
     OR EXISTS(SELECT 1 FROM public.progress_history history WHERE history.project_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects project WHERE project.id=history.project_id)) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_REFERENTIAL_INTEGRITY_FAILED';
  END IF;
  IF EXISTS(SELECT 1 FROM public.projects WHERE project_status IS NULL OR project_status NOT IN ('Active','Completed')) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_PROJECT_STATUS_REPAIR_REQUIRED';
  END IF;
END
$openday_preflight$;`;
}

function productionRoleCompatibilitySql(mode = 'remote') {
  if (mode === 'local-certification') {
    return `-- Local certification starts from the canonical baseline, which never
-- carried production's historical four-role check constraint.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;`;
  }
  return `DO $openday_profiles_role_compatibility$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid, true)
    INTO v_definition
    FROM pg_constraint constraint_row
   WHERE constraint_row.conrelid='public.profiles'::regclass
     AND constraint_row.conname='profiles_role_check'
     AND constraint_row.contype='c';
  IF v_definition IS DISTINCT FROM
     'CHECK (role = ANY (ARRAY[''Admin''::text, ''PM''::text, ''Contractor''::text, ''Viewer''::text]))' THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_PROFILES_ROLE_CONSTRAINT_MISMATCH: %',v_definition;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.profiles
     WHERE role NOT IN('Admin','PM','Contractor','Viewer')
  ) THEN
    RAISE EXCEPTION 'OPENDAY_PREFLIGHT_UNSUPPORTED_PROFILE_ROLE';
  END IF;
  ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
END
$openday_profiles_role_compatibility$;`;
}

function postflightSql(migrations, target) {
  const ledgerMigrations = migrations.filter(({ number }) => number > 132);
  const ids = ledgerMigrations.map(({ filename }) => `'${filename.replace(/\.sql$/, '')}'`).join(',');
  const legacyRolePostflight = target === 'production'
    ? `  IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(role)='viewer')
     OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_role_check') THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_LEGACY_PROFILE_ROLE_CONTRACT_REMAINS';
  END IF;`
    : '';
  return `DO $openday_postflight$
DECLARE v_version uuid; v_ledger_count integer; v_signature text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='job_role')
     OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='progress_history' AND column_name='work_ontology_version_id')
     OR to_regclass('public.contractor_report_risk_work_groups') IS NULL
     OR to_regclass('public.work_ontology_versions') IS NULL
     OR to_regclass('public.project_boqs') IS NULL
     OR to_regclass('public.project_tenders') IS NULL
     OR to_regclass('public.project_budget_cycles') IS NULL
     OR to_regclass('public.project_variations') IS NULL
     OR to_regclass('public.project_payment_schedules') IS NULL
     OR to_regclass('public.project_team_memberships') IS NULL
     OR to_regclass('public.project_procurement_strategies') IS NULL
     OR to_regclass('public.schema_migration_ledger') IS NULL THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_REQUIRED_OBJECT_MISSING';
  END IF;
  SELECT id INTO v_version FROM public.work_ontology_versions WHERE status='PUBLISHED' AND is_active=true;
  IF v_version IS NULL
     OR (SELECT count(*) FROM public.work_ontology_disciplines WHERE ontology_version_id=v_version) <> 12
     OR (SELECT count(*) FROM public.work_ontology_work_groups WHERE ontology_version_id=v_version AND is_active) <> 141
     OR (SELECT count(*) FROM public.work_ontology_boq_item_definitions WHERE ontology_version_id=v_version) <> 563 THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_ONTOLOGY_MISMATCH';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
     WHERE migration_id='supported-baseline-000-132'
       AND sequence_number=132
       AND filename='SUPPORTED_BASELINE_000_132@f14abab2e0051297bf3b4430be7b6984cdf64ff8'
       AND sha256='d1a1a545d755c544cf780da1b2cb220ac3b14c8aecd4325e33462e1e5be95b48'
  ) THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_LEDGER_BASELINE_MISMATCH';
  END IF;
  SELECT count(*) INTO v_ledger_count FROM public.schema_migration_ledger WHERE migration_id IN (${ids});
  IF v_ledger_count <> ${ledgerMigrations.length} THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_LEDGER_MISMATCH: % expected ${ledgerMigrations.length}', v_ledger_count;
  END IF;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.auth_user_role()','public.can_access_audit_log(text,text)',
    'public.can_admin_project(bigint)','public.current_company_id()',
    'public.get_my_role()','public.invite_contractor(text)','public.is_global_admin()'
  ] LOOP
    IF has_function_privilege('anon',v_signature,'EXECUTE')
       OR has_function_privilege('service_role',v_signature,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_signature,'EXECUTE') THEN
      RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_SECURITY_DEFINER_ACL_FAILED: %',v_signature;
    END IF;
  END LOOP;
  IF has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
     OR has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE')
     OR has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE') THEN
    RAISE EXCEPTION 'OPENDAY_POSTFLIGHT_SECURITY_DEFINER_ACL_FAILED: rls_auto_enable';
  END IF;${legacyRolePostflight ? `\n${legacyRolePostflight}` : ''}
END
$openday_postflight$;`;
}

export function buildCatchupPackage({ repoRoot, target, preflightMode = 'remote' }) {
  const migrations = loadMigrations({ repoRoot, target });
  const projectRef = target === 'production' ? PRODUCTION_PROJECT_REF : STAGING_PROJECT_REF;
  const sections = [
    '-- AUTO-GENERATED. DO NOT EDIT.',
    `-- OpenDay ${target} catch-up package`,
    `-- Application commit: ${APPLICATION_COMMIT}`,
    `-- Approved Supabase project ref: ${projectRef}`,
    `-- Migration count: ${migrations.length}`,
    'BEGIN;',
    "SET LOCAL lock_timeout = '10s';",
    "SET LOCAL statement_timeout = '30min';",
    preflightSql(target, preflightMode),
  ];
  if (target === 'production') sections.push(productionRoleCompatibilitySql(preflightMode));
  for (const migration of migrations) {
    sections.push(`-- MIGRATION ${migration.filename} SHA256 ${migration.sha256}\n${migration.sql}`);
  }
  sections.push(...migrations.filter(({ number }) => number > 132).map(({ number, filename, sha256 }) =>
    `SELECT private.register_schema_migration('${filename.replace(/\.sql$/, '')}', ${number}, '${filename}', '${sha256}');`));
  sections.push(postflightSql(migrations, target), 'COMMIT;');
  const sql = `${sections.join('\n\n').trim()}\n`;
  const transactionControls = splitSqlStatements(sql)
    .map(withoutComments)
    .filter((statement) => /^(?:BEGIN|COMMIT|ROLLBACK)\s*;?$/i.test(statement));
  if (transactionControls.length !== 2 || !/^BEGIN/i.test(transactionControls[0]) || !/^COMMIT/i.test(transactionControls[1])) {
    throw new Error(`Release must contain one outer BEGIN/COMMIT pair; found ${transactionControls.join(', ')}`);
  }
  return {
    target,
    projectRef,
    applicationCommit: APPLICATION_COMMIT,
    migrations,
    sql,
    sha256: normalizedSha256(sql),
  };
}
