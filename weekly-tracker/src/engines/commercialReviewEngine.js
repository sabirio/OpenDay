export const COMMERCIAL_REVIEW_BUCKETS=['NEW','PENDING','APPROVED','REJECTED','DISPUTED'];
export function countCommercialReviewBuckets(items=[]){return Object.fromEntries(COMMERCIAL_REVIEW_BUCKETS.map(bucket=>[bucket,items.reduce((count,item)=>count+(item.bucket===bucket?1:0),0)]))}
