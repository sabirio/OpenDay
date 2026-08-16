import{useMemo}from'react';import{buildCommercialReviewPresentation}from'../core/presentation/commercialReviewPresentationModel.js';
export function useCommercialReviewPresentation(review){return useMemo(()=>buildCommercialReviewPresentation(review),[review])}
