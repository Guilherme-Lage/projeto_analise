let itens = [];
let ocultar = true;
let idxModalAtual = -1;
let ultimaLocacaoClicada = "";
let ocultarAlertas = false; 
let contextoAnterior = null; // { tipo, valor } — para voltar após confirmar'
//  MODAL 
function abrirModal(globalIdx) {
    try {
        idxModalAtual = globalIdx;
        const item = itens[globalIdx];

        // 1. Data e hora
        const agora = new Date();
        const dt = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('modal-datetime').textContent = dt;

        // 2. Preencher Locação (RECUPERA O QUE ESTÁ NA TABELA)
        const elLoc = document.getElementById('modal-locacao');
        if (elLoc) elLoc.value = item.locacao || ''; // Aqui ele volta a mostrar o valor atual

        // 3. Preencher Código e Nome
        document.getElementById('modal-cod-nome').textContent = `${item.codigo} — ${item.nome}`;

        // 4. Marca e GTIN Novo
        document.getElementById('modal-marca').value = item.marca || '';
        document.getElementById('modal-gtin-novo').value = item.gtinNovo || '';

        // 5. GTIN Original
        const elGtinAntigo = document.getElementById('modal-gtin-antigo');
        if (elGtinAntigo) elGtinAntigo.textContent = item.gtinAntigo || '---';

        // 6. Quantidade (ESTA SIM SEMPRE VEM ZERADA)
        const elQtd = document.getElementById('modal-qtdo');
        if (elQtd) elQtd.value = item.qtdConferida != null ? item.qtdConferida : '';

        // 7. Fotos — renderiza galeria
        renderizarGaleria(item.fotos || []);

        // 8. Botão Confirmar
        const btnConf = document.getElementById('modal-btn-confirmar');
        if (item.conferido) {
            btnConf.textContent = 'Desmarcar';
            btnConf.classList.add('ja-conferido');
        } else {
            btnConf.textContent = 'Confirmar';
            btnConf.classList.remove('ja-conferido');
        }

        // 9. Abrir e Focar na Quantidade
        document.getElementById('modal-overlay').classList.add('aberto');
        setTimeout(() => {
            const elGtinNovo = document.getElementById('modal-gtin-novo');
            if (elGtinNovo) {
                elGtinNovo.focus();
                elGtinNovo.select();
            }
        }, 150);

    } catch (erro) {
        console.error("Erro ao abrir modal:", erro);
    }
}



function fecharModal() {
    document.getElementById('modal-overlay').classList.remove('aberto');
    // Limpa input de foto
    const fi = document.getElementById('foto-input');
    if (fi) fi.value = '';
    idxModalAtual = -1;
}

function fecharModalFora(e) {
    if (e.target === document.getElementById('modal-overlay')) fecharModal();
}

function renderizarGaleria(fotos) {
    const galeria = document.getElementById('galeria-fotos');
    if (!galeria) return;

    if (!fotos || fotos.length === 0) {
        galeria.innerHTML = '<span class="galeria-vazia">📷 Nenhuma foto</span>';
        return;
    }

    galeria.innerHTML = fotos.map((src, i) => `
        <div class="foto-thumb" title="Clique para remover">
            <img src="${src}" alt="foto ${i+1}" onclick="removerFoto(${i})">
            <button class="foto-remover" onclick="removerFoto(${i})">✕</button>
        </div>
    `).join('');
}

function removerFoto(idx) {
    if (idxModalAtual < 0) return;
    const item = itens[idxModalAtual];
    if (!item.fotos) return;
    item.fotos.splice(idx, 1);
    renderizarGaleria(item.fotos);
    localStorage.setItem('estoque_hontec_backup', JSON.stringify(itens));
}

