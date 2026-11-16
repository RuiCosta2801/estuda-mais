// --- 1. Registo do Service Worker com Auto-Atualização ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registo) => {
            registo.update();
        }).catch((erro) => console.error('Erro SW:', erro));

        let aRecarregar = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!aRecarregar) {
                aRecarregar = true;
                window.location.reload();
            }
        });
    });
}

// --- 2. Variáveis Globais ---
let perfilUtilizador = null; // { nome, dataNascimento, nivel, ano }
let disciplinas = [];
let sessoes = [];
let conquistasDesbloqueadasIds = [];
let disciplinaSelecionadaId = null;
let disciplinaRelatorioAtualId = null;

// Controlo do Cronómetro, Pausa e Proteção de Foco
let tempoIntervalo = null;
let horaInicio = null;
let tempoAcumuladoAntesPausa = 0;
let estaEmPausa = false;
let segundosDecorridos = 0;
let toastTimeout = null;
let wakeLock = null;
let momentoSaidaApp = null;
let segundosForaDaApp = 0;

// --- 3. Proteção Durante Sessão Ativa (Sem Pausa) ---
window.addEventListener('beforeunload', (e) => {
    if (horaInicio !== null && !estaEmPausa) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('visibilitychange', () => {
    if (horaInicio !== null && !estaEmPausa) {
        if (document.hidden) {
            momentoSaidaApp = Date.now();
        } else {
            // Reativar WakeLock ao regressar à aplicação
            ativarWakeLock();

            if (momentoSaidaApp !== null) {
                const diffSeg = Math.floor((Date.now() - momentoSaidaApp) / 1000);
                momentoSaidaApp = null;
                if (diffSeg >= 3) {
                    segundosForaDaApp += diffSeg;
                    const avisoEl = document.getElementById('foco-aviso-saida');
                    avisoEl.innerText = `Saíste da aplicação durante ${formatarTempo(segundosForaDaApp)} sem pausar.`;
                    avisoEl.style.display = 'block';
                }
            }
        }
    }
});

// --- 4. Gestão de Perfil e Início de Sessão ---
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
        isSuperior: isSuperior,
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
    
    const grupoPeriodoHoras = document.getElementById('grupo-periodo-horas');
    const selectSemestre = document.getElementById('semestre-disciplina');
    const ajudaMeta = document.getElementById('texto-ajuda-meta');

    if (termos.isSuperior) {
        grupoPeriodoHoras.className = 'form-linha-dupla';
        selectSemestre.style.display = 'block';
        selectSemestre.innerHTML = `
            <option value="1.º Semestre">1.º Semestre</option>
            <option value="2.º Semestre">2.º Semestre</option>
        `;
        ajudaMeta.innerText = "Horas semanais esperadas (calculado automaticamente para um semestre de 15 semanas).";
    } else {
        grupoPeriodoHoras.className = 'form-linha-unica';
        selectSemestre.style.display = 'none';
        selectSemestre.innerHTML = `<option value="Anual">Anual</option>`;
        ajudaMeta.innerText = "Horas semanais esperadas (calculado automaticamente para um ano letivo de 30 semanas).";
    }

    document.getElementById('titulo-comparacao-materias').innerText = `Comparação entre ${termos.pluralCap}`;
    document.getElementById('titulo-sessoes-materia').innerText = `Sessões desta ${termos.singularCap}`;
    document.getElementById('btn-apagar-relatorio').innerText = `✕ Apagar esta ${termos.singular}`;
}

// --- 5. Sistema de Conquistas (Semanais & Longo Prazo) ---
function obterInicioSemana(dataObj) {
    const d = new Date(dataObj);
    const diaSemana = d.getDay(); // 0 = Domingo, 1 = Segunda...
    const diffSegunda = (diaSemana === 0 ? -6 : 1) - diaSemana;
    d.setDate(d.getDate() + diffSegunda);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

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

function avaliarMetricasSemanais() {
    const inicioSemanaAtual = obterInicioSemana(new Date());
    const msSemana = 7 * 24 * 3600 * 1000;

    let algumaMetaSemanalCumprida = false;
    let disciplinaMetaSemanal = null;
    let superacaoSemanal = false;
    let disciplinaSuperacao = null;
    let quatroSemanasSeguidas = false;
    let disciplinaQuatroSemanas = null;

    disciplinas.forEach(d => {
        const metaSemanalSeg = (d.horasSemanais || 2) * 3600;
        const sessoesDisc = sessoes.filter(s => s.disciplinaId === d.id);

        const tempoSemanaAtual = sessoesDisc
            .filter(s => obterInicioSemana(s.data) === inicioSemanaAtual)
            .reduce((soma, s) => soma + s.duracaoSegundos, 0);

        if (tempoSemanaAtual >= metaSemanalSeg) {
            algumaMetaSemanalCumprida = true;
            if (!disciplinaMetaSemanal) disciplinaMetaSemanal = d;
        }

        if (tempoSemanaAtual >= metaSemanalSeg * 1.5) {
            superacaoSemanal = true;
            if (!disciplinaSuperacao) disciplinaSuperacao = d;
        }

        let cumpriu4Semanas = true;
        for (let w = 0; w < 4; w++) {
            const alvoSemana = inicioSemanaAtual - (w * msSemana);
            const tempoNaquelaSemana = sessoesDisc
                .filter(s => obterInicioSemana(s.data) === alvoSemana)
                .reduce((soma, s) => soma + s.duracaoSegundos, 0);
            if (tempoNaquelaSemana < metaSemanalSeg) {
                cumpriu4Semanas = false;
                break;
            }
        }
        if (cumpriu4Semanas) {
            quatroSemanasSeguidas = true;
            if (!disciplinaQuatroSemanas) disciplinaQuatroSemanas = d;
        }
    });

    const todasCumpridasEstaSemana = disciplinas.length > 0 && disciplinas.every(d => {
        const metaSemanalSeg = (d.horasSemanais || 2) * 3600;
        const tempoSemanaAtual = sessoes
            .filter(s => s.disciplinaId === d.id && obterInicioSemana(s.data) === inicioSemanaAtual)
            .reduce((soma, s) => soma + s.duracaoSegundos, 0);
        return tempoSemanaAtual >= metaSemanalSeg;
    });

    return {
        algumaMetaSemanalCumprida,
        disciplinaMetaSemanal,
        todasCumpridasEstaSemana,
        superacaoSemanal,
        disciplinaSuperacao,
        quatroSemanasSeguidas,
        disciplinaQuatroSemanas
    };
}

function avaliarTodasConquistas() {
    const termos = obterTermosEnsino();
    const tempoTotalGlobal = disciplinas.reduce((soma, d) => soma + (d.tempoTotal || 0), 0);
    const maxSessao = sessoes.reduce((max, s) => Math.max(max, s.duracaoSegundos || 0), 0);
    const diasSeguidos = calcularDiasSeguidos();
    const sem = avaliarMetricasSemanais();

    const disc10h = disciplinas.find(d => (d.tempoTotal || 0) >= 10 * 3600);
    const disc50h = disciplinas.find(d => (d.tempoTotal || 0) >= 50 * 3600);
    const disc100h = disciplinas.find(d => (d.tempoTotal || 0) >= 100 * 3600);
    const discMetaPeriodoCumprida = disciplinas.find(d => (d.tempoTotal || 0) >= (d.metaSegundos || 30 * 3600));

    return [
        {
            id: 'primeira_sessao',
            simbolo: '01',
            titulo: 'Primeiro Passo',
            desc: 'Conclui a tua primeira sessão de estudo.',
            desbloqueada: sessoes.length >= 1,
            extra: ''
        },
        {
            id: 'meta_semanal_1',
            simbolo: '1S',
            titulo: 'Meta Semanal',
            desc: `Cumpre as horas semanais de uma ${termos.singular} esta semana.`,
            desbloqueada: sem.algumaMetaSemanalCumprida,
            extra: sem.disciplinaMetaSemanal ? `Obtido em: ${sem.disciplinaMetaSemanal.nome}` : ''
        },
        {
            id: 'semana_perfeita',
            simbolo: '100%',
            titulo: 'Semana Perfeita',
            desc: `Cumpre a meta semanal de todas as tuas ${termos.plural} na mesma semana.`,
            desbloqueada: sem.todasCumpridasEstaSemana,
            extra: ''
        },
        {
            id: 'superacao_semanal',
            simbolo: '+50%',
            titulo: 'Superação Semanal',
            desc: `Ultrapassa em 50% a meta semanal de uma ${termos.singular}.`,
            desbloqueada: sem.superacaoSemanal,
            extra: sem.disciplinaSuperacao ? `Obtido em: ${sem.disciplinaSuperacao.nome}` : ''
        },
        {
            id: 'quatro_semanas',
            simbolo: '4S',
            titulo: 'Ritmo Imparável',
            desc: `Cumpre a meta semanal de uma ${termos.singular} durante 4 semanas seguidas.`,
            desbloqueada: sem.quatroSemanasSeguidas,
            extra: sem.disciplinaQuatroSemanas ? `Obtido em: ${sem.disciplinaQuatroSemanas.nome}` : ''
        },
        {
            id: 'streak_7',
            simbolo: '7D',
            titulo: 'Semana Dedicada',
            desc: 'Estuda todos os dias durante 7 dias consecutivos.',
            desbloqueada: diasSeguidos >= 7,
            extra: ''
        },
        {
            id: 'streak_30',
            simbolo: '30D',
            titulo: 'Hábito de Ferro',
            desc: 'Estuda todos os dias durante 30 dias consecutivos.',
            desbloqueada: diasSeguidos >= 30,
            extra: ''
        },
        {
            id: 'foco_2h',
            simbolo: '2H',
            titulo: 'Mente Inabalável',
            desc: 'Completa uma sessão contínua de 2 horas sem interrupções.',
            desbloqueada: maxSessao >= 7200,
            extra: ''
        },
        {
            id: 'foco_4h',
            simbolo: '4H',
            titulo: 'Ultra-Maratona',
            desc: 'Completa uma sessão contínua de 4 horas num único bloco.',
            desbloqueada: maxSessao >= 14400,
            extra: ''
        },
        {
            id: 'materia_10h',
            simbolo: '10H',
            titulo: 'Base Sólida',
            desc: `Acumula 10 horas de estudo numa só ${termos.singular}.`,
            desbloqueada: !!disc10h,
            extra: disc10h ? `Obtido em: ${disc10h.nome}` : ''
        },
        {
            id: 'materia_50h',
            simbolo: '50H',
            titulo: 'Especialista',
            desc: `Acumula 50 horas de dedicação numa só ${termos.singular}.`,
            desbloqueada: !!disc50h,
            extra: disc50h ? `Obtido em: ${disc50h.nome}` : ''
        },
        {
            id: 'materia_100h',
            simbolo: '100H',
            titulo: `Mestre da ${termos.singularCap}`,
            desc: `Acumula 100 horas numa única ${termos.singular}.`,
            desbloqueada: !!disc100h,
            extra: disc100h ? `Obtido em: ${disc100h.nome}` : ''
        },
        {
            id: 'meta_periodo',
            simbolo: '✓',
            titulo: 'Período Concluído',
            desc: `Atinge 100% da meta total do semestre/ano numa ${termos.singular}.`,
            desbloqueada: !!discMetaPeriodoCumprida,
            extra: discMetaPeriodoCumprida ? `Concluído: ${discMetaPeriodoCumprida.nome}` : ''
        },
        {
            id: 'total_100h',
            simbolo: 'I',
            titulo: 'Centurião',
            desc: 'Atinge 100 horas totais acumuladas de estudo.',
            desbloqueada: tempoTotalGlobal >= 100 * 3600,
            extra: ''
        },
        {
            id: 'total_250h',
            simbolo: 'II',
            titulo: 'Veterano',
            desc: 'Atinge 250 horas totais acumuladas de estudo.',
            desbloqueada: tempoTotalGlobal >= 250 * 3600,
            extra: ''
        },
        {
            id: 'total_500h',
            simbolo: 'III',
            titulo: 'Mestre do Foco',
            desc: 'Atinge a marca histórica de 500 horas totais de estudo.',
            desbloqueada: tempoTotalGlobal >= 500 * 3600,
            extra: ''
        },
        {
            id: 'total_1000h',
            simbolo: 'IV',
            titulo: 'Lenda Académica',
            desc: 'Alcança 1000 horas totais de estudo registadas.',
            desbloqueada: tempoTotalGlobal >= 1000 * 3600,
            extra: ''
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
                    <span class="conquista-simbolo">${c.simbolo}</span>
                    ${c.desbloqueada ? '<span class="conquista-status">✓ Obtida</span>' : ''}
                </div>
                <span class="conquista-titulo">${c.titulo}</span>
                <span class="conquista-desc">${c.desc}</span>
                ${extraHtml}
            </div>
        `;
    });
}

// --- 6. Carregar e Guardar Dados ---
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

// --- 7. Funções das Disciplinas / Cadeiras ---
function adicionarDisciplina() {
    const termos = obterTermosEnsino();
    const inputNome = document.getElementById('nova-disciplina');
    const selectSemestre = document.getElementById('semestre-disciplina');
    const inputMetaSemanal = document.getElementById('meta-disciplina');
    
    const nome = inputNome.value.trim();
    const periodo = termos.isSuperior ? selectSemestre.value : 'Anual';
    const horasSemanais = parseFloat(inputMetaSemanal.value) || 2;
    
    const semanasPeriodo = (periodo === 'Anual') ? 30 : 15;
    const metaTotalHoras = horasSemanais * semanasPeriodo;
    
    if (nome === '') {
        alert(`Escreve o nome da ${termos.singular}!`);
        return;
    }

    const nova = {
        id: Date.now(),
        nome: nome,
        semestre: periodo,
        horasSemanais: horasSemanais,
        metaSegundos: metaTotalHoras * 3600,
        tempoTotal: 0
    };

    disciplinas.push(nova);
    guardarDados();
    verificarNovasConquistas();
    atualizarInterface();
    inputNome.value = '';
    inputMetaSemanal.value = '';
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

function atualizarResumoTopo() {
    const hojeStr = new Date().toISOString().slice(0, 10);
    const inicioSemana = obterInicioSemana(new Date());

    const segHoje = sessoes
        .filter(s => new Date(s.data).toISOString().slice(0, 10) === hojeStr)
        .reduce((soma, s) => soma + s.duracaoSegundos, 0);

    const segSemana = sessoes
        .filter(s => obterInicioSemana(s.data) === inicioSemana)
        .reduce((soma, s) => soma + s.duracaoSegundos, 0);

    const streak = calcularDiasSeguidos();

    document.getElementById('resumo-hoje').innerText = formatarTempo(segHoje);
    document.getElementById('resumo-semana').innerText = formatarTempo(segSemana);
    document.getElementById('resumo-streak').innerText = streak === 1 ? '1 dia' : `${streak} dias`;
}

function atualizarInterface() {
    atualizarResumoTopo();

    const termos = obterTermosEnsino();
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

    disciplinas.forEach(d => {
        const isSelecionada = (d.id === disciplinaSelecionadaId);
        const btnEscolha = document.createElement('button');
        btnEscolha.className = `btn-escolha-disciplina ${isSelecionada ? 'selecionada' : ''}`;
        btnEscolha.innerHTML = `
            <span class="card-escolha-nome">${d.nome}</span>
            <span class="card-escolha-tempo">${formatarTempo(d.tempoTotal || 0)}</span>
        `;
        btnEscolha.onclick = () => selecionarDisciplinaParaEstudar(d.id);
        containerBotoes.appendChild(btnEscolha);
    });

    const ordemPeriodos = termos.isSuperior 
        ? ["1.º Semestre", "2.º Semestre", "Anual"] 
        : ["Anual", "1.º Semestre", "2.º Semestre"];

    ordemPeriodos.forEach(periodoNome => {
        const materiasDoPeriodo = disciplinas.filter(d => (d.semestre || (termos.isSuperior ? "1.º Semestre" : "Anual")) === periodoNome);
        
        if (materiasDoPeriodo.length > 0) {
            const bloco = document.createElement('div');
            bloco.className = 'timeline-bloco';

            let itensHtml = '';
            materiasDoPeriodo.forEach(d => {
                const metaH = Math.round((d.metaSegundos || 30 * 3600) / 3600);
                const infoSemanal = d.horasSemanais ? ` • ${d.horasSemanais}h/sem` : '';
                itensHtml += `
                    <li class="disciplina-item" onclick="abrirRelatorio(${d.id})">
                        <div class="disciplina-info">
                            <strong>${d.nome}</strong>
                            <span class="disciplina-subtexto">${formatarTempo(d.tempoTotal || 0)} de ${metaH}h${infoSemanal}</span>
                        </div>
                        <button class="btn-seta" title="Ver relatório">→</button>
                    </li>
                `;
            });

            bloco.innerHTML = `
                <div class="timeline-ponto"></div>
                <div class="timeline-cabecalho">${periodoNome}</div>
                <ul class="timeline-lista">${itensHtml}</ul>
            `;
            timeline.appendChild(bloco);
        }
    });
}

// --- 8. Formatação e Navegação ---
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
    document.body.classList.remove('modo-foco-ativo');
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

// --- 9. Página de Relatório, Edição e Registo Manual ---
function alternarFormularioEdicaoDisciplina() {
    const box = document.getElementById('box-editar-disciplina');
    if (box.style.display === 'none') {
        const d = disciplinas.find(item => item.id === disciplinaRelatorioAtualId);
        if (!d) return;
        
        const termos = obterTermosEnsino();
        document.getElementById('edit-disc-nome').value = d.nome;
        document.getElementById('edit-disc-horas').value = d.horasSemanais || 2;
        
        const grupo = document.getElementById('edit-grupo-periodo-horas');
        const selSem = document.getElementById('edit-disc-semestre');
        if (termos.isSuperior) {
            grupo.className = 'form-linha-dupla';
            selSem.style.display = 'block';
            selSem.value = d.semestre || '1.º Semestre';
        } else {
            grupo.className = 'form-linha-unica';
            selSem.style.display = 'none';
        }
        
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
}

function guardarEdicaoDisciplina() {
    const d = disciplinas.find(item => item.id === disciplinaRelatorioAtualId);
    if (!d) return;

    const termos = obterTermosEnsino();
    const novoNome = document.getElementById('edit-disc-nome').value.trim();
    const novasHorasSemanais = parseFloat(document.getElementById('edit-disc-horas').value) || 2;
    const novoSemestre = termos.isSuperior ? document.getElementById('edit-disc-semestre').value : 'Anual';

    if (novoNome === '') {
        alert("O nome não pode ficar vazio!");
        return;
    }

    const semanasPeriodo = (novoSemestre === 'Anual') ? 30 : 15;
    d.nome = novoNome;
    d.semestre = novoSemestre;
    d.horasSemanais = novasHorasSemanais;
    d.metaSegundos = (novasHorasSemanais * semanasPeriodo) * 3600;

    guardarDados();
    document.getElementById('box-editar-disciplina').style.display = 'none';
    abrirRelatorio(d.id);
}

function alternarFormularioManual() {
    const box = document.getElementById('box-registo-manual');
    if (box.style.display === 'none') {
        document.getElementById('manual-horas').value = '';
        document.getElementById('manual-minutos').value = '';
        document.getElementById('manual-nota').value = '';
        document.getElementById('manual-data').value = new Date().toISOString().slice(0, 10);
        box.style.display = 'block';
    } else {
        box.style.display = 'none';
    }
}

function guardarSessaoManual() {
    const horas = parseInt(document.getElementById('manual-horas').value, 10) || 0;
    const minutos = parseInt(document.getElementById('manual-minutos').value, 10) || 0;
    const dataStr = document.getElementById('manual-data').value;
    const nota = document.getElementById('manual-nota').value.trim();

    const totalSegundos = (horas * 3600) + (minutos * 60);
    if (totalSegundos <= 0) {
        alert("Indica pelo menos 1 minuto de estudo.");
        return;
    }

    const disciplina = disciplinas.find(d => d.id === disciplinaRelatorioAtualId);
    if (!disciplina) return;

    const dataIso = dataStr ? new Date(dataStr + 'T12:00:00').toISOString() : new Date().toISOString();

    sessoes.push({
        id: Date.now(),
        disciplinaId: disciplina.id,
        data: dataIso,
        duracaoSegundos: totalSegundos,
        nota: nota ? `${nota} (Manual)` : 'Registo manual'
    });

    sincronizarTemposDisciplinas();
    const novaConquista = verificarNovasConquistas();
    mostrarToastConquista(disciplina.nome, totalSegundos, novaConquista);
    
    document.getElementById('box-registo-manual').style.display = 'none';
    abrirRelatorio(disciplina.id);
}

function abrirRelatorio(id) {
    const disciplina = disciplinas.find(d => d.id === id);
    if (!disciplina) return;

    disciplinaRelatorioAtualId = id;
    esconderTodosEcras();
    document.getElementById('box-editar-disciplina').style.display = 'none';
    document.getElementById('box-registo-manual').style.display = 'none';
    document.getElementById('ecra-relatorio').style.display = 'block';

    // Cálculo Semanal
    const inicioSemanaAtual = obterInicioSemana(new Date());
    const metaSemanalSeg = (disciplina.horasSemanais || 2) * 3600;
    const estudadoSemanaSeg = sessoes
        .filter(s => s.disciplinaId === disciplina.id && obterInicioSemana(s.data) === inicioSemanaAtual)
        .reduce((soma, s) => soma + s.duracaoSegundos, 0);
    const percSemanal = Math.min(100, Math.round((estudadoSemanaSeg / metaSemanalSeg) * 100));

    document.getElementById('rel-semanal-detalhe').innerText = `${formatarTempo(estudadoSemanaSeg)} / ${Math.round(metaSemanalSeg / 3600)}h`;
    document.getElementById('rel-semanal-percentagem').innerText = `${percSemanal}%`;
    document.getElementById('rel-semanal-barra').style.width = `${percSemanal}%`;

    // Cálculo Total do Período
    const metaSeg = disciplina.metaSegundos || (30 * 3600);
    const estudadoSeg = disciplina.tempoTotal || 0;
    const faltaSeg = Math.max(0, metaSeg - estudadoSeg);
    const percentagem = Math.min(100, Math.round((estudadoSeg / metaSeg) * 100));

    document.getElementById('rel-semestre').innerText = disciplina.semestre || 'Anual';
    const semanalBadge = document.getElementById('rel-semanal-badge');
    if (disciplina.horasSemanais) {
        semanalBadge.innerText = `${disciplina.horasSemanais}h / semana`;
        semanalBadge.style.display = 'inline-block';
    } else {
        semanalBadge.style.display = 'none';
    }

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
            ? `${formatarTempo(s.duracaoSegundos)}` 
            : `${nomeDisc} • ${formatarTempo(s.duracaoSegundos)}`;

        const notaHtml = s.nota ? `<span class="sessao-nota">"${s.nota}"</span>` : '';

        const li = document.createElement('li');
        li.className = 'sessao-item';
        li.innerHTML = `
            <div class="sessao-detalhes">
                <span class="sessao-titulo">${tituloLinha}</span>
                <span class="sessao-meta">${formatarDataHora(s.data)}</span>
                ${notaHtml}
            </div>
            <button class="btn-apagar-sessao" onclick="eliminarSessao(${s.id})" title="Eliminar sessão">✕</button>
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

// --- 10. Notificação Animada de Conquista + Vibração ---
function mostrarToastConquista(nomeDisciplina, segundos, novaConquista) {
    const toast = document.getElementById('toast-conquista');
    const titulo = document.getElementById('toast-titulo');
    const mensagem = document.getElementById('toast-mensagem');

    if (novaConquista) {
        titulo.innerText = `Conquista: ${novaConquista.titulo}`;
        mensagem.innerText = `+${formatarTempo(segundos)} em ${nomeDisciplina} • ${novaConquista.desc}`;
        if ('vibrate' in navigator) navigator.vibrate([120, 60, 180]);
    } else {
        const frases = [
            "Excelente foco! Mais um passo dado.",
            "Sessão concluída! Continua assim.",
            "Ótimo trabalho! O esforço compensa.",
            "Missão cumprida! Mais perto da tua meta."
        ];
        titulo.innerText = frases[Math.floor(Math.random() * frases.length)];
        mensagem.innerText = `+${formatarTempo(segundos)} registados em ${nomeDisciplina}.`;
        if ('vibrate' in navigator) navigator.vibrate(80);
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

// --- 11. Modo Foco & Cronómetro com Pausa ---
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
    document.body.classList.add('modo-foco-ativo');
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('ecra-foco').style.display = 'flex';

    document.getElementById('foco-semestre').innerText = disciplina.semestre || 'Anual';
    document.getElementById('foco-titulo').innerText = disciplina.nome;
    document.getElementById('foco-nota').value = '';
    
    const avisoEl = document.getElementById('foco-aviso-saida');
    avisoEl.style.display = 'none';
    avisoEl.innerText = '';
    
    horaInicio = Date.now();
    tempoAcumuladoAntesPausa = 0;
    estaEmPausa = false;
    segundosDecorridos = 0;
    momentoSaidaApp = null;
    segundosForaDaApp = 0;

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