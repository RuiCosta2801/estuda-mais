// --- 1. Registo do Service Worker (Silencioso em segundo plano) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch((erro) => console.error('Erro SW:', erro));
    });
}

// --- 2. Variáveis Globais ---
let perfilUtilizador = null; // { nome, dataNascimento, nivel, ano }
let disciplinas = [];
let sessoes = [];
let conquistasDesbloqueadasIds = [];
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

// --- 3. Gestão de Perfil e Início de Sessão ---
const opcoesAnosEnsino = {
    normal: [
        "1.º Ano (Ensino Primário)",
        "2.º Ano (Ensino Primário)",
        "3.º Ano (Ensino Primário)",
        "4.º Ano (Ensino Primário)",
        "5.º Ano (2.º Ciclo)",
        "6.º Ano (2.º Ciclo)",
        "7.º Ano (3.º Ciclo)",
        "8.º Ano (3.º Ciclo)",
        "9.º Ano (3.º Ciclo)",
        "10.º Ano (Ensino Secundário)",
        "11.º Ano (Ensino Secundário)",
        "12.º Ano (Ensino Secundário)"
    ],
    superior: [
        "Licenciatura - 1.º Ano",
        "Licenciatura - 2.º Ano",
        "Licenciatura - 3.º Ano",
        "Mestrado - 1.º Ano",
        "Mestrado - 2.º Ano"
    ]
};

function atualizarOpcoesAno() {
    const nivel = document.getElementById('perfil-nivel').value;
    const selectAno = document.getElementById('perfil-ano');
    selectAno.innerHTML = '';

    opcoesAnosEnsino[nivel].forEach(anoTexto => {
        const opt = document.createElement('option');
        opt.value = anoTexto;
        opt.innerText = anoTexto;
        selectAno.appendChild(opt);
    });
}

function calcularIdade(dataNascStr) {
    if (!dataNascStr) return '--';
    const hoje = new Date();
    const nasc = new Date(dataNascStr);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
        idade--;
    }
    return idade >= 0 ? `${idade} anos` : '--';
}

