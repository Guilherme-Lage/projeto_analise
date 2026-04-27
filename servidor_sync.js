const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const PORT = 4000;

// ── COLOQUE SUA CHAVE AQUI ─────────────────────────────────────
// Gere uma nova em: https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = '';
// ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.resolve(__dirname)));

// ── Estado em memória ──────────────────────────────────────────
let estadoAtual = {
    itens: [],
    busca: '',
    filtro: 'todos',
    versao: 0,
    ultimaAtualizacao: null
};

// ── Aguarda mudança com timeout curto (3s) ────────────────────
function aguardarMudanca(versaoCliente, timeoutMs = 3000) {
    return new Promise(resolve => {
        if (estadoAtual.versao > versaoCliente) { resolve(); return; }
        const t = setTimeout(resolve, timeoutMs);
        const check = setInterval(() => {
            if (estadoAtual.versao > versaoCliente) {
                clearTimeout(t);
                clearInterval(check);
                resolve();
            }
        }, 200);
    });
}

// ── ROTAS ──────────────────────────────────────────────────────

// 1. Qualquer dispositivo publica estado (PC ou celular)
app.post('/sync/publicar', (req, res) => {
    const { itens, versao, busca, filtro } = req.body;
    if (!itens) return res.status(400).json({ erro: 'itens ausente' });

    estadoAtual.itens = itens;
    estadoAtual.versao = Math.max(estadoAtual.versao, versao || 0) + 1;
    estadoAtual.ultimaAtualizacao = new Date().toISOString();
    if (busca !== undefined) estadoAtual.busca = busca;
    if (filtro !== undefined) estadoAtual.filtro = filtro;

    console.log(`[SYNC] Publicado — v${estadoAtual.versao} — ${itens.length} itens — busca:"${estadoAtual.busca}"`);
    res.json({ ok: true, versao: estadoAtual.versao });
});

// 2. Retorna estado (long-poll curto: 3s)
app.get('/sync/estado', async (req, res) => {
    const versaoCliente = parseInt(req.query.versao || '0');
    if (versaoCliente >= estadoAtual.versao && estadoAtual.versao > 0) {
        await aguardarMudanca(versaoCliente, 3000);
    }
    res.json({
        versao: estadoAtual.versao,
        itens: estadoAtual.itens,
        busca: estadoAtual.busca,
        filtro: estadoAtual.filtro,
        ultimaAtualizacao: estadoAtual.ultimaAtualizacao
    });
});

// 3. Versão atual (polling leve)
app.get('/sync/versao', (req, res) => {
    res.json({ versao: estadoAtual.versao });
});

// 4. Limpa estado
app.post('/sync/limpar', (req, res) => {
    estadoAtual = {
        itens: [], busca: '', filtro: 'todos',
        versao: estadoAtual.versao + 1,
        ultimaAtualizacao: new Date().toISOString()
    };
    console.log(`[SYNC] Limpo — v${estadoAtual.versao}`);
    res.json({ ok: true, versao: estadoAtual.versao });
});

// 5. Consulta Gemini via API REST (sem SDK — mais confiável)
app.post('/sync/gemini', async (req, res) => {
    const { gtin } = req.body;
    if (!gtin) return res.status(400).json({ error: 'GTIN ausente' });

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'SUA_CHAVE_AQUI') {
        console.error('[IA] ❌ Chave da API não configurada!');
        return res.status(500).json({ error: 'Chave da API Gemini não configurada no servidor.' });
    }

    const prompt = `Você é um catalogador especialista em autopeças. 
Pesquise o código de barras / GTIN "${gtin}" e identifique o produto.
Retorne APENAS um objeto JSON válido, sem nenhum texto antes ou depois, sem markdown, sem backticks.
Formato obrigatório: {"nome": "NOME COMERCIAL DA PEÇA", "marca": "FABRICANTE", "desc": "APLICAÇÃO/VEÍCULO"}
Se não encontrar, use: {"nome": "NÃO ENCONTRADO", "marca": "---", "desc": ""}`;

    // URL da API REST do Gemini com Google Search ativado
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ],
        tools: [
            {
                google_search: {}  // Ativa a busca web nativa (sintaxe correta da API REST)
            }
        ],
        generationConfig: {
            temperature: 0.1,       // Respostas mais precisas/consistentes
            maxOutputTokens: 256
        }
    };

    console.log(`[IA] 🔍 Consultando Gemini para GTIN: ${gtin}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            timeout: 30000 // 30 segundos
        });

        const textoResposta = await response.text();

        // Mostra o erro real da API no terminal para facilitar debug
        if (!response.ok) {
            console.error(`[IA] ❌ Erro HTTP ${response.status}:`, textoResposta);
            return res.status(500).json({
                error: `Erro na API Gemini (HTTP ${response.status})`,
                detalhe: textoResposta
            });
        }

        const dados = JSON.parse(textoResposta);

        // Extrai o texto da resposta da estrutura do Gemini
        const partes = dados?.candidates?.[0]?.content?.parts;
        const textoIA = partes?.find(p => p.text)?.text || '';

        console.log('[IA] Resposta bruta:', textoIA);

        if (!textoIA) {
            console.warn('[IA] ⚠️  Nenhum texto retornado. Resposta completa:', JSON.stringify(dados, null, 2));
            return res.json({ ok: true, produto: { nome: 'PEÇA NÃO LOCALIZADA', marca: '---', desc: '' } });
        }

        // Extrai o JSON do texto (ignora qualquer texto ao redor)
        const match = textoIA.match(/\{[\s\S]*?\}/);
        if (match) {
            const produto = JSON.parse(match[0]);
            console.log('[IA] ✅ Produto encontrado:', produto);
            return res.json({
                ok: true,
                produto: {
                    nome: (produto.nome || 'NÃO ENCONTRADO').toUpperCase(),
                    marca: (produto.marca || '---').toUpperCase(),
                    desc: (produto.desc || '').toUpperCase()
                }
            });
        }

        // Se não tem JSON mas tem texto, loga para debug
        console.warn('[IA] ⚠️  Texto retornado mas sem JSON válido:', textoIA);
        return res.json({ ok: true, produto: { nome: 'PEÇA NÃO LOCALIZADA', marca: '---', desc: '' } });

    } catch (erro) {
        // Agora o erro REAL aparece no terminal
        console.error('[IA] ❌ ERRO REAL:', erro.message || erro);
        return res.status(500).json({
            error: 'Erro interno ao consultar Gemini',
            detalhe: erro.message
        });
    }
});


app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let ipLocal = 'SEU_IP';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) { ipLocal = net.address; break; }
        }
    }

    const chaveOk = GEMINI_API_KEY && GEMINI_API_KEY !== 'SUA_CHAVE_AQUI';

    console.log(`\n✅ Servidor de Sync rodando!`);
    console.log(`💻 PC:      http://localhost:${PORT}`);
    console.log(`📱 Celular: http://${ipLocal}:${PORT}`);
    console.log(`🔑 Gemini:  ${chaveOk ? '✅ Chave configurada' : '❌ CHAVE NÃO CONFIGURADA — edite GEMINI_API_KEY no topo do arquivo'}`);
    console.log(`\nPressione Ctrl+C para parar.\n`);
});