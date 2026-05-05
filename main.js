let itens = [];
let ocultar = true;
let idxModalAtual = -1;
let ultimaLocacaoClicada = "";
let ocultarAlertas = false;
let contextoAnterior = null; // { tipo, valor } — para voltar após confirmar'
let modoEdicaoAtivo = false;
const dbName = "HontecDB";
const storeName = "estoque";
let ultimoBipTime = 0;
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

        // 8. Botão Dinâmico
        const btnConf = document.getElementById('modal-btn-confirmar');
        btnConf.onclick = null;

        if (item.conferido) {
            if (typeof modoEdicaoAtivo !== 'undefined' && modoEdicaoAtivo) {
                btnConf.textContent = 'REMOVER';
                btnConf.style.background = '#CC0000';
                btnConf.onclick = () => resetarItem();
            } else {
                btnConf.textContent = 'ALTERAR';
                btnConf.style.background = '#00009C';
                btnConf.onclick = () => confirmarModal();
            }
            btnConf.classList.add('ja-conferido');
        } else {
            btnConf.textContent = 'CONFIRMAR';
            btnConf.style.background = '#00009C';
            btnConf.classList.remove('ja-conferido');
            btnConf.onclick = () => confirmarModal();
        }

        // 9. Abrir Modal e dar Foco
        document.getElementById('modal-overlay').classList.add('aberto');
        setTimeout(() => {
            const elGtinNovo = document.getElementById('modal-gtin-novo');
            const elQtd = document.getElementById('modal-qtdo');

            if (elGtinNovo) {
                elGtinNovo.focus();
                elGtinNovo.select();

                elGtinNovo.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation(); // Impede que o evento vá para outros scripts

                        if (elQtd) {
                            elQtd.focus();
                            elQtd.select();
                        }
                    }
                };
            }

            if (elQtd) {
                // --- ADICIONADO AQUI: LIMPEZA AUTOMÁTICA AO BIPAR ---
                elQtd.oninput = (e) => {
                    const valorAtual = elQtd.value.trim();
                    const gtinReferencia = elGtinNovo.value.trim();

                    // Se o leitor começar a despejar o código de barras (mínimo 8 dígitos) e ele for igual ao GTIN
                    if (valorAtual.length >= 8 && gtinReferencia !== "" && valorAtual.includes(gtinReferencia)) {
                        // Limpa qualquer número antigo que estava na frente e deixa só o GTIN puro
                        elQtd.value = gtinReferencia;
                    }
                };
                // ---------------------------------------------------

                elQtd.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault(); // IMPEDE O PULO PARA A FOTO DE VEZ
                        e.stopPropagation();

                        const agora = Date.now();
                        const intervalo = agora - ultimoBipTime;

                        const valorNoCampo = elQtd.value.trim();
                        const gtinReferencia = elGtinNovo.value.trim();

                        // 1. VERIFICAÇÃO DO BIP (O que está no campo precisa ser o GTIN)
                        if (valorNoCampo === gtinReferencia && gtinReferencia !== "") {

                            // TRAVA 1: Se o intervalo for menor que 400ms, ignora (Evita o bip duplo)
                            if (intervalo < 400) {
                                console.warn("Bip duplo ignorado");
                                elQtd.select();
                                return;
                            }

                            ultimoBipTime = agora;

                            let contagemAtual = parseFloat(item.qtdConferida) || 0;
                            item.qtdConferida = contagemAtual + 1;

                            elQtd.value = item.qtdConferida;
                            elQtd.select();
                            console.log("Bip detectado: +1");
                        }
                        // 2. ENTER MANUAL (Só fecha se o campo NÃO for igual ao GTIN e NÃO estiver vazio)
                        else if (valorNoCampo !== "" && isNaN(valorNoCampo) === false) {

                            // TRAVA 2: Para evitar fechar sem querer por velocidade do leitor,
                            // só fechamos se o valor no campo for um número limpo (sem o GTIN junto)
                            confirmarModal();
                        }
                    }
                };
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


