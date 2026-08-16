export function summarizeBidReviewRound(round){
  const participants=round?.participants||[];
  const submissions=participants.map(x=>x.submission).filter(Boolean);
  return {
    participantCount:participants.length,
    submittedCount:submissions.length,
    reviewedCount:submissions.filter(x=>x.reviewStatus==='REVIEWED').length,
    completeBidCount:submissions.filter(x=>Number(x.missingLineCount)===0).length,
    missingPriceCount:submissions.reduce((sum,x)=>sum+Number(x.missingLineCount||0),0),
    readyToClose:participants.length>0&&submissions.length===participants.length&&submissions.every(x=>x.reviewStatus==='REVIEWED'),
  };
}

export function groupBidReviewItems(items=[]){
  const groups=[];const byId=new Map();
  for(const item of items){
    let group=byId.get(item.workGroupId);
    if(!group){group={workGroupId:item.workGroupId,disciplineLabel:item.disciplineLabel,workGroupCode:item.workGroupCode,workGroupLabel:item.workGroupLabel,items:[]};byId.set(item.workGroupId,group);groups.push(group)}
    group.items.push(item);
  }
  return groups;
}
