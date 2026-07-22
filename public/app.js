// ATENÇÃO: verifique se o link abaixo aponta para o seu backend no Render,
// sem barra "/" no final.
const API_URL = "https://dotr-fegoparaowhats.onrender.com";

let TODOS_OS_LEADS = [];
let ETAPA_ATIVA = "TODAS";
let TERMO_BUSCA = "";
let IDS_JA_VISTOS = null; // null = ainda não fez a primeira carga
const INTERVALO_VERIFICACAO_MS = 3 * 60 * 1000; // confere novos leads a cada 3 min

// ---------------------------------------------------------------------------
// Plano do dia — teto de envios manuais por dia, pra reduzir o risco de o
// WhatsApp marcar o número como spam se a equipe disparar tudo de uma vez.
// Não bloqueia o envio (continua manual), só reordena visualmente o que é
// prioridade hoje vs. o que pode esperar amanhã, e mostra quantos já foram
// mandados. O número vem do backend (contagem real de tags aplicadas no
// Kommo hoje) — é o mesmo pra qualquer pessoa da equipe, em qualquer
// computador, porque não depende de nada guardado no navegador.
// ---------------------------------------------------------------------------
let PLANO_DIA = { enviados_hoje: 0, limite: 25 };

async function atualizarPlanoDia() {
  try {
    const resp = await fetch(`${API_URL}/api/plano-do-dia`);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    PLANO_DIA = await resp.json();
  } catch (e) {
    console.warn("Não consegui atualizar o plano do dia:", e);
  }
}

// Incremento otimista pra dar feedback instantâneo no clique — o número real
// é reconciliado no próximo carregamento (poll de 3 min ou "Atualizar").
function marcarEnvioOtimista() {
  PLANO_DIA = { ...PLANO_DIA, enviados_hoje: PLANO_DIA.enviados_hoje + 1 };
}

// Dá pra cada lead (na ordem em que já chegam do backend, mais parado primeiro)
// um status "hoje" ou "amanha" com base no que já foi enviado hoje.
function calcularStatusPlanoDia() {
  const restante = Math.max(0, PLANO_DIA.limite - PLANO_DIA.enviados_hoje);
  const mapa = new Map();
  TODOS_OS_LEADS.forEach((lead, idx) => {
    mapa.set(String(lead.id), idx < restante ? "hoje" : "amanha");
  });
  return mapa;
}

// Termômetro do caso: quanto mais dias parado, mais "frio" (mais segmentos
// preenchidos, cor migra de âmbar pra cinza-azulado).
function calcularTermometro(dias) {
  if (dias <= 3) return { nivel: 1, cor: "var(--temp-quente)" };
  if (dias <= 7) return { nivel: 2, cor: "var(--temp-quente)" };
  if (dias <= 14) return { nivel: 3, cor: "var(--temp-morno)" };
  if (dias <= 30) return { nivel: 4, cor: "var(--temp-frio)" };
  return { nivel: 5, cor: "var(--temp-gelado)" };
}

function termometroHtml(dias) {
  const { nivel, cor } = calcularTermometro(dias);
  const segmentos = Array.from({ length: 5 }, (_, i) => `<span class="${i < nivel ? "on" : ""}"></span>`).join("");
  return `<span class="termometro" style="--seg-cor:${cor}" title="${dias} dia${dias === 1 ? "" : "s"} parado">${segmentos}</span>`;
}

const el = {
  lista: () => document.getElementById("listaLeads"),
  stats: () => document.getElementById("stats"),
  tabs: () => document.getElementById("tabsEtapas"),
  busca: () => document.getElementById("busca"),
  btnAtualizar: () => document.getElementById("btnAtualizar"),
  btnAvisos: () => document.getElementById("btnAvisos"),
  toast: () => document.getElementById("toast"),
};

function mostrarToast(mensagem, tipo = "ok") {
  const t = el.toast();
  t.textContent = mensagem;
  t.className = `toast show ${tipo}`;
  setTimeout(() => (t.className = "toast"), 2600);
}

