/**
 * Configuração e Cliente HTTP da API Central — Plataforma do Público Geral (SEBPC/MG)
 * Suporta consumo via API Central local (00_API_e_Dados) e fallback estático automático
 * de alta disponibilidade para GitHub Pages / hospedagem sem backend em nuvem.
 */
(function () {
  'use strict';

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const DEFAULT_API_URL = isLocalHost ? 'http://localhost:8090' : '';
  window.SEBPC_API_URL = (window.SEBPC_API_URL || localStorage.getItem('sebpc_api_url') || DEFAULT_API_URL).replace(/\/+$/, '');

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string') {
      if (input.startsWith('/api/')) {
        if (window.SEBPC_API_URL) {
          input = window.SEBPC_API_URL + input;
        } else {
          // Mapeamento de rotas para fallback estático relativo
          if (input.includes('/bibliotecas')) input = '../00_API_e_Dados/data/bibliotecas_publico.json';
          else if (input.includes('/municipios')) input = '../00_API_e_Dados/data/municipios_mg.json';
          else if (input.includes('/estado')) input = '../00_API_e_Dados/data/estado_mg.json';
          else if (input.includes('/mascara')) input = '../00_API_e_Dados/data/mascara_fora_mg.json';
        }
      }
    }
    return originalFetch(input, init);
  };

  async function loadStaticFallback() {
    console.warn('[SEBPC API Publico] Ativando carregamento direto dos dados estáticos (GitHub Pages / Standalone)...');
    const staticBase = '../00_API_e_Dados/data';
    const [bibRes, munRes, estRes, mascRes] = await Promise.all([
      originalFetch(`${staticBase}/bibliotecas_publico.json`),
      originalFetch(`${staticBase}/municipios_mg.json`),
      originalFetch(`${staticBase}/estado_mg.json`),
      originalFetch(`${staticBase}/mascara_fora_mg.json`)
    ]);

    if (!bibRes.ok) throw new Error(`Falha ao carregar bibliotecas publicas estaticas: HTTP ${bibRes.status}`);

    const [bibData, munData, estData, mascData] = await Promise.all([
      bibRes.json(),
      munRes.ok ? munRes.json() : null,
      estRes.ok ? estRes.json() : null,
      mascRes.ok ? mascRes.json() : null
    ]);

    window.BIBLIOTECAS_DATA = bibData;
    if (munData) window.MUNICIPIOS_GEOJSON = munData;
    if (estData) window.ESTADO_MG_GEOJSON = estData;
    if (mascData) window.MASCARA_FORA_MG_GEOJSON = mascData;
  }

  window.SEBPC_loadBootstrapData = async function () {
    const base = window.SEBPC_API_URL;
    if (!base) {
      // Modo nuvem direta / GitHub Pages sem servidor local
      return loadStaticFallback();
    }

    try {
      const [bibRes, munRes, estRes, mascRes] = await Promise.all([
        originalFetch(`${base}/api/publico/bibliotecas`),
        originalFetch(`${base}/api/publico/municipios`),
        originalFetch(`${base}/api/publico/estado`),
        originalFetch(`${base}/api/publico/mascara`)
      ]);

      if (!bibRes.ok) throw new Error(`Falha ao carregar bibliotecas publicas: HTTP ${bibRes.status}`);

      const [bibData, munData, estData, mascData] = await Promise.all([
        bibRes.json(),
        munRes.ok ? munRes.json() : null,
        estRes.ok ? estRes.json() : null,
        mascRes.ok ? mascRes.json() : null
      ]);

      window.BIBLIOTECAS_DATA = bibData;
      if (munData) window.MUNICIPIOS_GEOJSON = munData;
      if (estData) window.ESTADO_MG_GEOJSON = estData;
      if (mascData) window.MASCARA_FORA_MG_GEOJSON = mascData;
    } catch (err) {
      console.warn('[SEBPC API Publico] API Central indisponível, acionando fallback estático:', err);
      try {
        await loadStaticFallback();
      } catch (staticErr) {
        console.error('[SEBPC API Publico] Erro crítico ao carregar dados locais:', staticErr);
        const countEl = document.getElementById('results-count');
        if (countEl) {
          countEl.textContent = 'Erro ao inicializar base de dados.';
        }
      }
    }
  };
})();