function carregarFotos(input) {
    if (!input.files || input.files.length === 0) return;
    if (idxModalAtual < 0) return;

    const item = itens[idxModalAtual];
    if (!item.fotos) item.fotos = [];

    const arquivos = Array.from(input.files);
    let lidos = 0;

    arquivos.forEach(arquivo => {
        const reader = new FileReader();
        reader.onload = (e) => {
            item.fotos.push(e.target.result);
            lidos++;
            if (lidos === arquivos.length) {
                renderizarGaleria(item.fotos);
                localStorage.setItem('estoque_hontec_backup', JSON.stringify(itens));
            }
        };
        reader.readAsDataURL(arquivo);
    });

    input.value = ''; // Permite selecionar as mesmas fotos novamente
}
function confirmarModal() {
    if (idxModalAtual < 0) return;
    const item = itens[idxModalAtual];

    // Captura com segurança
    const elLoc = document.getElementById('modal-locacao');
    const elMarca = document.getElementById('modal-marca');
    const elGtinN = document.getElementById('modal-gtin-novo');
    const elQtd = document.getElementById('modal-qtdo');

    // SALVAMENTO: Só muda a locação se o campo não estiver em branco
    if (elLoc && elLoc.value.trim() !== "") {
        item.locacao = elLoc.value.trim().toUpperCase();
    }

    if (elMarca) item.marca = elMarca.value.trim().toUpperCase();
    if (elGtinN) item.gtinNovo = elGtinN.value.trim().toUpperCase();
    if (elQtd) item.qtdConferida = elQtd.value !== '' ? parseFloat(elQtd.value) : 0;

    item.conferido = !item.conferido;

    // Persistência no navegador
    localStorage.setItem('estoque_hontec_backup', JSON.stringify(itens));

    // --- MUDANÇAS PARA LIMPAR A PESQUISA ---
 // Volta ao contexto anterior (ex: busca de prateleira) ou lista completa
    ultimaLocacaoClicada = "";

    if (contextoAnterior) {
        document.getElementById('filtro-tipo').value = contextoAnterior.tipo;
        document.getElementById('busca').value = contextoAnterior.valor;
        filtrar();
    } else {
        document.getElementById('busca').value = "";
        document.getElementById('filtro-tipo').value = "todos";
        renderizarTabela(itens);
    }
    atualizarContador();
    fecharModal();
}




//  CSV 

function carregarCSV(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = (e) => {
        // Tenta UTF-8 primeiro; se vier com caracteres estranhos, tenta latin-1
        processarCSV(e.target.result, arquivo.name);
    };
    // Tenta latin-1 para arquivos brasileiros com acentos
    leitor.readAsText(arquivo, 'ISO-8859-1');
}

function limparAspas(val) {
    if (!val) return '';
    return val.replace(/^"|"$/g, '').trim();
}
function parseLinhaCsv(linha, sep) {
    // Parser robusto que lida com aspas, separadores dentro de aspas, etc.
    const resultado = [];
    let campo = '';
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            if (dentroAspas && linha[i + 1] === '"') { campo += '"'; i++; }
            else dentroAspas = !dentroAspas;
        } else if (c === sep && !dentroAspas) {
            resultado.push(campo.trim());
            campo = '';
        } else {
            campo += c;
        }
    }
    resultado.push(campo.trim());
    return resultado;
}

function splitLinhasCSV(texto) {
    // Reconstrói linhas que têm quebra de linha DENTRO de aspas (campo multiline)
    const linhas = [];
    let atual = '';
    let dentroAspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (c === '"') {
            dentroAspas = !dentroAspas;
            atual += c;
        } else if ((c === '\n' || (c === '\r' && texto[i + 1] === '\n')) && !dentroAspas) {
            if (c === '\r') i++;
            if (atual.trim()) linhas.push(atual);
            atual = '';
        } else {
            atual += c;
        }
    }
    if (atual.trim()) linhas.push(atual);
    return linhas;
}