async function carregarLeadsParaReaquecer({ manterFiltro = true, silencioso = false } = {}) {
  const btn = el.btnAtualizar();
  if (!silencioso) {
    btn?.classList.add("spinning");
    el.lista().innerHTML = `
      <div class="skeleton-grid">
        <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
      </div>`;
  }

  try {
    const [response] = await Promise.all([
      fetch(`${API_URL}/api/leads-para-reaquecer`),
      atualizarPlanoDia(),
    ]);
    if (!response.ok) throw new Error(`Erro no servidor: ${response.status}`);

    TODOS_OS_LEADS = await response.json();
    if (!manterFiltro) {
      ETAPA_ATIVA = "TODAS";
      TERMO_BUSCA = "";
    }

    avisarSeTiverLeadNovo(TODOS_OS_LEADS);
    renderizarStats();
    renderizarTabs();
    renderizarLista();
  } catch (error) {
    console.error("Erro detalhado:", error);
    if (silencioso) return; // não estraga o que já está na tela por causa de um poll em segundo plano
    el.stats().innerHTML = "";
    el.tabs().innerHTML = "";
    el.lista().innerHTML = `
      <div class="estado-erro">
        <span class="emoji">⚠️</span>
        <p><strong>Não consegui falar com o servidor.</strong></p>
        <p style="font-size:0.8rem">Confira se o backend no Render está ativo.</p>
        <div class="detalhe">${escapeHtml(error.message)}</div>
      </div>`;
  } finally {
    btn?.classList.remove("spinning");
  }
}

function renderizarStats() {
  const total = TODOS_OS_LEADS.length;
  const porEtapa = agruparPorEtapa(TODOS_OS_LEADS);
  const etapasOrdenadas = [...porEtapa.entries()].sort((a, b) => b[1] - a[1]);
  const { enviados_hoje: enviadosHoje, limite } = PLANO_DIA;
  const noLimite = enviadosHoje >= limite;
  const pctBarra = Math.min(100, Math.round((enviadosHoje / limite) * 100));

  const cards = [
    `<div class="stat destaque"><div class="valor">${total}</div><div class="rotulo">Pendentes de reaquecer</div></div>`,
    `<div class="stat plano-dia ${noLimite ? "no-limite" : ""}" title="Teto sugerido pra reduzir risco de bloqueio no WhatsApp — contado a partir das tags aplicadas no Kommo hoje, vale pra equipe toda">
      <div class="valor">${enviadosHoje}/${limite}</div>
      <div class="rotulo">Enviados hoje (equipe)</div>
      <div class="barra"><div class="barra-fill" style="width:${pctBarra}%"></div></div>
    </div>`,
    ...etapasOrdenadas.slice(0, 2).map(
      ([etapa, qtd]) => `<div class="stat"><div class="valor">${qtd}</div><div class="rotulo">${escapeHtml(etapa)}</div></div>`
    ),
  ];

  el.stats().innerHTML = cards.join("");
}

function agruparPorEtapa(leads) {
  const mapa = new Map();
  for (const l of leads) {
    const etapa = l.etapa || "Sem etapa";
    mapa.set(etapa, (mapa.get(etapa) || 0) + 1);
  }
  return mapa;
}

function renderizarTabs() {
  const etapas = [...agruparPorEtapa(TODOS_OS_LEADS).keys()];
  const todas = [["TODAS", TODOS_OS_LEADS.length], ...etapas.map(e => [e, null])];

  el.tabs().innerHTML = todas
    .map(([etapa]) => `
      <button class="tab ${ETAPA_ATIVA === etapa ? "ativa" : ""}" data-etapa="${escapeHtml(etapa)}" role="tab" aria-selected="${ETAPA_ATIVA === etapa}">
        ${etapa === "TODAS" ? "Todas" : escapeHtml(etapa)}
      </button>`)
    .join("");

  el.tabs().querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      ETAPA_ATIVA = btn.dataset.etapa;
      renderizarTabs();
      renderizarLista();
    });
  });
}

