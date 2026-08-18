// Local-only Tender / BOQ / Commercial spine deployment through migration 132.
import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';import*as path from'node:path';import{fileURLToPath}from'node:url';import{DB_URL}from'./env.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const migrations=[
  ['117_tender_bid_contractor_consultant_quantities.sql','7cd80008e8c96693e58ca07a3220f384039d0022494e60202e2bd717e6c5f203'],
  ['118_cost_package_procurement_tender_package_foundation.sql','9b092098f153dbfc194ee5d58b462d66de0ae5c1ffb793fdca964ac3ca5629b7'],
  ['119_project_team_access_foundation.sql','b52392c04b8bc0f702836d56331f18355d18e0f5086b4a8bb934095f118f73e9'],
  ['120_boq_template_v1_freeze.sql','74a7b492ec279b0fead7b79bf019c6c7582b8050bbb9cb3a326ebb8fad1f33c6'],
  ['121_tender_package_identity.sql','cf4282eb027e527ccd6e26ca7fffed9d3ef1ceb9e541dec35798126f1ef93fee'],
  ['122_consultant_boq_workflow.sql','c597f44c918a0b74ec991fb60c12dd325280352d816e62613edc67de120a8d6c'],
  ['123_consultant_boq_read_model.sql','5832b5c1103097f07ae9962da4a3919c67510316a973bb34bc8186fc3b0dd40a'],
  ['124_commercial_project_ontology_alignment.sql','d35d9ceafa2b2e401cb586959e6df93da8a507cd38dbabb605466b93147a99e1'],
  ['125_tender_invitation_lifecycle.sql','3c4e2d24f438e021a26b6b15ca5d0efa043f472420db75558ea289b6939e7138'],
  ['126_tender_setup_package_guard.sql','7b5e58516f0da2540f7476f6b04fd9a6d4bff07fb3b95df2fbcec128b5e70d3a'],
  ['127_bid_round_accepted_participant_scope.sql','3ef4f9f6a991ea35830c80d1fda18ea1d9eaee4eb72622108f6303e66b452847'],
  ['128_bid_scope_adjustments_and_comparison.sql','df2218250c08815dc489542599c8f0ca83a43d0fd1acc20e96ea127d215429da'],
  ['129_clarification_subjects_and_lifecycle.sql','0d8e2cfadf098f6ab80255069410c2ecbe61e04269ead21c43c649faa9032d93'],
  ['130_award_boq_commercial_baseline.sql','2d306b065a36233043b76fd03ed63be2ceb68fb5fb09948af3f5e866f2a78f00'],
  ['131_cost_package_financial_foundation.sql','2da6b148d757eea4f76fd98d56b810e9dfef20e64507bd5f91343661e2678323'],
  ['132_historical_commercial_data_foundation.sql','c1d9a0037233f2b27f1b8afd46c19fa86bfd7230f84794b07c0a5c586722b70e'],
];
for(const[file,expected]of migrations){const full=path.resolve(dir,'..','..','src','migrations',file),bytes=Buffer.from(readFileSync(full,'utf8').replace(/\r\n/g,'\n')),actual=createHash('sha256').update(bytes).digest('hex');if(actual!==expected)throw new Error(`REFUSING LOCAL DEPLOY: ${file} hash mismatch`);execFileSync('psql',[DB_URL,'-v','ON_ERROR_STOP=1','-f',full],{stdio:'inherit',env:{...process.env,PATH:`C:\\Program Files\\PostgreSQL\\17\\bin;${process.env.PATH}`}})}
console.log('Local Tender / BOQ / Commercial spine applied through 132.');
