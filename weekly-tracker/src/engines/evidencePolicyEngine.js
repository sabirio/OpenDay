export function validateEvidenceFileAgainstPolicy(file,policy,safeFilename){if(!file||!file.size)throw Object.assign(new Error('Choose a non-empty image.'),{code:'EMPTY_EVIDENCE_FILE'});if(!policy.allowedMimeTypes.includes(file.type))throw Object.assign(new Error('Use a JPEG, PNG or WebP image.'),{code:'UNSUPPORTED_EVIDENCE_TYPE'});if(file.size>policy.maxFileBytes)throw Object.assign(new Error(`Image must be ${policy.maxFileMegabytes} MB or smaller.`),{code:'EVIDENCE_FILE_TOO_LARGE'});return{filename:safeFilename(file.name),mimeType:file.type,byteSize:file.size}}
// evaluateEvidenceRequirements/getCloseout (core/application/evidenceApplicationAdapter.js)
// are intentionally not wired into any page yet — get_snag_evidence_policy
// (034 SQL) hardcodes correctionRequiredForReview/verificationRequiredForClosure
// to false server-side, so this gate has no effect either way today. Engine-audit
// note (2026-07-16): not a bug, just unfinished scaffolding — wiring it up is a
// UI/UX decision (what should block review/closure, and how to show it), not a fix.
// requiredEvidenceCount uses `??`, not `||`, so a future policy explicitly setting
// it to 0 is respected rather than silently coerced to the 1-item default.
export function evaluateEvidenceRequirements(policy,evidence,transition){const type=transition==='review'?'CORRECTION':'VERIFICATION';const required=transition==='review'?policy.correctionRequiredForReview:policy.verificationRequiredForClosure;const count=(evidence||[]).filter(item=>item.evidence_type===type&&item.original_filename).length;return{required,satisfied:!required||count>=(policy.requiredEvidenceCount??1),type,count}}
