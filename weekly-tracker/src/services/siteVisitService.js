import { supabase } from '../lib/supabase';

function fromDB(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    referenceReportId: row.reference_report_id,
    visitDate: row.visit_date,
    demolitionStatus: row.demolition_status,
    constructionStatuses: row.construction_statuses || {},
    testingStatuses: row.testing_statuses || {},
    handoverStatuses: row.handover_statuses || {},
    pmScheduleAssessment: row.pm_schedule_assessment,
    observations: row.observations,
    photos: row.photos || [],
    declarationConfirmed: row.declaration_confirmed,
    submittedAt: row.submitted_at,
  };
}

function toDB(visit) {
  return {
    project_id: visit.projectId,
    reference_report_id: visit.referenceReportId || null,
    visit_date: visit.visitDate || null,
    demolition_status: visit.demolitionStatus || null,
    construction_statuses: visit.constructionStatuses || {},
    testing_statuses: visit.testingStatuses || {},
    handover_statuses: visit.handoverStatuses || {},
    pm_schedule_assessment: visit.pmScheduleAssessment || null,
    observations: visit.observations || null,
    photos: visit.photos || [],
    declaration_confirmed: visit.declarationConfirmed || false,
    submitted_at: visit.submittedAt || new Date().toISOString(),
  };
}

export async function getAll() {
  const { data, error } = await supabase
    .from('site_visits')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data.map(fromDB);
}

export async function create(visit) {
  const { data, error } = await supabase
    .from('site_visits')
    .insert([toDB(visit)])
    .select()
    .single();
  if (error) throw error;
  return fromDB(data);
}
