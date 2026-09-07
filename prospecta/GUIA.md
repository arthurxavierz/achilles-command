# Achilles Prospecta — extensão do Chrome

Fila de abordagem do Achilles Command dentro do WhatsApp Web.

Ela puxa a lista que está na sua aba de **Captação**, abre a conversa de cada lead, preenche a mensagem e — no modo automático — envia sozinha, marca o lead como abordado, joga no CRM e devolve o foco para o Command no fim. Você monta a lista uma vez e acompanha.

## Os dois modos

```
REVISAR UMA A UMA                        DISPARO AUTOMÁTICO
abre a conversa                          abre a conversa
preenche a mensagem                      preenche a mensagem
espera VOCÊ apertar Enter                mostra a mensagem por alguns segundos
detecta o envio e avança                 envia sozinha se você não cancelar
                                         confirma que saiu e avança
```

Os dois respeitam o teto diário, a janela de horário e a pausa entre leads; os dois marcam *Abordado* no Command e adicionam ao CRM. O que muda é quem aperta o Enter.

O modo automático **nunca liga sozinho**: ou você clica em "⚡ Disparo automático" na barra da Captação, ou marca *Enviar automaticamente* nas configurações da extensão.

### Antes de usar o automático

Disparar mensagem não solicitada em série é o tipo de padrão que o WhatsApp detecta e pune com bloqueio do número — a pausa entre leads reduz o risco, não o elimina. Vale usar em número de trabalho, com teto baixo nos primeiros dias, mensagem que faz sentido para quem recebe, e olhando a tela. A janela de cancelamento existe justamente para você poder segurar uma mensagem que saiu errada.

## Instalar

```
1. Chrome -> chrome://extensions
2. ligue "Modo do desenvolvedor" (canto superior direito)
3. "Carregar sem compactação"
4. selecione a pasta:  achilles-command/prospecta
```

A extensão aparece na barra. Fixe no pino para acessar as configurações.

O `manifest.json` já cobre `app.achillesmedia.com.br`, `*.netlify.app` e `localhost`. Se o Command mudar de endereço, acrescente o novo domínio em **dois** lugares: em `content_scripts.matches` no `manifest.json` e na lista `COMMAND_URLS` do `background.js`. Depois recarregue a extensão em `chrome://extensions`.

### Migração no Supabase

Execute uma vez, para o "abordado" acompanhar você entre dispositivos:

```
supabase/migration_2026_08_04_contato.sql
```

Sem ela nada quebra — a marcação fica só no navegador.

## Usar

**1. Monte a lista no Command.** Abra Captação, busque, aplique os filtros. Uma barra aparece no canto inferior direito com quantos leads estão prontos — ela conta só quem tem celular e ainda não foi abordado.

**2. Escolha o modo:**

```
[Revisar uma a uma]     o WhatsApp abre e espera você clicar em Iniciar por lá
[⚡ Disparo automático]  o WhatsApp abre e a fila já começa a andar
```

**3. Acompanhe.** A barra da Captação passa a mostrar `3/12 enviados` enquanto a fila roda, com um botão **Pausar fila** que funciona daqui mesmo. Na aba do WhatsApp, a gaveta lateral mostra o lead atual e a contagem antes de cada envio:

```
[Pular este]   passa sem enviar
[Pausar]       para e guarda o progresso
[Parar]        descarta a fila
```

**4. Volta para o app.** Ao terminar a fila (ou pausar por teto, horário ou erro), a extensão traz a aba do Command para a frente com os leads já etiquetados como *Abordado* e criados no CRM. Se o Command estiver fechado, ela guarda e aplica quando você abrir.

## Quando a fila para sozinha

O automático prefere parar a errar em série:

```
número inválido 2x seguidas          pausa para você conferir a base
envio não confirmado em 20s          marca falha; 2 seguidas pausam a fila
a caixa não tem o texto preparado    pausa sem enviar (alguém digitou junto)
não consegui escrever na caixa       pausa e pede a aba visível
teto diário / fora do horário        pausa e guarda a fila para depois
```

Em todos esses casos o progresso fica salvo: é só retomar pela gaveta do WhatsApp Web.

## Configurações

Clique no ícone da extensão:

| Ajuste | Padrão | Para quê |
|---|---|---|
| Enviar automaticamente | desligado | a extensão aperta o Enter por você |
| Janela para cancelar | 4s | tempo com a mensagem na tela antes de sair |
| Voltar para o Command | ligado | traz o app para a frente ao terminar |
| Pausa entre leads | 20s | ritmo entre uma conversa e outra |
| Teto por dia | 30 | trava a fila ao atingir o limite |
| Horário comercial | 8h–19h | não abre conversa fora da janela |

Se a sua lista tem mais leads do que o teto, a fila para no limite e continua salva para o dia seguinte — suba o teto conscientemente, não por padrão.

## Quando algo parar de funcionar

O WhatsApp Web muda de layout de tempos em tempos. Todos os seletores estão num único lugar, no topo do `content-whatsapp.js`:

```javascript
const SEL = {
  msgInput: '...',   // caixa de digitação
  sendBtn:  '...',   // botão de enviar (usado no modo automático)
  outgoing: '...',   // bolhas de saída (usado para confirmar o envio)
  thread:   '...',   // container da conversa
  dialog:   '...'    // diálogo de número inválido
};
```

Sintomas e causas mais comuns:

```
"Não achei a caixa de mensagem"   -> msgInput desatualizado, ou WhatsApp desconectado
"Não consegui escrever na caixa"  -> aba em segundo plano; deixe-a visível
não avança depois de enviar       -> outgoing desatualizado
nada sai no automático            -> sendBtn desatualizado (cai no Enter sintético)
pula todo mundo como inválido     -> dialog pegando o diálogo errado
a fila não aparece no Command     -> domínio fora do matches do manifest
a aba do Command trava            -> content-command.js pintando dentro do
                                     próprio MutationObserver (watchCommand)
```

## Arquivos

```
manifest.json           permissões e onde cada script roda
background.js           guarda a fila, abre o WhatsApp, devolve o foco e o resultado
lib/shared.js           telefone, saudação, horário, armazenamento, ajustes
content-command.js      lê a ponte da Captação, monta a fila e mostra o andamento
content-whatsapp.js     a gaveta, o laço da fila e o envio
panel.html/js/css       configurações e status
```

Do lado do Command, a ponte é a função `prospectBridge()` em `app.js`, que publica a lista visível como JSON dentro da página, e `bindExtensionBridge()`, que escuta os eventos de volta. A extensão nunca altera o estado do sistema direto — ela avisa, e o Command decide.
