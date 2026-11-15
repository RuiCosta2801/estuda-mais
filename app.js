// --- 1. Registo do Service Worker (Offline) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => document.getElementById('status-app').innerText = "App pronta para instalar e usar offline.")
            .catch((erro) => console.error('Erro SW:', erro));
    });
}

// --- 2. Variáveis Globais ---
let disciplinas = [];
let sessoes = [];
let disciplinaSelecionadaId = null;
let disciplinaRelatorioAtualId = null;

// Controlo do Cronómetro e Pausa
let tempoIntervalo = null;
let horaInicio = null;
let tempoAcumuladoAntesPausa = 0;
let estaEmPausa = false;
let segundosDecorridos = 0;
let toastTimeout = null;
let wakeLock = null;

// --- 3. Carregar e Guardar Dados ---
function carregarDados() {
    const dadosGuardados = localStorage.getItem('estuda_dados');
    if (dadosGuardados) {
        disciplinas = JSON.parse(dadosGuardados);
    }

    const sessoesGuardadas = localStorage.getItem('estuda_sessoes');
    if (sessoesGuardadas) {
        sessoes = JSON.parse(sessoesGuardadas);
    } else {
        disciplinas.forEach(d => {
            if (d.tempoTotal > 0) {
                sessoes.push({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    disciplinaId: d.id,
                    data: new Date().toISOString(),
                    duracaoSegundos: d.tempoTotal,
                    nota: "Sessão anterior"
                });
            }
        });
        guardarDados();
    }

    atualizarInterface();
}

function guardarDados() {
    localStorage.setItem('estuda_dados', JSON.stringify(disciplinas));
    localStorage.setItem('estuda_sessoes', JSON.stringify(sessoes));
}

function sincronizarTemposDisciplinas() {
    disciplinas.forEach(d => {
        const total = sessoes
            .filter(s => s.disciplinaId === d.id)
            .reduce((soma, s) => soma + s.duracaoSegundos, 0);
        d.tempoTotal = total;
    });
    guardarDados();
}

// --- 4. Funções das Disciplinas ---
function adicionarDisciplina() {
    const inputNome = document.getElementById('nova-disciplina');
    const selectSemestre = document.getElementById('semestre-disciplina');
    const inputMeta = document.getElementById('meta-disciplina');
    
    const nome = inputNome.value.trim();
    const semestre = selectSemestre.value;
    const metaHoras = parseFloat(inputMeta.value) || 30;
    
    if (nome === '') {
        alert("Escreve o nome da disciplina!");
        return;
    }

    const nova = {
        id: Date.now(),
        nome: nome,
        semestre: semestre,
        metaSegundos: metaHoras * 3600,
        tempoTotal: 0
    };

    disciplinas.push(nova);
    guardarDados();
    atualizarInterface();
    inputNome.value = '';
}

function selecionarDisciplinaParaEstudar(id) {
    if (disciplinaSelecionadaId === id) {
        disciplinaSelecionadaId = null;
    } else {
        disciplinaSelecionadaId = id;
    }
    atualizarInterface();
}

function removerDisciplina(id) {
    if (confirm("Tens a certeza que queres apagar esta disciplina e todas as suas sessões?")) {
        disciplinas = disciplinas.filter(d => d.id !== id);
        sessoes = sessoes.filter(s => s.disciplinaId !== id);
        if (disciplinaSelecionadaId === id) {
            disciplinaSelecionadaId = null;
        }
        guardarDados();
        voltarPrincipal();
    }
}

function atualizarInterface() {
    const lista = document.getElementById('lista-disciplinas');
    const containerBotoes = document.getElementById('botoes-selecao-disciplinas');
    const msgTopo = document.getElementById('msg-sem-disciplinas-topo');
    const msgLista = document.getElementById('msg-sem-disciplinas-lista');
    const btnIniciar = document.getElementById('btn-iniciar');
    
    lista.innerHTML = '';
    containerBotoes.innerHTML = '';

    if (disciplinas.length === 0) {
        msgTopo.style.display = 'block';
        msgLista.style.display = 'block';
        btnIniciar.disabled = true;
        return;
    }

    msgTopo.style.display = 'none';
    msgLista.style.display = 'none';
    btnIniciar.disabled = (disciplinaSelecionadaId === null);

    disciplinas.forEach(d => {
        const isSelecionada = (d.id === disciplinaSelecionadaId);
        const btnEscolha = document.createElement('button');
        btnEscolha.className = `btn-escolha-disciplina ${isSelecionada ? 'selecionada' : ''}`;
        btnEscolha.innerText = d.nome;
        btnEscolha.onclick = () => selecionarDisciplinaParaEstudar(d.id);
        containerBotoes.appendChild(btnEscolha);

        const semestreTexto = d.semestre || '1.º Semestre';
        const li = document.createElement('li');
        li.className = 'disciplina-item';
        li.onclick = () => abrirRelatorio(d.id);
        li.innerHTML = `
            <div class="disciplina-info">
                <strong>${d.nome}</strong>
                <span class="badge-semestre">${semestreTexto}</span>
            </div>
            <button class="btn-seta" title="Ver relatório">➔</button>
        `;
        lista.appendChild(li);
    });
}

