/** Stable, human-readable filenames — no random UUIDs in user-facing downloads. */

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** OpenDay_Projects_YYYY-MM-DD.xlsx */
export function buildProjectExportFilename(date = new Date()) {
  return `OpenDay_Projects_${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.xlsx`;
}

/** Same name every time — it's a static template, not a dated export. */
export const PROJECT_IMPORT_TEMPLATE_FILENAME = 'OpenDay_Project_Import_Template.xlsx';
