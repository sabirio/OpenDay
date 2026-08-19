export function countEnabledCapabilities(capabilities=[]) {
  let count=0;
  for(const capability of capabilities)if(capability.enabled)count+=1;
  return count;
}