function adicionarLog(item) {
    const lista = document.getElementById('log-lista');
    if (!lista) return;

    const agora = new Date();
    const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const status = item.conferido ? "OK" : "VOLTOU";
    const qtd = item.qtdConferida !== null ? `[${item.qtdConferida}]` : "";

    const div = document.createElement('div');
    div.style.padding = "4px 8px";
    div.style.borderBottom = "1px solid #eee";
    div.innerHTML = `<b>${hora}</b> - ${status}: ${item.codigo} ${qtd}`;

    lista.prepend(div);

    if (lista.children.length > 100) {
        lista.removeChild(lista.lastChild);
    }
}



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
        let texto = e.target.result;

        // Se o texto contém "Ã", é quase certeza que um arquivo UTF-8 foi lido errado.
        // Então releremos como UTF-8 para corrigir o Ç e os acentos.
        if (texto.includes('Ã') || texto.includes('Â')) {
            const leitorUTF = new FileReader();
            leitorUTF.onload = (e2) => processarCSV(e2.target.result, arquivo.name);
            leitorUTF.readAsText(arquivo, 'UTF-8');
        } else {
            processarCSV(texto, arquivo.name);
        }
    };

    // Começa tentando ler como ISO-8859-1
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
        if (linhas.length < 2) {
            alert('Arquivo CSV vazio ou inválido.');
            return;
        }

        const sep = linhas[0].includes('|') ? '|' : (linhas[0].includes(';') ? ';' : ',');
        const cabecalho = parseLinhaCsv(linhas[0], sep).map(v => (v || "").replace(/^\uFEFF/g, "").toUpperCase().trim());

        const idx = (nome) => cabecalho.findIndex(c => c.includes(nome.toUpperCase()));
        const idxExato = (nome) => cabecalho.findIndex(c => c === nome.toUpperCase());

        const iUtilizacao = idx('UTILIZACAO');
        const iItemEstoque = idxExato('ITEM_ESTOQUE');
        const iItemEstoquePub = idxExato('ITEM_ESTOQUE_PUB');
        const iDesItemEstoque = idxExato('DES_ITEM_ESTOQUE');

        const ehExportado = idx('STATUS') >= 0 && idx('LOCACAO') >= 0;
        itens = [];

        if (ehExportado) {
            // --- LEITURA DE ARQUIVO EXPORTADO (Com as novas colunas) ---
            const iStatus = idx('STATUS');
            const iMarca = idx('MARCA');
            const iQtd = idx('QTD_SISTEMA');
            const iQtdConf = idx('QTD_CONFERIDA');
            const iLocacao = idx('LOCACAO');
            const iLocacaoNova = idx('LOCACAO_NOVA');
            const iGtinAntig = idx('GTIN_ANTIGO');

            // Prioriza CODIGO_DE_BARRAS, se não achar busca por GTIN_NOVO (compatibilidade)
            let iGtinLido = idx('CODIGO_DE_BARRAS');
            if (iGtinLido < 0) iGtinLido = idx('GTIN_NOVO');

            const iData = idx('DATA_HORA');
            const fotoCols = cabecalho.reduce((acc, nome, i) => {
                if (/^FOTO_\d+$/.test(nome)) acc.push(i);
                return acc;
            }, []);

            for (let i = 1; i < linhas.length; i++) {
                const cols = parseLinhaCsv(linhas[i], sep);
                if (cols.length < 2) continue;

                const statusLido = (iStatus >= 0 ? (cols[iStatus] || '') : '').toUpperCase();
                const fotos = fotoCols.map(fi => cols[fi] || '').filter(f => f.trim() !== '');

                const isNovo = statusLido === 'NOVO';
                const isAlt = statusLido === 'ALTERNATIVO';
                const isOk = statusLido === 'OK';
                const conferido = isOk || isAlt || isNovo;

                // Captura o GTIN e limpa se for "SEM GTIN"
                let gtinLido = iGtinLido >= 0 ? (cols[iGtinLido] || '').trim() : '';
                if (gtinLido.toUpperCase() === 'SEM GTIN') gtinLido = '';

                itens.push({
                    itemEstoque: iItemEstoque >= 0 ? (cols[iItemEstoque] || '') : '',
                    codigo: iItemEstoquePub >= 0 ? (cols[iItemEstoquePub] || '') : '',
                    nome: (iDesItemEstoque >= 0 ? (cols[iDesItemEstoque] || '') : '').toUpperCase(),
                    utilizacao: iUtilizacao >= 0 ? (cols[iUtilizacao] || '') : '',
                    locacaoOriginal: (iLocacao >= 0 ? (cols[iLocacao] || '') : '').toUpperCase(),
                    locacaoNova: (iLocacaoNova >= 0 ? (cols[iLocacaoNova] || '') : '').toUpperCase(),
                    locacao: (() => {
                        const nova = (iLocacaoNova >= 0 ? (cols[iLocacaoNova] || '') : '').trim().toUpperCase();
                        const orig = (iLocacao >= 0 ? (cols[iLocacao] || '') : '').trim().toUpperCase();
                        return nova || orig;
                    })(),
                    marca: (iMarca >= 0 ? (cols[iMarca] || '') : '').toUpperCase(),
                    qtd: parseFloat((cols[iQtd] || '0').replace(',', '.')) || 0,
                    conferido: conferido,
                    ehAlternativo: isAlt,
                    isNovoItem: isNovo,
                    qtdConferida: (iQtdConf >= 0 && cols[iQtdConf] !== '') ? parseFloat(cols[iQtdConf]) : null,
                    gtinAntigo: (iGtinAntig >= 0 ? (cols[iGtinAntig] || '') : '').toUpperCase(),
                    gtinNovo: gtinLido, // Armazena o código real ou vazio (sem a string "SEM GTIN")
                    dataHoraRegistro: iData >= 0 ? cols[iData] : null,
                    fotos: fotos
                });
            }
        } else {
            // --- LEITURA DE ARQUIVO ORIGINAL DO SISTEMA ---
            const iQtd = idx('QTD_CONTABIL');
            const iMarcaCSV = idx('MARCA');
            const iZona = idx('LOCACAO_ZONA');
            const iRua = idx('LOCACAO_RUA');
            const iEstante = idx('LOCACAO_ESTANTE');
            const iPrateleira = idx('LOCACAO_PRATELEIRA');
            const iNumero = idx('LOCACAO_NUMERO');
            let iGtin = idx('COD_EAN_GTIN');
            if (iGtin < 0) iGtin = idx('GTIN');

            for (let i = 1; i < linhas.length; i++) {
                const cols = parseLinhaCsv(linhas[i], sep);
                if (cols.length < 2) continue;

                const locacao = [iZona, iRua, iEstante, iPrateleira, iNumero]
                    .map(x => (x >= 0 && cols[x]) ? cols[x].trim() : '')
                    .filter(Boolean).join('.');

                itens.push({
                    itemEstoque: iItemEstoque >= 0 ? (cols[iItemEstoque] || '') : '',
                    codigo: iItemEstoquePub >= 0 ? (cols[iItemEstoquePub] || '') : '',
                    nome: (iDesItemEstoque >= 0 ? (cols[iDesItemEstoque] || '---') : '---').toUpperCase(),
                    utilizacao: iUtilizacao >= 0 ? (cols[iUtilizacao] || '') : '',
                    qtd: parseFloat((iQtd >= 0 ? cols[iQtd] : '0').replace(',', '.')) || 0,
                    locacao: locacao.toUpperCase(),
                    gtinAntigo: (iGtin >= 0 ? (cols[iGtin] || '---') : '---').toUpperCase(),
                    gtinNovo: '',
                    marca: (iMarcaCSV >= 0 ? (cols[iMarcaCSV] || '') : '').toUpperCase(),
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
        syncPublicar();

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

    const locacoesIniciadas = [...new Set(itens.filter(i => i.conferido).map(i => i.locacao))];

    lista.forEach((item) => {
        const globalIdx = itens.indexOf(item);
        const tr = document.createElement('tr');
        tr.id = `linha-${globalIdx}`;

        let classeQuadrado = "";
        let iconeStatus = "";

        const estaConferido = item.conferido === true;
        const ehAlerta = !estaConferido && locacoesIniciadas.includes(item.locacao);
        const ehAlternativo = item.ehAlternativo === true;
        const ehNovo = item.isNovoItem === true; // Nova verificação do N verde

        if (estaConferido) {
            tr.classList.add('conferido');

            if (ehAlternativo) {
                // Item Alternativo (A Amarelo)
                tr.style.background = "#eef0ff";
                classeQuadrado = "ok-alternativo"; // Mantenha sua classe CSS
                iconeStatus = "A";
            }
            else if (ehNovo) {
                // ITEM NOVO (N Verde)
                tr.style.background = "#f2fff2"; // Fundo levemente verde
                classeQuadrado = "ok-novo";      // Vamos definir essa classe abaixo
                iconeStatus = "N";
            }
            else {
                // Item Normal Conferido (✓ Verde)
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
            if (ocultar && estaConferido) tr.style.display = 'none';
            if (ocultarAlertas && ehAlerta) tr.style.display = 'none';
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
    // Atualiza botão de estatísticas no dropdown (mini resumo)
    const conf = itens.filter(i => i.conferido).length;
    const total = itens.length;
    const btnStats = document.getElementById('btn-stats-mini');
    if (btnStats) {
        btnStats.textContent = total > 0
            ? `Estatísticas  (${conf}/${total})`
            : 'Estatísticas';
    }
    // const elConf = document.getElementById('cnt-conf');
    // const elTotal = document.getElementById('cnt-total');
    //  const painel = document.getElementById('contador-painel');

    // if (itens.length > 0) {
    //     painel.style.display = 'block';

    //     const total = itens.length;
    //     const conferidos = itens.filter(i => i.conferido).length;

    //     if (elConf) elConf.textContent = conferidos;
    //     if (elTotal) elTotal.textContent = total;

    //     // --- LÓGICA DE CORES ---
    //     if (conferidos === 0) {
    //         // 1. BRANCO quando for zero
    //         painel.style.backgroundColor = "#ffffff";
    //         painel.style.color = "#000000";
    //     } else if (conferidos < total) {
    //         // 2. AMARELO enquanto estiver conferindo
    //         painel.style.backgroundColor = "#fff9c4"; // Amarelo suave
    //         painel.style.color = "#000000"; // Marrom para ler melhor no amarelo
    //     } else {
    //         // 3. VERDE quando o total for atingido
    //         painel.style.backgroundColor = "#155724"; // Verde suave
    //         painel.style.color = "#ffffff"; // Verde escuro para o texto
    //     }
    // } else {
    //     if (painel) painel.style.display = 'none';
    // }
}


function filtrar() {
    const buscaRaw = (document.getElementById('busca').value || '').trim().toUpperCase();
    const tipo = document.getElementById('filtro-tipo').value;

    if (buscaRaw === "") {
        renderizarTabela(itens);
        return;
    }

    // Criamos o array de termos para a busca flexível
    const termos = buscaRaw.split(" ").filter(t => t.length > 0);

    // 1. Filtra os itens com lógica de múltiplos termos
    let resultados = itens.filter(i => {
        const cod = (i.codigo || "").toUpperCase();
        const nom = (i.nome || "").toUpperCase();
        const loc = (i.locacao || "").toUpperCase();

        // Função auxiliar: verifica se TODOS os termos digitados estão no texto alvo
        const bateComTodos = (textoAlvo) => termos.every(t => textoAlvo.includes(t));

        if (tipo === 'codigo') return bateComTodos(cod);
        if (tipo === 'nome') return bateComTodos(nom);
        if (tipo === 'locacao') return bateComTodos(loc);

        // Busca geral (todos): os termos podem estar espalhados entre código, nome ou locação
        // Ex: "CABO AZUL" - CABO pode estar no nome e AZUL na locação
        return termos.every(t => cod.includes(t) || nom.includes(t) || loc.includes(t));
    });

    // --- MANTENDO EXATAMENTE SUA LÓGICA DE ORDENAÇÃO ABAIXO ---

    if (tipo === 'nome') {
        resultados.sort((a, b) => {
            const nomA = (a.nome || "").toUpperCase();
            const nomB = (b.nome || "").toUpperCase();
            return nomA.localeCompare(nomB);
        });
    }

    if (tipo === 'codigo') {
        resultados.sort((a, b) => {
            const codA = a.codigo.toUpperCase();
            const codB = b.codigo.toUpperCase();

            // A. Prioridade por Relevância do Código (usando a busca completa)
            if (codA === buscaRaw && codB !== buscaRaw) return -1;
            if (codB === buscaRaw && codA !== buscaRaw) return 1;

            const iniciaA = codA.startsWith(buscaRaw);
            const iniciaB = codB.startsWith(buscaRaw);
            if (iniciaA && !iniciaB) return -1;
            if (iniciaB && !iniciaA) return 1;

            // B. Se os códigos empatarem na relevância, ordena por LOCAÇÃO
            if (codA === codB) {
                const locA = (a.locacao || "").toUpperCase();
                const locB = (b.locacao || "").toUpperCase();
                if (locA !== locB) {
                    return locA.localeCompare(locB, undefined, { numeric: true });
                }
            }

            // C. Se até a locação for igual, ordena por NOME (Alfabética)
            return a.nome.toUpperCase().localeCompare(b.nome.toUpperCase());
        });
    }
    renderizarTabela(resultados);
}
function exportarCSV() {
    try {
        if (itens.length === 0) {
            alert('Carregue um arquivo primeiro!');
            return;
        }

        const maxFotos = 5;
        // 1. Cabeçalho rigoroso (A ordem aqui manda em tudo)
        let colunas = [
            'STATUS',
            'ITEM_ESTOQUE',
            'ITEM_ESTOQUE_PUB',
            'DES_ITEM_ESTOQUE',
            'MARCA',
            'UTILIZACAO_ITEM',
            'QTD_SISTEMA',
            'QTD_CONFERIDA',
            'LOCACAO',
            'LOCACAO_NOVA',
            'GTIN_ANTIGO',
            'CODIGO_DE_BARRAS',
            'GTIN',
            'DATA_HORA'
        ];

        for (let i = 1; i <= maxFotos; i++) {
            colunas.push(`FOTO_${i}`);
        }

        const linhas = [colunas.join('|')];

        itens.forEach(item => {
            const qtdC = item.qtdConferida != null ? item.qtdConferida : '';

            // Lógica de Status
            const locacoesIniciadas = [...new Set(itens.filter(i => i.conferido).map(i => i.locacao))];
            const estaConferido = item.conferido === true;
            const ehAlerta = !estaConferido && locacoesIniciadas.includes(item.locacao);

            let statusExport = 'PENDENTE';
            if (item.ehAlternativo) statusExport = 'ALTERNATIVO';
            else if (item.isNovoItem) statusExport = 'NOVO';
            else if (ehAlerta) statusExport = 'ALERTA';
            else if (estaConferido) statusExport = 'OK';

            // Lógica de GTIN (13 dígitos)
            const valorBipado = (item.gtinNovo || '').toString().trim();
            const gtinColuna = /^\d{13}$/.test(valorBipado) ? valorBipado : 'SEM GTIN';

            // Função para limpar aspas e espaços (Proteção contra o erro da imagem)
            const limpar = (t) => (t || '').toString().trim().replace(/"/g, '""');

            // 2. Montagem do Registro - DEVE SEGUIR A MESMA ORDEM DO CABEÇALHO
            // Adicionamos um caractere de tabulação (\t) antes do número. 
            // O Excel vê isso e aceita o zero à esquerda sem mostrar nada estranho.
            const forcarTexto = (valor) => `\t${limpar(valor)}`;

            let registro = [
                statusExport,
                limpar(item.itemEstoque),
                forcarTexto(item.codigo),               // Força texto com tabulação invisível
                `"${limpar(item.nome)}"`,
                limpar(item.marca),
                `"${limpar(item.utilizacao)}"`,
                item.qtd || 0,
                qtdC,
                limpar(item.locacaoOriginal || item.locacao),
                limpar(item.locacaoNova),
                forcarTexto(item.gtinAntigo),           // Força texto
                forcarTexto(valorBipado === '' ? 'SEM GTIN' : valorBipado),
                forcarTexto(gtinColuna),
                limpar(item.dataHoraRegistro)
            ];


            // 3. Fotos
            for (let i = 0; i < maxFotos; i++) {
                const foto = item.fotos && item.fotos[i] ? item.fotos[i] : "";
                registro.push(`"${limpar(foto)}"`);
            }

            linhas.push(registro.join('|'));
        });

        // 4. Geração do arquivo (UTF-8 com BOM)
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

        // 1. Captura GTIN, Marca e Quantidade
        const elGtinN = document.getElementById('modal-gtin-novo');
        const elMarca = document.getElementById('modal-marca');
        const elQtd = document.getElementById('modal-qtdo');
        if (elGtinN) item.gtinNovo = elGtinN.value.trim().toUpperCase();
        if (elMarca) item.marca = elMarca.value.trim().toUpperCase();
        if (elQtd) item.qtdConferida = elQtd.value !== '' ? parseFloat(elQtd.value) : 0;

        // 2. Gerencia TROCA DE LOCAÇÃO
        const inputNova = document.getElementById('modal-locacao-nova');
        const btn = document.getElementById('modal-status-loc');
        if (btn.textContent === "X" && inputNova.value.trim() !== "") {
            if (!item.locacaoOriginal) item.locacaoOriginal = item.locacao;
            item.trocaLocacao = true;
            item.locacaoNova = inputNova.value.trim().toUpperCase();
            item.locacao = item.locacaoNova;
        } else {
            if (item.locacaoOriginal) item.locacao = item.locacaoOriginal;
            item.trocaLocacao = false;
            item.locacaoNova = "";
        }

        // 3. Status e Data
        item.conferido = true;
        item.dataHoraRegistro = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // VIBRAR AQUI (Feedback imediato da gravação dos dados)
        vibrarDispositivo('sucesso');

        // 4. Log e Backup
        try { adicionarLog(item); } catch (e) { }
        await salvarBackup();

        const indiceParaRolar = idxModalAtual;

        // 5. FECHAR MODAL
        fecharModal();

        // 6. RESTAURAR CONTEXTO
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

        // 7. SINCRONIZA
        syncPublicar();
        atualizarContador();
        centralizarItemNaTela(indiceParaRolar);

    } catch (erro) {
        console.error("Erro ao confirmar:", erro);
        vibrarDispositivo('erro'); // Opcional: vibrar erro se algo falhar
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

                    const elInfo = document.getElementById('info-arquivo');
                    if (elInfo) {
                        elInfo.style.display = 'block';
                        elInfo.textContent = "Dados restaurados da memória local (IndexedDB)";
                    }
                }
            }
        };
        syncIniciar(); // Inicia sincronização PC <-> Celular
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

    tx.oncomplete = async () => {
        try { await fetch(`${SYNC_URL}/sync/limpar`, { method: 'POST' }); } catch (e) { }
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

        // Verificamos quantos itens restaram na lista após o filtrar()
        const itensNaLocacao = itens.filter(i => i.locacao === item.locacao);
        if (itensNaLocacao.length === 1) {
            abrirModal(globalIdx);
        }

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
        filtrar();
    }
}

// --- FLUXO DE FOCO: MODAL NORMAL (CONFERÊNCIA) ---
// 1. Enter no GTIN Novo -> Pula para Quantidade
// --- FLUXO DE NAVEGAÇÃO POR TECLADO (MODAL CONFERÊNCIA) ---

document.addEventListener('keydown', function (e) {
    const focado = document.activeElement;

    // 1. GTIN NOVO -> QUANTIDADE (ENTER)
    if (e.key === 'Enter' && focado.id === 'modal-gtin-novo') {
        e.preventDefault();
        const inputQtd = document.getElementById('modal-qtdo');
        if (inputQtd) {
            inputQtd.focus();
            inputQtd.select();
        }
    }

    // 2. QUANTIDADE -> BOTÃO FOTO (ENTER)
    else if (e.key === 'Enter' && focado.id === 'modal-qtdo') {
        e.preventDefault();
        const btnFoto = document.querySelector('.btn-adicionar-foto');
        if (btnFoto) {
            btnFoto.focus();
            btnFoto.style.outline = "2px solid #00009C";
        }
    }

    // 3. BOTÃO FOTO -> DECISÃO (ENTER PULA | ESPAÇO ABRE)
    else if (focado.classList.contains('btn-adicionar-foto')) {
        // ENTER: Pula para o Confirmar
        if (e.key === 'Enter') {
            e.preventDefault();
            const btnConf = document.getElementById('modal-btn-confirmar');
            if (btnConf) {
                btnConf.focus();
                btnConf.style.outline = "2px solid #00009C";
            }
        }
        // ESPAÇO: Abre a Câmera/Arquivos
        else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            const inputArq = document.getElementById('foto-input');
            if (inputArq) inputArq.click();
        }
    }
});

// 4. APÓS TIRAR A FOTO -> FOCO AUTOMÁTICO NO CONFIRMAR
// (Fora do keydown porque o 'change' é um evento do sistema de arquivos)
const inputArq = document.getElementById('foto-input');
if (inputArq) {
    inputArq.addEventListener('change', function () {
        setTimeout(() => {
            const btnConf = document.getElementById('modal-btn-confirmar');
            if (btnConf) {
                btnConf.focus();
                btnConf.style.outline = "2px solid #00009C";
            }
        }, 500);
    });
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

//  MODAL NOVO ITEM 


function abrirModalNovo() {
    fotosTempNovo = []; // Reseta o ar
    const galeria = document.getElementById('novo-galeria-fotos');
    if (galeria) galeria.innerHTML = '';
    ['novo-locacao', 'novo-codigo', 'novo-nome', 'novo-marca',
        'novo-gtin-antigo', 'novo-gtin-novo', 'novo-qtdo',].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    fecharSugestoes();
    document.getElementById('modal-novo-overlay').classList.add('aberto');
    setTimeout(() => {
        const el = document.getElementById('novo-codigo');
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
    const btn = document.getElementById('btn-toggle-sugestoes');
    if (lista) lista.style.display = 'none';
    if (btn) btn.textContent = '▼';
}

function toggleSugestoes() {
    const lista = document.getElementById('sugestoes-lista');
    const btn = document.getElementById('btn-toggle-sugestoes');
    const inputCod = document.getElementById('novo-codigo');
    if (!lista) return;

    if (lista.style.display === 'block') {
        // Fecha
        lista.style.display = 'none';
        if (btn) btn.textContent = '▼';
    } else {
        // Abre — garante que tem conteúdo
        const termo = (inputCod?.value || '').trim().toUpperCase();
        if (termo.length > 0) {
            buscarSugestoes(); // Re-renderiza com o termo atual
        } else if (lista.innerHTML.trim() === '' && itens.length > 0) {
            // Mostra os primeiros itens se campo vazio
            const primeiros = itens.slice(0, 12);
            lista.innerHTML = primeiros.map(item => `
                <div onclick="selecionarSugestao('${item.codigo.replace(/'/g, "\\'")}','${item.nome.replace(/'/g, "\\'")}','${(item.marca || '').replace(/'/g, "\\'")}','${(item.gtinAntigo || '').replace(/'/g, "\\'")}','${(item.locacao || '').replace(/'/g, "\\'")}')"
                    style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; line-height:1.3; background:#fff;"
                    onmouseover="this.style.background='#eef0ff'"
                    onmouseout="this.style.background='#fff'">
                    <div style="font-weight:700; color:#00009C; font-size:11px;">${item.codigo} <span style="color:#aaa;font-weight:400;font-size:10px;">— ${item.locacao || ''}</span></div>
                    <div style="color:#888; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.nome}</div>
                </div>
            `).join('');
        }
        lista.style.display = 'block';
        if (btn) btn.textContent = '▲';
    }
}

function buscarSugestoes() {
    const inputCod = document.getElementById('novo-codigo');
    const termo = (inputCod.value || '').trim().toUpperCase();
    const lista = document.getElementById('sugestoes-lista');

    const seloAlt = document.getElementById('selo-alternativo');
    const chkAlt = document.getElementById('novo-is-alternativo');

    if (!lista) return;

    // --- LÓGICA DO SELO "A" VERDE ---
    const codigoExiste = itens.some(i => i.codigo.toUpperCase() === termo);

    if (codigoExiste && termo.length > 0) {
        if (seloAlt) seloAlt.style.display = 'flex';
        if (chkAlt) chkAlt.checked = true;
    } else {
        if (seloAlt) seloAlt.style.display = 'none';
        if (chkAlt) chkAlt.checked = false;
    }

    // Se campo vazio, esconde a lista
    if (termo.length < 1 || itens.length === 0) {
        lista.style.display = 'none';
        return;
    }

    // 1. Filtro e 2. Ordenação (Prioridade Exata)
    let filtrados = itens.filter(i =>
        i.codigo.toUpperCase().includes(termo) ||
        i.nome.toUpperCase().includes(termo)
    );

    filtrados.sort((a, b) => {
        const codA = a.codigo.toUpperCase();
        const codB = b.codigo.toUpperCase();
        if (codA === termo && codB !== termo) return -1;
        if (codB === termo && codA !== termo) return 1;
        if (codA.startsWith(termo) && !codB.startsWith(termo)) return -1;
        if (codB.startsWith(termo) && !codA.startsWith(termo)) return 1;
        return codA.localeCompare(codB, undefined, { numeric: true });
    });

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

    // 3. Renderização da lista (Usando seus tamanhos 11px/10px)
    lista.innerHTML = resultados.map(item => `
        <div onclick="selecionarSugestao('${item.codigo.replace(/'/g, "\\'")}','${item.nome.replace(/'/g, "\\'")}','${(item.marca || '').replace(/'/g, "\\'")}','${(item.gtinAntigo || '').replace(/'/g, "\\'")}','${(item.locacao || '').replace(/'/g, "\\'")}')"
            style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; line-height:1.3; background:#fff;"
            onmouseover="this.style.background='#eef0ff'"
            onmouseout="this.style.background='#fff'">
            <div style="font-weight:700; color:#00009C; font-size:11px;">${item.codigo} <span style="color:#aaa;font-weight:400;font-size:10px;">— ${item.locacao || ''}</span></div>
            <div style="color:#888; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.nome}</div>
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
    const nBtnFoto = document.querySelector('#modal-novo-overlay .btn-adicionar-foto');
    const nInputArq = document.getElementById('novo-foto-input');
    const nBtnConf = document.getElementById('btnadd');

    if (!nLoc) return;

    // 1. Locação -> Código
    nLoc.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); nCod.focus(); }
    });

    // 2. Código -> GTIN Novo (Com seleção automática da 1ª sugestão)
    nCod.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const lista = document.getElementById('sugestoes-lista');
            if (lista && lista.style.display === 'block' && lista.children.length > 0) {
                e.preventDefault();
                lista.children[0].click(); // Clica na primeira sugestão
            } else {
                e.preventDefault();
                nGtinN.focus();
            }
        }
    });

    // 3. GTIN Novo -> Quantidade
    nGtinN.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nQtd.focus();
            nQtd.select();
        }
    });

    // 4. Quantidade -> Botão Foto (Pula o checkbox, que já é automático)
    nQtd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nBtnFoto) {
                nBtnFoto.focus();
                nBtnFoto.style.outline = "2px solid #00009C";
            }
        }
    });

    // 5. Lógica no Botão de Foto: ENTER PULA | ESPAÇO ABRE
    if (nBtnFoto) {
        nBtnFoto.addEventListener('keydown', (e) => {
            // ENTER: Vai para o botão de Adicionar Item
            if (e.key === 'Enter') {
                e.preventDefault();
                if (nBtnConf) {
                    nBtnConf.focus();
                    nBtnConf.style.outline = "2px solid #00009C";
                }
            }
            // ESPAÇO: Abre a câmera/arquivos
            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (nInputArq) nInputArq.click();
            }
        });
    }

    // 6. APÓS FOTO -> Vai direto para o botão Adicionar (Confirmar)
    if (nInputArq) {
        nInputArq.addEventListener('change', () => {
            setTimeout(() => {
                if (nBtnConf) {
                    nBtnConf.focus();
                    nBtnConf.style.outline = "2px solid #00009C";
                }
            }, 500);
        });
    }
}



//fim modal novo


function selecionarSugestao(codigo, nome, marca, gtinAntigo, locacao) {
    document.getElementById('novo-codigo').value = codigo;
    document.getElementById('novo-nome').value = nome;
    document.getElementById('novo-marca').value = marca;
    document.getElementById('novo-gtin-antigo').value = gtinAntigo;

    // Preenche locação se o campo estiver vazio
    const elLoc = document.getElementById('novo-locacao');
    if (elLoc && (!elLoc.value || elLoc.value.trim() === '') && locacao) {
        elLoc.value = locacao;
        elLoc.style.background = '#eef0ff';
        setTimeout(() => { elLoc.style.background = ''; }, 2000);
    }

    const inputNome = document.getElementById('novo-nome');
    inputNome.style.background = "#eef0ff";

    console.log("Item vinculado ao original: " + codigo + " | Locação: " + locacao);

    fecharSugestoes();

    // Foca no GTIN Novo para o usuário bipar o que tem em mãos
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


    if (!codigo) { alert('Código é obrigatório.'); return; }
    if (!locacao) { alert('Locação é obrigatória.'); return; }

    // --- LÓGICA DE STATUS AUTOMÁTICA ---
    // Verifica se o código digitado já existe em algum item do arquivo original
    const codigoJaExiste = itens.some(i => i.codigo.toUpperCase() === codigo && !i.isNovoItem);

    const agora = new Date();
    const dt = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const novoItem = {
        locacao,
        codigo,
        nome: nome || '---',
        qtd: 0, // Itens novos não têm quantidade contábil prévia
        gtinAntigo: gtinAnt || 'NOVO',
        gtinNovo: gtinNov,
        marca,
        conferido: true,

        // --- AQUI ESTÁ A REGRA SOLICITADA ---
        ehAlternativo: codigoJaExiste, // Vem como ALTERNATIVO se o código já existe
        isNovoItem: !codigoJaExiste,   // Vem como NOVO se o código for inédito
        // ------------------------------------
        dataHoraRegistro: dt,
        fotos: [...fotosTempNovo],
        adicionadoManualmente: true
    };

    itens.push(novoItem);

    // Limpezas e atualizações
    fotosTempNovo = [];
    itens.sort((a, b) => a.locacao.localeCompare(b.locacao, undefined, { numeric: true }));

    await salvarBackup();
    syncPublicar();

    document.getElementById('btn-limpar').style.display = 'inline-block';
    renderizarTabela(itens);
    atualizarContador();
    fecharModalNovo();

    try { adicionarLog(novoItem); } catch (e) { }
}



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
        syncPublicar();
        renderizarTabela(itens);
        atualizarContador();
        fecharModal();
    }
}



let fotosTempNovo = []; // Armazena as fotos antes de salvar o item

//  SINCRONIZAÇÃO BIDIRECIONAL (PC <-> CELULAR)


const SYNC_URL = window.location.origin;
let syncVersaoLocal = 0;
let syncAtivo = false;
let ehDispositivo = null;

function detectarDispositivo() {
    ehDispositivo = window.innerWidth < 800 ? 'celular' : 'pc';
    console.log(`[SYNC] Dispositivo: ${ehDispositivo}`);
}

// ── Publica estado + busca atual para o servidor ──
// Chamado por TODOS os dispositivos após qualquer mudança
async function syncPublicar() {
    try {
        const busca = document.getElementById('busca')?.value || '';
        const filtro = document.getElementById('filtro-tipo')?.value || 'todos';
        const res = await fetch(`${SYNC_URL}/sync/publicar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens, versao: syncVersaoLocal, busca, filtro })
        });
        if (res.ok) {
            const d = await res.json();
            syncVersaoLocal = d.versao;
        }
    } catch (e) { /* offline */ }
}

// ── Aplica estado recebido do servidor ──
function syncAplicarEstado(dados) {
    if (dados.versao <= syncVersaoLocal) return;
    syncVersaoLocal = dados.versao;
    itens = dados.itens;

    // Aplica busca/filtro sincronizados
    if (dados.busca !== undefined) {
        const elBusca = document.getElementById('busca');
        const elFiltro = document.getElementById('filtro-tipo');
        if (elBusca && elFiltro) {
            elBusca.value = dados.busca || '';
            if (dados.filtro) elFiltro.value = dados.filtro;
            ultimaLocacaoClicada = ''; // reset para não confundir o clique duplo
        }
    }

    // Renderiza respeitando o filtro atual
    const buscaTexto = document.getElementById('busca')?.value?.trim() || '';
    if (buscaTexto !== "") {
        filtrar();
    } else {
        renderizarTabela(itens);
    }
    atualizarContador();

    if (itens.length > 0) {
        const btnLimpar = document.getElementById('btn-limpar');
        if (btnLimpar) btnLimpar.style.display = 'inline-block';
    }

    console.log(`[SYNC] Estado aplicado — v${dados.versao} — ${itens.length} itens`);
}

// ── Polling curto (2s) — funciona nos DOIS dispositivos ──
async function syncIniciarPolling() {
    if (syncAtivo) return;
    syncAtivo = true;
    const indicador = document.getElementById('sync-indicador');
    console.log('[SYNC] Polling bidirecional iniciado...');

    while (syncAtivo) {
        try {
            if (indicador) { indicador.textContent = '🔄'; }
            const res = await fetch(`${SYNC_URL}/sync/estado?versao=${syncVersaoLocal}`, {
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const dados = await res.json();
                if (indicador) indicador.textContent = '🟢';
                if (dados.versao > syncVersaoLocal && dados.itens) {
                    syncAplicarEstado(dados);
                }
            }
        } catch (e) {
            if (indicador) indicador.textContent = '🔴';
        }
        // Intervalo curto: 2s
        await new Promise(r => setTimeout(r, 2000));
    }
}

// ── Ao carregar: busca estado do servidor se tela vazia ──
async function syncVerificarAoCarregar() {
    try {
        const res = await fetch(`${SYNC_URL}/sync/estado?versao=0`, {
            signal: AbortSignal.timeout(3000)
        });
        if (!res.ok) return;
        const dados = await res.json();
        if (dados.itens && dados.itens.length > 0 && itens.length === 0) {
            syncAplicarEstado(dados);
            const elInfo = document.getElementById('info-arquivo');
            if (elInfo) { elInfo.style.display = 'block'; elInfo.textContent = 'Dados sincronizados do servidor'; }
        }
    } catch (e) { /* offline */ }
}

function syncIniciar() {
    detectarDispositivo();
    syncVerificarAoCarregar().then(() => syncIniciarPolling());
}
// FIM SINCRONIZAÇÃO

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
function abrirLegenda() {
    document.getElementById('modal-legenda').classList.add('aberto');
    document.getElementById('dropdown-config').classList.remove('aberto');
}

function fecharLegenda() {
    document.getElementById('modal-legenda').classList.remove('aberto');
}

function fecharLegendaFora(e) {
    if (e.target === document.getElementById('modal-legenda')) fecharLegenda();
}

function centralizarItemNaTela(globalIdx) {
    setTimeout(() => {
        const linha = document.getElementById(`linha-${globalIdx}`);

        if (linha) {
            linha.offsetHeight;

            const topoDaLinha = linha.getBoundingClientRect().top + window.scrollY;
            const pontoCentral = topoDaLinha - (window.innerHeight / 2);

            window.scrollTo({
                top: pontoCentral,
                behavior: 'smooth'
            });

            linha.style.transition = "background 0.3s";
            linha.style.background = "#fff9c4";
            setTimeout(() => {
                linha.style.background = "";
            }, 1500);
        }
    }, 300);
}


function abrirModalIAGemini() {
    document.getElementById('modal-ia-overlay').classList.add('aberto');


    const chaveFixa = '';

    document.getElementById('ia-gemini-key').value = chaveFixa;

    setTimeout(() => {
        document.getElementById('ia-gtin').focus();
    }, 150);
}

function fecharModalIA() {
    document.getElementById('modal-ia-overlay').classList.remove('aberto');
    document.getElementById('ia-gtin').value = '';
    document.getElementById('ia-status').style.display = 'none';
}

function fecharModalIAFora(e) {
    if (e.target === document.getElementById('modal-ia-overlay')) fecharModalIA();
}
async function buscarProdutoComGemini() {
    const gtin = document.getElementById('ia-gtin').value.trim();
    const statusDiv = document.getElementById('ia-status');
    const btnRodar = document.getElementById('btn-rodar-ia');

    if (!gtin) { alert("Por favor, insira o código de barras (GTIN)."); return; }

    statusDiv.style.display = 'block';
    statusDiv.textContent = "⏳ Pesquisando no Gemini...";
    btnRodar.disabled = true;
    btnRodar.style.opacity = '0.5';

    try {
        const response = await fetch(`${SYNC_URL}/sync/gemini`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gtin })
        });

        // Captura o texto puro primeiro para evitar quebrar no JSON
        const textoPuro = await response.text();

        if (!response.ok) {
            let msgErro = "Erro ao consultar o Gemini.";
            try {
                const erroObj = JSON.parse(textoPuro);
                msgErro = erroObj.error || msgErro;
            } catch (e) {
                msgErro = textoPuro || msgErro;
            }
            throw new Error(msgErro);
        }

        // Se a resposta estiver vazia
        if (!textoPuro.trim()) {
            throw new Error("O servidor retornou uma resposta vazia.");
        }

        const data = JSON.parse(textoPuro);
        const produto = data.produto;

        fecharModalIA();
        abrirModalNovo();

        setTimeout(() => {
            document.getElementById('novo-codigo').value = gtin;
            document.getElementById('novo-nome').value = produto.nome.toUpperCase();
            document.getElementById('novo-marca').value = produto.marca.toUpperCase();
            document.getElementById('novo-gtin-novo').value = gtin;

            console.log("Descrição da IA:", produto.desc);
            alert("✨ Produto encontrado pela IA e preenchido com sucesso!");
        }, 300);

    } catch (e) {
        console.error(e);
        statusDiv.textContent = `❌ Erro: ${e.message}`;
    } finally {
        btnRodar.disabled = false;
        btnRodar.style.opacity = '1';
    }
}
// ═══════════════════════════════════════════════════════════════
//  VERIFICAR COM IA — modal do item → Ollama + SerpAPI no servidor
// ═══════════════════════════════════════════════════════════════

function fecharModalIAConf() {
    document.getElementById('modal-ia-conf-overlay').classList.remove('aberto');
}
function fecharModalIAConfFora(e) {
    if (e.target === document.getElementById('modal-ia-conf-overlay')) fecharModalIAConf();
}

async function verificarComIA() {
    if (idxModalAtual < 0) return;
    const item = itens[idxModalAtual];

    const gtinEl = document.getElementById('modal-gtin-novo');
    const gtin = (gtinEl?.value || item.gtinNovo || item.gtinAntigo || '').trim();

    if (!gtin) {
        alert('Preencha o campo GTIN Novo antes de verificar com a IA.');
        gtinEl?.focus();
        return;
    }

    const overlay = document.getElementById('modal-ia-conf-overlay');
    const status = document.getElementById('ia-conf-status');
    const corpo = document.getElementById('ia-conf-corpo');
    const acoes = document.getElementById('ia-conf-acoes');
    const sFechar = document.getElementById('ia-conf-apenas-fechar');

    overlay.classList.add('aberto');
    status.style.display = 'block';
    status.style.color = '#888';
    status.textContent = '🔍 Consultando IA com o GTIN ' + gtin + '...';
    corpo.style.display = 'none';
    acoes.style.display = 'none';
    sFechar.style.display = 'flex';

    try {
        const res = await fetch('/sync/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gtin })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || data.detalhe || `Erro HTTP ${res.status}`);

        const prod = data.produto;

        // Preenche comparativo
        document.getElementById('ia-atual-nome').textContent = item.nome || '---';
        document.getElementById('ia-atual-marca').textContent = item.marca || '---';

        const elNomeIA = document.getElementById('ia-novo-nome');
        elNomeIA.value = prod.nome || '';
        setTimeout(() => autoResizeNome(elNomeIA), 10);

        document.getElementById('ia-novo-marca').value = prod.marca || '';
        document.getElementById('ia-novo-desc').textContent = prod.desc || '(sem descrição)';

        // Marca checkbox só onde há diferença
        document.getElementById('ia-chk-nome').checked = (prod.nome || '').toUpperCase() !== (item.nome || '').toUpperCase();
        document.getElementById('ia-chk-marca').checked = (prod.marca || '').toUpperCase() !== (item.marca || '').toUpperCase();

        status.style.display = 'none';
        corpo.style.display = 'block';
        acoes.style.display = 'grid';
        sFechar.style.display = 'none';

    } catch (erro) {
        console.error('[IA]', erro);
        status.style.color = '#CC0000';
        status.textContent = '❌ ' + erro.message + '\n\nVerifique se o servidor está rodando e o Ollama está ativo (ollama serve).';
    }
}

function aplicarResultadoIA() {
    if (idxModalAtual < 0) { fecharModalIAConf(); return; }
    const item = itens[idxModalAtual];

    if (document.getElementById('ia-chk-nome').checked) {
        const v = document.getElementById('ia-novo-nome').value.trim().toUpperCase();
        if (v) {
            item.nome = v;
            const el = document.getElementById('modal-nome');
            if (el) {
                el.value = v;
                autoResizeNome(el);
                el.style.background = '#f0fff4';
                setTimeout(() => el.style.background = '', 2000);
            }
        }
    }

    if (document.getElementById('ia-chk-marca').checked) {
        const v = document.getElementById('ia-novo-marca').value.trim().toUpperCase();
        if (v) {
            item.marca = v;
            const el = document.getElementById('modal-marca');
            if (el) {
                el.value = v;
                el.style.background = '#f0fff4';
                setTimeout(() => el.style.background = '', 2000);
            }
        }
    }

    fecharModalIAConf();
}

// Auto-resize textarea de nome
function autoResizeNome(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}
// ═══════════════════════════════════════════════════════════════
//  MODAL DE ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════

function fecharEstatisticas() {
    document.getElementById('modal-stats-overlay').classList.remove('aberto');
    // Fecha também o dropdown
    const dd = document.getElementById('dropdown-config');
    if (dd) dd.classList.remove('aberto');
}

function abrirEstatisticas() {
    const total = itens.length;
    const conferidos = itens.filter(i => i.conferido).length; // inclui novos e alternativos
    const novos = itens.filter(i => i.isNovoItem === true).length;
    const alternativos = itens.filter(i => i.ehAlternativo === true).length;
    const pendentes = itens.filter(i => !i.conferido).length;

    // Alerta: itens pendentes em locação que tem pelo menos 1 conferido
    const locacoesComConf = new Set(itens.filter(i => i.conferido).map(i => i.locacao));
    const alertas = itens.filter(i => !i.conferido && locacoesComConf.has(i.locacao)).length;

    // GTIN Novo = GTIN Antigo (possível erro / sem mudança)
    const gtinIgual = itens.filter(i => {
        const ant = (i.gtinAntigo || '').trim();
        const nov = (i.gtinNovo || '').trim();
        return nov && ant && nov === ant;
    }).length;

    // GTIN Novo preenchido (foi atualizado)
    const gtinAtualizado = itens.filter(i => {
        const ant = (i.gtinAntigo || '').trim();
        const nov = (i.gtinNovo || '').trim();
        return nov && nov !== ant;
    }).length;

    // Progresso %
    const pct = total > 0 ? Math.round(((total - pendentes) / total) * 100) : 0;

    // Cor barra de progresso
    const corBarra = pct === 100 ? '#2d7a4a' : pct >= 50 ? '#f39c12' : '#CC0000';

    const corpo = document.getElementById('stats-corpo');
    corpo.innerHTML = `
        <!-- Barra de progresso -->
        <div style="padding:14px 16px; border-bottom:1.5px solid #eee;">
            <div style="display:flex; justify-content:space-between; font-family:'IBM Plex Mono',monospace; font-size:11px; color:#888; margin-bottom:6px;">
                <span>PROGRESSO</span><span style="font-weight:700; color:${corBarra};">${pct}%</span>
            </div>
            <div style="background:#eee; border-radius:4px; height:8px; overflow:hidden;">
                <div style="background:${corBarra}; width:${pct}%; height:100%; border-radius:4px; transition:width 0.4s;"></div>
            </div>
        </div>

        <!-- Cards de estatísticas -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1px; background:#eee;">

            ${statCard('✅ Conferidos', conferidos, '#2d7a4a', '#edf7f0')}
            ${statCard('⏳ Pendentes', pendentes, '#CC0000', '#fff0f0')}
            ${statCard('⚠️ Alertas', alertas, '#b87d00', '#fff9c4')}
            ${statCard('➕ Novos', novos, '#00009C', '#eef0ff')}
            ${statCard('🔄 Alternativos', alternativos, '#6a0dad', '#f5eeff')}
            ${statCard('📦 Total', total, '#1a1a1a', '#f7f7f7')}
        </div>

        <!-- GTIN -->
        <div style="border-top:1.5px solid #eee; padding:12px 16px; font-family:'IBM Plex Mono',monospace;">
            <div style="font-size:10px; font-weight:700; letter-spacing:0.1em; color:#888; margin-bottom:10px; text-transform:uppercase;">GTIN</div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:12px; color:#1a1a1a;">🔄 Atualizados (novo ≠ antigo)</span>
                <span style="font-size:14px; font-weight:700; color:#2d7a4a;">${gtinAtualizado}</span>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px;">
                <span style="font-size:12px; font-family:'IBM Plex Mono',monospace;">⚠️ Novo = Antigo (sem mudança)</span>
                <span style="font-size:14px; font-weight:700; color:#b87d00;">${gtinIgual}</span>
            </div>
        </div>
    `;

    // Fecha dropdown e abre modal
    const dd = document.getElementById('dropdown-config');
    if (dd) dd.classList.remove('aberto');
    document.getElementById('modal-stats-overlay').classList.add('aberto');
}

function statCard(label, valor, cor, bg) {
    return `
        <div style="background:${bg}; padding:14px 16px; display:flex; flex-direction:column; gap:4px;">
            <span style="font-family:'IBM Plex Mono',monospace; font-size:10px; color:#888; letter-spacing:0.08em; text-transform:uppercase;">${label}</span>
            <span style="font-family:'IBM Plex Mono',monospace; font-size:28px; font-weight:700; color:${cor}; line-height:1;">${valor}</span>
        </div>`;
}

function vibrarDispositivo(tipo) {
    if (!navigator.vibrate) return; // Se o navegador não suportar, não faz nada

    if (tipo === 'sucesso') {
        navigator.vibrate(50); // Vibração curta e única
    } else if (tipo === 'erro') {
        navigator.vibrate([100, 50, 100]); // Duas vibrações (aviso)
    } else if (tipo === 'alerta') {
        navigator.vibrate([200, 100, 200]); // Vibração mais longa para atenção
    }
}
