/**
 * Canonical Core contracts. These JSDoc typedefs are the minimal type layer
 * for the JS-first application; runtime validation/normalization lives in
 * buildCanonicalProjectSnapshot.js.
 *
 * @typedef {{code:string,path:string,originalValue?:unknown,normalizedValue?:unknown,severity:'info'|'warning'|'error',message?:string}} CanonicalWarning
 * @typedef {{project:object,template:object|null,zones:Array,workPackages:Array,contractorReports:Array,latestContractorReport:object|null,siteVisits:Array,latestSiteVisit:object|null,progressHistory:Array,risks:Array,evidence:Array,scope:object,metadata:{projectId:string,organizationId:string|null,calculatedAt:string,sourceVersion:string},warnings:CanonicalWarning[]}} CanonicalProjectSnapshot
 * @typedef {{overallProgress:number,contractorProgress:number|null,verifiedProgress:number|null,plannedProgress:number|null,variance:number|null,confidence:number|null,calculationMethod:string,breakdown:Array,warnings:CanonicalWarning[],calculatedAt:string}} CanonicalProgressResult
 * @typedef {{contractorProgress:number|null,pmVerifiedProgress:number|null,signedDifference:number|null,absoluteDifference:number|null,severity:'unavailable'|'ok'|'warning'|'critical',confidence:number|null,comparedScope:object,contractorReportId:string|null,siteVisitId:string|null,comparedAt:string|null,warnings:CanonicalWarning[]}} CanonicalDiscrepancyResult
 * @typedef {{snapshot:CanonicalProjectSnapshot,progress:CanonicalProgressResult,discrepancy:CanonicalDiscrepancyResult,schedule:object|null,readiness:object|null,risks:object,warnings:CanonicalWarning[],calculatedAt:string,compatibility:object}} OpenDayOrchestratorResult
 */

export const CANONICAL_SOURCE_VERSION = 'openday-canonical-core/1';

