const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { GoogleGenAI } = require('@google/genai'); 
const app = express();
const PORT = 4000;

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

// 1. Qualquer dispositivo fica estado (PC ou celular)
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

app.post('/sync/gemini', async (req, res) => {
    const { gtin } = req.body;
    if (!gtin) return res.status(400).json({ error: 'GTIN ausente' });

    const chaveFixa = '';

    try {
        // Inicializa o cliente do Gemini com a sua chave
        const ai = new GoogleGenAI({ apiKey: chaveFixa });

        const prompt = `Você é um robô catalogador de estoque. Identifique o produto real correspondente ao código de barras (GTIN/EAN) "${gtin}".
Você DEVE retornar OBRIGATORIAMENTE apenas um objeto JSON e rigorosamente nada além disso. 

Sua resposta deve ser estruturada exatamente assim:
{
  "nome": "NOME COMERCIAL DO PRODUTO EM CAIXA ALTA",
  "marca": "MARCA DO PRODUTO EM CAIXA ALTA",
  "desc": "Breve descrição de utilização"
}

Se você não encontrar o produto correspondente ao código "${gtin}", preencha o nome e a marca com "NÃO ENCONTRADO", mas mantenha o JSON válido.`;

        // Executa a chamada usando o modelo recomendado
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                // Força o modelo a responder estritamente em formato JSON
                responseMimeType: "application/json" 
            }
        });

        const textoResposta = response.text;

        if (!textoResposta) {
            return res.status(500).json({ error: "O Gemini não retornou uma resposta válida." });
        }

        // Converte o texto JSON retornado pela IA diretamente em Objeto
        const produto = JSON.parse(textoResposta.trim());

        const respostaFinal = {
            nome: produto.nome || "NÃO ENCONTRADO",
            marca: produto.marca || "NÃO ENCONTRADO",
            desc: produto.desc || "Sem descrição disponível."
        };

        res.json({ ok: true, produto: respostaFinal });

    } catch (e) {
        console.error("Erro no processo da IA via SDK:", e);
        res.status(500).json({ error: "Falha ao processar a requisição usando o SDK do Gemini." });
    }
});
app.listen(PORT, '0.0.0.0', () => {
    // Descobre o IP local para mostrar no terminal
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let ipLocal = 'SEU_IP';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) { ipLocal = net.address; break; }
        }
    }
    console.log(`\n✅ Servidor de Sync rodando!`);
    console.log(`💻 PC:      http://localhost:${PORT}`);
    console.log(`📱 Celular: http://${ipLocal}:${PORT}`);
    console.log(`\nPressione Ctrl+C para parar.\n`);
});