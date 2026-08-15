import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const normalizeAnswer = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const normalizeIdentifier = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('en-US');

function bytesToB64(bytes: Uint8Array) { let s=''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function b64ToBytes(v: string) { const s=atob(v), out=new Uint8Array(s.length); for(let i=0;i<s.length;i++) out[i]=s.charCodeAt(i); return out; }
async function derive(answer: string, saltB64: string) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(answer), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:b64ToBytes(saltB64), iterations:150000, hash:'SHA-256' }, material, 256);
  return bytesToB64(new Uint8Array(bits));
}
async function hashNew(answer: string) { const salt=crypto.getRandomValues(new Uint8Array(16)); const saltB64=bytesToB64(salt); return {salt:saltB64, hash:await derive(answer,saltB64)}; }
async function authenticatedUser(req: Request) {
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token) return null;
  const {data,error}=await service.auth.getUser(token); return error?null:data.user;
}
async function adminProfile(req: Request) {
  const user=await authenticatedUser(req); if(!user) return null;
  const {data}=await service.from('profiles').select('id,role,active').eq('id',user.id).maybeSingle();
  return data?.role==='admin'&&data?.active!==false?data:null;
}
async function resolveUser(identifier: string) {
  if(!identifier) return null;
  if(!identifier.includes('@')) {
    const {data:profile}=await service.from('profiles').select('id,first_name,last_name,username,active').ilike('username',identifier).maybeSingle();
    if(profile) return profile;
  }
  for(let page=1;page<=10;page++) {
    const {data,error}=await service.auth.admin.listUsers({page,perPage:100}); if(error) break;
    const match=data.users.find(u=>String(u.email||'').toLocaleLowerCase('en-US')===identifier);
    if(match){const {data:profile}=await service.from('profiles').select('id,first_name,last_name,username,active').eq('id',match.id).maybeSingle(); return profile||{id:match.id,first_name:'',last_name:'',username:'',active:true};}
    if(data.users.length<100) break;
  }
  return null;
}
async function requestAdminReset(target:any){
  const since=new Date(Date.now()-2*60*60*1000).toISOString();
  const {data:existing}=await service.from('notification_log').select('id').eq('event_type','password_reset_request').eq('channel','in_app').gte('created_at',since).contains('metadata',{target_user_id:target.id}).limit(1);
  if(existing?.length) return;
  const {data:admins}=await service.from('profiles').select('id').eq('role','admin').eq('active',true);
  const targetName=[target.first_name,target.last_name].filter(Boolean).join(' ')||target.username||'User';
  if(admins?.length) await service.from('notification_log').insert(admins.map((a:any)=>({user_id:a.id,period_id:null,event_type:'password_reset_request',channel:'in_app',recipient:null,status:'sent',metadata:{target_user_id:target.id,target_name:targetName,username:target.username||null,requested_at:new Date().toISOString()}})));
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  try{
    const body=await req.json(); const action=String(body.action||'');

    if(action==='set_question'){
      const user=await authenticatedUser(req); if(!user) return reply({error:'You must be signed in.'},401);
      const question=String(body.question||'').trim(), answer=normalizeAnswer(body.answer);
      if(question.length<8||question.length>180) return reply({error:'Choose a valid security question.'},400);
      if(answer.length<3) return reply({error:'Your security answer must be at least 3 characters.'},400);
      const h=await hashNew(answer);
      const {error}=await service.from('password_recovery_settings').upsert({user_id:user.id,security_question:question,answer_salt:h.salt,answer_hash:h.hash,failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()});
      if(error) throw error; return reply({ok:true});
    }

    if(action==='status'){
      const user=await authenticatedUser(req); if(!user) return reply({error:'You must be signed in.'},401);
      const {data}=await service.from('password_recovery_settings').select('security_question,updated_at').eq('user_id',user.id).maybeSingle();
      return reply({configured:!!data,question:data?.security_question||null,updated_at:data?.updated_at||null});
    }

    if(action==='admin_reset'){
      const admin=await adminProfile(req); if(!admin) return reply({error:'Administrator access required.'},403);
      const targetId=String(body.target_user_id||''), newPassword=String(body.new_password||'');
      if(!targetId) return reply({error:'Missing user.'},400);
      if(newPassword.length<8) return reply({error:'Temporary password must be at least 8 characters.'},400);
      const {error}=await service.auth.admin.updateUserById(targetId,{password:newPassword}); if(error) throw error;
      await service.from('password_recovery_settings').update({failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()}).eq('user_id',targetId);
      return reply({ok:true,message:'Password reset successfully.'});
    }

    const identifier=normalizeIdentifier(body.identifier), target=await resolveUser(identifier);
    if(!target||target.active===false) return reply({error:'We could not verify that account.'},404);

    if(action==='get_question'){
      const {data}=await service.from('password_recovery_settings').select('security_question,locked_until').eq('user_id',target.id).maybeSingle();
      if(!data) return reply({configured:false});
      const locked=!!(data.locked_until&&new Date(data.locked_until).getTime()>Date.now());
      return reply({configured:true,question:data.security_question,locked,locked_until:locked?data.locked_until:null});
    }

    if(action==='reset_password'){
      const answer=normalizeAnswer(body.answer), newPassword=String(body.new_password||'');
      if(newPassword.length<8) return reply({error:'New password must be at least 8 characters.'},400);
      const {data:rec}=await service.from('password_recovery_settings').select('*').eq('user_id',target.id).maybeSingle();
      if(!rec) return reply({error:'Security-question recovery is not configured for this account.',admin_reset_available:true},400);
      if(rec.locked_until&&new Date(rec.locked_until).getTime()>Date.now()) return reply({error:'Too many incorrect attempts. Try again later or request an admin reset.',locked:true,admin_reset_available:true},429);
      const candidate=await derive(answer,rec.answer_salt);
      if(candidate!==rec.answer_hash){
        const failures=Number(rec.failed_attempts||0)+1, lockedUntil=failures>=5?new Date(Date.now()+15*60*1000).toISOString():null;
        await service.from('password_recovery_settings').update({failed_attempts:lockedUntil?0:failures,locked_until:lockedUntil,updated_at:new Date().toISOString()}).eq('user_id',target.id);
        return reply({error:lockedUntil?'Too many incorrect attempts. Recovery is locked for 15 minutes.':'That security answer is incorrect.',attempts_remaining:lockedUntil?0:5-failures,admin_reset_available:true},401);
      }
      const {error:updateError}=await service.auth.admin.updateUserById(target.id,{password:newPassword}); if(updateError) throw updateError;
      await service.from('password_recovery_settings').update({failed_attempts:0,locked_until:null,updated_at:new Date().toISOString()}).eq('user_id',target.id);
      return reply({ok:true,message:'Password updated. You can sign in now.'});
    }

    if(action==='request_admin_reset'){ await requestAdminReset(target); return reply({ok:true,message:'An administrator has been alerted.'}); }
    return reply({error:'Unknown action.'},400);
  }catch(e){console.error(e);return reply({error:'Password recovery is temporarily unavailable.'},500);}
});
