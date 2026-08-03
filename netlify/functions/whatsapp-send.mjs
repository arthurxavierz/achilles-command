import { requireInternalAuth, authError } from '../lib/auth.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export default async (request) => {
  if(request.method!=='POST') return json({error:'Método não permitido'},405);
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);
  const enabled=(Netlify.env.get('WHATSAPP_CLOUD_ENABLED')||'false').toLowerCase()==='true';
  if(!enabled) return json({error:'WhatsApp Cloud API está desativada. O Command está em envio assistido/manual.'},503);
  const token=Netlify.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneId=Netlify.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const apiVersion=Netlify.env.get('WHATSAPP_API_VERSION')||'v23.0';
  if(!token||!phoneId) return json({error:'Credenciais do WhatsApp Cloud API não configuradas'},503);
  try{
    const b=await request.json();
    const to=String(b.to||'').replace(/\D/g,'');
    if(!to) return json({error:'Destino obrigatório'},400);
    let payload;
    if(b.templateName){
      payload={messaging_product:'whatsapp',to,type:'template',template:{name:b.templateName,language:{code:b.language||'pt_BR'},components:b.components||[]}};
    }else{
      payload={messaging_product:'whatsapp',to,type:'text',text:{preview_url:false,body:String(b.text||'').slice(0,4096)}};
    }
    const res=await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();
    if(!res.ok) throw new Error(data?.error?.message||`Meta ${res.status}`);
    return json({ok:true,data});
  }catch(error){return json({error:error.message},500);}
};
