
# SDR Reheat — Robson Menezes Advogados

Painel interno para reaquecer leads que esfriaram em etapas críticas do Kommo
(Contato Iniciado, No Show, Protocolo Farmer), sugerindo o vídeo certo para
cada etapa e disparando o WhatsApp com um clique.

## Arquitetura

- **Backend** (`server.js`): Node/Express hospedado no Render. Fala com a API
  do Kommo, decide quem é candidato a reaquecimento e aplica a tag de
  controle depois do envio.
- **Frontend** (`public/`): HTML/CSS/JS puro hospedado no Cloudflare Pages.
- **Sem banco de dados próprio**: o "estado" de quem já foi reaquecido vive
  como tag no próprio Kommo (`REAQUECIDO_V1` por padrão).

## O problema do link "seco" do Drive (e como foi resolvido)

Link do Google Drive colado direto no WhatsApp não gera prévia (thumbnail).
Vimeo não tem mais plano gratuito, e subir tudo pro YouTube não é viável
agora. A solução deste projeto: **cada vídeo tem sua própria página de
prévia**, servida pelo próprio backend em `/v/:key`.

Essa página:
1. Tem as tags Open Graph corretas (`og:image` apontando para a miniatura
   pública do Drive, `og:title`, etc.) — é isso que o WhatsApp lê para montar
   a prévia com thumbnail no chat.
2. Ao ser aberta, mostra o vídeo direto embedado (player do Drive), sem exigir
   login nem redirecionar para fora.

Ou seja: **o vídeo continua no Google Drive**, só que o link enviado no
WhatsApp não é mais o link cru do Drive — é `SEU_BACKEND/v/chave-do-video`.

### Pré-requisito no Drive
O arquivo precisa estar compartilhado como **"Qualquer pessoa com o link" →
Leitor**. Sem isso, nem a miniatura nem o player funcionam.

## Configurando os vídeos (`config/videos.json`)

```json
{
  "key": "ad1-protecao-caixa",       // identificador único, usado na URL /v/:key
  "etapa_alvo": "CONTATO INICIADO",  // precisa bater com o NOME da etapa no Kommo
  "titulo": "Autoridade: Proteção de Caixa",
  "driveFileId": "cole aqui o link completo do Drive ou só o ID",
  "mensagem": "Texto com [NOME] como placeholder do primeiro nome do lead"
}
```

Pode colar a URL inteira do Drive (`https://drive.google.com/file/d/ID/view?usp=sharing`)
em `driveFileId` — o backend extrai o ID sozinho.

`etapa_alvo` é comparado (sem diferenciar maiúsculas/acentos de espaço) com o
nome real da etapa que o sistema busca dinamicamente na API do Kommo
(`/leads/pipelines`), então não precisa descobrir e colar IDs de status na mão.

Uma etapa pode ter **vários vídeos** (basta repetir o mesmo `etapa_alvo` em
mais de uma entrada) — o sistema escolhe um de forma determinística por lead,
distribuindo entre eles.

### Limite de dias diferente por etapa
Por padrão todas as etapas usam `DIAS_MINIMOS_PARADO` (variável de ambiente).
Se alguma etapa precisar de um número diferente, adicione `"dias_minimos": N`
em qualquer vídeo daquela etapa:

```json
{
  "key": "...", "etapa_alvo": "EM QUALIFICACAO", "dias_minimos": 3, ...
}
```

## Buscar qualquer lead no Kommo

Abaixo da lista principal tem uma busca ("Buscar qualquer lead no Kommo") que
não usa o filtro de "pronto pra reaquecer" — ela chama a API do Kommo direto
(`GET /leads?query=...`) e devolve qualquer lead que bater com o nome ou
telefone digitado, **independente da etapa ou de quantos dias está parado**.
É por isso que o seu próprio número (ou um lead muito novo) não aparecia na
busca do topo antes: aquela busca só filtra dentro da lista já pré-filtrada
de candidatos a reaquecimento. Na busca nova dá pra escolher qualquer vídeo
configurado e mandar no WhatsApp na hora, pra qualquer lead encontrado.

## Links do WhatsApp abrindo o app instalado

Os links de envio agora usam `https://wa.me/<numero>?text=...` em vez de
`https://web.whatsapp.com/send?...`. O `web.whatsapp.com` força sempre a
versão web. O `wa.me` é o link universal do próprio WhatsApp: o sistema
tenta abrir o WhatsApp Desktop instalado primeiro, e só cai pra versão web
se não achar nenhum app instalado.

## Envio de teste (pra você mesmo, sem tocar no Kommo)

O painel tem uma seção "Envio de teste" (embaixo da lista de leads) onde dá
pra colocar um nome e um número qualquer (o seu, por exemplo), escolher um
dos vídeos configurados e mandar a mensagem no WhatsApp — sem aplicar tag
nem mexer em nada no Kommo.

## Envio automático

O painel confere sozinho a cada 3 minutos se apareceu lead novo pronto pra
reaquecer e avisa (toast na tela + notificação do navegador, se você clicar
em "Avisos" e permitir). O envio em si continua manual — você sempre revisa
e clica em "Enviar no WhatsApp" antes de qualquer mensagem sair. Isso evita
os riscos de automação total (bloqueio do número pela política do WhatsApp,
ou precisar de WhatsApp Business API oficial).

A notificação do navegador só chega enquanto a aba estiver aberta (pode
ficar minimizada, mas o computador precisa estar ligado com o navegador
rodando).

## Variáveis de ambiente


Veja `.env.example`. As mesmas variáveis devem ser configuradas no painel do
Render (Environment).

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha com os valores reais
npm start
```

## Deploy

- **Render**: nada muda no processo atual — só garanta que as variáveis de
  ambiente novas (`PUBLIC_BASE_URL`, `DIAS_MINIMOS_PARADO`, `TAG_CONTROLE`)
  estejam configuradas lá também.
- **Cloudflare Pages**: publique a pasta `public/` como antes. Se o domínio do
  Render mudar, atualize `API_URL` no topo de `public/app.js`.

## O que mudou nesta reestruturação

- Removido script duplicado dentro de `index.html` que brigava com `app.js` e
  chamava um endpoint (`/api/leads-reaquecer`) que não existe.
- Corrigido o bug em que **todo** lead recebia o vídeo de "Contato Iniciado",
  independente da etapa real (`server.js` não convertia `status_id` em nome
  de etapa antes de comparar).
- Adicionada paginação real na busca de leads (antes travava em 250).
- Telefone do lead agora é buscado de verdade nos contatos do Kommo — antes o
  campo simplesmente não existia na resposta.
- Mapeamento de etapas passou a ser buscado dinamicamente da API do Kommo, em
  vez de depender de IDs fixos copiados manualmente.
- Resolvido o problema da prévia do vídeo no WhatsApp (ver seção acima),
  sem depender de Vimeo pago ou upload no YouTube.
- Interface redesenhada: cards com hierarquia mais clara, filtro por etapa,
  busca por nome, contador de pendentes por etapa, estados de carregamento/
  vazio/erro tratados, feedback de toast ao marcar um lead como enviado.
