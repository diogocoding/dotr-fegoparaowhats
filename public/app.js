// Configuração do link do seu Back-end no Render
const API_URL = "https://dotr-fegoparaowhats.onrender.com";

// Função principal que carrega os leads ao abrir a página
async function carregarLeadsParaReaquecer() {
    const listaContainer = document.getElementById('listaLeads');
    
    try {
        const response = await fetch(`${API_URL}/api/leads-para-reaquecer`);
        const leads = await response.json();

        if (!leads || leads.length === 0) {
            listaContainer.innerHTML = `
                <div class="text-center py-20">
                    <p class="text-slate-500">✅ Nenhum lead pendente de reaquecimento no momento.</p>
                </div>
            `;
            return;
        }

        // Renderiza os cards dos leads
        listaContainer.innerHTML = leads.map(lead => {
            // Se o vídeo sugerido não vier do back, usamos um padrão para não quebrar
            const video = lead.video_sugerido || { 
                titulo: "Vídeo Institucional", 
                link: "https://youtu.be/default", 
                mensagem: "Olá [NOME], veja esse conteúdo que o Dr. Robson separou para você:" 
            };

            return `
                <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-amber-500/30 transition-all">
                    <div class="space-y-1">
                        <span class="text-[10px] font-bold bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded uppercase border border-amber-500/20">
                            ${lead.etapa || 'Etapa não identificada'}
                        </span>
                        <h3 class="text-lg font-bold text-slate-100">${lead.name}</h3>
                        <p class="text-xs text-slate-500 flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                            Parado há ${lead.dias_parado} dias
                        </p>
                    </div>

                    <div class="flex flex-col items-end gap-3 w-full md:w-auto">
                        <div class="text-right">
                            <p class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Vídeo Sugerido</p>
                            <p class="text-xs text-amber-400 font-medium">${video.titulo}</p>
                        </div>
                        
                        <button onclick="enviarWhatsApp('${lead.id}', '${lead.name}', '${lead.telefone}', ${JSON.stringify(video).replace(/"/g, '&quot;')})" 
                                class="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2">
                            📱 ENVIAR WHATSAPP
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao buscar leads:", error);
        listaContainer.innerHTML = `
            <div class="bg-rose-500/10 border border-rose-500/20 p-6 rounded-xl text-rose-400 text-center">
                <p class="font-bold">Erro de Conexão</p>
                <p class="text-xs">Não foi possível conectar ao servidor no Render. Verifique se o Back-end está ativo.</p>
            </div>
        `;
    }
}

// Função que abre o WhatsApp e avisa o Back-end para tirar o lead da lista
async function enviarWhatsApp(leadId, nome, telefone, videoConfig) {
    // 1. Prepara a mensagem
    // Pegamos apenas o primeiro nome para ficar mais pessoal
    const primeiroNome = nome.split(' ')[0];
    const mensagemPronta = videoConfig.mensagem.replace('[NOME]', primeiroNome);
    const linkFinal = `${mensagemPronta} ${videoConfig.link}`;

    // 2. Tenta formatar o telefone (se o telefone vier do back)
    // Se o telefone não vier, o WhatsApp abrirá para você escolher o contato
    const numeroWhats = telefone && telefone !== "Ver no Kommo" ? telefone.replace(/\D/g, '') : "";

    // 3. Abre o WhatsApp Web
    const urlWhats = `https://web.whatsapp.com/send
