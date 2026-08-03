(() => {
  const script = document.currentScript;
  const chatUrl = script?.dataset.chatUrl || 'https://app.achillesmedia.com.br/chat.html';
  const accent = script?.dataset.accent || 'linear-gradient(165deg,#e3c877 0%,#c9a241 48%,#a8842f 100%)';

  const style = document.createElement('style');
  style.textContent = `
    #achilles-chat-button{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:58px;height:58px;border:0;border-radius:18px;background:${accent};color:#14100a;box-shadow:0 18px 46px rgba(201,162,65,.28),0 8px 24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.26);display:grid;place-items:center;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease}
    #achilles-chat-button:hover{transform:translateY(-2px);box-shadow:0 24px 56px rgba(201,162,65,.36),0 8px 24px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.32)}
    #achilles-chat-frame{position:fixed;right:22px;bottom:92px;z-index:2147482999;width:min(390px,calc(100vw - 28px));height:min(650px,calc(100vh - 120px));border:1px solid rgba(201,162,65,.18);border-radius:22px;background:#090807;box-shadow:0 30px 90px rgba(0,0,0,.5);overflow:hidden;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:.22s}
    #achilles-chat-frame.open{opacity:1;transform:none;pointer-events:auto}
    #achilles-chat-frame iframe{width:100%;height:100%;border:0}
    @media(max-width:520px){#achilles-chat-button{right:14px;bottom:14px}#achilles-chat-frame{right:7px;bottom:82px;width:calc(100vw - 14px);height:calc(100vh - 94px)}}`;
  document.head.appendChild(style);

  const frame = document.createElement('div');
  frame.id = 'achilles-chat-frame';
  frame.innerHTML = `<iframe src="${chatUrl}" title="Assistente Achilles" loading="lazy"></iframe>`;
  document.body.appendChild(frame);

  const button = document.createElement('button');
  button.id='achilles-chat-button';button.setAttribute('aria-label','Abrir atendimento');button.innerHTML='<svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  button.onclick=()=>frame.classList.toggle('open');document.body.appendChild(button);
})();
