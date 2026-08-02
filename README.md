# SDR Reheat — Robson Menezes Advogados

Painel interno para apoiar SDRs no reaquecimento de leads do Kommo através de mensagens personalizadas no WhatsApp, utilizando vídeos específicos para cada etapa do funil.

O sistema identifica automaticamente quais leads estão parados há tempo suficiente, sugere o vídeo correto e gera a mensagem pronta para envio no WhatsApp com apenas um clique.

---

# Índice

- Visão geral
- Principais funcionalidades
- Arquitetura
- Fluxo de funcionamento
- Pré-requisitos
- Instalação
- Configuração
- Variáveis de ambiente
- Configuração dos vídeos
- Página de prévia dos vídeos
- Plano do dia
- Busca livre de leads
- Envio de teste
- Contador de reaquecimentos
- Deploy
- Estrutura do projeto
- Funcionamento interno
- Limitações
- Roadmap

---

# Visão geral

O projeto foi desenvolvido para resolver alguns problemas comuns do processo de reaquecimento de leads:

- identificar automaticamente quem está parado há vários dias;
- sugerir o vídeo correto conforme a etapa do funil;
- impedir que o mesmo lead seja sugerido repetidamente;
- manter todo o controle dentro do próprio Kommo, sem banco de dados próprio;
- permitir envio totalmente manual pelo WhatsApp, evitando automações proibidas.

---

# Principais funcionalidades

- Busca automática de leads elegíveis para reaquecimento.
- Identificação dinâmica das etapas do pipeline.
- Distribuição automática entre vários vídeos da mesma etapa.
- Geração automática da mensagem personalizada.
- Placeholder `[NOME]`.
- Busca livre de qualquer lead do Kommo.
- Envio de teste para qualquer número.
- Página própria de prévia dos vídeos.
- Plano diário de envios.
- Contador opcional de reaquecimentos.
- Notificações quando surgirem novos leads.
- Interface totalmente web.

---

# Arquitetura

```
Cloudflare Pages
        │
        │
Frontend (HTML/CSS/JS)
        │
        ▼
Express (Render)
        │
        ├── API Kommo
        │
        └── Google Drive
```

Não existe banco de dados.

Todo o estado do sistema fica armazenado no próprio Kommo através de:

- tags;
- campos personalizados (opcionalmente).

---

# Fluxo de funcionamento

1. O backend consulta o Kommo.
2. Obtém os pipelines.
3. Descobre os nomes das etapas.
4. Busca todos os leads.
5. Calcula quantos dias estão parados.
6. Ignora quem já possui a tag de controle.
7. Seleciona o vídeo correspondente.
8. Exibe o card na interface.
9. O SDR revisa.
10. Clica em "Enviar no WhatsApp".
11. O WhatsApp abre com a mensagem pronta.
12. O backend aplica a tag de controle.
13. Opcionalmente incrementa o contador de reaquecimentos.

---

# Pré-requisitos

- Node.js 18+
- Conta Kommo
- Token da API do Kommo
- Vídeos armazenados no Google Drive
- Projeto hospedado no Render
- Frontend hospedado no Cloudflare Pages

---

# Instalação

```bash
npm install
```

Crie o arquivo:

```bash
cp .env.example .env
```

Configure as variáveis.

Execute:

```bash
npm start
```

---

# Variáveis de ambiente

## Obrigatórias

```env
KOMMO_SUBDOMAIN=

KOMMO_TOKEN=

PUBLIC_BASE_URL=

TAG_CONTROLE=REAQUECIDO_V1

DIAS_MINIMOS_PARADO=2

LIMITE_DIARIO_ENVIOS=25
```

## Opcionais

```env
KOMMO_CAMPO_CONTADOR_ID=

KOMMO_CAMPO_ULTIMA_DATA_ID=
```

### Descrição

### KOMMO_SUBDOMAIN

Subdomínio da conta Kommo.

---

### KOMMO_TOKEN

Token da API.

---

### PUBLIC_BASE_URL

URL pública do backend.

Exemplo:

```
https://meu-backend.onrender.com
```

---

### TAG_CONTROLE

Tag aplicada após o envio.

Padrão:

```
REAQUECIDO_V1
```

---

### DIAS_MINIMOS_PARADO

Quantidade mínima de dias parado para entrar na fila.

---

### LIMITE_DIARIO_ENVIOS

Quantidade sugerida de envios por dia.

Não bloqueia o envio.

Serve apenas como orientação visual.

---

### KOMMO_CAMPO_CONTADOR_ID

Campo numérico do Kommo.

Opcional.

---

### KOMMO_CAMPO_ULTIMA_DATA_ID

Campo de data do Kommo.

Opcional.

---

# Configuração dos vídeos

Arquivo:

```
config/videos.json
```

Cada vídeo possui:

