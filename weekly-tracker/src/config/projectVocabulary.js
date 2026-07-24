/**
 * projectVocabulary — the ONE canonical literal definition of each shared
 * project classification vocabulary (Location Type, Project Type, Store
 * Concept). Both live project creation/editing (Project Information
 * Architecture v1) and historical Import (`core/import/
 * projectImportFieldMap.js`, which re-exports these under its own historic
 * names) consume this module — neither maintains its own copy.
 *
 * config/ is a dependency-free leaf layer already consumed by both core/ and
 * UI code elsewhere in this codebase, which is what makes it a legal neutral
 * owner here: Import depends on this vocabulary, this vocabulary does not
 * depend on Import (or on anything else).
 *
 * None of these are DB enums/CHECK constraints — project_type, location_type,
 * and store_concept are all plain TEXT columns. Unrecognized/free-text values
 * are never rejected here; these lists are UI suggestions only (Store
 * Concept) or a v1 warn-not-block vocabulary (Project Type, Location Type —
 * enforced by Import's own validation, not by this module).
 */

export const PROJECT_TYPE_OPTIONS = Object.freeze(['New Opening', 'Rebuilding']);

export const LOCATION_TYPE_OPTIONS = Object.freeze(['Mall', 'Street']);

export const STORE_CONCEPT_SUGGESTIONS = Object.freeze(['Flagship', 'Standard', 'Small', 'Compact']);
