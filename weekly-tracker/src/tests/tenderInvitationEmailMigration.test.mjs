import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/116_tender_invitation_email.sql',import.meta.url),'utf8');let p=0,f=0;const check=(name,condition)=>{if(condition){p++;console.log(`  PASS ${name}`)}else{f++;console.error(`  FAIL ${name}`)}};
check('setup snapshot stores versioned invitation copy',/project_tender_setup_versions[\s\S]*invitation_message/.test(sql)&&/char_length\(invitation_message\) <= 4000/.test(sql));
check('bidder access records sent and opened timestamps',/email_sent_at timestamptz/.test(sql)&&/email_opened_at timestamptz/.test(sql));
check('save command accepts and persists invitation message',/p_invitation_message text/.test(sql)&&/btrim\(p_invitation_message\)/.test(sql));
check('invite command returns branded email context',/'invitationMessage',v_setup\.invitation_message/.test(sql)&&/'projectStoreCode',v_store_code/.test(sql));
check('only service role can mark successful delivery',/REVOKE ALL ON FUNCTION public\.mark_project_tender_invitation_sent\(uuid,uuid\) FROM PUBLIC,anon,authenticated,service_role;[\s\S]*GRANT EXECUTE ON FUNCTION public\.mark_project_tender_invitation_sent\(uuid,uuid\) TO service_role;/.test(sql));
check('portal activation records opened state',/email_opened_at=COALESCE\(email_opened_at,now\(\)\)/.test(sql));
console.log(`\nTender invitation email migration: ${p} passed, ${f} failed`);if(f)process.exit(1);
