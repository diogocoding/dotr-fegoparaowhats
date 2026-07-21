// ATENÇÃO: Verifique se o link abaixo termina EXATAMENTE assim, sem barra no final.
const API_URL = "https://dotr-fegoparaowhats.onrender.com"; 

async function carregarLeadsParaReaquecer() {
    const listaContainer = document.getElementById('listaLeads');
    if (!listaContainer) return;

    try {
        console.log("Buscando leads em:", `${API_URL}/api/leads-para-reaquecer`);
        
        const response = await fetch(`${API_URL}/api/leads-para-reaquecer`);
        
        // Se a resposta não for OK, lança erro para o catch
        if (!response.ok) throw new Error(`Erro no servidor: ${response.status}`);

        const leads = await response.json();

        if (!leads || leads.length === 0) {
            listaContainer.innerHTML = `<p class="text-center py-20 text-slate-500">✅ Nenhum lead pendente de reaquecimento.</p>`;
            return;
        }

        listaContainer.innerHTML = leads.map(lead => {
            const video = lead.video_sugerido || { titulo: "Vídeo Institucional", link: "#", copy: "Olá!" };
            
            return `
                <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 hover:border-amber-500/30 transition-all">
                    <div class="space-y-1">
                        <span class="text-[10px] font-bold bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded uppercase border border-amber-500/20">
                            ${lead.etapa}
                        </span>
                        <h3 class="text-lg font-bold text-slate-100">${lead.name}</h3>
                        <p class="text-xs text-slate-500 italic">Parado há ${lead.dias_parado} dias</p>
                    </div>

                    <div class="flex flex-col items-end gap-3 w-full md:w-auto">
                        <div class="text-right hidden md:block">
                            <p class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Sugestão</p>
                            <p class="text-xs text-amber-400 font-medium">${video.titulo}</p>
                        </div>
                        
                        <button onclick="enviarWhatsApp('${lead.id}', '${lead.name}', '${lead.telefone}', ${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                                class="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                            📱 ENVIAR NO WHATSAPP
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro detalhado:", error);
        listaContainer.innerHTML = `
            <div class="text-center py-10">
                <p class="text-rose-500 font-bold">Erro de Conexão</p>
                <p class="text-xs text-slate-500">O site não conseguiu falar com o Render.</p>
                <p class="text-[10px] mt-2 bg-slate-900 p-2 rounded font-mono">${error.message}</p>
            </div>
        `;
    }
}

async function enviarWhatsApp(leadId, nome, telefone, videoConfig) {
    const primeiroNome = nome.split(' ')[0];
    const mensagemFinal = videoConfig.copy.replace('[NOME]', primeiroNome) + "\n\n" + videoConfig.link;
    
    // Abre o WhatsApp (tenta usar o telefone se existir, senão vai sem número)
    const telLimpo = (telefone && telefone !== "Ver no Kommo") ? telefone.replace(/\D/g, '') : "";
    const urlWhats = `https://web.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(mensagemFinal)}`;
    
    window.open(urlWhats, '_blank');

    // Avisa o backend para por a tag e sumir com o lead da lista
    try {
        await fetch(`${API_URL}/api/marcar-enviado/${leadId}`, { method: 'POST' });
        // Recarrega em 2 segundos para o lead sumir da tela
        setTimeout(carregarLeadsParaReaquecer, 2000);
    } catch (e) {
        console.error("Erro ao marcar como enviado:", e);
    }
}

document.addEventListener('DOMContentLoaded', carregarLeadsParaReaquecer);
