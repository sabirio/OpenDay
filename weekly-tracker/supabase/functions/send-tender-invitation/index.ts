import {createClient} from 'npm:@supabase/supabase-js@2.106.2';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};

const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]||char));
const paragraph=(value:unknown)=>escapeHtml(value).replace(/\r?\n/g,'<br>');

function emailDocument(invitation:Record<string,unknown>,actionLink:string){
  const subject=`Invitation to Tender — ${invitation.tenderNumber}`;
  const deadline=new Date(String(invitation.deadlineAt)).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'});
  const html=`<!doctype html><html><body style="margin:0;background:#f3f5f7;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden"><div style="padding:22px 28px;background:#17202a;color:#fff;font-size:22px;font-weight:800">OpenDay</div><div style="padding:30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#b4492a">INVITATION TO TENDER</div><h1 style="font-size:26px;margin:8px 0 24px">${escapeHtml(invitation.title)}</h1><p>Dear ${escapeHtml(invitation.contractorName)},</p><p style="line-height:1.6">${paragraph(invitation.invitationMessage)}</p><table style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #dfe3e8"><tr><td style="padding:10px;border-bottom:1px solid #dfe3e8;color:#687381">Project</td><td style="padding:10px;border-bottom:1px solid #dfe3e8;font-weight:700">${escapeHtml(invitation.projectStoreCode)}</td></tr><tr><td style="padding:10px;border-bottom:1px solid #dfe3e8;color:#687381">Tender</td><td style="padding:10px;border-bottom:1px solid #dfe3e8;font-weight:700">${escapeHtml(invitation.tenderNumber)}</td></tr><tr><td style="padding:10px;border-bottom:1px solid #dfe3e8;color:#687381">Deadline</td><td style="padding:10px;border-bottom:1px solid #dfe3e8;font-weight:700">${escapeHtml(deadline)} UTC</td></tr><tr><td style="padding:10px;color:#687381">Currency</td><td style="padding:10px;font-weight:700">${escapeHtml(invitation.currencyCode)}</td></tr></table><p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 20px;background:#b4492a;color:#fff;text-decoration:none;border-radius:7px;font-weight:700">Open Tender</a></p><p style="margin-top:24px;font-size:12px;line-height:1.5;color:#687381">This secure sign-in link can be used once and expires shortly. Do not forward this invitation.</p></div></div></body></html>`;
  const text=`Invitation to Tender — ${invitation.tenderNumber}\n\nDear ${invitation.contractorName},\n\n${invitation.invitationMessage}\n\nProject: ${invitation.projectStoreCode}\nTender: ${invitation.tenderNumber}\nDeadline: ${deadline} UTC\nCurrency: ${invitation.currencyCode}\n\nOpen Tender: ${actionLink}\n\nThis secure sign-in link can be used once and expires shortly. Do not forward this invitation.`;
  return{subject,html,text};
}

async function sendEmail(to:string,content:{subject:string;html:string;text:string}){
  const resendKey=Deno.env.get('RESEND_API_KEY');
  const fromAddress=Deno.env.get('TENDER_EMAIL_FROM')||'tender@openday.local';
  if(resendKey){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:`OpenDay <${fromAddress}>`,to:[to],subject:content.subject,html:content.html,text:content.text})});
    if(!response.ok)throw new Error(`EMAIL_PROVIDER_FAILED:${response.status}`);
    return 'RESEND';
  }
  const mailpitUrl=Deno.env.get('MAILPIT_SEND_URL')||'http://host.docker.internal:54324/api/v1/send';
  const response=await fetch(mailpitUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Name:'OpenDay',Email:fromAddress},To:[{Name:'',Email:to}],Subject:content.subject,HTML:content.html,Text:content.text,Tags:['tender-invitation']})});
  if(!response.ok)throw new Error(`LOCAL_EMAIL_PROVIDER_FAILED:${response.status}`);
  return 'MAILPIT';
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers:corsHeaders});
  try{
    const authorization=request.headers.get('Authorization');
    if(!authorization)throw new Error('AUTHENTICATION_REQUIRED');
    const supabaseUrl=Deno.env.get('SUPABASE_URL');const anonKey=Deno.env.get('SUPABASE_ANON_KEY');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!supabaseUrl||!anonKey||!serviceKey)throw new Error('EMAIL_FUNCTION_NOT_CONFIGURED');
    const body=await request.json();
    if(!body.tenderId||!body.participantId||!body.clientRequestId)throw new Error('TENDER_INVITATION_ID_REQUIRED');
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const{data:invitation,error:inviteError}=await userClient.rpc('invite_project_tender_bidder',{p_tender_id:body.tenderId,p_participant_id:body.participantId,p_client_request_id:body.clientRequestId});
    if(inviteError)throw inviteError;
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const configuredOrigin=Deno.env.get('APP_SITE_URL');const requestedOrigin=String(body.redirectOrigin||'');const localOrigin=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(requestedOrigin)?requestedOrigin:null;const siteOrigin=configuredOrigin||localOrigin;
    if(!siteOrigin)throw new Error('APP_SITE_URL_REQUIRED');
    const{data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:invitation.email,options:{redirectTo:`${siteOrigin.replace(/\/$/,'')}/tenders`}});
    if(linkError||!link?.properties?.action_link)throw linkError||new Error('MAGIC_LINK_NOT_CREATED');
    const content=emailDocument(invitation,link.properties.action_link);const provider=await sendEmail(invitation.email,content);
    const{data:sentAt,error:markError}=await admin.rpc('mark_project_tender_invitation_sent',{p_tender_id:body.tenderId,p_participant_id:body.participantId});
    if(markError)throw markError;
    return Response.json({...invitation,emailSentAt:sentAt,emailProvider:provider},{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(error){console.error('[send-tender-invitation]',error);return Response.json({error:error instanceof Error?error.message:'TENDER_INVITATION_FAILED'},{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}
});
