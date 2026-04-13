let itens = [];
let ocultar = false;
let idxModalAtual = -1;

//  MODAL 
function abrirModal(globalIdx) {
    idxModalAtual = globalIdx;
    const item = itens[globalIdx];

    // Data e hora atuais
    const agora = new Date();
    const dt = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('modal-datetime').textContent = dt;

    // Preencher campos
    document.getElementById('modal-locacao').textContent = item.locacao || '—';
    document.getElementById('modal-cod-nome').textContent = `${item.codigo} — ${item.nome}`;


    // Campos editáveis
    document.getElementById('modal-marca').value = item.marca || '';
    document.getElementById('modal-gtin-antigo').value = item.gtinAntigo || '';
    document.getElementById('modal-gtin-novo').value = item.gtinNovo || '';
    document.getElementById('modal-qtdo').value = item.qtdConferida != null ? item.qtdConferida : (item.qtd % 1 === 0 ? item.qtd.toFixed(0) : item.qtd.toFixed(2));

    // Foto
    const ph = document.getElementById('foto-placeholder');
    if (item.foto) {
        ph.innerHTML = `<img src="${item.foto}" alt="foto">`;
    } else {
        ph.innerHTML = '📷';
    }

    // Botão confirmar
    const btnConf = document.getElementById('modal-btn-confirmar');
    if (item.conferido) {
        btnConf.textContent = 'Desmarcar';
        btnConf.classList.add('ja-conferido');
    } else {
        btnConf.textContent = 'Confirmar';
        btnConf.classList.remove('ja-conferido');
    }

    document.getElementById('modal-overlay').classList.add('aberto');
    document.getElementById('modal-marca').focus();
}

function fecharModal() {
    document.getElementById('modal-overlay').classList.remove('aberto');
    // Limpa foto
    document.getElementById('foto-input').value = '';
    idxModalAtual = -1;
}

function fecharModalFora(e) {
    if (e.target === document.getElementById('modal-overlay')) fecharModal();
}

function carregarFoto(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const src = e.target.result;
        document.getElementById('foto-placeholder').innerHTML = `<img src="${src}" alt="foto">`;
        if (idxModalAtual >= 0) itens[idxModalAtual].foto = src;
    };
    reader.readAsDataURL(input.files[0]);
}

function confirmarModal() {
    if (idxModalAtual < 0) return;

    const item = itens[idxModalAtual];

    // Salvar dados extras
    item.marca = document.getElementById('modal-marca').value.trim();
    item.gtinAntigo = document.getElementById('modal-gtin-antigo').value.trim();
    item.gtinNovo = document.getElementById('modal-gtin-novo').value.trim();
    const qtdVal = document.getElementById('modal-qtdo').value;
    item.qtdConferida = qtdVal !== '' ? parseFloat(qtdVal) : null;

    // Toggle conferido
    item.conferido = !item.conferido;

    // Atualizar linha na tabela
    const tr = document.getElementById(`linha-${idxModalAtual}`);
    const q = document.getElementById(`q-${idxModalAtual}`);

    if (tr) {
        if (item.conferido) {
            tr.classList.add('conferido');
            q.classList.add('ok');
            q.textContent = '✓';
            if (ocultar) setTimeout(() => { tr.style.display = 'none'; }, 300);
        } else {
            tr.classList.remove('conferido');
            q.classList.remove('ok');
            q.textContent = '';
            tr.style.display = '';
        }
    }

    atualizarContador();
    fecharModal();
}

//  CSV 

function carregarCSV(input) {
    const arquivo = input.files[0];
    if (!arquivo) return;

    document.getElementById('info-arquivo').style.display = 'block';
    document.getElementById('info-arquivo').textContent = `Carregando ${arquivo.name}...`;

    const leitor = new FileReader();
    leitor.onload = (e) => processarCSV(e.target.result, arquivo.name);
    leitor.readAsText(arquivo, 'UTF-8');
}

function limparAspas(val) {
    if (!val) return '';
    return val.replace(/^"|"$/g, '').trim();
}

