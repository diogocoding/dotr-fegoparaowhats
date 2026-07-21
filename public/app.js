// ATENÇÃO: verifique se o link abaixo aponta para o seu backend no Render,
// sem barra "/" no final.
const API_URL = "https://dotr-fegoparaowhats.onrender.com";

let TODOS_OS_LEADS = [];
let ETAPA_ATIVA = "TODAS";
let TERMO_BUSCA = "";

const el = {
  lista: () => document.getElementById("listaLeads"),
  stats: () => document.getElementById("stats"),
  tabs: () => document.getElementById("tabsEtapas"),
  busca: () => document.getElementById("busca"),
  btnAtualizar: () => document.getElementById("btnAtualizar"),
  toast: () => document.getElementById("toast"),
};

function mostrarToast(mensagem, tipo = "ok") {
  const t = el.toast();
  t.textContent = mensagem;
  t.className = `toast show ${tipo}`;
  setTimeout(() => (t.className = "toast"), 2600);
}

async function carregarLeadsParaReaquecer({ manterFiltro = true } = {}) {
  const btn = el.btnAtualizar();
  btn?.classList.add("spinning");
  el.lista().innerHTML = `
    <div class="skeleton-grid">
      <div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>
    </div>`;

  try {
    const response = await fetch(`${API_URL}/api/leads-para-reaquecer`);
    if (!response.ok) throw new Error(`Erro no servidor: ${response.status}`);

    TODOS_OS_LEADS = await response.json();
    if (!manterFiltro) {
      ETAPA_ATIVA = "TODAS";
      TERMO_BUSCA = "";
    }

    renderizarStats();
    renderizarTabs();
    renderizarLista();
  } catch (error) {
    console.error("Erro detalhado:", error);
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

  const cards = [
    `<div class="stat destaque"><div class="valor">${total}</div><div class="rotulo">Pendentes de reaquecer</div></div>`,
    ...etapasOrdenadas.slice(0, 3).map(
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

  container.innerHTML = leads.map(leadParaHtml).join("");

  container.querySelectorAll("[data-enviar]").forEach(btn => {
    btn.addEventListener("click", () => {
      const { id, nome, telefone } = btn.dataset;
      const video = JSON.parse(decodeURIComponent(btn.dataset.video));
      enviarWhatsApp(id, nome, telefone, video, btn);
    });
  });
}

function leadParaHtml(lead) {
  const video = lead.video_sugerido || { titulo: "Vídeo institucional", link: "#", copy: "Olá!" };
  const temTelefone = Boolean(lead.telefone);
  const videoData = encodeURIComponent(JSON.stringify(video));

  return `
    <div class="lead-card">
      <div class="lead-info">
        <span class="badge-etapa">${escapeHtml(lead.etapa || "—")}</span>
        <span class="lead-nome">${escapeHtml(lead.name)}</span>
        <span class="lead-meta">Parado há ${lead.dias_parado} dia${lead.dias_parado === 1 ? "" : "s"}${temTelefone ? "" : " · sem telefone no Kommo"}</span>
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
  const urlWhats = `https://web.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(mensagemFinal)}`;

  window.open(urlWhats, "_blank");

  btn.disabled = true;
  btn.textContent = "Marcando…";

  try {
    const resp = await fetch(`${API_URL}/api/marcar-enviado/${leadId}`, { method: "POST" });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
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

el.busca()?.addEventListener("input", e => {
  TERMO_BUSCA = e.target.value;
  renderizarLista();
});

el.btnAtualizar()?.addEventListener("click", () => carregarLeadsParaReaquecer());

document.addEventListener("DOMContentLoaded", () => carregarLeadsParaReaquecer());
