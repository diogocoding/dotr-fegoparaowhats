import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const KOMMO_URL = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
const HEADERS = { Authorization: `Bearer ${process.env.KOMMO_TOKEN}` };
const TAG_CONTROLE = process.env.TAG_CONTROLE || "REAQUECIDO_V1";
// URL pública deste próprio backend (usada para montar os links de prévia /v/:key
// que são enviados no WhatsApp no lugar do link seco do Drive).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://dotr-fegoparaowhats.onrender.com").replace(/\/$/, "");
const DIAS_MINIMOS_PARADO = Number(process.env.DIAS_MINIMOS_PARADO || 2);

// ---------------------------------------------------------------------------
// Config de vídeos (config/videos.json)
// ---------------------------------------------------------------------------
function carregarVideosConfig() {
    const raw = fs.readFileSync(path.join(__dirname, "config/videos.json"), "utf-8");
    const lista = JSON.parse(raw);
    return lista.map(v => ({ ...v, driveFileId: extrairDriveId(v.driveFileId || v.link || "") }));
}

// Aceita tanto um ID puro quanto uma URL completa do Google Drive
// (https://drive.google.com/file/d/ID/view?usp=sharing) e devolve só o ID.
function extrairDriveId(valor) {
    if (!valor) return null;
    const match = valor.match(/[-\w]{25,}/); // IDs do Drive têm 25+ caracteres
    return match ? match[0] : valor;
}

// ---------------------------------------------------------------------------
// Mapa de etapas do Kommo (nome <-> id), buscado dinamicamente para não
// depender de IDs fixos hardcoded no código (eles mudam por conta/funil).
// ---------------------------------------------------------------------------
let etapasCache = { map: null, expira: 0 };

async function getMapaEtapas() {
    if (etapasCache.map && Date.now() < etapasCache.expira) return etapasCache.map;

    const resp = await axios.get(`${KOMMO_URL}/leads/pipelines`, { headers: HEADERS });
    const pipelines = resp.data?._embedded?.pipelines || [];
    const map = new Map(); // status_id (string) -> nome da etapa (normalizado)

    for (const pipeline of pipelines) {
        const statuses = pipeline._embedded?.statuses || [];
        for (const s of statuses) {
            map.set(String(s.id), s.name);
        }
    }

    etapasCache = { map, expira: Date.now() + 10 * 60 * 1000 }; // cache de 10 min
    return map;
}

function normalizar(texto) {
    return String(texto || "").trim().toUpperCase();
}

// Agrupa os vídeos configurados por etapa (uma etapa pode ter vários vídeos).
function agruparVideosPorEtapa(videosConfig) {
    const mapa = new Map();
    for (const v of videosConfig) {
        const chave = normalizar(v.etapa_alvo);
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(v);
    }
    return mapa;
}

// Escolhe um vídeo entre os disponíveis para a etapa de forma determinística
// por lead (mesmo lead sempre recebe a mesma sugestão se a lista for
// recarregada), mas distribuída entre os vários vídeos daquela etapa.
function escolherVideo(videosDaEtapa, leadId) {
    if (videosDaEtapa.length === 1) return videosDaEtapa[0];
    let hash = 0;
    for (const c of String(leadId)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return videosDaEtapa[hash % videosDaEtapa.length];
}

// Cada etapa pode ter seu próprio número mínimo de dias parado — basta
// colocar "dias_minimos" em qualquer vídeo daquela etapa no videos.json.
// Se não for informado, usa o padrão global (DIAS_MINIMOS_PARADO).
function getDiasMinimoPorEtapa(etapasComVideo) {
    const mapa = new Map();
    for (const [etapa, videos] of etapasComVideo) {
        const comOverride = videos.find(v => typeof v.dias_minimos === "number");
        mapa.set(etapa, comOverride ? comOverride.dias_minimos : DIAS_MINIMOS_PARADO);
    }
    return mapa;
}

// ---------------------------------------------------------------------------
// Busca todos os leads paginando (a API do Kommo devolve no máximo 250 por vez)
// ---------------------------------------------------------------------------
async function buscarTodosOsLeads() {
    let page = 1;
    const leads = [];

    while (true) {
        const resp = await axios.get(`${KOMMO_URL}/leads`, {
            headers: HEADERS,
            params: { with: "contacts", limit: 250, page },
        });
        const pagina = resp.data?._embedded?.leads || [];
        leads.push(...pagina);
        if (pagina.length < 250) break; // última página
        page += 1;
        if (page > 40) break; // trava de segurança (10k leads)
    }

    return leads;
}

// ---------------------------------------------------------------------------
// Busca telefone E nome de vários contatos de uma vez (em lotes de 250 ids).
// IMPORTANTE: o nome do CONTATO é o nome da pessoa de verdade. O nome do LEAD
// (l.name lá em cima) é o título do negócio no Kommo e costuma vir genérico
// ("Lead", "Negócio #1234" etc.) — por isso o [NOME] das mensagens usa o nome
// do contato, não o do lead.
// ---------------------------------------------------------------------------
async function buscarDadosContatos(idsContatos) {
    const dadosPorContato = new Map(); // contactId -> { telefone, nome }
    const ids = [...new Set(idsContatos)].filter(Boolean);
    if (ids.length === 0) return dadosPorContato;

    const TAMANHO_LOTE = 250;
    for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
        const lote = ids.slice(i, i + TAMANHO_LOTE);
        const params = new URLSearchParams();
        lote.forEach(id => params.append("filter[id][]", id));

        try {
            const resp = await axios.get(`${KOMMO_URL}/contacts?${params.toString()}`, { headers: HEADERS });
            const contatos = resp.data?._embedded?.contacts || [];
            for (const c of contatos) {
                const campoTelefone = (c.custom_fields_values || []).find(
                    f => f.field_code === "PHONE" || /telefone|phone/i.test(f.field_name || "")
                );
                const telefone = campoTelefone?.values?.[0]?.value;
                dadosPorContato.set(c.id, { telefone: telefone || null, nome: c.name || null });
            }
        } catch (e) {
            console.error("Erro ao buscar contatos:", e.message);
        }
    }

    return dadosPorContato;
}

