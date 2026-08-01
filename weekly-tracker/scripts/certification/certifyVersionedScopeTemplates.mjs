import {
  anonClient,
  loadFixtureState,
  makeReporter,
  psql,
  queryOne,
  requireCertificationEnvironment,
  signInAs,
} from './lib.mjs';
import {
  RETAIL_FITOUT_V2_FAMILY,
  RETAIL_FITOUT_V2_TEMPLATE_ID,
} from '../../src/domains/construction/templates/versionedScopeTemplate.js';

await requireCertificationEnvironment();

const state = loadFixtureState();
const r = makeReporter('Versioned scope-template runtime certification');
const COMPANY_A_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000a1';
const COMPANY_B_TEMPLATE_ID = '00000000-0000-4000-8000-0000000000b1';
const TEMP_PROJECT_ID = 990041;

async function main() {
  const adminA = await signInAs(state.users.adminA.email, state.password);
  const viewerA = await signInAs(state.users.viewerA.email, state.password);
  const adminB = await signInAs(state.users.adminB.email, state.password);
  const anon = anonClient();

  psql(`
    DELETE FROM public.projects WHERE id = ${TEMP_PROJECT_ID};
    DELETE FROM public.templates
      WHERE id IN ('${COMPANY_A_TEMPLATE_ID}', '${COMPANY_B_TEMPLATE_ID}');
    INSERT INTO public.templates (id,name,family,family_id,company_id,version,is_active,data)
    SELECT '${COMPANY_A_TEMPLATE_ID}','Company A V2',family,
           '00000000-0000-4000-8000-0000000000a0','company-a',1,true,data
    FROM public.templates WHERE id = '${RETAIL_FITOUT_V2_TEMPLATE_ID}';
    INSERT INTO public.templates (id,name,family,family_id,company_id,version,is_active,data)
    SELECT '${COMPANY_B_TEMPLATE_ID}','Company B V2',family,
           '00000000-0000-4000-8000-0000000000b0','company-b',1,true,data
    FROM public.templates WHERE id = '${RETAIL_FITOUT_V2_TEMPLATE_ID}';
  `);

  r.section('RLS read matrix');
  for (const [label, client] of [['Admin A', adminA], ['Viewer A', viewerA]]) {
    const { data, error } = await client
      .from('templates')
      .select('id,company_id')
      .in('id', [RETAIL_FITOUT_V2_TEMPLATE_ID, COMPANY_A_TEMPLATE_ID, COMPANY_B_TEMPLATE_ID]);
    const ids = new Set((data ?? []).map(row => row.id));
    r.check(`${label} reads global default`, !error && ids.has(RETAIL_FITOUT_V2_TEMPLATE_ID), error?.message);
    r.check(`${label} reads own-company template`, !error && ids.has(COMPANY_A_TEMPLATE_ID), error?.message);
    r.check(`${label} cannot read Company B private template`, !ids.has(COMPANY_B_TEMPLATE_ID), JSON.stringify(data));
  }
  {
    const { data } = await adminB
      .from('templates')
      .select('id')
      .in('id', [COMPANY_A_TEMPLATE_ID, COMPANY_B_TEMPLATE_ID]);
    const ids = new Set((data ?? []).map(row => row.id));
    r.check('Company B reads its own private template', ids.has(COMPANY_B_TEMPLATE_ID));
    r.check('Company B cannot read Company A private template', !ids.has(COMPANY_A_TEMPLATE_ID));
  }
  {
    const { data, error } = await anon
      .from('templates')
      .select('id')
      .eq('id', RETAIL_FITOUT_V2_TEMPLATE_ID);
    r.check('unauthenticated client cannot read protected template data',
      Boolean(error) || (data ?? []).length === 0, JSON.stringify({ data, error }));
  }

  r.section('RLS write matrix');
  {
    const { error } = await adminA
      .from('templates')
      .update({ name: 'Company A V2 updated' })
      .eq('id', COMPANY_A_TEMPLATE_ID);
    r.check('Company A Admin can update own unreferenced template metadata', !error, error?.message);
  }
  {
    const before = queryOne(`SELECT name FROM public.templates WHERE id='${COMPANY_B_TEMPLATE_ID}';`);
    await adminA.from('templates').update({ name: 'cross-company-write' }).eq('id', COMPANY_B_TEMPLATE_ID);
    const after = queryOne(`SELECT name FROM public.templates WHERE id='${COMPANY_B_TEMPLATE_ID}';`);
    r.check('Company A Admin cannot update Company B private template',
      after === before);
  }
  {
    const before = queryOne(`SELECT name FROM public.templates WHERE id='${RETAIL_FITOUT_V2_TEMPLATE_ID}';`);
    await adminA.from('templates').update({ name: 'company-admin-global-write' }).eq('id', RETAIL_FITOUT_V2_TEMPLATE_ID);
    const after = queryOne(`SELECT name FROM public.templates WHERE id='${RETAIL_FITOUT_V2_TEMPLATE_ID}';`);
    r.check('company-scoped Admin cannot mutate global OpenDay default',
      after === before);
  }

  r.section('Database immutability and pin stability');
  {
    psql(`
      INSERT INTO public.projects (
        id,store_code,country,company_id,template_type,template_id,scope
      ) VALUES (
        ${TEMP_PROJECT_ID},'CERT-SCOPE-TEMPLATE','Local','company-a',
        '${RETAIL_FITOUT_V2_FAMILY}','${COMPANY_A_TEMPLATE_ID}',
        '{"workPackages":["common.demolition.strip_out"]}'::jsonb
      );
    `);

    const ownTemplate = await adminA.from('templates').select('data').eq('id', COMPANY_A_TEMPLATE_ID).single();
    const mutatedData = structuredClone(ownTemplate.data.data);
    mutatedData.zones[0].categories[0].label = 'Forbidden in-place semantic mutation';
    const { error: immutableError } = await adminA
      .from('templates')
      .update({ data: mutatedData })
      .eq('id', COMPANY_A_TEMPLATE_ID);
    r.check('referenced template semantic update is rejected by the database trigger',
      immutableError?.message?.includes('REFERENCED_TEMPLATE_IMMUTABLE') === true,
      immutableError?.message);

    const pinnedId = queryOne(`SELECT template_id FROM public.projects WHERE id=${TEMP_PROJECT_ID};`);
    r.check('referenced project remains pinned to the original version',
      pinnedId === COMPANY_A_TEMPLATE_ID);
  }
}

try {
  await main();
} finally {
  psql(`
    DELETE FROM public.projects WHERE id = ${TEMP_PROJECT_ID};
    DELETE FROM public.templates
      WHERE id IN ('${COMPANY_A_TEMPLATE_ID}', '${COMPANY_B_TEMPLATE_ID}');
  `);
}

const summary = r.summary();
process.exit(summary.fail === 0 ? 0 : 1);