function processarCSV(texto, nomeArquivo) {
    try {
        const linhas = splitLinhasCSV(texto);
        if (linhas.length < 2) { alert('Arquivo CSV vazio ou inválido.'); return; }

        // Detecta separador
        const sep = linhas[0].includes('|') ? '|' : (linhas[0].includes(';') ? ';' : ',');

        const cabecalho = parseLinhaCsv(linhas[0], sep).map(v => v.toUpperCase().trim());
        const idx = (nome) => cabecalho.findIndex(c => c.includes(nome.toUpperCase()));

        const iCodigo = idx('ITEM_ESTOQUE_PUB');
        const iNome = idx('DES_ITEM_ESTOQUE');
        const iQtd = idx('QTD_CONTABIL');
        const iZona = idx('LOCACAO_ZONA');
        const iRua = idx('LOCACAO_RUA');
        const iEstante = idx('LOCACAO_ESTANTE');
        const iPrateleira = idx('LOCACAO_PRATELEIRA');
        const iNumero = idx('LOCACAO_NUMERO');
        const iMarcaCSV = idx('MARCA');
        // Aceita COD_EAN_GTIN ou GTIN
        let iGtin = idx('COD_EAN_GTIN');
        if (iGtin < 0) iGtin = idx('GTIN');

        console.log('Colunas detectadas:', { iCodigo, iNome, iQtd, iZona, iRua, iEstante, iPrateleira, iNumero, iGtin });

        itens = [];

        for (let i = 1; i < linhas.length; i++) {
            const cols = parseLinhaCsv(linhas[i], sep);
            if (cols.length < 2) continue;

            const zona = iZona >= 0 ? cols[iZona] : '';
            const rua = iRua >= 0 ? cols[iRua] : '';
            const est = iEstante >= 0 ? cols[iEstante] : '';
            const prat = iPrateleira >= 0 ? cols[iPrateleira] : '';
            const num = iNumero >= 0 ? cols[iNumero] : '';

            const locacao = [zona, rua, est, prat, num].filter(Boolean).join('.');
            const codigo = iCodigo >= 0 ? cols[iCodigo] : `item-${i}`;
            const nome = iNome >= 0 ? cols[iNome] : '---';
            const gtin = iGtin >= 0 ? cols[iGtin] : '---';
            const marcaCSV = iMarcaCSV >= 0 ? cols[iMarcaCSV] : '';
            const qtdRaw = (iQtd >= 0 && cols[iQtd] != null) ? cols[iQtd] : '0';
            const qtd = parseFloat(qtdRaw.replace(',', '.')) || 0;

            if (!codigo) continue;

            itens.push({
                locacao: locacao.toUpperCase(),
                codigo: codigo.toUpperCase(),
                nome: nome.toUpperCase(),
                qtd: qtd,
                gtinAntigo: gtin.toUpperCase(),
                conferido: false,
                marca: marcaCSV.toUpperCase(),
                gtinNovo: '',
                qtdConferida: null,
                fotos: []
            });
        }

        itens.sort((a, b) => a.locacao.localeCompare(b.locacao, undefined, { numeric: true }));

        renderizarTabela(itens);
        atualizarContador();

        // Atualiza legenda — tenta achar o elemento, se não existir cria
        let elInfo = document.getElementById('info-arquivo');
        if (!elInfo) {
            elInfo = document.createElement('div');
            elInfo.id = 'info-arquivo';
            elInfo.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;';
            document.querySelector('.tabela-wrapper').before(elInfo);
        }
        elInfo.style.display = 'block';
        elInfo.textContent = `${nomeArquivo} — ${itens.length} itens carregados`;
        document.getElementById('btn-limpar').style.display = 'inline-block';

    } catch (erro) {
        console.error("Erro ao processar CSV:", erro);
        alert("Erro ao ler o arquivo: " + erro.message);
    }
}
function renderizarTabela(lista) {
    const corpo = document.getElementById('corpo');
    corpo.innerHTML = '';

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="6" class="estado-vazio">Nenhum item encontrado</td></tr>';
        return;
    }

    // Identifica locações que têm pelo menos um item conferido (Gera o Alerta)
    const locacoesComConferidos = [...new Set(
        itens.filter(i => i.conferido).map(i => i.locacao)
    )];

    lista.forEach((item) => {
        const globalIdx = itens.indexOf(item);
        const tr = document.createElement('tr');
        tr.id = `linha-${globalIdx}`;

        let classeQuadrado = "";
        let iconeStatus = "";
        let statusAlerta = false;

        if (item.conferido) {
            tr.classList.add('conferido');
            classeQuadrado = "ok";
            iconeStatus = "✓";
        } else if (locacoesComConferidos.includes(item.locacao)) {
            tr.classList.add('em-alerta');
            classeQuadrado = "status-pendente";
            iconeStatus = "!";
            statusAlerta = true;
        }

        // --- LÓGICA DE OCULTAR ---
        const buscaAtiva = document.getElementById('busca').value.trim() !== '';
        
        // Se NÃO houver busca, aplicamos os filtros de ocultar
        if (!buscaAtiva) {
            if (ocultar && item.conferido) {
                tr.style.display = 'none';
            }
            if (ocultarAlertas && statusAlerta && !item.conferido) {
                tr.style.display = 'none';
            }
        }

        tr.onclick = () => gerenciarCliqueItem(globalIdx);

        tr.innerHTML = `
            <td class="col-status">
                <div class="quadrado ${classeQuadrado}" id="q-${globalIdx}">
                    ${iconeStatus}
                </div>
            </td>
            <td class="col-locacao">${item.locacao || '---'}</td>
            <td class="col-marca">${item.marca || '---'}</td> 
            <td class="col-codigo">${item.codigo}</td>
            <td class="col-nome">${item.nome}</td>
            <td class="col-gtin">${item.gtinNovo || item.gtinAntigo || '---'}</td>
        `;
        corpo.appendChild(tr);
    });

    if (typeof atualizarContador === "function") atualizarContador();
}



