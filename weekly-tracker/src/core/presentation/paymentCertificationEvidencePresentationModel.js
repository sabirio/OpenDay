import { parseCertificationDocumentReferences } from '../../engines/paymentCertificationEvidenceEngine.js';

export function buildPaymentCertificationEvidencePresentation() {
  return { parseDocumentReferences: parseCertificationDocumentReferences };
}