function leadsFiltrados() {
  return TODOS_OS_LEADS.filter(l => {
    const passaEtapa = ETAPA_ATIVA === "TODAS" || l.etapa === ETAPA_ATIVA;
    const passaBusca = !TERMO_BUSCA || (l.name || "").toLowerCase().includes(TERMO_BUSCA.toLowerCase());
    return passaEtapa && passaBusca;
  });
}

function renderizarLista() {
  const leads = leadsFiltrados();
  const container = el.lista();

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="estado-vazio">
        <span class="emoji">✅</span>
        <p><strong>Nenhum lead pendente por aqui.</strong></p>
        <p style="font-size:0.8rem">Tudo reaquecido — foco no que é novo.</p>
      </div>`;
    return;
  }

  const mapaPlano = calcularStatusPlanoDia();
  let divisorInserido = false;
  const partes = [];
  leads.forEach(lead => {
    const status = mapaPlano.get(String(lead.id)) || "hoje";
    if (status === "amanha" && !divisorInserido) {
      partes.push(`<div class="divisor-plano">sugestão pra amanhã</div>`);
      divisorInserido = true;
    }
    partes.push(leadParaHtml(lead, status));
  });
  container.innerHTML = partes.join("");

  container.querySelectorAll("[data-enviar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const { id, nome, telefone } = btn.dataset;
      const video = JSON.parse(decodeURIComponent(btn.dataset.video));
      enviarWhatsApp(id, nome, telefone, video, btn);
    });
  });
}

function leadParaHtml(lead, statusPlano = "hoje") {
  const video = lead.video_sugerido || { titulo: "Vídeo institucional", link: "#", copy: "Olá!" };
  const temTelefone = Boolean(lead.telefone);
  const videoData = encodeURIComponent(JSON.stringify(video));

  return `
    <div class="lead-card ${statusPlano === "amanha" ? "amanha" : ""}">
      <div class="lead-info">
        <span class="badge-etapa">${escapeHtml(lead.etapa || "—")}</span>
        <span class="lead-nome">${escapeHtml(lead.name)}</span>
        <span class="lead-meta">
          ${termometroHtml(lead.dias_parado)}
          Parado há ${lead.dias_parado} dia${lead.dias_parado === 1 ? "" : "s"}${temTelefone ? "" : " · sem telefone no Kommo"}
        </span>
      </div>
      <div class="lead-acao">
        <div class="sugestao">
          <div class="rotulo">Sugestão</div>
          <div class="titulo">${escapeHtml(video.titulo)}</div>
        </div>
        <button
          class="btn-enviar ${temTelefone ? "" : "sem-telefone"}"
          data-enviar
          data-id="${lead.id}"
          data-nome="${escapeHtml(lead.name)}"
          data-telefone="${escapeHtml(lead.telefone || "")}"
          data-video="${videoData}"
        >
          ${iconeWhats()} ${temTelefone ? "Enviar no WhatsApp" : "Marcar como enviado"}
        </button>
      </div>
    </div>`;
}

function iconeWhats() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.11h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.2 8.2 0 0 1-1.26-4.34c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.55-3.7 8.2-8.25 8.2z"/></svg>`;
}

