import { requireInternalAuth, authError } from '../lib/auth.mjs';
const USER_AGENT = "Mozilla/5.0 (compatible; AchillesCommand/1.0; +https://achillesmedia.com.br)";
const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

function absolute(url, base) { try { return new URL(url, base).href; } catch { return ''; } }
function uniq(list) { return [...new Set(list.filter(Boolean))]; }
function safeUrl(value='') {
  try { const u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}

function extract(html, base) {
  const mailto = [...html.matchAll(/mailto:([^"'?#\s<]+)/gi)].map(m=>decodeURIComponent(m[1]));
  const plainEmails = [...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0]);
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>absolute(m[1],base));
  const social = {
    instagram: hrefs.find(x=>/instagram\.com\//i.test(x)) || '',
    facebook: hrefs.find(x=>/(facebook|fb)\.com\//i.test(x)) || '',
    linkedin: hrefs.find(x=>/linkedin\.com\//i.test(x)) || '',
    whatsapp: hrefs.find(x=>/(wa\.me|api\.whatsapp\.com|whatsapp\.com\/send)/i.test(x)) || ''
  };
  const phones = uniq([
    ...[...html.matchAll(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g)].map(m=>m[0].trim()),
    ...hrefs.filter(x=>/^tel:/i.test(x)).map(x=>x.replace(/^tel:/i,''))
  ]).slice(0,5);
  return { emails: uniq([...mailto,...plainEmails]).slice(0,8), phones, ...social };
}

export default async (request) => {
  if (request.method !== 'POST') return json({error:'Método não permitido'},405);
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);
  try {
    const body=await request.json();
    const url=safeUrl(String(body.website||''));
    if(!url) return json({error:'Site inválido'},400);
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
    const res=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':USER_AGENT,'Accept':'text/html,application/xhtml+xml','Accept-Language':'pt-BR,pt;q=0.9'}});
    clearTimeout(timer);
    if(!res.ok) throw new Error(`Site respondeu ${res.status}`);
    const type=res.headers.get('content-type')||'';
    if(!type.includes('text/html')) throw new Error('O endereço não retornou uma página HTML');
    const html=(await res.text()).slice(0,1500000);
    return json({website:res.url,...extract(html,res.url)});
  } catch(error){ return json({error:error.name==='AbortError'?'O site demorou demais para responder':error.message},502); }
};
