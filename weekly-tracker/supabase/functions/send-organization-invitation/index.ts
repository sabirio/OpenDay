import {createClient} from 'npm:@supabase/supabase-js@2.106.2';

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]||char));

function emailDocument(invitation:Record<string,unknown>,actionLink:string){
  const subject=`You have been invited to ${invitation.organizationName} in OpenDay`;
  const recipient=invitation.name||String(invitation.email).split('@')[0];
  const html=`<!doctype html><html><body style="margin:0;background:#f3f5f7;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #dfe3e8;border-radius:12px;overflow:hidden"><div style="padding:22px 28px;background:#17202a;color:#fff;font-size:22px;font-weight:800">OpenDay</div><div style="padding:30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#b4492a">TEAM INVITATION</div><h1 style="font-size:26px;margin:8px 0 24px">Join ${escapeHtml(invitation.organizationName)}</h1><p>Dear ${escapeHtml(recipient)},</p><p style="line-height:1.6">You have been invited to join your colleagues in OpenDay. OpenDay keeps project, commercial, tender and field information in one secure workspace.</p><table style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #dfe3e8"><tr><td style="padding:10px;border-bottom:1px solid #dfe3e8;color:#687381">Organization</td><td style="padding:10px;border-bottom:1px solid #dfe3e8;font-weight:700">${escapeHtml(invitation.organizationName)}</td></tr><tr><td style="padding:10px;border-bottom:1px solid #dfe3e8;color:#687381">Role</td><td style="padding:10px;border-bottom:1px solid #dfe3e8;font-weight:700">${escapeHtml(invitation.jobRole||invitation.accessRole)}</td></tr><tr><td style="padding:10px;color:#687381">Organization access</td><td style="padding:10px;font-weight:700">${escapeHtml(invitation.organizationRole)}</td></tr></table><p><a href="${escapeHtml(actionLink)}" style="display:inline-block;padding:12px 20px;background:#b4492a;color:#fff;text-decoration:none;border-radius:7px;font-weight:700">Join OpenDay</a></p><p style="margin-top:24px;font-size:12px;line-height:1.5;color:#687381">This secure sign-in link can be used once and expires shortly. Do not forward this invitation.</p></div></div></body></html>`;
  const text=`You have been invited to ${invitation.organizationName} in OpenDay\n\nDear ${recipient},\n\nJoin your colleagues in OpenDay.\n\nOrganization: ${invitation.organizationName}\nRole: ${invitation.jobRole||invitation.accessRole}\nOrganization access: ${invitation.organizationRole}\n\nJoin OpenDay: ${actionLink}\n\nThis secure sign-in link can be used once and expires shortly. Do not forward this invitation.`;
  return{subject,html,text};
}

async function sendEmail(to:string,content:{subject:string;html:string;text:string}){
  const resendKey=Deno.env.get('RESEND_API_KEY');
  const fromAddress=Deno.env.get('TEAM_EMAIL_FROM')||'team@openday.local';
  if(resendKey){
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:`OpenDay <${fromAddress}>`,to:[to],subject:content.subject,html:content.html,text:content.text})});
    if(!response.ok)throw new Error(`EMAIL_PROVIDER_FAILED:${response.status}`);
    return 'RESEND';
  }
  const mailpitUrl=Deno.env.get('MAILPIT_SEND_URL')||'http://host.docker.internal:54324/api/v1/send';
  const response=await fetch(mailpitUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Name:'OpenDay',Email:fromAddress},To:[{Name:'',Email:to}],Subject:content.subject,HTML:content.html,Text:content.text,Tags:['organization-invitation']})});
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
    if(!body.organizationId||!body.email||!body.clientRequestId)throw new Error('ORGANIZATION_INVITATION_FIELDS_REQUIRED');
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const{data:invitation,error:inviteError}=await userClient.rpc('prepare_organization_user_invitation',{
      p_organization_id:body.organizationId,p_email:body.email,p_name:body.name||null,
      p_organization_role:body.organizationRole,p_access_role:body.accessRole,
      p_job_role:body.jobRole||null,p_client_request_id:body.clientRequestId,
    });
    if(inviteError)throw inviteError;
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const configuredOrigin=Deno.env.get('APP_SITE_URL');const requestedOrigin=String(body.redirectOrigin||'');
    const localOrigin=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(requestedOrigin)?requestedOrigin:null;
    const siteOrigin=configuredOrigin||localOrigin;if(!siteOrigin)throw new Error('APP_SITE_URL_REQUIRED');
    const{data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:invitation.email,options:{redirectTo:`${siteOrigin.replace(/\/$/,'')}/`}});
    if(linkError||!link?.properties?.action_link)throw linkError||new Error('MAGIC_LINK_NOT_CREATED');
    const content=emailDocument(invitation,link.properties.action_link);const provider=await sendEmail(invitation.email,content);
    const{data:sentAt,error:markError}=await admin.rpc('mark_organization_user_invitation_sent',{p_invitation_id:invitation.invitationId});
    if(markError)throw markError;
    return Response.json({...invitation,emailSentAt:sentAt,emailProvider:provider},{headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(error){console.error('[send-organization-invitation]',error);return Response.json({error:error instanceof Error?error.message:'ORGANIZATION_INVITATION_FAILED'},{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}})}
});