function processarCSV(texto, nomeArquivo) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) { alert('Arquivo CSV vazio ou inválido.'); return; }

    const sep = linhas[0].includes('|') ? '|' : ',';
    const cabecalho = linhas[0].split(sep).map(limparAspas);
    const idx = (nome) => cabecalho.findIndex(c => c.toUpperCase().includes(nome.toUpperCase()));

    const iCodigo = idx('ITEM_ESTOQUE_PUB');
    const iNome = idx('DES_ITEM_ESTOQUE');
    const iQtd = idx('QTD_CONTABIL');
    const iZona = idx('LOCACAO_ZONA');
    const iRua = idx('LOCACAO_RUA');
    const iEstante = idx('LOCACAO_ESTANTE');
    const iPrateleira = idx('LOCACAO_PRATELEIRA');
    const iNumero = idx('LOCACAO_NUMERO');

    itens = [];

    for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(sep).map(limparAspas);
        if (cols.length < 3) continue;

        const locacao = [iZona, iRua, iEstante, iPrateleira, iNumero]
            .map(x => x >= 0 ? cols[x] : '')
            .filter(Boolean).join('.');

        const codigo = iCodigo >= 0 ? cols[iCodigo] : `item-${i}`;
        const nome = iNome >= 0 ? cols[iNome] : '---';
        const qtd = parseFloat((iQtd >= 0 ? cols[iQtd] : '0').replace(',', '.')) || 0;

        itens.push({
            locacao, codigo, nome, qtd,
            conferido: false,
            marca: '', gtinAntigo: '', gtinNovo: '',
            qtdConferida: null, foto: null
        });
    }

    renderizarTabela(itens);
    document.getElementById('info-arquivo').textContent = `📄 ${nomeArquivo} — ${itens.length} itens`;
    document.getElementById('btn-limpar').style.display = 'inline-block';
    atualizarContador();
}

function renderizarTabela(lista) {
    const corpo = document.getElementById('corpo');
    corpo.innerHTML = '';

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="5" class="estado-vazio">Nenhum item encontrado</td></tr>';
        return;
    }

    lista.forEach((item) => {
        const globalIdx = itens.indexOf(item);
        const tr = document.createElement('tr');
        tr.id = `linha-${globalIdx}`;
        if (item.conferido) tr.classList.add('conferido');
        if (ocultar && item.conferido) tr.style.display = 'none';

        tr.onclick = () => abrirModal(globalIdx);
        tr.style.cursor = 'pointer';

        const qtdFormatada = item.qtd % 1 === 0 ? item.qtd.toFixed(0) : item.qtd.toFixed(2);

        tr.innerHTML = `
            <td class="col-status">
                <div class="quadrado ${item.conferido ? 'ok' : ''}" id="q-${globalIdx}">
                    ${item.conferido ? '✓' : ''}
                </div>
            </td>
            <td class="col-locacao" title="${item.locacao}">${item.locacao || '---'}</td>
            <td class="col-codigo">${item.codigo}</td>
            <td class="col-nome" title="${item.nome}">${item.nome}</td>
            <td class="col-qtd">${qtdFormatada}</td>
        `;
        corpo.appendChild(tr);
    });

    document.getElementById('contador').style.display = 'block';
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
    function filtrar() {
        const busca = document.getElementById('busca').value.toLowerCase().trim();

        const filtrados = busca === ''
            ? itens
            : itens.filter(i =>
                i.codigo.toLowerCase().includes(busca) ||
                i.nome.toLowerCase().includes(busca) ||
                i.locacao.toLowerCase().includes(busca)
            );

        renderizarTabela(filtrados);

        document.querySelectorAll('#corpo tr').forEach(tr => {
            const idx = parseInt(tr.id?.replace('linha-', ''));
            if (isNaN(idx)) return;

            const item = itens[idx];
            if (busca !== '') {
                tr.style.display = '';
            } else {
                tr.style.display = (ocultar && item.conferido) ? 'none' : '';
            }
        });
    }

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

    const linhas = ['STATUS|LOCACAO|CODIGO|NOME|QUANTIDADE|QTD_CONFERIDA|MARCA|GTIN_ANTIGO|GTIN_NOVO'];
    itens.forEach(i => {
        const qtdC = i.qtdConferida != null ? i.qtdConferida : '';
        linhas.push(`${i.conferido ? 'OK' : 'PENDENTE'}|${i.locacao}|${i.codigo}|${i.nome}|${i.qtd}|${qtdC}|${i.marca}|${i.gtinAntigo}|${i.gtinNovo}`);
    });

    const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'estoque_conferido.csv';
    link.click();
}
window.onload = () => {
    const backup = localStorage.getItem('estoque_hontec_backup');
    if (backup) {
        if (confirm("Encontramos uma conferência em andamento. Deseja restaurar os dados?")) {
            itens = JSON.parse(backup);
            renderizarTabela(itens);
            atualizarContador();
            document.getElementById('btn-limpar').style.display = 'inline-block';
            document.getElementById('info-arquivo').textContent = "Dados restaurados da memória local";
        }
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