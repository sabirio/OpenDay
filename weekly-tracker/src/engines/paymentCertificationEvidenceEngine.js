export function parseCertificationDocumentReferences(source) {
  return String(source || '').split('\n').map(line => line.trim()).filter(Boolean).map((reference, index) => ({ reference, sequence: index + 1 }));
}