function atualizarContador() {
    const conf = itens.filter(i => i.conferido).length;
    const total = itens.length;
    document.getElementById('cnt-conf').textContent = conf;
    document.getElementById('cnt-total').textContent = total;

    const el = document.getElementById('contador');
    if (total === 0) return;
    if (conf === 0) {
        el.style.background = '#fff0f0'; el.style.color = '#CC0000'; el.style.borderColor = '#CC0000';
    } else if (conf === total) {
        el.style.background = '#edf7f0'; el.style.color = '#2d7a4a'; el.style.borderColor = '#2d7a4a';
    } else {
        el.style.background = '#fff9eb'; el.style.color = '#f39c12'; el.style.borderColor = '#f39c12';
    }
}

function filtrar() {
    const buscaRaw = document.getElementById('busca').value.trim();
    const busca = buscaRaw.toLowerCase();
    const tipo = document.getElementById('filtro-tipo').value;

    // Se limpar a busca, resetamos o rastreio de locação clicada
    if (busca === '') {
        ultimaLocacaoClicada = ""; 
        contextoAnterior = null;
        renderizarTabela(itens);
        return;
    }

    const filtrados = itens.filter(i => {
        const loc   = (i.locacao || '').toLowerCase();
        const cod   = (i.codigo || '').toLowerCase();
        const nome  = (i.nome || '').toLowerCase();
        const marca = (i.marca || '').toLowerCase();
         if (tipo === 'prateleira') return loc.includes(busca);
        const gtin  = (i.gtinOriginal || '').toLowerCase() + (i.gtinNovo || '').toLowerCase();

        if (tipo === 'locacao') return loc.includes(busca);
        if (tipo === 'codigo')  return cod.includes(busca);
        if (tipo === 'nome')    return nome.includes(busca);
        if (tipo === 'marca')   return marca.includes(busca);
        if (tipo === 'gtin')    return gtin.includes(busca);

        // Busca Global
        return loc.includes(busca) || cod.includes(busca) || nome.includes(busca) || marca.includes(busca) || gtin.includes(busca);
    });

    renderizarTabela(filtrados);
}



function alternarConferidos() {
    ocultar = !ocultar;
    document.getElementById('btn-ocultar').textContent = ocultar ? 'Mostrar Todos' : 'Ocultar Conferidos';
    document.querySelectorAll('#corpo tr').forEach(tr => {
        const idx = parseInt(tr.id?.replace('linha-', ''));
        if (isNaN(idx)) return;
        tr.style.display = (ocultar && itens[idx]?.conferido) ? 'none' : '';
    });
}