// --- 5. Formatação e Navegação ---
function formatarTempo(segundos) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;

    if (h > 0) {
        return `${h}h ${m}m`;
    } else if (m > 0) {
        return `${m}m ${s}s`;
    } else {
        return `${s}s`;
    }
}

function formatarDataHora(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + 
           ' às ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function esconderTodosEcras() {
    document.getElementById('ecra-principal').style.display = 'none';
    document.getElementById('ecra-relatorio').style.display = 'none';
    document.getElementById('ecra-historico').style.display = 'none';
    document.getElementById('ecra-foco').style.display = 'none';
}

function voltarPrincipal() {
    esconderTodosEcras();
    document.getElementById('app-header').style.display = 'block';
    document.getElementById('status-app').style.display = 'block';
    document.getElementById('ecra-principal').style.display = 'block';
    disciplinaRelatorioAtualId = null;
    atualizarInterface();
}

// --- 6. Página de Relatório & Histórico ---
function abrirRelatorio(id) {
    const disciplina = disciplinas.find(d => d.id === id);
    if (!disciplina) return;

    disciplinaRelatorioAtualId = id;
    esconderTodosEcras();
    document.getElementById('ecra-relatorio').style.display = 'block';

    const metaSeg = disciplina.metaSegundos || (30 * 3600);
    const estudadoSeg = disciplina.tempoTotal || 0;
    const faltaSeg = Math.max(0, metaSeg - estudadoSeg);
    const percentagem = Math.min(100, Math.round((estudadoSeg / metaSeg) * 100));

    document.getElementById('rel-semestre').innerText = disciplina.semestre || '1.º Semestre';
    document.getElementById('rel-titulo').innerText = disciplina.nome;
    document.getElementById('rel-estudado').innerText = formatarTempo(estudadoSeg);
    document.getElementById('rel-falta').innerText = formatarTempo(faltaSeg);
    document.getElementById('rel-meta').innerText = `${Math.round(metaSeg / 3600)}h`;
    
    document.getElementById('rel-percentagem').innerText = `${percentagem}%`;
    document.getElementById('rel-barra-progresso').style.width = `${percentagem}%`;

    document.getElementById('btn-apagar-relatorio').onclick = () => removerDisciplina(disciplina.id);

    const graficoContainer = document.getElementById('grafico-comparativo');
    graficoContainer.innerHTML = '';

    const tempoTotalGlobal = disciplinas.reduce((soma, d) => soma + (d.tempoTotal || 0), 0);

    disciplinas.forEach(d => {
        const isDestaque = (d.id === disciplina.id);
        const percentagemRelativa = tempoTotalGlobal > 0 
            ? Math.round(((d.tempoTotal || 0) / tempoTotalGlobal) * 100) 
            : 0;
        
        const estiloDestaque = isDestaque ? 'font-weight: 700; color: #818cf8;' : '';

        graficoContainer.innerHTML += `
            <div class="grafico-linha">
                <div class="grafico-cabecalho">
                    <span style="${estiloDestaque}">${d.nome}</span>
                    <span style="${estiloDestaque}">${formatarTempo(d.tempoTotal)} (${percentagemRelativa}%)</span>
                </div>
                <div class="grafico-barra-fundo">
                    <div class="grafico-barra ${isDestaque ? 'destaque' : ''}" style="width: ${percentagemRelativa}%;"></div>
                </div>
            </div>
        `;
    });

    renderizarListaSessoes('lista-sessoes-disciplina', id);
}

function abrirHistoricoGeral() {
    esconderTodosEcras();
    document.getElementById('ecra-historico').style.display = 'block';
    renderizarListaSessoes('lista-sessoes-geral', null);
}

