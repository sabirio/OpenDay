/**
 * downloadXlsxBlob — browser download boundary for generated XLSX bytes.
 * Same Blob -> object URL -> hidden <a> -> click -> revoke pattern already
 * proven by src/export/pdf/renderExportPdf.js's downloadPdfBlob, kept as its
 * own small file here (rather than importing the PDF-specific module) since
 * that file is intentionally scoped to @react-pdf/renderer output.
 */
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function downloadXlsxBlob(bytes, filename) {
  const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