function formatarDataNascimento(dataNascStr) {
    if (!dataNascStr) return '--/--/----';
    const partes = dataNascStr.split('-');
    if (partes.length !== 3) return dataNascStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function abrirEdicaoPerfil() {
    esconderTodosEcras();
    document.getElementById('btn-abrir-perfil').style.display = 'none';
    document.getElementById('header-saudacao').style.display = 'none';
    document.getElementById('ecra-login').style.display = 'block';

    const btnCancelar = document.getElementById('btn-cancelar-edicao-perfil');
    const tituloForm = document.getElementById('titulo-form-perfil');

    if (perfilUtilizador) {
        btnCancelar.style.display = 'inline-block';
        tituloForm.innerText = "Alterar Dados do Perfil";
        document.getElementById('perfil-nome').value = perfilUtilizador.nome || '';
        document.getElementById('perfil-nascimento').value = perfilUtilizador.dataNascimento || '';
        document.getElementById('perfil-nivel').value = perfilUtilizador.nivel || 'normal';
        atualizarOpcoesAno();
        document.getElementById('perfil-ano').value = perfilUtilizador.ano || opcoesAnosEnsino[perfilUtilizador.nivel][0];
    } else {
        btnCancelar.style.display = 'none';
        tituloForm.innerText = "Bem-vindo ao Estuda+";
        atualizarOpcoesAno();
    }
}

function guardarPerfil() {
    const nome = document.getElementById('perfil-nome').value.trim();
    const dataNascimento = document.getElementById('perfil-nascimento').value;
    const nivel = document.getElementById('perfil-nivel').value;
    const ano = document.getElementById('perfil-ano').value;

    if (nome === '') {
        alert("Por favor, escreve o teu nome!");
        return;
    }
    if (dataNascimento === '') {
        alert("Por favor, indica a tua data de nascimento!");
        return;
    }

    perfilUtilizador = { nome, dataNascimento, nivel, ano };
    localStorage.setItem('estuda_perfil', JSON.stringify(perfilUtilizador));
    
    aplicarNomenclaturaEnsino();
    voltarPrincipal();
}

function abrirPaginaPerfil() {
    if (!perfilUtilizador) {
        abrirEdicaoPerfil();
        return;
    }

    esconderTodosEcras();
    document.getElementById('ecra-perfil').style.display = 'block';

    document.getElementById('perfil-avatar-inicial').innerText = perfilUtilizador.nome.charAt(0).toUpperCase();
    document.getElementById('view-perfil-nome').innerText = perfilUtilizador.nome;
    document.getElementById('view-perfil-nivel-badge').innerText = perfilUtilizador.nivel === 'superior' ? 'Ensino Superior' : 'Ensino Normal';
    document.getElementById('view-perfil-nascimento').innerText = formatarDataNascimento(perfilUtilizador.dataNascimento);
    document.getElementById('view-perfil-idade').innerText = calcularIdade(perfilUtilizador.dataNascimento);
    document.getElementById('view-perfil-ano').innerText = perfilUtilizador.ano;

    renderizarConquistas();
}

function obterTermosEnsino() {
    const isSuperior = perfilUtilizador && perfilUtilizador.nivel === 'superior';
    return {
        singular: isSuperior ? 'cadeira' : 'disciplina',
        singularCap: isSuperior ? 'Cadeira' : 'Disciplina',
        plural: isSuperior ? 'cadeiras' : 'disciplinas',
        pluralCap: isSuperior ? 'Cadeiras' : 'Disciplinas',
        exemplo: isSuperior ? 'Ex: Investigação Operacional' : 'Ex: Matemática'
    };
}

function aplicarNomenclaturaEnsino() {
    const termos = obterTermosEnsino();

    if (perfilUtilizador) {
        const saudacao = document.getElementById('header-saudacao');
        saudacao.innerText = `Olá, ${perfilUtilizador.nome} • ${perfilUtilizador.ano}`;
        saudacao.style.display = 'block';
        document.getElementById('btn-abrir-perfil').style.display = 'inline-block';
    }

    document.getElementById('msg-sem-disciplinas-topo').innerText = `Ainda não tens ${termos.plural} para estudar`;
    document.getElementById('msg-sem-disciplinas-lista').innerText = `Ainda não tens ${termos.plural} para estudar`;
    document.getElementById('titulo-minhas-materias').innerText = `As Minhas ${termos.pluralCap}`;
    document.getElementById('nova-disciplina').placeholder = `Nome da ${termos.singular} (${termos.exemplo})`;
    
    document.getElementById('titulo-comparacao-materias').innerText = `Comparação entre ${termos.pluralCap}`;
    document.getElementById('titulo-sessoes-materia').innerText = `Sessões desta ${termos.singularCap}`;
    document.getElementById('btn-apagar-relatorio').innerText = `🗑️ Apagar esta ${termos.singular}`;
}

// --- 4. Sistema de Conquistas ---
function calcularDiasSeguidos() {
    if (sessoes.length === 0) return 0;
    const diasUnicos = [...new Set(sessoes.map(s => new Date(s.data).toISOString().slice(0, 10)))].sort().reverse();
    
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    
    if (diasUnicos[0] !== hoje && diasUnicos[0] !== ontem) return 0;

    let streak = 1;
    for (let i = 0; i < diasUnicos.length - 1; i++) {
        const atual = new Date(diasUnicos[i]);
        const anterior = new Date(diasUnicos[i + 1]);
        const diffDias = Math.round((atual - anterior) / 86400000);
        if (diffDias === 1) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

function avaliarTodasConquistas() {
    const termos = obterTermosEnsino();
    const tempoTotalGlobal = disciplinas.reduce((soma, d) => soma + (d.tempoTotal || 0), 0);
    const maxSessao = sessoes.reduce((max, s) => Math.max(max, s.duracaoSegundos || 0), 0);
    const diasSeguidos = calcularDiasSeguidos();

    const disc10h = disciplinas.find(d => (d.tempoTotal || 0) >= 10 * 3600);
    const disc25h = disciplinas.find(d => (d.tempoTotal || 0) >= 25 * 3600);
    const discMetaCumprida = disciplinas.find(d => (d.tempoTotal || 0) >= (d.metaSegundos || 30 * 3600));

    return [
        {
            id: 'primeira_sessao',
            emoji: '🚀',
            titulo: 'Primeiro Passo',
            desc: 'Conclui a tua primeira sessão de estudo.',
            desbloqueada: sessoes.length >= 1,
            extra: ''
        },
        {
            id: 'organizado_3',
            emoji: '📚',
            titulo: 'Plano Traçado',
            desc: `Adiciona pelo menos 3 ${termos.plural} ao teu plano.`,
            desbloqueada: disciplinas.length >= 3,
            extra: ''
        },
        {
            id: 'foco_1h',
            emoji: '⏱️',
            titulo: 'Foco Profundo',
            desc: 'Completa uma sessão contínua de 1 hora.',
            desbloqueada: maxSessao >= 3600,
            extra: ''
        },
        {
            id: 'foco_2h',
            emoji: '🧠',
            titulo: 'Mente Inabalável',
            desc: 'Completa uma maratona de 2 horas numa única sessão.',
            desbloqueada: maxSessao >= 7200,
            extra: ''
        },
        {
            id: 'materia_10h',
            emoji: '📘',
            titulo: `10h numa ${termos.singularCap}`,
            desc: `Acumula 10 horas de estudo numa só ${termos.singular}.`,
            desbloqueada: !!disc10h,
            extra: disc10h ? `Conquistado em: ${disc10h.nome}` : ''
        },
        {
            id: 'materia_25h',
            emoji: '🎓',
            titulo: `25h numa ${termos.singularCap}`,
            desc: `Acumula 25 horas de domínio numa só ${termos.singular}.`,
            desbloqueada: !!disc25h,
            extra: disc25h ? `Conquistado em: ${disc25h.nome}` : ''
        },
        {
            id: 'total_10h',
            emoji: '⚡',
            titulo: '10 Horas Totais',
            desc: 'Alcança 10 horas de estudo somando todas as matérias.',
            desbloqueada: tempoTotalGlobal >= 10 * 3600,
            extra: ''
        },
        {
            id: 'total_50h',
            emoji: '🔥',
            titulo: '50 Horas Totais',
            desc: 'Alcança 50 horas acumuladas de dedicação.',
            desbloqueada: tempoTotalGlobal >= 50 * 3600,
            extra: ''
        },
        {
            id: 'total_100h',
            emoji: '👑',
            titulo: 'Centurião do Estudo',
            desc: 'Atinge a marca lendária de 100 horas totais.',
            desbloqueada: tempoTotalGlobal >= 100 * 3600,
            extra: ''
        },
        {
            id: 'streak_3',
            emoji: '📅',
            titulo: 'Ritmo Certo',
            desc: 'Estuda durante 3 dias seguidos.',
            desbloqueada: diasSeguidos >= 3,
            extra: ''
        },
        {
            id: 'streak_7',
            emoji: '🏅',
            titulo: 'Semana Imparável',
            desc: 'Mantém o foco durante 7 dias consecutivos.',
            desbloqueada: diasSeguidos >= 7,
            extra: ''
        },
        {
            id: 'meta_concluida',
            emoji: '🎯',
            titulo: 'Objetivo Cumprido',
            desc: `Atinge 100% da meta definida numa ${termos.singular}.`,
            desbloqueada: !!discMetaCumprida,
            extra: discMetaCumprida ? `Meta atingida: ${discMetaCumprida.nome}` : ''
        }
    ];
}

function verificarNovasConquistas() {
    const listaAtual = avaliarTodasConquistas();
    let novaConquistaEncontrada = null;

    listaAtual.forEach(c => {
        if (c.desbloqueada && !conquistasDesbloqueadasIds.includes(c.id)) {
            conquistasDesbloqueadasIds.push(c.id);
            novaConquistaEncontrada = c;
        }
    });

    localStorage.setItem('estuda_conquistas', JSON.stringify(conquistasDesbloqueadasIds));
    return novaConquistaEncontrada;
}

function renderizarConquistas() {
    const lista = avaliarTodasConquistas();
    const grid = document.getElementById('grid-conquistas');
    const contador = document.getElementById('contador-conquistas');
    
    grid.innerHTML = '';
    const totalDesbloqueadas = lista.filter(c => c.desbloqueada).length;
    contador.innerText = `${totalDesbloqueadas} / ${lista.length}`;

    lista.forEach(c => {
        const extraHtml = c.extra ? `<span class="conquista-detalhe-extra">${c.extra}</span>` : '';
        grid.innerHTML += `
            <div class="conquista-card ${c.desbloqueada ? 'desbloqueada' : ''}">
                <div class="conquista-topo">
                    <span class="conquista-emoji">${c.emoji}</span>
                    ${c.desbloqueada ? '<span class="conquista-status">✓ Obtida</span>' : ''}
                </div>
                <span class="conquista-titulo">${c.titulo}</span>
                <span class="conquista-desc">${c.desc}</span>
                ${extraHtml}
            </div>
        `;
    });
}

// --- 5. Carregar e Guardar Dados ---
function carregarDados() {
    const perfilGuardado = localStorage.getItem('estuda_perfil');
    if (perfilGuardado) {
        perfilUtilizador = JSON.parse(perfilGuardado);
    }

    const dadosGuardados = localStorage.getItem('estuda_dados');
    if (dadosGuardados) {
        disciplinas = JSON.parse(dadosGuardados);
    }

    const sessoesGuardadas = localStorage.getItem('estuda_sessoes');
    if (sessoesGuardadas) {
        sessoes = JSON.parse(sessoesGuardadas);
    }

    const conquistasGuardadas = localStorage.getItem('estuda_conquistas');
    if (conquistasGuardadas) {
        conquistasDesbloqueadasIds = JSON.parse(conquistasGuardadas);
    } else {
        verificarNovasConquistas();
    }

    if (!perfilUtilizador) {
        abrirEdicaoPerfil();
    } else {
        aplicarNomenclaturaEnsino();
        voltarPrincipal();
    }
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

// --- 6. Funções das Disciplinas / Cadeiras ---
function adicionarDisciplina() {
    const termos = obterTermosEnsino();
    const inputNome = document.getElementById('nova-disciplina');
    const selectSemestre = document.getElementById('semestre-disciplina');
    const inputMeta = document.getElementById('meta-disciplina');
    
    const nome = inputNome.value.trim();
    const semestre = selectSemestre.value;
    const metaHoras = parseFloat(inputMeta.value) || 30;
    
    if (nome === '') {
        alert(`Escreve o nome da ${termos.singular}!`);
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
    verificarNovasConquistas();
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
    const termos = obterTermosEnsino();
    if (confirm(`Tens a certeza que queres apagar esta ${termos.singular} e todas as suas sessões?`)) {
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
    const timeline = document.getElementById('timeline-disciplinas');
    const containerBotoes = document.getElementById('botoes-selecao-disciplinas');
    const msgTopo = document.getElementById('msg-sem-disciplinas-topo');
    const msgLista = document.getElementById('msg-sem-disciplinas-lista');
    const btnIniciar = document.getElementById('btn-iniciar');
    
    timeline.innerHTML = '';
    containerBotoes.innerHTML = '';

    if (disciplinas.length === 0) {
        msgTopo.style.display = 'block';
        msgLista.style.display = 'block';
        timeline.style.display = 'none';
        btnIniciar.disabled = true;
        return;
    }

    msgTopo.style.display = 'none';
    msgLista.style.display = 'none';
    timeline.style.display = 'flex';
    btnIniciar.disabled = (disciplinaSelecionadaId === null);

    // 1. Cartões quadrados alinhados à esquerda para iniciar estudo
    disciplinas.forEach(d => {
        const isSelecionada = (d.id === disciplinaSelecionadaId);
        const btnEscolha = document.createElement('button');
        btnEscolha.className = `btn-escolha-disciplina ${isSelecionada ? 'selecionada' : ''}`;
        btnEscolha.innerHTML = `
            <span class="card-escolha-nome">${d.nome}</span>
            <span class="card-escolha-tempo">⏱️ ${formatarTempo(d.tempoTotal || 0)}</span>
        `;
        btnEscolha.onclick = () => selecionarDisciplinaParaEstudar(d.id);
        containerBotoes.appendChild(btnEscolha);
    });

    // 2. Linha Temporal agrupada por Semestre
    const ordemSemestres = ["1.º Semestre", "2.º Semestre", "Anual"];
    ordemSemestres.forEach(semestreNome => {
        const materiasDoSemestre = disciplinas.filter(d => (d.semestre || "1.º Semestre") === semestreNome);
        
        if (materiasDoSemestre.length > 0) {
            const bloco = document.createElement('div');
            bloco.className = 'timeline-bloco';

            let itensHtml = '';
            materiasDoSemestre.forEach(d => {
                const metaH = Math.round((d.metaSegundos || 30 * 3600) / 3600);
                itensHtml += `
                    <li class="disciplina-item" onclick="abrirRelatorio(${d.id})">
                        <div class="disciplina-info">
                            <strong>${d.nome}</strong>
                            <span class="disciplina-subtexto">${formatarTempo(d.tempoTotal || 0)} de ${metaH}h</span>
                        </div>
                        <button class="btn-seta" title="Ver relatório">➔</button>
                    </li>
                `;
            });

            bloco.innerHTML = `
                <div class="timeline-ponto"></div>
                <div class="timeline-cabecalho">${semestreNome}</div>
                <ul class="timeline-lista">${itensHtml}</ul>
            `;
            timeline.appendChild(bloco);
        }
    });
}

// --- 7. Formatação e Navegação ---
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
    document.getElementById('ecra-login').style.display = 'none';
    document.getElementById('ecra-principal').style.display = 'none';
    document.getElementById('ecra-relatorio').style.display = 'none';
    document.getElementById('ecra-historico').style.display = 'none';
    document.getElementById('ecra-perfil').style.display = 'none';
    document.getElementById('ecra-foco').style.display = 'none';
}

function voltarPrincipal() {
    esconderTodosEcras();
    document.getElementById('app-header').style.display = 'block';
    if (perfilUtilizador) {
        document.getElementById('btn-abrir-perfil').style.display = 'inline-block';
        document.getElementById('header-saudacao').style.display = 'block';
    }
    document.getElementById('ecra-principal').style.display = 'block';
    disciplinaRelatorioAtualId = null;
    atualizarInterface();
}

// --- 8. Página de Relatório & Histórico ---
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
    const termos = obterTermosEnsino();
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
        const nomeDisc = disc ? disc.nome : `${termos.singularCap} apagada`;
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
    const termos = obterTermosEnsino();
    if (confirm(`Queres eliminar esta sessão de estudo? O tempo será descontado da ${termos.singular}.`)) {
        sessoes = sessoes.filter(s => s.id !== sessaoId);
        sincronizarTemposDisciplinas();

        if (disciplinaRelatorioAtualId !== null) {
            abrirRelatorio(disciplinaRelatorioAtualId);
        } else {
            abrirHistoricoGeral();
        }
    }
}

// --- 9. Notificação Animada de Conquista ---
function mostrarToastConquista(nomeDisciplina, segundos, novaConquista) {
    const toast = document.getElementById('toast-conquista');
    const titulo = document.getElementById('toast-titulo');
    const mensagem = document.getElementById('toast-mensagem');

    if (novaConquista) {
        titulo.innerText = `Conquista: ${novaConquista.titulo}!`;
        mensagem.innerText = `+${formatarTempo(segundos)} em ${nomeDisciplina} • ${novaConquista.desc}`;
    } else {
        const frases = [
            "Excelente foco! Mais um passo dado.",
            "Sessão concluída! Continua assim.",
            "Ótimo trabalho! O esforço compensa.",
            "Missão cumprida! Mais perto da tua meta."
        ];
        titulo.innerText = frases[Math.floor(Math.random() * frases.length)];
        mensagem.innerText = `+${formatarTempo(segundos)} registados em ${nomeDisciplina}!`;
    }

    toast.classList.add('visivel');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        fecharToastConquista();
    }, 5000);
}

function fecharToastConquista() {
    document.getElementById('toast-conquista').classList.remove('visivel');
}

// --- 10. Modo Foco & Cronómetro com Pausa ---
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
        const novaConquista = verificarNovasConquistas();
        mostrarToastConquista(disciplina.nome, segundosDecorridos, novaConquista);
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

// Iniciar a app
carregarDados();