function exportarCSV() {
    if (itens.length === 0) { alert('Carregue um arquivo primeiro!'); return; }

    const linhas = ['STATUS|MARCA|CODIGO|NOME|QUANTIDADE|QTD_CONFERIDA|GTIN_ANTIGO|GTIN_NOVO|LOCACAO|QTD_FOTOS|FOTOS'];
    itens.forEach(i => {
        const qtdC = i.qtdConferida != null ? i.qtdConferida : '';
        const fotos = (i.fotos && i.fotos.length > 0) ? i.fotos.join(';;') : '';
        const qtdFotos = i.fotos ? i.fotos.length : 0;
        linhas.push(`${i.conferido ? 'OK' : 'PENDENTE'}|${i.marca}|${i.codigo}|${i.nome}|${i.qtd}|${qtdC}|${i.gtinAntigo || ''}|${i.gtinNovo || ''}|${i.locacao}|${qtdFotos}|${fotos}`);
    });

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'estoque_conferido.csv';
    link.click();
}
window.onload = () => {
    try {
        const backup = localStorage.getItem('estoque_hontec_backup');
        if (backup) {
            if (confirm("Encontramos uma conferência em andamento. Deseja restaurar os dados?")) {
                itens = JSON.parse(backup);
                renderizarTabela(itens);
                atualizarContador();
                document.getElementById('btn-limpar').style.display = 'inline-block';
                const elInfo = document.getElementById('info-arquivo');
                if (elInfo) elInfo.textContent = "Dados restaurados da memória local";
            }
        }
    } catch (e) {
        console.warn("Erro ao restaurar backup:", e);
        localStorage.removeItem('estoque_hontec_backup');
    }
};
function limpar() {
    if (!confirm("Isso apagará todo o progresso atual. Confirmar?")) return;
    localStorage.removeItem('estoque_hontec_backup');

    itens = [];
    document.getElementById('corpo').innerHTML = '<tr><td colspan="5" class="estado-vazio">Nenhum arquivo carregado — clique em Abrir CSV</td></tr>';
    document.getElementById('info-arquivo').textContent = 'Nenhum arquivo carregado';
    document.getElementById('contador').style.display = 'none';
    document.getElementById('btn-limpar').style.display = 'none';
    document.getElementById('busca').value = '';
    document.getElementById('entrada-arquivo').value = '';
}


document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
});

function gerenciarCliqueItem(globalIdx) {
    const item = itens[globalIdx];
    const campoBusca = document.getElementById('busca');
    const seletorFiltro = document.getElementById('filtro-tipo');

    if (ultimaLocacaoClicada !== item.locacao) {
        // 1º clique: salva contexto atual ANTES de mudar, depois filtra por locação
        const tipoAtual = seletorFiltro.value;
        const valorAtual = campoBusca.value.trim();

        // Só salva se for busca de prateleira (para poder voltar)
        if (tipoAtual === 'prateleira' && valorAtual !== '') {
            contextoAnterior = { tipo: tipoAtual, valor: valorAtual };
        } else if (tipoAtual !== 'locacao') {
            // qualquer outra busca ativa: salva também
            contextoAnterior = valorAtual !== '' ? { tipo: tipoAtual, valor: valorAtual } : null;
        }

        ultimaLocacaoClicada = item.locacao;
        seletorFiltro.value = "locacao";
        campoBusca.value = item.locacao;
        filtrar();
    } else {
        // 2º clique: abre modal
        abrirModal(globalIdx);
    }
}
function voltarListaCompleta() {
    document.getElementById('busca').value = "";
    document.getElementById('filtro-tipo').value = "todos";
    ultimaLocacaoClicada = "";
    contextoAnterior = null;
    renderizarTabela(itens);
}   

function alternarAlertas() {
    ocultarAlertas = !ocultarAlertas;
    const btn = document.getElementById('btn-ocultar-alertas');
    
    // Muda o texto e destaca o botão quando ativo
    btn.textContent = ocultarAlertas ? 'Mostrar Alertas' : 'Ocultar Alertas';
    btn.style.backgroundColor = ocultarAlertas ? '#fff9c4' : '#fff';
    btn.style.color = '#000';

    renderizarTabela(itens);
}
const inputGtin = document.getElementById('gtin'); // Use o ID real do seu campo GTIN
const inputQuantidade = document.getElementById('quantidade'); // Use o ID real do campo Qtd

inputGtin.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Impede que o Enter envie o formulário antes da hora
        inputQuantidade.focus();
        inputQuantidade.select(); // Opcional: já seleciona o texto para facilitar a edição
    }
});