function renderizarListaSessoes(elementoId, filtroDisciplinaId) {
    const ul = document.getElementById(elementoId);
    ul.innerHTML = '';

    let listaFiltrada = [...sessoes].sort((a, b) => new Date(b.data) - new Date(a.data));
    if (filtroDisciplinaId !== null) {
        listaFiltrada = listaFiltrada.filter(s => s.disciplinaId === filtroDisciplinaId);
    }

    if (listaFiltrada.length === 0) {
        ul.innerHTML = '<p class="texto-vazio">Nenhuma sessão registada.</p>';
        return;
    }

    listaFiltrada.forEach(s => {
        const disc = disciplinas.find(d => d.id === s.disciplinaId);
        const nomeDisc = disc ? disc.nome : 'Disciplina apagada';
        const tituloLinha = filtroDisciplinaId !== null 
            ? `⏱️ ${formatarTempo(s.duracaoSegundos)}` 
            : `${nomeDisc} — ⏱️ ${formatarTempo(s.duracaoSegundos)}`;

        const notaHtml = s.nota ? `<span class="sessao-nota">"${s.nota}"</span>` : '';

        const li = document.createElement('li');
        li.className = 'sessao-item';
        li.innerHTML = `
            <div class="sessao-detalhes">
                <span class="sessao-titulo">${tituloLinha}</span>
                <span class="sessao-meta">${formatarDataHora(s.data)}</span>
                ${notaHtml}
            </div>
            <button class="btn-apagar-sessao" onclick="eliminarSessao(${s.id})" title="Eliminar sessão">🗑️</button>
        `;
        ul.appendChild(li);
    });
}

function eliminarSessao(sessaoId) {
    if (confirm("Queres eliminar esta sessão de estudo? O tempo será descontado da cadeira.")) {
        sessoes = sessoes.filter(s => s.id !== sessaoId);
        sincronizarTemposDisciplinas();

        if (disciplinaRelatorioAtualId !== null) {
            abrirRelatorio(disciplinaRelatorioAtualId);
        } else {
            abrirHistoricoGeral();
        }
    }
}

// --- 7. Notificação Animada de Conquista ---
function mostrarToastConquista(nomeDisciplina, segundos) {
    const toast = document.getElementById('toast-conquista');
    const titulo = document.getElementById('toast-titulo');
    const mensagem = document.getElementById('toast-mensagem');

    const frases = [
        "Excelente foco! Mais um passo dado.",
        "Conquista desbloqueada! Continua assim.",
        "Ótimo trabalho! O esforço compensa.",
        "Missão cumprida! Mais perto da tua meta."
    ];
    const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];

    titulo.innerText = fraseAleatoria;
    mensagem.innerText = `+${formatarTempo(segundos)} registados em ${nomeDisciplina}!`;

    toast.classList.add('visivel');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        fecharToastConquista();
    }, 4500);
}

function fecharToastConquista() {
    document.getElementById('toast-conquista').classList.remove('visivel');
}

// --- 8. Modo Foco & Cronómetro com Pausa ---
async function ativarWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {}
}

function libertarWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}

function iniciarCronometro() {
    if (disciplinaSelecionadaId === null) return;

    const disciplina = disciplinas.find(d => d.id === disciplinaSelecionadaId);
    if (!disciplina) return;

    esconderTodosEcras();
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('status-app').style.display = 'none';
    document.getElementById('ecra-foco').style.display = 'flex';

    document.getElementById('foco-semestre').innerText = disciplina.semestre || '1.º Semestre';
    document.getElementById('foco-titulo').innerText = disciplina.nome;
    document.getElementById('foco-nota').value = '';
    
    horaInicio = Date.now();
    tempoAcumuladoAntesPausa = 0;
    estaEmPausa = false;
    segundosDecorridos = 0;

    atualizarEstadoVisualPausa();
    atualizarEcraCronometro();
    ativarWakeLock();

    tempoIntervalo = setInterval(() => {
        if (!estaEmPausa) {
            const msAtuais = tempoAcumuladoAntesPausa + (Date.now() - horaInicio);
            segundosDecorridos = Math.floor(msAtuais / 1000);
            atualizarEcraCronometro();
        }
    }, 500);
}

function alternarPausa() {
    if (!estaEmPausa) {
        tempoAcumuladoAntesPausa += (Date.now() - horaInicio);
        estaEmPausa = true;
    } else {
        horaInicio = Date.now();
        estaEmPausa = false;
    }

    atualizarEstadoVisualPausa();
}

