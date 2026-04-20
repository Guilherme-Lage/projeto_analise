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

        // 9. Abrir Modal e dar Foco com Trava de Bip Duplo (Debounce)
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
                        elQtd.focus();
                        elQtd.select();
                    }
                };
            }

            if (elQtd) {
                elQtd.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        const agora = Date.now();
                        const intervalo = agora - ultimoBipTime;

                        const valorNoCampo = elQtd.value.trim();
                        const gtinReferencia = elGtinNovo.value.trim();

                        // Se o valor for o GTIN (Bip da máquina)
                        if (valorNoCampo === gtinReferencia && gtinReferencia !== "") {
                            e.preventDefault();

                            // BLOQUEIO: Se o intervalo for menor que 500ms, ignora o bip
                            if (intervalo < 400) {
                                console.warn("Bip duplo ignorado");
                                elQtd.select();
                                return;
                            }

                            ultimoBipTime = agora; // Atualiza o tempo do último bip válido

                            let contagemAtual = parseFloat(item.qtdConferida) || 0;
                            item.qtdConferida = contagemAtual + 1;
                            
                            elQtd.value = item.qtdConferida;
                            elQtd.select(); 
                            console.log("Bip detectado: +1");
                        } 
                        // Se o campo estiver vazio ou for número (Enter manual do teclado)
                        else if (valorNoCampo === "" || !isNaN(valorNoCampo)) {
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

    if (lista.children.length > 100) {
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
        if (linhas.length < 2) { alert('Arquivo CSV vazio ou inválido.'); return; }

        const sep = linhas[0].includes('|') ? '|' : (linhas[0].includes(';') ? ';' : ',');
        const cabecalho = parseLinhaCsv(linhas[0], sep).map(v => v.toUpperCase().trim());
        const idx = (nome) => cabecalho.findIndex(c => c.includes(nome.toUpperCase()));

        const ehExportado = idx('STATUS') >= 0 && idx('LOCACAO') >= 0 && idx('CODIGO') >= 0;
        itens = [];

        // Captura o índice da coluna UTILIZACAO globalmente
        const iUtilizacao = cabecalho.findIndex(c => c.includes('UTILIZACAO_ITEM') || c === 'UTILIZACAO');
        console.log("Índice da Utilização detectado:", iUtilizacao);
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
                    utilizacao: iUtilizacao >= 0 ? cols[iUtilizacao] : '', // CAPTURA NO EXPORTADO
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
                    utilizacao: iUtilizacao >= 0 ? cols[iUtilizacao] : '', // CAPTURA NO ORIGINAL
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
    const elConf = document.getElementById('cnt-conf');
    const elTotal = document.getElementById('cnt-total');
    const painel = document.getElementById('contador');

    if (itens.length > 0) {
        painel.style.display = 'block';

        const total = itens.length;
        const conferidos = itens.filter(i => i.conferido).length;

        if (elConf) elConf.textContent = conferidos;
        if (elTotal) elTotal.textContent = total;

        // --- LÓGICA DE CORES ---
        if (conferidos === 0) {
            // 1. BRANCO quando for zero
            painel.style.backgroundColor = "#ffffff";
            painel.style.color = "#000000";
        } else if (conferidos < total) {
            // 2. AMARELO enquanto estiver conferindo
            painel.style.backgroundColor = "#fff9c4"; // Amarelo suave
            painel.style.color = "#000000"; // Marrom para ler melhor no amarelo
        } else {
            // 3. VERDE quando o total for atingido
            painel.style.backgroundColor = "#155724"; // Verde suave
            painel.style.color = "#ffffff"; // Verde escuro para o texto
        }
    } else {
        if (painel) painel.style.display = 'none';
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

    if (tipo === 'nome') {
        resultados.sort((a, b) => {
            const nomA = (a.nome || "").toUpperCase();
            const nomB = (b.nome || "").toUpperCase();

            // Ordem Alfabética simples de A a Z
            return nomA.localeCompare(nomB);
        });
    }
    if (tipo === 'codigo') {
        resultados.sort((a, b) => {
            const codA = a.codigo.toUpperCase();
            const codB = b.codigo.toUpperCase();

            // A. Prioridade por Relevância do Código
            if (codA === busca && codB !== busca) return -1;
            if (codB === busca && codA !== busca) return 1;

            const iniciaA = codA.startsWith(busca);
            const iniciaB = codB.startsWith(busca);
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

        // 1. Cabeçalho com UTILIZACAO após o NOME
        let colunas = [
            'STATUS', 'MARCA', 'CODIGO', 'NOME', 'UTILIZACAO_ITEM', // Adicionado aqui
            'QTD_SISTEMA', 'QTD_CONFERIDA', 'LOCACAO', 'LOCACAO_NOVA',
            'GTIN_ANTIGO', 'GTIN_NOVO', 'DATA_HORA'
        ];

        for (let i = 1; i <= maxFotos; i++) {
            colunas.push(`FOTO_${i}`);
        }

        const linhas = [colunas.join('|')];

        // 2. Processamento dos itens
        itens.forEach(item => {
            const qtdC = item.qtdConferida != null ? item.qtdConferida : '';

            let statusExport = 'PENDENTE';
            if (item.ehAlternativo) {
                statusExport = 'ALTERNATIVO';
            } else if (item.conferido) {
                statusExport = 'OK';
            }

            let registro = [
                statusExport,
                item.marca || '',
                item.codigo,
                `"${item.nome}"`,
                `"${item.utilizacao || ''}"`, // Garante que o valor capturado seja escrito
                item.qtd,
                qtdC,
                item.locacaoOriginal || item.locacao,
                item.locacaoNova || '',
                item.gtinAntigo || '',
                item.gtinNovo || '',
                item.dataHoraRegistro || ''
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
        item.dataHoraRegistro = new Date().toLocaleDateString('pt-BR') + ' ' +
            new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // 4. Log e Backup
        try { adicionarLog(item); } catch (e) { }
        await salvarBackup();

        // 5. FECHAR MODAL PRIMEIRO
        fecharModal();

        // 6. RESTAURAR CONTEXTO (ESTANTE) ANTES DE SINCRONIZAR
        ultimaLocacaoClicada = "";
        if (contextoAnterior) {
            document.getElementById('filtro-tipo').value = contextoAnterior.tipo;
            document.getElementById('busca').value = contextoAnterior.valor;
            filtrar(); // Aplica o filtro da estante localmente
        } else {
            document.getElementById('busca').value = "";
            document.getElementById('filtro-tipo').value = "todos";
            renderizarTabela(itens);
        }

        // 7. SINCRONIZAR (Agora ele vai ler os inputs já restaurados para 'estante')
        syncPublicar();

        atualizarContador();

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
        <div onclick="selecionarSugestao('${item.codigo.replace(/'/g, "\\'")}','${item.nome.replace(/'/g, "\\'")}','${(item.marca || '').replace(/'/g, "\\'")}','${(item.gtinAntigo || '').replace(/'/g, "\\'")}')"
            style="padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; line-height:1.3; background:#fff;"
            onmouseover="this.style.background='#eef0ff'"
            onmouseout="this.style.background='#fff'">
            <div style="font-weight:700; color:#00009C; font-size:11px;">${item.codigo}</div>
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
    syncPublicar(); // Sincroniza com celular

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
        syncPublicar();
        renderizarTabela(itens);
        atualizarContador();
        fecharModal();
    }
}



let fotosTempNovo = []; // Armazena as fotos antes de salvar o item

// ═══════════════════════════════════════════════════════════════
//  SINCRONIZAÇÃO BIDIRECIONAL (PC <-> CELULAR)
// ═══════════════════════════════════════════════════════════════

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
    // Ambos os dispositivos verificam ao carregar E fazem polling
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
function abrirLegenda() {
    document.getElementById('modal-legenda').classList.add('aberto');
    // Fecha o menu da engrenagem ao abrir a legenda
    document.getElementById('dropdown-config').classList.remove('aberto');
}

function fecharLegenda() {
    document.getElementById('modal-legenda').classList.remove('aberto');
}

function fecharLegendaFora(e) {
    if (e.target === document.getElementById('modal-legenda')) fecharLegenda();
}