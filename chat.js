(() => {
  const messages = document.getElementById('messages');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const data = { name:'', company:'', service:'', objective:'', phone:'' };
  let step = 0;

  const steps = [
    { ask:'Olá. Sou o assistente da Achilles Media. Qual é o seu nome?', key:'name' },
    { ask:() => `Prazer, ${first(data.name)}. Qual é o nome da sua empresa ou projeto?`, key:'company' },
    { ask:'Qual solução você procura?', key:'service', choices:['Site ou landing page','Chatbot e atendimento','Automação empresarial','Ainda não tenho certeza'] },
    { ask:'Qual resultado você mais precisa melhorar agora?', key:'objective' },
    { ask:'Para concluir, qual número podemos usar para continuar no WhatsApp?', key:'phone' }
  ];

  function first(name){ return String(name||'').trim().split(' ')[0] || 'certo'; }
  function time(){ return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
  function add(text,type='bot'){
    const el=document.createElement('div');el.className=`msg ${type}`;el.textContent=text;
    const small=document.createElement('small');small.textContent=time();el.appendChild(small);messages.appendChild(el);messages.scrollTop=messages.scrollHeight;
  }
  function choices(items){
    const wrap=document.createElement('div');wrap.className='choices';
    items.forEach(item=>{const b=document.createElement('button');b.className='choice';b.type='button';b.textContent=item;b.onclick=()=>submit(item);wrap.appendChild(b)});
    messages.appendChild(wrap);messages.scrollTop=messages.scrollHeight;
  }
  function ask(){
    if(step>=steps.length) return finish();
    const current=steps[step];add(typeof current.ask==='function'?current.ask():current.ask);
    if(current.choices) choices(current.choices);
    input.placeholder=current.key==='phone'?'DDD e número':'Escreva sua resposta';input.focus();
  }
  async function submit(value){
    const text=String(value||'').trim();if(!text)return;
    document.querySelector('.choices')?.remove();add(text,'user');
    data[steps[step].key]=text;step+=1;setTimeout(ask,350);
  }
  async function finish(){
    add(`Obrigado, ${first(data.name)}. Registrei que a ${data.company} procura ${data.service.toLowerCase()} para ${data.objective.toLowerCase()}.`);

    const core = window.AchillesCore;
    const payload = {
      company: data.company, contact: data.name, phone: data.phone,
      service: data.service, source: 'Chat do site', notes: data.objective, value: 0
    };

    // 1) Grava localmente primeiro, para a conversa não se perder se a rede falhar.
    let saved = null;
    if (core) {
      try { saved = core.addLead(payload); } catch(e){ console.warn('Achilles: falha ao registrar lead', e); }
    }

    // 2) No site publicado, envia o lead para a Function segura que grava no
    //    Supabase por uma Function do próprio Achilles Command.
    if (core && !window.ACHILLES_CONFIG?.demoMode) {
      const res = await core.sendLeadToServer(payload);
      if (!res.ok) console.warn('Achilles: lead salvo localmente, mas o servidor não confirmou a gravação', res.error);
    }

    add('O próximo passo é um diagnóstico rápido com a Achilles. Vou preparar a continuidade no WhatsApp.');
    const phone=(window.ACHILLES_CONFIG?.brand?.whatsapp||'5541984991690').replace(/\D/g,'');
    const text=`Olá, sou ${data.name}, da ${data.company}. Conversei com o assistente da Achilles e quero falar sobre ${data.service}.`;
    const wrap=document.createElement('div');wrap.className='choices';
    const a=document.createElement('button');a.className='choice';a.textContent='Continuar no WhatsApp';a.onclick=()=>window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');wrap.appendChild(a);messages.appendChild(wrap);
    input.disabled=true;form.querySelector('button').disabled=true;
  }
  form.addEventListener('submit',e=>{e.preventDefault();const v=input.value;input.value='';submit(v)});
  setTimeout(ask,250);
})();