function atualizarEstadoVisualPausa() {
    const btnPausar = document.getElementById('btn-pausar');
    const estadoTexto = document.getElementById('foco-estado');
    const displayTempo = document.getElementById('display-tempo');

    if (estaEmPausa) {
        btnPausar.innerText = "▶ Retomar";
        btnPausar.classList.add('retomar');
        estadoTexto.innerText = "Sessão em pausa";
        estadoTexto.classList.add('pausado');
        displayTempo.classList.add('pausado');
    } else {
        btnPausar.innerText = "⏸ Pausar";
        btnPausar.classList.remove('retomar');
        estadoTexto.innerText = "A contar tempo de estudo...";
        estadoTexto.classList.remove('pausado');
        displayTempo.classList.remove('pausado');
    }
}

function pararCronometro() {
    clearInterval(tempoIntervalo);
    libertarWakeLock();

    let msTotais = tempoAcumuladoAntesPausa;
    if (!estaEmPausa && horaInicio) {
        msTotais += (Date.now() - horaInicio);
    }
    segundosDecorridos = Math.floor(msTotais / 1000);

    const disciplina = disciplinas.find(d => d.id === disciplinaSelecionadaId);
    const notaTexto = document.getElementById('foco-nota').value.trim();

    if (disciplina && segundosDecorridos > 0) {
        sessoes.push({
            id: Date.now(),
            disciplinaId: disciplina.id,
            data: new Date().toISOString(),
            duracaoSegundos: segundosDecorridos,
            nota: notaTexto
        });

        sincronizarTemposDisciplinas();
        mostrarToastConquista(disciplina.nome, segundosDecorridos);
    }

    horaInicio = null;
    tempoAcumuladoAntesPausa = 0;
    estaEmPausa = false;

    voltarPrincipal();
}

function descartarSessao() {
    if (confirm("Queres mesmo descartar esta sessão sem guardar o tempo?")) {
        clearInterval(tempoIntervalo);
        libertarWakeLock();
        horaInicio = null;
        tempoAcumuladoAntesPausa = 0;
        estaEmPausa = false;
        voltarPrincipal();
    }
}

function atualizarEcraCronometro() {
    const horas = String(Math.floor(segundosDecorridos / 3600)).padStart(2, '0');
    const minutos = String(Math.floor((segundosDecorridos % 3600) / 60)).padStart(2, '0');
    const segundos = String(segundosDecorridos % 60).padStart(2, '0');
    document.getElementById('display-tempo').innerText = `${horas}:${minutos}:${segundos}`;
}

// --- 9. Backup: Exportar e Importar JSON (Preparado para o futuro) ---
function exportarDados() {
    const pacoteBackup = {
        versao: 2,
        disciplinas: disciplinas,
        sessoes: sessoes
    };
    const dadosStr = JSON.stringify(pacoteBackup, null, 2);
    const blob = new Blob([dadosStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    const dataHoje = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `estuda-mais-backup-${dataHoje}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importarDados(event) {
    const ficheiro = event.target.files[0];
    if (!ficheiro) return;

    const leitor = new FileReader();
    leitor.onload = function(e) {
        try {
            const dadosImportados = JSON.parse(e.target.result);
            if (Array.isArray(dadosImportados)) {
                if (confirm("Isto vai substituir os dados atuais pelos do ficheiro. Continuar?")) {
                    disciplinas = dadosImportados;
                    sessoes = [];
                    disciplinaSelecionadaId = null;
                    guardarDados();
                    atualizarInterface();
                    alert("Backup restaurado com sucesso!");
                }
            } else if (dadosImportados && Array.isArray(dadosImportados.disciplinas)) {
                if (confirm("Isto vai substituir os dados atuais e o histórico pelos do ficheiro. Continuar?")) {
                    disciplinas = dadosImportados.disciplinas;
                    sessoes = dadosImportados.sessoes || [];
                    sincronizarTemposDisciplinas();
                    disciplinaSelecionadaId = null;
                    atualizarInterface();
                    alert("Backup restaurado com sucesso!");
                }
            } else {
                alert("Ficheiro inválido!");
            }
        } catch (erro) {
            alert("Erro ao ler o ficheiro JSON.");
        }
    };
    leitor.readAsText(ficheiro);
}

// Iniciar a app
carregarDados();