async function enviarWhatsApp(leadId, nome, telefone, videoConfig, btn) {
  const primeiroNome = (nome || "").split(" ")[0];
  const mensagemFinal = `${videoConfig.copy.replace("[NOME]", primeiroNome)}\n\n${videoConfig.link}`;
  const telLimpo = telefone ? telefone.replace(/\D/g, "") : "";
  abrirWhatsApp(telLimpo, mensagemFinal);

  btn.disabled = true;
  btn.textContent = "Marcando…";

  try {
    const resp = await fetch(`${API_URL}/api/marcar-enviado/${leadId}`, { method: "POST" });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    marcarEnvioOtimista();
    mostrarToast(`${nome.split(" ")[0]} marcado como reaquecido`, "ok");
    TODOS_OS_LEADS = TODOS_OS_LEADS.filter(l => String(l.id) !== String(leadId));
    renderizarStats();
    renderizarTabs();
    renderizarLista();
  } catch (e) {
    console.error("Erro ao marcar como enviado:", e);
    mostrarToast("Não consegui atualizar o Kommo — tente de novo", "erro");
    btn.disabled = false;
    btn.innerHTML = `${iconeWhats()} Enviar no WhatsApp`;
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// web.whatsapp.com sempre força a versão web, mesmo com o WhatsApp Desktop
// instalado. O link wa.me é o link universal do próprio WhatsApp: o sistema
// operacional/navegador tenta abrir o app instalado (desktop) primeiro e só
// cai pro WhatsApp Web se não achar nenhum app.
// Sempre usa a MESMA aba nomeada em vez de "_blank" (que abre uma aba nova a
// cada clique). O wa.me já tenta abrir o WhatsApp Desktop instalado primeiro;
// isso aqui só evita que, quando cai no fallback web, cada envio gere uma
// nova aba do WhatsApp Web brigando com a anterior (é esse conflito de duas
// sessões que fazia a mensagem não continuar). Só a primeira mensagem depois
// desta atualização abre uma aba nova — as próximas reaproveitam essa mesma.
const NOME_ABA_WHATSAPP = "sdrReheatWhatsApp";

function abrirWhatsApp(telefoneLimpo, mensagem) {
  const url = `https://wa.me/${telefoneLimpo}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, NOME_ABA_WHATSAPP);
}

el.busca()?.addEventListener("input", e => {
  TERMO_BUSCA = e.target.value;
  renderizarLista();
});

el.btnAtualizar()?.addEventListener("click", () => carregarLeadsParaReaquecer());

// ---------------------------------------------------------------------------
// Avisos: compara os leads recebidos com os da última checagem e, se
// aparecer gente nova (ex: alguém que acabou de completar +2 dias parado),
// avisa por notificação do navegador (se permitido) e por toast.
// Não envia nada sozinho — só avisa. O clique em "Enviar" continua manual.
// ---------------------------------------------------------------------------
function avisarSeTiverLeadNovo(leadsAtuais) {
  const idsAtuais = new Set(leadsAtuais.map(l => String(l.id)));

  if (IDS_JA_VISTOS !== null) {
    const novos = [...idsAtuais].filter(id => !IDS_JA_VISTOS.has(id));
    if (novos.length > 0) {
      const texto = novos.length === 1
        ? "1 lead novo pronto pra reaquecer"
        : `${novos.length} leads novos prontos pra reaquecer`;
      mostrarToast(texto, "ok");
      if (window.Notification && Notification.permission === "granted") {
        new Notification("SDR Reheat", { body: texto });
      }
    }
  }

  IDS_JA_VISTOS = idsAtuais;
}

function atualizarBotaoAvisos() {
  const btn = el.btnAvisos();
  if (!btn || !window.Notification) return;
  const ativo = Notification.permission === "granted";
  btn.classList.toggle("ativo", ativo);
  btn.title = ativo ? "Avisos ativados" : "Ativar avisos de novos leads";
}

el.btnAvisos()?.addEventListener("click", async () => {
  if (!window.Notification) {
    mostrarToast("Seu navegador não aceita esse tipo de aviso", "erro");
    return;
  }
  if (Notification.permission === "granted") {
    mostrarToast("Avisos já estão ativados");
    return;
  }
  const resultado = await Notification.requestPermission();
  atualizarBotaoAvisos();
  mostrarToast(resultado === "granted" ? "Avisos ativados" : "Permissão não concedida", resultado === "granted" ? "ok" : "erro");
});

// Confere silenciosamente em segundo plano — mantém o filtro/busca atuais
// e não recria o skeleton de carregamento.
setInterval(() => carregarLeadsParaReaquecer({ silencioso: true }), INTERVALO_VERIFICACAO_MS);

document.addEventListener("DOMContentLoaded", () => {
  atualizarBotaoAvisos();
  carregarLeadsParaReaquecer();
});

// ---------------------------------------------------------------------------
// Painel de envio de teste — manda pra um número qualquer (ex: o seu),
// sem tocar em nada no Kommo.
// ---------------------------------------------------------------------------
async function carregarVideosParaTeste() {
  const select = document.getElementById("testeVideo");
  if (!select) return;
  try {
    const resp = await fetch(`${API_URL}/api/videos-config`);
    const videos = await resp.json();
    select.innerHTML = videos
      .map(v => `<option value='${encodeURIComponent(JSON.stringify(v))}'>${escapeHtml(v.etapa_alvo)} — ${escapeHtml(v.titulo)}</option>`)
      .join("");
  } catch (e) {
    select.innerHTML = `<option>Não consegui carregar os vídeos</option>`;
  }
}

document.querySelectorAll(".ferramenta-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ferramenta-tab").forEach(t => t.classList.remove("ativa"));
    tab.classList.add("ativa");

    const alvo = tab.dataset.ferramenta; // "busca" ou "teste"
    document.getElementById("painelBusca").hidden = alvo !== "busca";
    document.getElementById("painelTeste").hidden = alvo !== "teste";

    if (alvo === "teste") carregarVideosParaTeste();
  });
});

document.getElementById("btnEnviarTeste")?.addEventListener("click", () => {
  const nome = document.getElementById("testeNome").value.trim() || "Teste";
  const telefone = document.getElementById("testeTelefone").value.replace(/\D/g, "");
  const select = document.getElementById("testeVideo");
  const video = select?.value ? JSON.parse(decodeURIComponent(select.value)) : null;

  if (!telefone) {
    mostrarToast("Informe um número pra enviar o teste", "erro");
    return;
  }
  if (!video) {
    mostrarToast("Nenhum vídeo disponível pra testar", "erro");
    return;
  }

  const mensagem = `${video.mensagem.replace("[NOME]", nome.split(" ")[0])}\n\n${video.link}`;
  abrirWhatsApp(telefone, mensagem);
  mostrarToast("Teste aberto no WhatsApp — nada foi alterado no Kommo", "ok");
});

// ---------------------------------------------------------------------------
// Busca livre de lead no Kommo — encontra QUALQUER lead (o seu número
// incluso), mesmo que não esteja "parado" o suficiente pra entrar na lista
// de reaquecimento. Não usa o filtro de dias/etapa — é uma busca direta na
// API do Kommo por nome ou telefone.
// ---------------------------------------------------------------------------
async function buscarLeadGlobal(termo) {
  const container = document.getElementById("resultadoBuscaLead");
  if (!container) return;

  if (!termo) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `<p class="busca-status">Procurando no Kommo…</p>`;

  try {
    const resp = await fetch(`${API_URL}/api/buscar-lead?q=${encodeURIComponent(termo)}`);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const resultados = await resp.json();

    if (resultados.length === 0) {
      container.innerHTML = `<p class="busca-status">Nenhum lead encontrado com "${escapeHtml(termo)}".</p>`;
      return;
    }

    container.innerHTML = resultados.map(leadBuscaParaHtml).join("");

    container.querySelectorAll("[data-enviar-busca]").forEach(btn => {
      btn.addEventListener("click", () => enviarVideoParaLeadEncontrado(btn));
    });
  } catch (e) {
    console.error("Erro ao buscar lead:", e);
    container.innerHTML = `<p class="busca-status erro">Não consegui buscar agora — tente de novo.</p>`;
  }
}

function leadBuscaParaHtml(lead) {
  const temTelefone = Boolean(lead.telefone);
  return `
    <div class="lead-card lead-card-busca" data-lead-busca-id="${lead.id}">
      <div class="lead-info">
        <span class="badge-etapa">${escapeHtml(lead.etapa || "Sem etapa")}</span>
        <span class="lead-nome">${escapeHtml(lead.name)}</span>
        <span class="lead-meta">${temTelefone ? escapeHtml(lead.telefone) : "Sem telefone no Kommo"}${lead.ja_reaquecido ? " · já tem tag de reaquecido" : ""}</span>
      </div>
      <div class="lead-acao lead-acao-busca">
        <select class="select-video-busca" data-lead-id="${lead.id}" data-telefone="${escapeHtml(lead.telefone || "")}" data-nome="${escapeHtml(lead.name)}">
          <option value="">Carregando vídeos…</option>
        </select>
        <button class="btn-enviar ${temTelefone ? "" : "sem-telefone"}" data-enviar-busca data-lead-id="${lead.id}" ${temTelefone ? "" : "disabled"}>
          ${iconeWhats()} Enviar
        </button>
      </div>
    </div>`;
}

let VIDEOS_CONFIG_CACHE = null;
async function getVideosConfigCache() {
  if (VIDEOS_CONFIG_CACHE) return VIDEOS_CONFIG_CACHE;
  const resp = await fetch(`${API_URL}/api/videos-config`);
  VIDEOS_CONFIG_CACHE = await resp.json();
  return VIDEOS_CONFIG_CACHE;
}

async function preencherSelectsDeVideoDaBusca() {
  const videos = await getVideosConfigCache();
  document.querySelectorAll(".select-video-busca").forEach(select => {
    select.innerHTML = videos
      .map(v => `<option value='${encodeURIComponent(JSON.stringify(v))}'>${escapeHtml(v.etapa_alvo)} — ${escapeHtml(v.titulo)}</option>`)
      .join("");
  });
}

async function enviarVideoParaLeadEncontrado(btn) {
  const leadId = btn.dataset.leadId;
  const card = btn.closest(".lead-card-busca");
  const select = card.querySelector(".select-video-busca");
  const video = select?.value ? JSON.parse(decodeURIComponent(select.value)) : null;
  const telefone = select?.dataset.telefone || "";
  const nome = select?.dataset.nome || "";

  if (!video) {
    mostrarToast("Escolha um vídeo pra enviar", "erro");
    return;
  }
  if (!telefone) {
    mostrarToast("Esse lead não tem telefone no Kommo", "erro");
    return;
  }

  const primeiroNome = (nome || "").split(" ")[0];
  const mensagem = `${video.mensagem.replace("[NOME]", primeiroNome)}\n\n${video.link}`;
  abrirWhatsApp(telefone.replace(/\D/g, ""), mensagem);

  btn.disabled = true;
  btn.textContent = "Marcando…";

  try {
    const resp = await fetch(`${API_URL}/api/marcar-enviado/${leadId}`, { method: "POST" });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    marcarEnvioOtimista();
    renderizarStats();
    mostrarToast(`WhatsApp aberto para ${primeiroNome} — marcado como reaquecido no Kommo`, "ok");
  } catch (e) {
    console.error("Erro ao marcar como enviado (busca livre):", e);
    mostrarToast("Mensagem aberta, mas não consegui marcar no Kommo — tente de novo", "erro");
    btn.disabled = false;
    btn.innerHTML = `${iconeWhats()} Enviar`;
  }
}

const inputBuscaLead = document.getElementById("buscaLeadGlobal");
let timeoutBuscaLead = null;
inputBuscaLead?.addEventListener("input", e => {
  clearTimeout(timeoutBuscaLead);
  const termo = e.target.value.trim();
  timeoutBuscaLead = setTimeout(async () => {
    await buscarLeadGlobal(termo);
    if (termo) await preencherSelectsDeVideoDaBusca();
  }, 450);
});
