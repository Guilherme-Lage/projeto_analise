let itens = [];
let ocultar = true;
let idxModalAtual = -1;
let ultimaLocacaoClicada = "";
let ocultarAlertas = false;
let contextoAnterior = null; // { tipo, valor } — para voltar após confirmar'
let modoEdicaoAtivo = false;
const dbName = "HontecDB";
const storeName = "estoque";

function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("HontecDB", 1);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("estoque")) {
                db.createObjectStore("estoque", { keyPath: "id" });
            }
        };

        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject("Erro ao abrir IndexedDB");
    });
}

async function salvarBackup() {
    try {
        const db = await abrirDB();
        const tx = db.transaction("estoque", "readwrite");
        const store = tx.objectStore("estoque");

        // Salva o array 'itens' dentro do ID 'backup_atual'
        await store.put({ id: "backup_atual", dados: itens });

        return new Promise((resolve) => {
            tx.oncomplete = () => {
                console.log("Progresso salvo no IndexedDB");
                resolve();
            };
        });
    } catch (err) {
        console.error("Erro ao salvar no IndexedDB:", err);
    }
}

function abrirModal(globalIdx) {
    try {
        idxModalAtual = globalIdx;
        const item = itens[globalIdx];

        // 1. Lógica de Data e Hora
        const elDataModal = document.getElementById('modal-datetime');
        if (item.dataHoraRegistro) {
            elDataModal.textContent = item.dataHoraRegistro;
        } else {
            const agora = new Date();
            const dt = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            elDataModal.textContent = dt;
        }

        // 2. Preencher Locação
        const btnLoc = document.getElementById('modal-status-loc');
        const cellNova = document.getElementById('cell-loc-nova');
        const inputNova = document.getElementById('modal-locacao-nova');

        document.getElementById('modal-loc-texto').textContent = item.locacaoOriginal || item.locacao;

        if (item.trocaLocacao) {
            btnLoc.textContent = "X";
            btnLoc.style.background = "#CC0000";
            btnLoc.style.color = "#fff";
            cellNova.style.display = "block";
            inputNova.value = item.locacaoNova || "";
        } else {
            btnLoc.textContent = "";
            btnLoc.style.background = "transparent";
            cellNova.style.display = "none";
            inputNova.value = "";
        }

        // 3. Preencher Código e Nome
        document.getElementById('modal-cod-nome').textContent = `${item.codigo} — ${item.nome}`;

        // 4. Marca e GTIN Novo
        document.getElementById('modal-marca').value = item.marca || '';
        document.getElementById('modal-gtin-novo').value = item.gtinNovo || '';

        // 5. GTIN Original
        const elGtinAntigo = document.getElementById('modal-gtin-antigo');
        if (elGtinAntigo) elGtinAntigo.textContent = item.gtinAntigo || '---';

        // 6. Quantidade
        const elQtd = document.getElementById('modal-qtdo');
        if (elQtd) elQtd.value = item.qtdConferida != null ? item.qtdConferida : '';

        // 7. Fotos
        renderizarGaleria(item.fotos || []);

        // 8. Botão Dinâmico (CONFIRMAR / ALTERAR / REMOVER)
        const btnConf = document.getElementById('modal-btn-confirmar');

        // Resetamos o evento de clique padrão
        btnConf.onclick = null;

        if (item.conferido) {
            if (typeof modoEdicaoAtivo !== 'undefined' && modoEdicaoAtivo) {
                // MODO EDIÇÃO ATIVO: Botão vira REMOVER
                btnConf.textContent = 'REMOVER';
                btnConf.style.background = '#CC0000'; // Vermelho
                btnConf.onclick = () => resetarItem();
            } else {
                // MODO NORMAL: Botão vira ALTERAR
                btnConf.textContent = 'ALTERAR';
                btnConf.style.background = '#00009C'; // Azul (ou a cor ja-conferido do seu CSS)
                btnConf.onclick = () => confirmarModal();
            }
            btnConf.classList.add('ja-conferido');
        } else {
            // ITEM NOVO: Sempre CONFIRMAR
            btnConf.textContent = 'CONFIRMAR';
            btnConf.style.background = '#00009C'; // Azul padrão
            btnConf.classList.remove('ja-conferido');
            btnConf.onclick = () => confirmarModal();
        }

        // 9. Abrir Modal e dar Foco
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
        galeria.innerHTML = '<span class="galeria-vazia">Nenhuma foto</span>';
        return;
    }

    galeria.innerHTML = fotos.map((src, i) => `
        <div class="foto-thumb" title="Clique para remover">
        
            <img src="${src}" alt="foto ${i + 1}" onclick="removerFoto(${i})">
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
    if (!input.files || input.files.length === 0 || idxModalAtual < 0) return;

    const item = itens[idxModalAtual];
    if (!item.fotos) item.fotos = [];

    const arquivos = Array.from(input.files);
    let lidos = 0;

    arquivos.forEach(arquivo => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Redimensiona para no máximo 500px (suficiente para ver o produto)
                const MAX_WIDTH = 500;
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converte para JPEG com qualidade baixa (0.4) para o texto ficar curto
                const fotoCompacta = canvas.toDataURL('image/jpeg', 0.4);

                item.fotos.push(fotoCompacta);
                lidos++;

                if (lidos === arquivos.length) {
                    renderizarGaleria(item.fotos);
                    // Aqui você chama a função do IndexedDB que criamos antes
                    salvarBackup();
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(arquivo);
    });

    input.value = '';
}
let historicoLog = [];

// Coloque esta função fora de qualquer outra
function adicionarLog(item) {
    const lista = document.getElementById('log-lista');
    if (!lista) return; // Se não achar a lista, não faz nada e não trava o código

    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const status = item.conferido ? "OK" : "VOLTOU";
    const qtd = item.qtdConferida !== null ? `[${item.qtdConferida}]` : "";

    const div = document.createElement('div');
    div.style.padding = "4px 8px";
    div.style.borderBottom = "1px solid #eee";
    div.innerHTML = `<b>${hora}</b> - ${status}: ${item.codigo} ${qtd}`;

    lista.prepend(div);

    if (lista.children.length > 5) {
        lista.removeChild(lista.lastChild);
    }
}

// Lógica do botão (coloque isso no final do arquivo ou no window.onload)
document.addEventListener('click', function (e) {
    if (e.target && (e.target.id === 'log-header' || e.target.parentElement.id === 'log-header')) {
        const lista = document.getElementById('log-lista');
        const seta = document.getElementById('log-seta');
        if (lista.style.display === 'none') {
            lista.style.display = 'block';
            seta.textContent = '▲';
        } else {
            lista.style.display = 'none';
            seta.textContent = '▼';
        }
    }
});

function renderizarLog() {
    const lista = document.getElementById('log-lista');
    lista.innerHTML = historicoLog.map(l => `<div class="log-item">${l.msg}</div>`).join('');
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
    leitor.readAsText(arquivo, 'ISO-8859-1');
}

function limparAspas(val) {
    if (!val) return '';
    return val.replace(/^"|"$/g, '').trim();
}
function parseLinhaCsv(linha, sep) {
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

        const sep = linhas[0].includes('|') ? '|' : (linhas[0].includes(';') ? ';' : ',');

        const cabecalho = parseLinhaCsv(linhas[0], sep).map(v => v.toUpperCase().trim());
        const idx = (nome) => cabecalho.findIndex(c => c.includes(nome.toUpperCase()));

        const ehExportado = idx('STATUS') >= 0 && idx('LOCACAO') >= 0 && idx('CODIGO') >= 0;

        itens = [];

        if (ehExportado) {
            // ── CSV EXPORTADO ───────────────────────────────────────────
            const iStatus = idx('STATUS');
            const iMarca = idx('MARCA');
            const iCodigo = idx('CODIGO');
            const iNome = idx('NOME');
            const iQtd = idx('QTD_SISTEMA');
            const iQtdConf = idx('QTD_CONFERIDA');
            const iLocacao = idx('LOCACAO');
            const iGtinAntig = idx('GTIN_ANTIGO');
            const iGtinNovo = idx('GTIN_NOVO');
            const iData = idx('DATA_HORA');

            // Detecta colunas de fotos (FOTO_1, FOTO_2, ...)
            const fotoCols = cabecalho.reduce((acc, nome, i) => {
                if (/^FOTO_\d+$/.test(nome)) acc.push(i);
                return acc;
            }, []);

            for (let i = 1; i < linhas.length; i++) {
                const cols = parseLinhaCsv(linhas[i], sep);
                if (cols.length < 2) continue;

                const fotos = fotoCols.map(fi => cols[fi] || '').filter(f => f.trim() !== '');
                const qtdRaw = iQtd >= 0 ? cols[iQtd] : '0';
                const qtdConfRaw = iQtdConf >= 0 ? cols[iQtdConf] : '';

                itens.push({
                    locacao: (iLocacao >= 0 ? cols[iLocacao] : '').toUpperCase(),
                    codigo: (iCodigo >= 0 ? cols[iCodigo] : '').toUpperCase(),
                    nome: (iNome >= 0 ? cols[iNome] : '').toUpperCase(),
                    qtd: parseFloat(qtdRaw.replace(',', '.')) || 0,
                    gtinAntigo: (iGtinAntig >= 0 ? cols[iGtinAntig] : '').toUpperCase(),
                    gtinNovo: (iGtinNovo >= 0 ? cols[iGtinNovo] : '').toUpperCase(),
                    dataHoraRegistro: iData >= 0 ? cols[iData] : null,
                    marca: (iMarca >= 0 ? cols[iMarca] : '').toUpperCase(),
                    conferido: iStatus >= 0 && cols[iStatus].toUpperCase() === 'OK',
                    qtdConferida: qtdConfRaw !== '' ? parseFloat(qtdConfRaw) : null,
                    fotos: fotos
                });
            }

        } else {
            // ── CSV ORIGINAL DO SISTEMA ─────────────────────────────────
            const iCodigo = idx('ITEM_ESTOQUE_PUB');
            const iNome = idx('DES_ITEM_ESTOQUE');
            const iQtd = idx('QTD_CONTABIL');
            const iZona = idx('LOCACAO_ZONA');
            const iRua = idx('LOCACAO_RUA');
            const iEstante = idx('LOCACAO_ESTANTE');
            const iPrateleira = idx('LOCACAO_PRATELEIRA');
            const iNumero = idx('LOCACAO_NUMERO');
            const iMarcaCSV = idx('MARCA');
            let iGtin = idx('COD_EAN_GTIN');
            if (iGtin < 0) iGtin = idx('GTIN');

            for (let i = 1; i < linhas.length; i++) {
                const cols = parseLinhaCsv(linhas[i], sep);
                if (cols.length < 2) continue;

                const locacao = [iZona, iRua, iEstante, iPrateleira, iNumero]
                    .map(x => (x >= 0 && cols[x]) ? cols[x].trim() : '')
                    .filter(Boolean).join('.');

                const codigo = iCodigo >= 0 ? cols[iCodigo] : `item-${i}`;
                if (!codigo) continue;

                itens.push({
                    locacao: locacao.toUpperCase(),
                    codigo: codigo.toUpperCase(),
                    nome: (iNome >= 0 ? cols[iNome] : '---').toUpperCase(),
                    qtd: parseFloat((iQtd >= 0 ? cols[iQtd] : '0').replace(',', '.')) || 0,
                    gtinAntigo: (iGtin >= 0 ? cols[iGtin] : '---').toUpperCase(),
                    gtinNovo: '',
                    marca: (iMarcaCSV >= 0 ? cols[iMarcaCSV] : '').toUpperCase(),
                    conferido: false,
                    qtdConferida: null,
                    fotos: []
                });
            }
        }

        itens.sort((a, b) => a.locacao.localeCompare(b.locacao, undefined, { numeric: true }));

        renderizarTabela(itens);
        atualizarContador();

        let elInfo = document.getElementById('info-arquivo');
        if (!elInfo) {
            elInfo = document.createElement('div');
            elInfo.id = 'info-arquivo';
            elInfo.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;';
            document.querySelector('.tabela-wrapper').before(elInfo);
        }
        elInfo.style.display = 'block';
        elInfo.textContent = `${nomeArquivo} — ${itens.length} itens${ehExportado ? ' (exportado)' : ''}`;
        document.getElementById('btn-limpar').style.display = 'inline-block';

    } catch (erro) {
        console.error("Erro ao processar CSV:", erro);
        alert("Erro ao ler o arquivo: " + erro.message);
    }
}
function renderizarTabela(lista) {
    const corpo = document.getElementById('corpo');
    if (!corpo) return;
    corpo.innerHTML = '';

    if (lista.length === 0) {
        corpo.innerHTML = '<tr><td colspan="6" class="estado-vazio">Nenhum item encontrado</td></tr>';
        return;
    }

    const locacoesIniciadas = [...new Set(
        itens.filter(i => i.conferido).map(i => i.locacao)
    )];

    lista.forEach((item) => {
        const globalIdx = itens.indexOf(item);
        const tr = document.createElement('tr');
        tr.id = `linha-${globalIdx}`;

        let classeQuadrado = "";
        let iconeStatus = "";

        const estaConferido = item.conferido === true;
        const ehAlerta = !estaConferido && locacoesIniciadas.includes(item.locacao);
        const ehAlternativo = item.ehAlternativo === true; // Nova verificação

        if (estaConferido) {
            tr.classList.add('conferido');

            if (ehAlternativo) {
                // Estilo para Item Alternativo
                tr.style.background = "#eef0ff"; // Azul claro para destacar a linha
                classeQuadrado = "ok-alternativo";
                iconeStatus = "A";
            } else {
                // Estilo para Item Normal Conferido
                classeQuadrado = "ok";
                iconeStatus = "✓";
            }
        } else if (ehAlerta) {
            tr.classList.add('em-alerta');
            classeQuadrado = "status-pendente";
            iconeStatus = "!";
        }

        const buscaAtiva = document.getElementById('busca').value.trim() !== '';

        if (!buscaAtiva) {
            if (ocultar && estaConferido) {
                tr.style.display = 'none';
            }

            if (ocultarAlertas && ehAlerta) {
                tr.style.display = 'none';
            }
        }

        tr.onclick = () => gerenciarCliqueItem(globalIdx);

        tr.innerHTML = `
            <td class="col-status">
                <div class="quadrado ${classeQuadrado}">
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
    const busca = (document.getElementById('busca').value || '').trim().toUpperCase();
    const tipo = document.getElementById('filtro-tipo').value;

    if (busca === "") {
        renderizarTabela(itens);
        return;
    }

    // 1. Filtra os itens normalmente
    let resultados = itens.filter(i => {
        const cod = (i.codigo || "").toUpperCase();
        const nom = (i.nome || "").toUpperCase();
        const loc = (i.locacao || "").toUpperCase();

        if (tipo === 'codigo') return cod.includes(busca);
        if (tipo === 'nome') return nom.includes(busca);
        if (tipo === 'locacao') return loc.includes(busca);

        // Busca geral (todos)
        return cod.includes(busca) || nom.includes(busca) || loc.includes(busca);
    });

    // 2. ORDENAÇÃO POR RELEVÂNCIA (Prioriza o início do texto)
    resultados.sort((a, b) => {
        const campoA = tipo === 'nome' ? a.nome.toUpperCase() : a.codigo.toUpperCase();
        const campoB = tipo === 'nome' ? b.nome.toUpperCase() : b.codigo.toUpperCase();

        // Regra 1: Exato vem primeiro
        if (campoA === busca && campoB !== busca) return -1;
        if (campoB === busca && campoA !== busca) return 1;

        // Regra 2: Começa com o termo vem depois
        const iniciaA = campoA.startsWith(busca);
        const iniciaB = campoB.startsWith(busca);
        if (iniciaA && !iniciaB) return -1;
        if (iniciaB && !iniciaA) return 1;

        // Regra 3: Ordem alfabética normal para o resto
        return campoA.localeCompare(campoB, undefined, { numeric: true });
    });

    renderizarTabela(resultados);
}

function exportarCSV() {
    try {
        if (itens.length === 0) {
            alert('Carregue um arquivo primeiro!');
            return;
        }

        const maxFotos = 5;

        // 1. Cabeçalho com DATA_HORA após o GTIN_NOVO
        let colunas = [
            'STATUS', 'MARCA', 'CODIGO', 'NOME', 'QTD_SISTEMA',
            'QTD_CONFERIDA', 'LOCACAO', 'LOCACAO_NOVA', 'GTIN_ANTIGO', 'GTIN_NOVO', 'DATA_HORA'
        ];

        for (let i = 1; i <= maxFotos; i++) {
            colunas.push(`FOTO_${i}`);
        }

        const linhas = [colunas.join('|')];

        // 2. Processamento dos itens
        itens.forEach(item => {
            const qtdC = item.qtdConferida != null ? item.qtdConferida : '';

            let registro = [
                item.conferido ? 'OK' : 'PENDENTE',
                item.marca || '',
                item.codigo,
                `"${item.nome}"`,
                item.qtd,
                qtdC,
                item.locacaoOriginal || item.locacao,
                item.locacaoNova || '',
                item.gtinAntigo || '',
                item.gtinNovo || '',
                item.dataHoraRegistro || '' // DATA_HORA agora antes das fotos
            ];

            // 3. Adiciona as fotos
            for (let i = 0; i < maxFotos; i++) {
                if (item.fotos && item.fotos[i]) {
                    registro.push(`"${item.fotos[i]}"`);
                } else {
                    registro.push('""');
                }
            }

            linhas.push(registro.join('|'));
        });

        // 4. Gerar arquivo
        const csvContent = "\uFEFF" + linhas.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `estoque_conferido.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (erro) {
        console.error("Erro ao exportar:", erro);
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
async function confirmarModal() {
    try {
        if (idxModalAtual < 0) return;
        const item = itens[idxModalAtual];

        // 1. Captura GTIN e Marca
        const elGtinN = document.getElementById('modal-gtin-novo');
        const elMarca = document.getElementById('modal-marca');
        if (elGtinN) item.gtinNovo = elGtinN.value.trim().toUpperCase();
        if (elMarca) item.marca = elMarca.value.trim().toUpperCase();

        // 2. Captura Quantidade
        const elQtd = document.getElementById('modal-qtdo');
        if (elQtd) item.qtdConferida = elQtd.value !== '' ? parseFloat(elQtd.value) : 0;

        // 3. Gerencia TROCA DE LOCAÇÃO (Ordem Corrigida)
        const inputNova = document.getElementById('modal-locacao-nova');
        const btn = document.getElementById('modal-status-loc');

        if (btn.textContent === "X" && inputNova.value.trim() !== "") {
            // Salva a original APENAS se ainda não existir uma salva
            if (!item.locacaoOriginal) {
                item.locacaoOriginal = item.locacao;
            }
            item.trocaLocacao = true;
            item.locacaoNova = inputNova.value.trim().toUpperCase();
            item.locacao = item.locacaoNova; // Atualiza para a tabela
        } else {
            // Se desmarcar o X, volta para a original
            if (item.locacaoOriginal) {
                item.locacao = item.locacaoOriginal;
            }
            item.trocaLocacao = false;
            item.locacaoNova = "";
        }

        // 4. Salva a Data (Use o nome dataHoraRegistro para bater com seu abrirModal)
        const agora = new Date();
        item.conferido = true;
        item.dataHoraRegistro = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // 5. Finalização
        try { adicionarLog(item); } catch (e) { console.log("Erro no log"); }

        await salvarBackup();
        renderizarTabela(itens);
        atualizarContador();
        fecharModal();

        // 6. Lógica de Contexto (Preservada)
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
    } catch (erro) {
        console.error("Erro ao confirmar:", erro);
        fecharModal();
    }
}

window.onload = async () => {
    try {

        const db = await abrirDB();

        const tx = db.transaction("estoque", "readonly");
        const store = tx.objectStore("estoque");


        const request = store.get("backup_atual");

        request.onsuccess = () => {
            const resultado = request.result;

            if (resultado && resultado.dados && resultado.dados.length > 0) {
                if (confirm(`Encontramos ${resultado.dados.length} itens salvos. Deseja restaurar o progresso?`)) {
                    itens = resultado.dados;
                    renderizarTabela(itens);
                    atualizarContador();

                    // Mostra os botões de controle
                    document.getElementById('btn-limpar').style.display = 'inline-block';
                    document.getElementById('contador').style.display = 'block';

                    const elInfo = document.getElementById('info-arquivo');
                    if (elInfo) {
                        elInfo.style.display = 'block';
                        elInfo.textContent = "Dados restaurados da memória local (IndexedDB)";
                    }
                }
            }
        };
        configurarFocoNovoItem();
        request.onerror = () => console.error("Erro ao buscar backup no IndexedDB");

    } catch (e) {
        console.error("Erro crítico na restauração:", e);
    }
};

async function limpar() {
    if (!confirm("Isso apagará todo o progresso atual. Confirmar?")) return;

    const db = await abrirDB();
    const tx = db.transaction("estoque", "readwrite");
    tx.objectStore("estoque").delete("backup_atual");

    tx.oncomplete = () => {
        location.reload();
    };
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModal();
});

function gerenciarCliqueItem(globalIdx) {
    const item = itens[globalIdx];
    const campoBusca = document.getElementById('busca');
    const seletorFiltro = document.getElementById('filtro-tipo');

    if (ultimaLocacaoClicada !== item.locacao) {

        const tipoAtual = seletorFiltro.value;
        const valorAtual = campoBusca.value.trim();

        if (tipoAtual === 'prateleira' && valorAtual !== '') {
            contextoAnterior = { tipo: tipoAtual, valor: valorAtual };
        } else if (tipoAtual !== 'locacao') {

            contextoAnterior = valorAtual !== '' ? { tipo: tipoAtual, valor: valorAtual } : null;
        }

        ultimaLocacaoClicada = item.locacao;
        seletorFiltro.value = "locacao";
        campoBusca.value = item.locacao;
        filtrar();
    } else {

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
    ocultarAlertas = !ocultarAlertas; // Inverte o valor (true/false)

    const btn = document.getElementById('btn-ocultar-alertas');
    if (btn) {
        btn.textContent = ocultarAlertas ? 'Mostrar Alertas' : 'Ocultar Alertas';

    }

    const buscaVal = document.getElementById('busca').value.trim();
    if (buscaVal === "") {
        renderizarTabela(itens);
    } else {
        filtrar(); // Se houver busca, re-filtra para aplicar a regra
    }
}

const inputGtin = document.getElementById('modal-gtin-novo');
const inputQuantidade = document.getElementById('modal-qtdo');
const btnFoto = document.querySelector('.btn-adicionar-foto');
const inputArquivo = document.getElementById('foto-input'); // O input file escondido
const btnConfirmar = document.getElementById('modal-btn-confirmar');

if (inputGtin && inputQuantidade) {
    // 1. Enter no GTIN -> Pula para Quantidade
    inputGtin.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            inputQuantidade.focus();
            inputQuantidade.select();
        }
    });

    // 2. Enter na Quantidade -> Pula para o Botão de Foto
    inputQuantidade.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (btnFoto) btnFoto.focus();
        }
    });

    // 3. Após Adicionar a Foto -> Pula para o Confirmar
    // O evento 'change' dispara quando você termina de selecionar as fotos
    if (inputArquivo) {
        inputArquivo.addEventListener('change', function () {
            // Pequeno delay para dar tempo do sistema processar a miniatura
            setTimeout(() => {
                if (btnConfirmar) {
                    btnConfirmar.focus();
                    // Destaque visual no botão Confirmar
                    btnConfirmar.style.outline = "3px solid #fff";
                    btnConfirmar.style.boxShadow = "0 0 10px rgba(0,0,156,0.5)";
                }
            }, 500);
        });
    }
}

function alternarTrocaLocacao() {
    const btn = document.getElementById('modal-status-loc');
    const cellNova = document.getElementById('cell-loc-nova');
    const inputNova = document.getElementById('modal-locacao-nova');

    if (btn.textContent === "") {
        btn.textContent = "X";
        btn.style.background = "#CC0000";
        btn.style.color = "#fff";
        btn.style.borderColor = "#CC0000";
        cellNova.style.display = "flex";
        inputNova.focus();
    } else {
        btn.textContent = "";
        btn.style.background = "transparent";
        btn.style.borderColor = "#1a1a1a";
        cellNova.style.display = "none";
        inputNova.value = "";
    }
}


// ═══════════════════════════════════════════════════════════════
//  MODAL NOVO ITEM 
// ═══════════════════════════════════════════════════════════════

function abrirModalNovo() {
    fotosTempNovo = []; // Reseta o ar
    const galeria = document.getElementById('novo-galeria-fotos');
    if (galeria) galeria.innerHTML = '';
    ['novo-locacao', 'novo-codigo', 'novo-nome', 'novo-marca',
        'novo-gtin-antigo', 'novo-gtin-novo', 'novo-qtdo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    fecharSugestoes();
    document.getElementById('modal-novo-overlay').classList.add('aberto');
    setTimeout(() => {
        const el = document.getElementById('novo-locacao');
        if (el) { el.focus(); }
    }, 150);
}

function fecharModalNovo() {
    document.getElementById('modal-novo-overlay').classList.remove('aberto');
    fecharSugestoes();
}

function fecharModalNovoFora(e) {
    if (e.target === document.getElementById('modal-novo-overlay')) fecharModalNovo();
}

function fecharSugestoes() {
    const lista = document.getElementById('sugestoes-lista');
    if (lista) lista.style.display = 'none';
}

function buscarSugestoes() {
    const termo = (document.getElementById('novo-codigo').value || '').trim().toUpperCase();
    const lista = document.getElementById('sugestoes-lista');

    if (!lista) return;

    if (termo.length < 1 || itens.length === 0) {
        lista.style.display = 'none';
        return;
    }

    // 1. Filtra todos que batem com o termo
    let filtrados = itens.filter(i => i.codigo.includes(termo) || i.nome.includes(termo));

    // 2. ORDENAÇÃO POR RELEVÂNCIA
    filtrados.sort((a, b) => {
        const codA = a.codigo.toUpperCase();
        const codB = b.codigo.toUpperCase();

        // Prioridade 1: Código Exato (Ex: "17" no topo)
        if (codA === termo && codB !== termo) return -1;
        if (codB === termo && codA !== termo) return 1;

        // Prioridade 2: Começa com o termo (Ex: "170" antes de "917")
        const iniciaA = codA.startsWith(termo);
        const iniciaB = codB.startsWith(termo);
        if (iniciaA && !iniciaB) return -1;
        if (iniciaB && !iniciaA) return 1;

        // Prioridade 3: Ordem alfabética para o resto
        return codA.localeCompare(codB, undefined, { numeric: true });
    });

    // 3. Remove duplicatas e limita a 12
    const vistos = new Set();
    const resultados = filtrados.filter(i => {
        if (vistos.has(i.codigo)) return false;
        vistos.add(i.codigo);
        return true;
    }).slice(0, 12);

    if (resultados.length === 0) {
        lista.style.display = 'none';
        return;
    }

    lista.innerHTML = resultados.map(item => `
        <div onclick="selecionarSugestao('${item.codigo.replace(/'/g, "\\'")}','${item.nome.replace(/'/g, "\\'")}','${(item.marca || '').replace(/'/g, "\\'")}','${(item.gtinAntigo || '').replace(/'/g, "\\'")}')"
            style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; line-height:1.3;"
            onmouseover="this.style.background='#eef0ff'"
            onmouseout="this.style.background='#fff'">
            <span style="font-weight:700; color:#00009C;">${item.codigo}</span>
            <span style="color:#888; margin-left:8px; font-size:10px;">${item.nome}</span>
        </div>
    `).join('');

    lista.style.display = 'block';
}

// --- FLUXO DE FOCO: MODAL NOVO ITEM ---

// --- FLUXO DE FOCO COMPLETO: MODAL NOVO ITEM ---
function configurarFocoNovoItem() {
    const nLoc = document.getElementById('novo-locacao');
    const nCod = document.getElementById('novo-codigo');
    const nGtinN = document.getElementById('novo-gtin-novo');
    const nQtd = document.getElementById('novo-qtdo');
    const nChkAlt = document.getElementById('novo-is-alternativo');
    const nBtnFoto = document.querySelector('#modal-novo-overlay .btn-adicionar-foto');
    const nInputArq = document.getElementById('novo-foto-input');
    const nBtnConf = document.getElementById('btnadd'); // Seu botão Adicionar

    if (!nLoc) return;

    // 1. Locação -> Código
    nLoc.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nCod.focus(); }
    });

    // 2. Código -> GTIN Novo (Com seleção automática)
    nCod.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const lista = document.getElementById('sugestoes-lista');
            if (lista && lista.style.display === 'block' && lista.children.length > 0) {
                e.preventDefault();
                lista.children[0].click();
            } else {
                e.preventDefault();
                nGtinN.focus();
            }
        }
    });

    // 3. GTIN Novo -> Quantidade
    nGtinN.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nQtd.focus(); nQtd.select(); }
    });

    // 4. Quantidade -> Botão Foto
    nQtd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nBtnFoto) nBtnFoto.focus();
        }
    });

    // 5. APÓS FOTO -> Vai para o Checkbox Alternativo
    if (nInputArq) {
        nInputArq.addEventListener('change', () => {
            setTimeout(() => {
                if (nChkAlt) {
                    nChkAlt.focus();
                    // Destaque visual no checkbox
                    nChkAlt.parentElement.style.outline = "2px solid #00009C";
                }
            }, 500);
        });
    }

    // 6. Checkbox -> Botão Confirmar (btnadd)
    if (nChkAlt) {
        nChkAlt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Impede o comportamento padrão

                // INVERTE O STATUS (Igual o Espaço faria)
                nChkAlt.checked = !nChkAlt.checked;

                // Remove o destaque visual
                nChkAlt.parentElement.style.outline = "none";

                // PULA PARA O BOTÃO CONFIRMAR
                if (nBtnConf) {
                    nBtnConf.focus();
                    nBtnConf.style.outline = "2px solid #00009C";
                }
            }
        });
    }
}

// Chame essa função uma única vez no seu window.onload
// configurarFocoNovoItem();


//fim modal novo


function selecionarSugestao(codigo, nome, marca, gtinAntigo) {
    document.getElementById('novo-codigo').value = codigo;
    document.getElementById('novo-nome').value = nome;
    document.getElementById('novo-marca').value = marca;
    document.getElementById('novo-gtin-antigo').value = gtinAntigo;

    // IDEIA DE ALERTA: Muda o estilo para indicar que é uma cópia/alternativo
    const inputNome = document.getElementById('novo-nome');
    inputNome.style.background = "#eef0ff"; // Um azulzinho leve

    // Adiciona uma flag visual ou texto
    console.log("Item vinculado ao original: " + codigo);

    fecharSugestoes();

    // Foca no GTIN Novo para o usuário bipar o que ele tem em mãos
    setTimeout(() => {
        const el = document.getElementById('novo-gtin-novo');
        if (el) { el.focus(); el.select(); }
    }, 50);
}
async function confirmarNovo() {
    const locacao = (document.getElementById('novo-locacao').value || '').trim().toUpperCase();
    const codigo = (document.getElementById('novo-codigo').value || '').trim().toUpperCase();
    const nome = (document.getElementById('novo-nome').value || '').trim().toUpperCase();
    const marca = (document.getElementById('novo-marca').value || '').trim().toUpperCase();
    const gtinAnt = (document.getElementById('novo-gtin-antigo').value || '').trim().toUpperCase();
    const gtinNov = (document.getElementById('novo-gtin-novo').value || '').trim().toUpperCase();
    const qtdVal = document.getElementById('novo-qtdo').value;
    const qtd = qtdVal !== '' ? parseFloat(qtdVal) : 0;

    const isAlt = document.getElementById('novo-is-alternativo')?.checked || false; // Captura o checkbox

    if (!codigo) { alert('Código é obrigatório.'); return; }
    if (!locacao) { alert('Locação é obrigatória.'); return; }

    const agora = new Date();
    const dt = agora.toLocaleDateString('pt-BR') + ' ' +
        agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const novoItem = {
        locacao,
        codigo,
        nome: nome || '---',
        qtd: qtd,
        gtinAntigo: gtinAnt,
        gtinNovo: gtinNov,
        marca,
        conferido: true,
        ehAlternativo: isAlt, // <--- NOVA PROPRIEDADE
        qtdConferida: qtd,
        dataHoraRegistro: dt,
        fotos: [],
        adicionadoManualmente: true
    };

    itens.push(novoItem);

    itens.sort((a, b) => a.locacao.localeCompare(b.locacao, undefined, { numeric: true }));

    await salvarBackup();

    // Mostra o item adicionado na tabela
    document.getElementById('btn-limpar').style.display = 'inline-block';
    renderizarTabela(itens);
    atualizarContador();

    fecharModalNovo();
    try { adicionarLog(novoItem); } catch (e) { }
}

// Fecha sugestões ao clicar fora
document.addEventListener('click', function (e) {
    const lista = document.getElementById('sugestoes-lista');
    const input = document.getElementById('novo-codigo');
    if (lista && input && !lista.contains(e.target) && e.target !== input) {
        fecharSugestoes();
    }
});

// Enter no campo código: confirma 1ª sugestão ou vai para nome
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharModalNovo();
        fecharSugestoes();
    }
});

function solicitarSenhaEdicao() {
    if (!modoEdicaoAtivo) {
        const senha = prompt("Digite a senha para habilitar a edição:");
        if (senha === "1234") {
            modoEdicaoAtivo = true;
            document.getElementById('btn-modo-desmarcar').textContent = "Desativar Desmarcar";
            document.getElementById('btn-modo-desmarcar').style.background = "#cc0000";
            document.getElementById('btn-modo-desmarcar').style.color = "#fff";
            alert("Modo de edição ativado! Agora você pode limpar conferências.");
        } else {
            alert("Senha incorreta!");
        }
    } else {
        modoEdicaoAtivo = false;
        document.getElementById('btn-modo-desmarcar').textContent = "Modo Desmarcar";
        document.getElementById('btn-modo-desmarcar').style.background = "#fff";
        document.getElementById('btn-modo-desmarcar').style.color = "#000000";
        alert("Modo de edição desativado.");
    }
}

async function resetarItem() {
    if (idxModalAtual < 0) return;

    // VERIFICAÇÃO DE SEGURANÇA
    if (!modoEdicaoAtivo) {
        alert("O modo de edição está bloqueado. Ative-o com a senha para limpar este item.");
        return;
    }

    const item = itens[idxModalAtual];

    if (confirm(`DESMARCAR ITEM: Deseja apagar toda a conferência do item ${item.codigo}?`)) {
        item.conferido = false;
        item.qtdConferida = null;
        item.gtinNovo = "";
        item.fotos = [];
        item.dataHoraRegistro = null;

        if (item.locacaoOriginal) {
            item.locacao = item.locacaoOriginal;
            item.locacaoNova = "";
            item.trocaLocacao = false;
        }

        try { adicionarLog(item, "RESETADO"); } catch (e) { }

        await salvarBackup();
        renderizarTabela(itens);
        atualizarContador();
        fecharModal();
    }
}

async function resetarItem() {
    const item = itens[idxModalAtual];

    if (confirm(`DESMARCAR: Deseja apagar a conferência do item ${item.codigo}?`)) {
        item.conferido = false;
        item.qtdConferida = null;
        item.gtinNovo = "";
        item.dataHoraRegistro = null;
        item.fotos = [];

        if (item.locacaoOriginal) {
            item.locacao = item.locacaoOriginal;
            item.locacaoNova = "";
            item.trocaLocacao = false;
        }

        await salvarBackup();
        renderizarTabela(itens);
        atualizarContador();
        fecharModal();
    }
}

let fotosTempNovo = []; // Armazena as fotos antes de salvar o item

function carregarFotosNovo(input) {
    if (!input.files || input.files.length === 0) return;

    const arquivos = Array.from(input.files);
    let lidos = 0;

    arquivos.forEach(arquivo => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 500;
                const scale = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                fotosTempNovo.push(canvas.toDataURL('image/jpeg', 0.4));
                lidos++;

                if (lidos === arquivos.length) {
                    renderizarGaleriaNovo();
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(arquivo);
    });
    input.value = '';
}

function renderizarGaleriaNovo() {
    const galeria = document.getElementById('novo-galeria-fotos');
    if (!galeria) return;

    galeria.innerHTML = fotosTempNovo.map((src, i) => `
        <div class="foto-thumb">
            <img src="${src}">
            <button class="foto-remover" onclick="removerFotoNovo(${i})">✕</button>
        </div>
    `).join('');
}

function removerFotoNovo(idx) {
    fotosTempNovo.splice(idx, 1);
    renderizarGaleriaNovo();
}
function alternarMenuConfig() {
    const menu = document.getElementById('dropdown-config');
    menu.classList.toggle('aberto');
}

// Fecha o menu ao clicar em qualquer item lá dentro
document.querySelectorAll('.item-menu').forEach(botao => {
    botao.addEventListener('click', () => {
        document.getElementById('dropdown-config').classList.remove('aberto');
    });
});

// Fecha se clicar fora
document.addEventListener('click', function (e) {
    const menu = document.getElementById('dropdown-config');
    const btn = document.querySelector('.btn-engrenagem');
    if (menu && !menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove('aberto');
    }
});
