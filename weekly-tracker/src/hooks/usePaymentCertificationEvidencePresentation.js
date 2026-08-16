import { useMemo } from 'react';
import { buildPaymentCertificationEvidencePresentation } from '../core/presentation/paymentCertificationEvidencePresentationModel.js';

export function usePaymentCertificationEvidencePresentation() {
  return useMemo(() => buildPaymentCertificationEvidencePresentation(), []);
}
