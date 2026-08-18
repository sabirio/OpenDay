export function formatScheduleCloseoutVariance(value){return value==null?'Not available':value===0?'On baseline':value>0?`${value} days lost`:`${Math.abs(value)} days gained`}