// ---------------------------------------------------------------------------
// Rota principal: leads prontos para reaquecer
// ---------------------------------------------------------------------------
app.get("/api/leads-para-reaquecer", async (req, res) => {
    try {
        const videosConfig = carregarVideosConfig();
        const etapasComVideo = agruparVideosPorEtapa(videosConfig);
        const diasMinimoPorEtapa = getDiasMinimoPorEtapa(etapasComVideo);

        const [leads, mapaEtapas] = await Promise.all([buscarTodosOsLeads(), getMapaEtapas()]);

        const agora = Math.floor(Date.now() / 1000);

        // Pré-filtra antes de gastar chamadas de API buscando telefone
        const candidatos = leads.filter(l => {
            const jaRecebeu = l._embedded?.tags?.some(t => t.name === TAG_CONTROLE);
            const diasParado = (agora - l.updated_at) / 86400;
            const nomeEtapa = mapaEtapas.get(String(l.status_id));
            const chaveEtapa = normalizar(nomeEtapa);
            const temVideoParaEtapa = nomeEtapa && etapasComVideo.has(chaveEtapa);
            const minimoExigido = temVideoParaEtapa ? diasMinimoPorEtapa.get(chaveEtapa) : Infinity;
            return !jaRecebeu && diasParado >= minimoExigido && temVideoParaEtapa;
        });

        const idsContatos = candidatos.flatMap(l => (l._embedded?.contacts || []).map(c => c.id));
        const dadosPorContato = await buscarDadosContatos(idsContatos);

        const reaqueciveis = candidatos.map(l => {
            const nomeEtapa = mapaEtapas.get(String(l.status_id));
            const video = escolherVideo(etapasComVideo.get(normalizar(nomeEtapa)), l.id);
            const contatoId = l._embedded?.contacts?.[0]?.id;
            const dadosContato = contatoId ? dadosPorContato.get(contatoId) : null;
            const telefone = dadosContato?.telefone;
            const diasParado = Math.floor((agora - l.updated_at) / 86400);

            return {
                id: l.id,
                // Nome do CONTATO (a pessoa de verdade), com fallback pro nome do
                // lead só se o contato não tiver nome cadastrado.
                name: dadosContato?.nome || l.name || "Sem nome",
                etapa: nomeEtapa,
                dias_parado: diasParado,
                telefone: telefone || null,
                video_sugerido: {
                    titulo: video.titulo,
                    // Link enviado é a NOSSA página de prévia (/v/:key), não o link seco
                    // do Drive — assim o WhatsApp mostra a miniatura do vídeo.
                    link: `${PUBLIC_BASE_URL}/v/${video.key}`,
                    copy: video.mensagem,
                },
            };
        });

        // Mais antigos primeiro, para o SDR atacar quem está esfriando há mais tempo
        reaqueciveis.sort((a, b) => b.dias_parado - a.dias_parado);

        res.json(reaqueciveis);
    } catch (error) {
        console.error("Erro em /api/leads-para-reaquecer:", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------------
// Marca o lead como reaquecido (aplica a tag de controle no Kommo)
// ---------------------------------------------------------------------------
app.post("/api/marcar-enviado/:id", async (req, res) => {
    try {
        await axios.patch(
            `${KOMMO_URL}/leads/${req.params.id}`,
            { _embedded: { tags: [{ name: TAG_CONTROLE }] } },
            { headers: HEADERS }
        );
        res.json({ success: true });
    } catch (error) {
        console.error("Erro em /api/marcar-enviado:", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------------
// Página de prévia do vídeo (/v/:key) — resolve o problema do link "seco".
// O WhatsApp lê as tags Open Graph desta página (og:image aponta pra
// miniatura do Drive) e mostra a prévia com thumbnail no chat. Ao clicar,
// o lead cai aqui e assiste ao vídeo direto (embed do Drive), sem sair do link.
// ---------------------------------------------------------------------------
app.get("/v/:key", (req, res) => {
    const videosConfig = carregarVideosConfig();
    const video = videosConfig.find(v => v.key === req.params.key);

    if (!video || !video.driveFileId) {
        return res.status(404).send("Vídeo não encontrado.");
    }

    const thumbUrl = `https://drive.google.com/thumbnail?id=${video.driveFileId}&sz=w1280-h720`;
    const embedUrl = `https://drive.google.com/file/d/${video.driveFileId}/preview`;
    const pageUrl = `${PUBLIC_BASE_URL}/v/${video.key}`;
    const titulo = escapeHtml(video.titulo || "Vídeo - Robson Menezes Advogados");

    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="Robson Menezes Advogados — assista ao vídeo completo.">
<meta property="og:image" content="${thumbUrl}">
<meta property="og:url" content="${pageUrl}">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{color-scheme:dark;}
  *{box-sizing:border-box;}
  body{margin:0;background:#0b0f14;color:#e8ecef;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;}
  .card{width:100%;max-width:640px;}
  h1{font-family:'Space Grotesk',system-ui,sans-serif;font-size:1.1rem;font-weight:600;margin:0 0 14px;color:#f2f4f6;}
  .player{position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 20px 60px -20px rgba(245,166,35,0.25);}
  iframe{width:100%;height:100%;border:0;}
  .brand{margin-top:18px;font-size:0.75rem;letter-spacing:0.04em;text-transform:uppercase;color:#8a97a6;}
  .brand b{color:#f5a623;}
</style>
</head>
<body>
  <div class="card">
    <h1>${titulo}</h1>
    <div class="player"><iframe src="${embedUrl}" allow="autoplay" allowfullscreen></iframe></div>
    <p class="brand">Enviado por <b>Robson Menezes Advogados</b></p>
  </div>
</body>
</html>`);
});

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------------------
// Busca livre de leads no Kommo — encontra QUALQUER lead por nome ou telefone,
// independente da etapa ou de quantos dias está parado (não usa o filtro de
// "pronto pra reaquecer"). Serve pra achar seu próprio número, testar, ou
// mandar um vídeo fora do fluxo automático.
// ---------------------------------------------------------------------------
app.get("/api/buscar-lead", async (req, res) => {
    try {
        const termo = String(req.query.q || "").trim();
        if (!termo) return res.json([]);

        const resp = await axios.get(`${KOMMO_URL}/leads`, {
            headers: HEADERS,
            params: { with: "contacts", query: termo, limit: 50 },
        });
        const leads = resp.data?._embedded?.leads || [];
        const mapaEtapas = await getMapaEtapas();

        const idsContatos = leads.flatMap(l => (l._embedded?.contacts || []).map(c => c.id));
        const dadosPorContato = await buscarDadosContatos(idsContatos);

        const resultado = leads.map(l => {
            const contatoId = l._embedded?.contacts?.[0]?.id;
            const dadosContato = contatoId ? dadosPorContato.get(contatoId) : null;
            const telefone = dadosContato?.telefone;
            return {
                id: l.id,
                name: dadosContato?.nome || l.name || "Sem nome",
                etapa: mapaEtapas.get(String(l.status_id)) || null,
                telefone: telefone || null,
                ja_reaquecido: l._embedded?.tags?.some(t => t.name === TAG_CONTROLE) || false,
            };
        });

        res.json(resultado);
    } catch (error) {
        console.error("Erro em /api/buscar-lead:", error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Lista os vídeos configurados (usado pelo painel de "Envio de teste" no
// frontend, pra popular o seletor sem precisar repetir o videos.json ali).
app.get("/api/videos-config", (req, res) => {
    try {
        const videosConfig = carregarVideosConfig();
        res.json(
            videosConfig.map(v => ({
                key: v.key,
                etapa_alvo: v.etapa_alvo,
                titulo: v.titulo,
                mensagem: v.mensagem,
                link: `${PUBLIC_BASE_URL}/v/${v.key}`,
            }))
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
