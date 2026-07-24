/**
 * projectVocabulary — shared, non-enforced vocabulary for project
 * classification fields used by live project creation/editing (Project
 * Information Architecture v1).
 *
 * These values are deliberately kept identical to core/import/
 * projectImportFieldMap.js's own PROJECT_TYPE_VALUES / LOCATION_TYPE_VALUES /
 * STORE_CONCEPT_SUGGESTIONS — that module is the frozen Import Foundation and
 * is not imported from here (components must not import core/ directly, and
 * Import Foundation is explicitly not to be touched by this task). A future
 * consolidation could make one of the two the single source; until then,
 * keep both lists in sync by hand if a value is ever added.
 *
 * None of these are DB enums/CHECK constraints — project_type, location_type,
 * and store_concept are all plain TEXT columns. Unrecognized/free-text values
 * are never rejected here; these lists are UI suggestions only.
 */

export const PROJECT_TYPE_OPTIONS = Object.freeze(['New Opening', 'Rebuilding']);

export const LOCATION_TYPE_OPTIONS = Object.freeze(['Mall', 'Street']);

export const STORE_CONCEPT_SUGGESTIONS = Object.freeze(['Flagship', 'Standard', 'Small', 'Compact']);
