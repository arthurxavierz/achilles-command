const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const uid=(prefix='lead')=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

export default async (request) => {
  if(request.method!=='POST') return json({error:'Método não permitido'},405);
  const url=Netlify.env.get('SUPABASE_URL');
  const key=Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const org=Netlify.env.get('ACHILLES_ORG_ID');
  if(!url||!key||!org) return json({error:'Captação pública ainda não configurada no servidor'},503);
  try{
    const b=await request.json();
    const phone=String(b.phone||'').replace(/[^\d+]/g,'').slice(0,24);
    const company=String(b.company||'').trim().slice(0,160);
    const contact=String(b.contact||'').trim().slice(0,160);
    if(!company||!contact) return json({error:'Nome e empresa são obrigatórios'},400);
    const record={
      id:uid(), organization_id:org, company, contact, phone,
      email:String(b.email||'').trim().slice(0,200), service:String(b.service||'').trim().slice(0,160),
      source:String(b.source||'Chat do site').trim().slice(0,100), stage:'new', score:60,
      value:Number(b.value||0)||0, last_contact:new Date().toISOString().slice(0,10),
      next_action:'Realizar diagnóstico', notes:String(b.notes||'').trim().slice(0,3000)
    };
    const res=await fetch(`${url.replace(/\/$/,'')}/rest/v1/leads`,{method:'POST',headers:{'apikey':key,'Authorization':`Bearer ${key}`,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(record)});
    const data=await res.json().catch(()=>null);
    if(!res.ok) throw new Error(data?.message||`Supabase ${res.status}`);
    return json({ok:true,lead:Array.isArray(data)?data[0]:data});
  }catch(error){ return json({error:error.message},500); }
};
