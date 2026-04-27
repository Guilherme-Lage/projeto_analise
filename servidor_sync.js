const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
const googleIt = require('google-it');
const { getJson } = require("serpapi");
const app = express();
const PORT = 4000;

// ── IA LOCAL (Ollama + Gemma3) — sem chave, sem limite ────────
// Instale: https://ollama.com/download
// Baixe o modelo: ollama pull gemma3:4b
// Se seu PC for potente (16GB+ RAM): ollama pull gemma3:12b
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'gemma3:4b';
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

// 5. Consulta IA local via Ollama (Gemma3 — sem chave, sem limite)
app.post('/sync/gemini', async (req, res) => {
    const { gtin } = req.body;
    const SERP_API_KEY = "ac7e806331532e4af96ee3df4bfe224455efbae00c7eddc1a7305969178a4236"; // Sua chave da SerpApi

    if (!gtin) return res.status(400).json({ error: 'GTIN ausente' });

    console.log(`[IA+WEB] 🔍 Buscando e catalogando GTIN: ${gtin}`);

    try {
        // 1. BUSCA NO GOOGLE VIA SERPAPI
        const searchResponse = await getJson({
            engine: "google",
            q: `produto autopeça aplicação EAN ${gtin}`, // Adicionado "aplicação" para vir os carros
            api_key: SERP_API_KEY
        });

        const contextoWeb = (searchResponse.organic_results || [])
            .slice(0, 4) // Pegamos 4 resultados para ter mais chance de achar os carros
            .map(r => r.snippet)
            .join(" | ");
        let ladoDetectado = "";
        const textoParaBusca = contextoWeb.toUpperCase();

        if (textoParaBusca.includes("DIREITO") || textoParaBusca.includes(" LD")) ladoDetectado = "DIREITO";
        if (textoParaBusca.includes("ESQUERDO") || textoParaBusca.includes(" LE")) ladoDetectado = "ESQUERDO";
        if (textoParaBusca.includes(" TRASEIRO")) ladoDetectado += " TRASEIRO";
        if (textoParaBusca.includes(" DIANTEIRO")) ladoDetectado += " DIANTEIRO";

        const prompt = `Você é um catalogador técnico de autopeças.
DADOS DA BUSCA: ${contextoWeb}
GTIN: ${gtin}

REGRAS OBRIGATÓRIAS:
1. NOME: [PEÇA] + [CARRO] + [ANOS ENCONTRADOS].
2. RIGOR COM ANOS: Extraia apenas os anos que aparecem de forma EXPLICITA nos dados acima. 
   - Se o dado diz "01 a 06", escreva "2001-2006".
   - Se o dado NÃO informa o ano final, NÃO use termos como "EM DIANTE" ou "ATUAL".
   - Na dúvida entre várias fontes, use o intervalo que aparece com mais frequência ou o mais curto (mais conservador).
3. PROIBIDO INVENTAR: Se os dados da web estiverem confusos ou incompletos sobre o ano, coloque apenas o NOME DA PEÇA e o CARRO.
4. PEÇAS COM LADO: Verifique se a peça possui lado (DIREITO/ESQUERDO ou LD/LE).
   - Se encontrar, adicione obrigatoriamente ao NOME (ex: AMORTECEDOR DIANTEIRO DIREITO CIVIC).
   - Se os dados não informarem o lado, adicione "[VERIFICAR LADO]" ao nome para alertar o usuário.
Exemplo de formato: "FILTRO DE AR CIVIC 2001-2006"

Responda APENAS JSON:
{
  "nome": "NOME + CARRO + ANOS REAIS",
  "marca": "MARCA",
  "desc": "APLICAÇÃO RESUMIDA"
}
Se os dados da busca forem inconclusivos, retorne: {"nome": "NÃO ENCONTRADO", "marca": "---", "desc": ""}`;


        const ollamaRes = await fetch(OLLAMA_URL, {
            method: 'POST',
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: prompt,
                stream: false,
                format: 'json',
                options: { temperature: 0.1 }
            })
        });

        const dados = await ollamaRes.json();
        const produto = JSON.parse(dados.response || "{}");

        // --- LOG NO TERMINAL ---
        console.log(`\n--- [IA] RESULTADO DA CONSULTA ---`);
        console.log(`GTIN: ${gtin}`);
        console.log(`NOME: ${produto.nome}`);
        console.log(`MARCA: ${produto.marca}`);
        console.log(`DESC/ANOS: ${produto.desc}`); // <--- Isso vai mostrar no seu terminal
        console.log(`----------------------------------\n`);

        res.json({
            ok: true,
            produto: {
                nome: (produto.nome || 'NÃO ENCONTRADO').toUpperCase(),
                marca: (produto.marca || '---').toUpperCase(),
                desc: (produto.desc || '').toUpperCase() // <--- Envia para o seu app
            }
        });
    } catch (erro) {
        console.error('[IA] ❌ ERRO:', erro.message);
        res.status(500).json({ error: 'Erro na consulta', detalhe: erro.message });
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

    console.log(`\n✅ Servidor rodando!`);
    console.log(`💻 PC:      http://localhost:${PORT}`);
    console.log(`📱 Celular: http://${ipLocal}:${PORT}`);
    console.log(`🤖 IA:      Ollama local (${OLLAMA_MODEL}) — sem chave, sem limite`);
    console.log(`\n⚠️  Certifique-se que o Ollama está rodando: ollama serve`);
    console.log(`⚠️  E que o modelo foi baixado:             ollama pull ${OLLAMA_MODEL}`);
    console.log(`\nPressione Ctrl+C para parar.\n`);
});