```json
{
    "key":"protecao-caixa",

    "titulo":"Proteção de Caixa",

    "etapa_alvo":"CONTATO INICIADO",

    "driveFileId":"https://drive.google.com/file/d/...",

    "mensagem":"Olá [NOME]..."
}
```

Pode ser informado:

- apenas o ID do arquivo;
- ou o link completo do Google Drive.

O backend extrai automaticamente o ID.

---

## Dias mínimos por etapa

Também é possível definir um tempo específico:

```json
{
    "dias_minimos":4
}
```

Nesse caso a etapa ignora o valor global.

---

## Vários vídeos para a mesma etapa

É permitido possuir diversos vídeos para uma mesma etapa.

O sistema faz uma distribuição determinística entre eles.

---

# Página de prévia dos vídeos

Enviar diretamente um link do Google Drive normalmente não gera thumbnail no WhatsApp.

Para resolver isso, cada vídeo possui uma página própria:

```
/v/chave-do-video
```

Essa página contém:

- Open Graph
- thumbnail
- título
- descrição
- player incorporado

Assim o WhatsApp gera corretamente a prévia da conversa.

---

# Google Drive

Os vídeos precisam estar compartilhados como:

```
Qualquer pessoa com o link
Leitor
```

Caso contrário:

- o player não abre;
- a thumbnail não aparece.

---

# Busca livre de leads

Além da lista automática existe uma busca direta no Kommo.

Ela permite localizar qualquer lead:

- independente da etapa;
- independente dos dias parado;
- mesmo que não esteja elegível para reaquecimento.

Após enviar:

- aplica a tag;
- atualiza o contador;
- entra no plano do dia.

---

# Envio de teste

Existe uma área destinada apenas para testes.

Ela permite:

- informar qualquer nome;
- qualquer telefone;
- qualquer vídeo.

Nenhuma informação é enviada ao Kommo.

Nenhuma tag é aplicada.

Nenhum contador é atualizado.

Serve apenas para validar mensagens.

---

# Plano do dia

O painel possui um limite sugerido de envios.

Exemplo:

```
12 / 25
```

Esse valor é calculado diretamente no Kommo.

Não utiliza:

- Local Storage
- Cookies
- Banco de dados

O backend conta quantos leads receberam a tag de controle no dia atual.

Após atingir o limite:

- os próximos cards continuam aparecendo;
- ficam apenas destacados como sugestão para o próximo dia.

O envio continua permitido.

---

# Contador de reaquecimentos

Opcional.

Permite saber:

- quantas vezes um lead foi reaquecido;
- quando ocorreu o último envio.

Necessário criar dois campos personalizados no Kommo:

Campo Numérico

```
Qtd. de reaquecimentos
```

Campo Data

```
Último reaquecimento
```

Depois configurar seus IDs nas variáveis de ambiente.

Quando ativos, o sistema atualiza automaticamente esses campos.

---

# Notificações

A interface consulta novos leads periodicamente.

Quando surgem novos candidatos:

- toast na tela;
- notificação do navegador (caso autorizada).

Nenhuma mensagem é enviada automaticamente.

Todo envio continua sendo manual.

---

# WhatsApp

O projeto utiliza:

```
https://wa.me/
```

Isso permite abrir:

- WhatsApp Desktop;
- WhatsApp Mobile;
- WhatsApp Web.

Quando utiliza o navegador, a mesma aba é reutilizada para evitar conflitos entre múltiplas sessões.

---

# Estrutura do projeto

```
.
├── config/
│   └── videos.json
│
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/
│
├── server.js
├── package.json
└── README.md
```

---

# Deploy

## Backend

Hospedar no Render.

Configurar todas as variáveis de ambiente.

---

## Frontend

Publicar a pasta:

```
public/
```

no Cloudflare Pages.

Caso a URL do backend seja alterada, atualizar a constante da API no frontend.

---

# Funcionamento interno

O backend:

- consulta pipelines;
- obtém nomes das etapas;
- busca leads paginados;
- busca telefones dos contatos;
- identifica elegíveis;
- seleciona vídeos;
- monta mensagens;
- aplica tags;
- atualiza campos personalizados;
- calcula o plano do dia.

Todo o estado permanece armazenado exclusivamente no Kommo.

---

# Limitações

- O envio continua manual.
- Depende da disponibilidade da API do Kommo.
- Os vídeos precisam estar públicos no Google Drive.
- A contagem diária utiliza o `updated_at` do lead.
- Não existe histórico próprio além das informações armazenadas no Kommo.

---

# Roadmap

Possíveis melhorias futuras:

- filtros avançados;
- dashboard de métricas;
- relatórios por SDR;
- histórico completo de envios;
- suporte a múltiplos pipelines;
- múltiplas empresas;
- exportação de relatórios;
- agendamento de campanhas;
- integração com WhatsApp Business API.

---

# Licença

Projeto interno desenvolvido para uso da equipe do Robson Menezes Advogados.
