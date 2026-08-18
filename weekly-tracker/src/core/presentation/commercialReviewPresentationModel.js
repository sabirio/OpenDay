import{COMMERCIAL_REVIEW_BUCKETS,countCommercialReviewBuckets}from'../../engines/commercialReviewEngine.js';
export function buildCommercialReviewPresentation(review){return{buckets:COMMERCIAL_REVIEW_BUCKETS,bucketCounts:countCommercialReviewBuckets(review?.openCycle?.items)}}
