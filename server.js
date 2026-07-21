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

const KOMMO_URL = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
const HEADERS = { Authorization: `Bearer ${process.env.KOMMO_TOKEN}` };
const TAG_CONTROLE = "REAQUECIDO_V1"; // Tag que impede o lead de aparecer de novo

// Rota para buscar os leads prontos para reaquecer
app.get("/api/leads-reaquecer", async (req, res) => {
    try {
        const videosConfig = JSON.parse(fs.readFileSync("./config/videos.json", "utf-8"));
        const etapasAlvo = videosConfig.map(v => v.etapa_alvo);

        // Busca leads (simplificado para o exemplo, use sua lógica de paginação se tiver muitos)
        const response = await axios.get(`${KOMMO_URL}/leads?with=contacts&limit=250`, { headers: HEADERS });
        const leads = response.data?._embedded?.leads || [];

        const agora = Math.floor(Date.now() / 1000);
        
        const reaqueciveis = leads.filter(l => {
            const idStatus = String(l.status_id);
            // Aqui você deve usar seu mapa de IDs de etapa (ETAPAS_IDS) do Dashboard
            // Para simplificar, assumimos que l.status_id já mapeia para as etapas
            const jaRecebeu = l._embedded?.tags?.some(t => t.name === TAG_CONTROLE);
            const diasParado = (agora - l.updated_at) / 86400;

            return !jaRecebeu && diasParado > 2; 
        }).map(l => {
            // Tenta encontrar o vídeo certo para a etapa dele
            // Nota: Você precisará converter o status_id para o NOME da etapa antes de comparar
            return { ...l, video_sugerido: videosConfig.find(v => v.etapa_alvo === "CONTATO INICIADO") }; // Exemplo fixo
        });

        res.json(reaqueciveis);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Adiciona a tag no Kommo para o lead sumir da lista
app.post("/api/marcar-enviado/:id", async (req, res) => {
    try {
        await axios.patch(`${KOMMO_URL}/leads/${req.params.id}`, {
            _embedded: { tags: [{ name: TAG_CONTROLE }] }
        }, { headers: HEADERS });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));