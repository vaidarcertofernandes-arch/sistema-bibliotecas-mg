/**
 * Módulo de Inteligência Analítica e Dashboard Executivo
 * Sistema Estadual de Bibliotecas Públicas e Comunitárias de Minas Gerais (SEBPC/MG)
 * Diretoria do Livro, Leitura, Literatura e Bibliotecas (DLLLB / SECULT-MG)
 * 
 * Atribuição Obrigatória: gmp_git_agentskills_v1
 */

(function () {
  'use strict';

  window.SEBPC_Dashboard = {
    initialized: false,
    idhmData: {},
    icmsData: {},
    activeTab: 'visao_geral',
    municData: {},
    filtroMunicModo: 'conselho',
    termoMunicAtivo: '', // 'visao_geral', 'vulnerabilidade', 'acoes_ppag', 'icms_dac', 'tabela_prioridades'
    
    /**
     * Inicialização e Carregamento Assíncrono dos Dados de Inteligência
     */
    init: async function () {
      try {
        if (window.IDHM_MUNICIPIOS_MG && Object.keys(window.IDHM_MUNICIPIOS_MG).length > 0) {
          this.idhmData = window.IDHM_MUNICIPIOS_MG;
        }
        if (window.ICMS_PATRIMONIO_CULTURAL_2026 && Object.keys(window.ICMS_PATRIMONIO_CULTURAL_2026).length > 0) {
          this.icmsData = window.ICMS_PATRIMONIO_CULTURAL_2026;
        }
        if (window.MUNIC_CULTURA_MG && window.MUNIC_CULTURA_MG.dados) {
          this.municData = window.MUNIC_CULTURA_MG;
        }

        if (!this.idhmData || Object.keys(this.idhmData).length === 0 || !this.icmsData || Object.keys(this.icmsData).length === 0 || !this.municData || !this.municData.dados) {
          const [resIdhm, resIcms, resMunic] = await Promise.all([
            (!this.idhmData || Object.keys(this.idhmData).length === 0) ? fetch('data/idhm_municipios_mg.json').then(r => r.ok ? r.json() : {}).catch(() => ({})) : Promise.resolve(this.idhmData),
            (!this.icmsData || Object.keys(this.icmsData).length === 0) ? fetch('data/icms_patrimonio_cultural_2026.json').then(r => r.ok ? r.json() : {}).catch(() => ({})) : Promise.resolve(this.icmsData),
            (!this.municData || !this.municData.dados) ? fetch('data/munic_cultura_mg.json').then(r => r.ok ? r.json() : {}).catch(() => ({})) : Promise.resolve(this.municData)
          ]);
          if (!this.idhmData || Object.keys(this.idhmData).length === 0) this.idhmData = resIdhm || {};
          if (!this.icmsData || Object.keys(this.icmsData).length === 0) this.icmsData = resIcms || {};
          if (!this.municData || !this.municData.dados) this.municData = resMunic || {};
        }
      } catch (err) {
        console.warn('Aviso ao carregar bases complementares do dashboard:', err);
      }
      
      if (!this.eventsBound) {
        this.bindEvents();
        this.eventsBound = true;
      }
      this.initialized = true;
      this.render();
    },

    bindEvents: function () {
      const btnToggle = document.getElementById('btn-toggle-dashboard-mode');
      if (btnToggle) {
        btnToggle.addEventListener('click', () => {
          this.toggleDashboardMode();
        });
      }

      // Eventos das abas do dashboard
      document.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.dash-tab-btn');
        if (tabBtn && tabBtn.dataset.tab) {
          this.setTab(tabBtn.dataset.tab);
        }
      });
    },

    toggleDashboardMode: function () {
      const body = document.body;
      const isDashActive = body.classList.toggle('dashboard-mode-active');
      const btnToggle = document.getElementById('btn-toggle-dashboard-mode');
      const mapLayout = document.querySelector('.main-layout');
      const dashView = document.getElementById('dashboard-view');
      
      if (btnToggle) {
        if (isDashActive) {
          btnToggle.innerHTML = `
            <span class="btn-icon">🗺️</span>
            <span>Ver Mapa</span>
          `;
          btnToggle.classList.add('active');
          if (mapLayout) mapLayout.style.display = 'none';
          if (dashView) {
            dashView.style.display = 'block';
            this.render();
          }
        } else {
          btnToggle.innerHTML = `
            <span class="btn-icon">📊</span>
            <span>Dashboard Executivo</span>
          `;
          btnToggle.classList.remove('active');
          if (dashView) dashView.style.display = 'none';
          if (mapLayout) {
            mapLayout.style.display = 'flex';
            // Notifica o Google Maps para redimensionar se necessário
            if (window.__state && window.__state.map) {
              google.maps.event.trigger(window.__state.map, 'resize');
            }
          }
        }
      }
    },

    setTab: function (tabKey) {
      this.activeTab = tabKey;
      document.querySelectorAll('.dash-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabKey);
      });
      document.querySelectorAll('.dash-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `dash-panel-${tabKey}`);
      });
    },

    /**
     * Normalizador de Strings para cruzamento fonético de municípios
     */
    norm: function (s) {
      if (!s) return '';
      return s.toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    },

    /**
     * Filtro dinâmico da Matriz Territorial de Busca Ativa
     */
    filtrarTabelaBuscaAtiva: function (termo) {
      const q = this.norm(termo || '');
      const rows = document.querySelectorAll('.busca-ativa-row');
      let visiveis = 0;
      rows.forEach(r => {
        const text = this.norm(r.dataset.search || '');
        const match = !q || text.includes(q);
        r.style.display = match ? '' : 'none';
        if (match) visiveis++;
      });
      const countEl = document.getElementById('dash-busca-ativa-count');
      if (countEl) {
        countEl.textContent = q ? `Mostrando ${visiveis} de ${rows.length} municípios filtrados` : `Mostrando ${rows.length} municípios desassistidos`;
      }
    },

    sortStateBuscaAtiva: { col: null, asc: true },
    sortStateIcms: { col: null, asc: true },

    ordenarTabelaBuscaAtiva: function (colIdx, tipo) {
      const table = document.getElementById('table-busca-ativa');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (this.sortStateBuscaAtiva.col === colIdx) {
        this.sortStateBuscaAtiva.asc = !this.sortStateBuscaAtiva.asc;
      } else {
        this.sortStateBuscaAtiva.col = colIdx;
        this.sortStateBuscaAtiva.asc = true;
      }
      const asc = this.sortStateBuscaAtiva.asc;

      rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[colIdx];
        const cellB = rowB.cells[colIdx];
        if (!cellA || !cellB) return 0;
        let valA = cellA.innerText.trim();
        let valB = cellB.innerText.trim();

        if (tipo === 'num') {
          const numA = parseFloat(valA.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          const numB = parseFloat(valB.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          return asc ? numA - numB : numB - numA;
        } else if (tipo === 'porte') {
          const porteOrder = { 'grande': 3, 'médio': 2, 'medio': 2, 'pequeno': 1 };
          const pA = porteOrder[valA.toLowerCase()] || 0;
          const pB = porteOrder[valB.toLowerCase()] || 0;
          return asc ? pA - pB : pB - pA;
        } else {
          return asc ? valA.localeCompare(valB, 'pt-BR') : valB.localeCompare(valA, 'pt-BR');
        }
      });

      rows.forEach(r => tbody.appendChild(r));

      table.querySelectorAll('thead th').forEach((th, idx) => {
        const titleText = th.dataset.colName || th.innerText.replace(/[▲▼⇅]/g, '').trim();
        th.dataset.colName = titleText;
        if (idx === colIdx) {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#2563eb;">${asc ? '▲' : '▼'}</span>`;
        } else {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#94a3b8;">⇅</span>`;
        }
      });
    },

    ordenarTabelaIcms: function (colIdx, tipo) {
      const table = document.getElementById('table-radar-icms');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (this.sortStateIcms.col === colIdx) {
        this.sortStateIcms.asc = !this.sortStateIcms.asc;
      } else {
        this.sortStateIcms.col = colIdx;
        this.sortStateIcms.asc = true;
      }
      const asc = this.sortStateIcms.asc;

      rows.sort((rowA, rowB) => {
        const cellA = rowA.cells[colIdx];
        const cellB = rowB.cells[colIdx];
        if (!cellA || !cellB) return 0;
        let valA = cellA.innerText.trim();
        let valB = cellB.innerText.trim();

        if (tipo === 'num') {
          const numA = parseFloat(valA.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          const numB = parseFloat(valB.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
          return asc ? numA - numB : numB - numA;
        } else {
          return asc ? valA.localeCompare(valB, 'pt-BR') : valB.localeCompare(valA, 'pt-BR');
        }
      });

      rows.forEach(r => tbody.appendChild(r));

      table.querySelectorAll('thead th').forEach((th, idx) => {
        if (idx === 0 || idx === 6) return;
        const titleText = th.dataset.colName || th.innerText.replace(/[▲▼⇅]/g, '').trim();
        th.dataset.colName = titleText;
        if (idx === colIdx) {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#2563eb;">${asc ? '▲' : '▼'}</span>`;
        } else {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#94a3b8;">⇅</span>`;
        }
      });
    },

    
    setFiltroMunic: function (modo) {
      this.filtroMunicModo = modo;
      ['conselho', 'fundo', 'cpf', 'exclusiva', 'todos'].forEach(m => {
        const btn = document.getElementById(`btn-munic-tab-${m}`);
        if (btn) btn.classList.toggle('active', m === modo);
      });
      this.aplicarFiltrosTabelaMunic();
    },

    filtrarTabelaMunic: function (termo) {
      this.termoMunicAtivo = termo || '';
      this.aplicarFiltrosTabelaMunic();
    },

    aplicarFiltrosTabelaMunic: function () {
      const q = this.norm(this.termoMunicAtivo);
      const modo = this.filtroMunicModo;
      const rows = document.querySelectorAll('.munic-row');
      let visiveis = 0;
      rows.forEach(r => {
        const text = this.norm(r.dataset.search || '');
        const matchText = !q || text.includes(q);
        let matchModo = true;
        if (modo === 'conselho') matchModo = r.dataset.conselho === '1';
        else if (modo === 'fundo') matchModo = r.dataset.fundo === '1';
        else if (modo === 'cpf') matchModo = r.dataset.cpf === '1';
        else if (modo === 'exclusiva') matchModo = r.dataset.exclusiva === '1';

        const show = matchText && matchModo;
        r.style.display = show ? '' : 'none';
        if (show) visiveis++;
      });
      const countEl = document.getElementById('dash-munic-count');
      if (countEl) {
        countEl.textContent = `Mostrando ${visiveis} de 395 municípios desassistidos`;
      }
    },

    ordenarTabelaMunic: function (colIdx, tipo) {
      const table = document.getElementById('table-munic-perfil');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const isAsc = table.dataset.sortCol === String(colIdx) && table.dataset.sortDir === 'asc';
      const asc = !isAsc;
      table.dataset.sortCol = String(colIdx);
      table.dataset.sortDir = asc ? 'asc' : 'desc';

      rows.sort((a, b) => {
        const cellA = (a.cells[colIdx] ? a.cells[colIdx].innerText : '').trim();
        const cellB = (b.cells[colIdx] ? b.cells[colIdx].innerText : '').trim();
        if (tipo === 'num') {
          const numA = parseFloat(cellA.replace(/[^\d.-]/g, '')) || 0;
          const numB = parseFloat(cellB.replace(/[^\d.-]/g, '')) || 0;
          return asc ? numA - numB : numB - numA;
        }
        return asc ? cellA.localeCompare(cellB, 'pt-BR') : cellB.localeCompare(cellA, 'pt-BR');
      });

      rows.forEach(r => tbody.appendChild(r));

      table.querySelectorAll('thead th').forEach((th, idx) => {
        const titleText = th.dataset.colName || th.innerText.replace(/[▲▼⇅]/g, '').trim();
        th.dataset.colName = titleText;
        if (idx === colIdx) {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#2563eb;">${asc ? '▲' : '▼'}</span>`;
        } else {
          th.innerHTML = `${titleText} <span style="font-size:0.7rem;color:#94a3b8;">⇅</span>`;
        }
      });
    },

    copiarFichaMunic: function (ibgeCode) {
      const municList = (this.municData && this.municData.dados) ? this.municData.dados : [];
      const item = municList.find(m => String(m.codigo_ibge) === String(ibgeCode));
      if (!item) return;

      const texto = [
        `=== FICHA DE ARTICULAÇÃO INSTITUCIONAL (MUNIC/IBGE) ===`,
        `Município: ${item.municipio} (IBGE: ${item.codigo_ibge})`,
        `Órgão Gestor: ${item.orgao_gestor}`,
        `Conselho Municipal de Cultura: ${item.conselho_cultura}`,
        `Fundo Municipal de Cultura: ${item.fundo_cultura}`,
        `Plano Municipal de Cultura: ${item.plano_cultura}`,
        `Conselho de Patrimônio Cultural: ${item.conselho_patrimonio}`,
        `Tripé CPF da Cultura: ${item.cpf_cultura ? 'SIM (Completo)' : 'Incompleto'}`,
        `Escolaridade do Gestor: ${item.escolaridade_gestor || 'Não informada'}`,
        `Servidores no Órgão: Concursados: ${item.recursos_humanos ? item.recursos_humanos.pct_concursados + '%' : '-'} | Temporários: ${item.recursos_humanos ? item.recursos_humanos.pct_temporarios + '%' : '-'}`,
        `Status Biblioteca: SEM BIBLIOTECA PÚBLICA ATIVA`,
        `Recomendação SEBPC/MG: Articulação direta com o Conselho Municipal de Cultura e pasta de gestão para proposta de criação de biblioteca pública municipal por lei.`
      ].join('\n');

      navigator.clipboard.writeText(texto).then(() => {
        alert(`Ficha de articulação de ${item.municipio} copiada para a área de transferência!`);
      }).catch(() => {
        prompt(`Copie a ficha institucional de ${item.municipio}:`, texto);
      });
    },

    filtroIcmsAtivo: 'todos',
    termoIcmsAtivo: '',

    setFiltroIcms: function (modo) {
      this.filtroIcmsAtivo = modo;
      ['todos', 'lanterna', 'zero1a'].forEach(m => {
        const btn = document.getElementById(`btn-icms-tab-${m}`);
        if (btn) btn.classList.toggle('active', m === modo);
      });
      this.aplicarFiltrosTabelaIcms();
    },

    filtrarTabelaIcms: function (termo) {
      this.termoIcmsAtivo = termo || '';
      this.aplicarFiltrosTabelaIcms();
    },

    aplicarFiltrosTabelaIcms: function () {
      const q = this.norm(this.termoIcmsAtivo);
      const modo = this.filtroIcmsAtivo;
      const rows = document.querySelectorAll('.icms-row');
      let visiveis = 0;
      rows.forEach(r => {
        const text = this.norm(r.dataset.search || '');
        const matchText = !q || text.includes(q);
        let matchModo = true;
        if (modo === 'lanterna') matchModo = r.dataset.lanterna === '1';
        if (modo === 'zero1a') matchModo = r.dataset.zero1a === '1';

        const match = matchText && matchModo;
        r.style.display = match ? '' : 'none';
        if (match) visiveis++;
      });
      const countEl = document.getElementById('dash-icms-count');
      if (countEl) {
        countEl.textContent = `Mostrando ${visiveis} de ${rows.length} municípios com biblioteca aberta sem DAC`;
      }
    },

    toggleGaleriaDacCompleta: function () {
      const el = document.getElementById('galeria-dac-completa-wrapper');
      const btn = document.getElementById('btn-toggle-dac-completa');
      if (el) {
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
        if (btn) {
          btn.innerHTML = isHidden ? '🔼 Ocultar Galeria Histórica (21)' : '👁️ Ver Galeria Histórica dos 21 Municípios';
        }
      }
    },

    /**
     * Renderização Principal do Dashboard Executivo
     */
    render: function () {
      const container = document.getElementById('dashboard-view');
      if (window.MUNIC_CULTURA_MG && window.MUNIC_CULTURA_MG.dados && (!this.municData || !this.municData.dados)) {
        this.municData = window.MUNIC_CULTURA_MG;
      }
      if (window.IDHM_MUNICIPIOS_MG && (!this.idhmData || Object.keys(this.idhmData).length === 0)) {
        this.idhmData = window.IDHM_MUNICIPIOS_MG;
      }
      if (window.ICMS_PATRIMONIO_CULTURAL_2026 && (!this.icmsData || Object.keys(this.icmsData).length === 0)) {
        this.icmsData = window.ICMS_PATRIMONIO_CULTURAL_2026;
      }
      if (!container) return;

      const state = window.__state || {};
      const allLibs = state.allLibraries || [];
      const stats = state.statistics || {};
      const desassistidos = (state.allMgSemAtiva && state.allMgSemAtiva.length) ? state.allMgSemAtiva : (state.closedLibraries || []);
      
      // Totais oficiais
      const totalMunComPub = stats.municipios_com_biblioteca_publica || 448;
      const totalMunSemPub = stats.municipios_sem_biblioteca_publica || 405;
      const cobMunPct = stats.cobertura_publica_percentual || 52.52;
      const cobPopPct = stats.cobertura_populacional_percentual || 83.45;
      const popComPub = stats.populacao_com_publica || 17140903;
      const popSemPub = stats.populacao_sem_publica || 3399086;
      const totalPub = stats.total_bibliotecas_publicas || 503;
      const totalComun = stats.total_bibliotecas_comunitarias || 54;
      const totalEquip = stats.total_equipamentos_ativos || 557;
      const totalDac = stats.total_com_dac || 243;

      // Análise dos 33 municípios com pop >= 20.000 sem biblioteca pública
      const maiores20k = desassistidos.filter(x => (x.populacao_2022 || 0) >= 20000)
        .sort((a, b) => (b.populacao_2022 || 0) - (a.populacao_2022 || 0));
      const popMaiores20k = maiores20k.reduce((acc, cur) => acc + (cur.populacao_2022 || 0), 0);

      // Análise de IDH-M cruzado
      const idhmCruzado = this.calcularAnaliseIdhm(allLibs, desassistidos);

      // Análise de ICMS Cultural e DAC
      const icmsCruzado = this.calcularAnaliseIcms(allLibs, desassistidos);

      // Análise histórica PPAG (Ações 4337 e 4336)
      const historicoPpag = this.calcularHistoricoPpag(allLibs);

      container.innerHTML = `
        <div class="dash-inner-container">
          
          <!-- Cabeçalho do Dashboard Executivo -->
          <div class="dash-header-bar">
            <div class="dash-header-titles">
              <div class="dash-tag">Painel de Inteligência Territorial • DLLLB / SECULT-MG</div>
              <h2>Dashboard Executivo da Diretoria e Coordenação</h2>
              <p>Módulo Analítico Integrado para Tomada de Decisão, Monitoramento do PPAG e Inteligência de Recursos Públicos</p>
            </div>
            <div class="dash-header-actions">
              <span class="dash-status-pill">
                <span class="dot-online"></span> Base Oficial Fechada (853 Municípios)
              </span>
              <button type="button" class="btn-dash-print" onclick="window.print()" title="Imprimir Relatório Executivo">
                🖨️ Imprimir Relatório
              </button>
            </div>
          </div>

          <!-- Régua de Navegação por Abas Estratégicas -->
          <nav class="dash-tabs-nav" role="tablist">
            <button type="button" class="dash-tab-btn ${this.activeTab === 'visao_geral' ? 'active' : ''}" data-tab="visao_geral">
              🏛️ 1. Panorama da Rede
            </button>
            <button type="button" class="dash-tab-btn ${this.activeTab === 'vulnerabilidade' ? 'active' : ''}" data-tab="vulnerabilidade">
              🎯 2. População & IDH-M
            </button>
            <button type="button" class="dash-tab-btn ${this.activeTab === 'icms_dac' ? 'active' : ''}" data-tab="icms_dac">
              🏛️ 3. DAC | ICMS
            </button>
            <button type="button" class="dash-tab-btn ${this.activeTab === 'acoes_ppag' ? 'active' : ''}" data-tab="acoes_ppag">
              📈 4. PPAG 2023-2026
            </button>
            <button type="button" class="dash-tab-btn ${this.activeTab === 'munic_ibge' ? 'active' : ''}" data-tab="munic_ibge">
              🏛️ 5. MUNIC (IBGE)
            </button>
            <button type="button" class="dash-tab-btn ${this.activeTab === 'tabela_prioridades' ? 'active' : ''}" data-tab="tabela_prioridades">
              📋 6. Busca Ativa
            </button>
          </nav>

          <!-- CONTEÚDO DAS ABAS -->
          <div class="dash-content-area">

            <!-- ABA 1: PANORAMA GERAL -->
            <div class="dash-tab-panel ${this.activeTab === 'visao_geral' ? 'active' : ''}" id="dash-panel-visao_geral">
              
              <!-- Cartões Síntese de Alto Impacto -->
              <div class="dash-kpi-grid">
                
                <div class="dash-kpi-card blue">
                  <div class="kpi-icon">🏛️</div>
                  <div class="kpi-title">Rede Pública Ativa</div>
                  <div class="kpi-value">${totalPub}</div>
                  <div class="kpi-sub">${(stats.total_por_tipo && stats.total_por_tipo['Pública Municipal']) || 502} municipais + ${(stats.total_por_tipo && stats.total_por_tipo['Estadual']) || 1} estadual (${totalMunComPub} municípios)</div>
                  <div class="kpi-footer-badge">+ ${totalComun} comunitárias ativas (${totalEquip} no total)</div>
                </div>

                <div class="dash-kpi-card teal">
                  <div class="kpi-icon">👥</div>
                  <div class="kpi-title">Cobertura Populacional</div>
                  <div class="kpi-value">${cobPopPct.toFixed(1)}%</div>
                  <div class="kpi-sub">${(popComPub / 1000000).toFixed(1)}M de 20,5M habitantes (Censo 2022)</div>
                  <div class="kpi-footer-badge success">Maior parte da população mineira assistida</div>
                </div>

                <div class="dash-kpi-card amber">
                  <div class="kpi-icon">🗺️</div>
                  <div class="kpi-title">Cobertura Territorial</div>
                  <div class="kpi-value">${cobMunPct.toFixed(1)}%</div>
                  <div class="kpi-sub">${totalMunComPub} de 853 municípios de MG</div>
                  <div class="kpi-footer-badge warning">Déficit em ${totalMunSemPub} municípios</div>
                </div>

                <div class="dash-kpi-card red">
                  <div class="kpi-icon">🔴</div>
                  <div class="kpi-title">Vácuo Populacional Crítico</div>
                  <div class="kpi-value">${maiores20k.length}</div>
                  <div class="kpi-sub">Cidades ≥ 20k hab. sem biblioteca pública ativa</div>
                  <div class="kpi-footer-badge danger">${(popMaiores20k / 1000000).toFixed(2)}M de habitantes sem atendimento</div>
                </div>

                <div class="dash-kpi-card purple">
                  <div class="kpi-icon">📜</div>
                  <div class="kpi-title">Certificação DAC Regular</div>
                  <div class="kpi-value">${totalDac}</div>
                  <div class="kpi-sub">${((totalDac / totalPub) * 100).toFixed(1)}% das bibliotecas públicas com DAC</div>
                  <div class="kpi-footer-badge info">Alavanca direta no ICMS Patrimônio Cultural</div>
                </div>

              </div>

              <!-- Gráficos Visuais Nativos em SVG (Panorama) -->
              <div class="dash-charts-row">
                
                <div class="dash-panel-box">
                  <div class="panel-box-header">
                    <h4>Distribuição da Rede Estadual por Tipologia</h4>
                    <span class="badge-count">${totalEquip} equipamentos</span>
                  </div>
                  <div class="svg-chart-container">
                    ${this.renderDonutChart([
                      { label: 'Pública Municipal', val: (stats.total_por_tipo && stats.total_por_tipo['Pública Municipal']) || 502, color: '#0284c7' },
                      { label: 'Comunitária', val: totalComun, color: '#16a34a' },
                      { label: 'Pública Estadual', val: (stats.total_por_tipo && stats.total_por_tipo['Estadual']) || 1, color: '#7c3aed' }
                    ])}
                  </div>
                  <div class="chart-summary-legend">
                    <div><span class="bullet" style="background:#0284c7;"></span> ${(stats.total_por_tipo && stats.total_por_tipo['Pública Municipal']) || 502} Públicas Municipais (${(((stats.total_por_tipo && stats.total_por_tipo['Pública Municipal']) || 502) / totalEquip * 100).toFixed(1)}%)</div>
                    <div><span class="bullet" style="background:#16a34a;"></span> ${totalComun} Comunitárias (${(totalComun / totalEquip * 100).toFixed(1)}%)</div>
                    <div><span class="bullet" style="background:#7c3aed;"></span> ${(stats.total_por_tipo && stats.total_por_tipo['Estadual']) || 1} Estadual (${(((stats.total_por_tipo && stats.total_por_tipo['Estadual']) || 1) / totalEquip * 100).toFixed(1)}%)</div>
                  </div>
                </div>

                <div class="dash-panel-box">
                  <div class="panel-box-header">
                    <h4>Decomposição dos ${totalMunSemPub} Municípios sem Biblioteca Pública</h4>
                    <span class="badge-count">${(popSemPub / 1000000).toFixed(1)}M habitantes</span>
                  </div>
                  <div class="svg-chart-container">
                    ${(() => {
                      const decomp = stats.decomposicao_sem_publica || {};
                      const semInfo = (decomp.sem_registro_historico != null ? decomp.sem_registro_historico : 387) + (decomp.sem_informacao_4_anos != null ? decomp.sem_informacao_4_anos : 6);
                      const bars = [
                        { label: 'Sem informação atualizada', val: semInfo, total: totalMunSemPub, color: '#f59e0b' },
                        { label: 'Fechadas ou em Reforma', val: decomp.fechada_reforma != null ? decomp.fechada_reforma : 6, total: totalMunSemPub, color: '#ef4444' },
                        { label: 'Apenas Comunitária Ativa', val: decomp.apenas_comunitaria != null ? decomp.apenas_comunitaria : 6, total: totalMunSemPub, color: '#8b5cf6' }
                      ];
                      if (decomp.declarado_sem_biblioteca) {
                        bars.push({ label: 'Declarado Sem Biblioteca', val: decomp.declarado_sem_biblioteca, total: totalMunSemPub, color: '#dc2626' });
                      }
                      return this.renderHorizontalBarChart(bars);
                    })()}
                  </div>
                  <div class="panel-box-footer-note">
                    *Classificação cadastral do Sistema Estadual de Bibliotecas (SEBPC/MG).
                  </div>
                </div>

              </div>

              <!-- Nota Técnica Explicativa para a Equipe -->
              <div class="dash-panel-box full-width" style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 1rem 1.25rem; margin-top: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem;">
                  <span style="font-size: 1.15rem;">📌</span>
                  <h4 style="margin: 0; font-size: 0.92rem; color: #0f172a; font-weight: 700;">Nota Técnica para a Equipe: Como Interpretar os Indicadores de Rede</h4>
                </div>
                <div style="font-size: 0.82rem; color: #334155; line-height: 1.55; display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
                  <div>
                    <strong style="color: #0369a1;">1. Tipologias da Rede Estadual:</strong><br>
                    • Mapeados <strong>557 equipamentos culturais ativos</strong> em Minas Gerais (502 bibliotecas públicas municipais, 54 comunitárias e 1 pública estadual).<br>
                    • As bibliotecas comunitárias são geridas pela sociedade civil organizada e <em>não desoneram o poder público municipal</em> de instituir seu equipamento oficial.<br>
                    • O índice de cobertura oficial de 52,5% (448 municípios) considera exclusivamente os municípios atendidos por bibliotecas públicas municipais ou estaduais.
                  </div>
                  <div>
                    <strong style="color: #0369a1;">2. Decomposição dos 405 Municípios sem Pública:</strong><br>
                    • <strong>394 municípios</strong> estão classificados como <em>"Sem informação atualizada"</em> (387 sem registro histórico consolidado e 7 sem dados há mais de 4 anos).<br>
                    • <strong>5 municípios</strong> têm confirmação de inatividade no cadastro (4 fechadas ou em reforma e 1 que declarou formalmente a inexistência).<br>
                    • <strong>6 municípios</strong> contam exclusivamente com biblioteca comunitária ativa, garantindo atendimento à população local embora sem equipamento público municipal.
                  </div>
                </div>
              </div>

            </div>

            <!-- ABA 2: VULNERABILIDADE & IDH-M -->
            <div class="dash-tab-panel ${this.activeTab === 'vulnerabilidade' ? 'active' : ''}" id="dash-panel-vulnerabilidade">
              
              <div class="dash-section-intro">
                <div class="intro-icon">🎯</div>
                <div>
                  <h3>Cruzamento de Equidade Social: População vs. IDH-M</h3>
                  <p>Identificação de vazios de atendimento onde o livro custa mais caro e a população mais depende da biblioteca pública para o acesso à leitura e à cultura.</p>
                </div>
              </div>

              <div class="dash-charts-row">
                
                <!-- Faixas de IDH-M e Presença de Bibliotecas -->
                <div class="dash-panel-box">
                  <div class="panel-box-header">
                    <h4>Presença de Biblioteca Pública por Faixa de IDH-M</h4>
                    <span class="badge-count">853 Municípios (Atlas Brasil / IBGE)</span>
                  </div>
                  <div class="svg-chart-container">
                    ${this.renderStackedBarChart(idhmCruzado.faixas)}
                  </div>
                  <div class="chart-summary-legend">
                    <div><span class="bullet" style="background:#0284c7;"></span> Com Biblioteca Pública</div>
                    <div><span class="bullet" style="background:#ef4444;"></span> Sem Biblioteca Pública</div>
                  </div>
                  <div class="panel-box-footer-note" style="margin-top: 0.85rem; padding: 0.75rem 0.85rem; background: #f8fafc; border-left: 3px solid #0284c7; border-radius: 4px; font-style: normal; color: #334155; line-height: 1.5;">
                    <strong style="color: #0369a1; display: block; margin-bottom: 0.35rem; font-size: 0.8rem;">📌 Guia de Leitura para a Equipe Técnica:</strong>
                    <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.77rem; color: #475569;">
                      <li><strong>Como ler as barras:</strong> Cada linha representa 100% dos municípios daquela faixa de desenvolvimento humano. O bloco <strong>azul (🔵)</strong> indica a proporção com biblioteca pública e o <strong>vermelho (🔴)</strong> indica os desassistidos.</li>
                      <li><strong>Diagnóstico de Desigualdade:</strong> Quanto menor o IDH-M, menor o acesso. Na faixa de <em>Muito Baixo / Baixo IDH-M (< 0,650)</em>, <strong>58% dos municípios não possuem biblioteca</strong>, gerando desertos culturais onde o poder aquisitivo para compra particular de livros é mínimo.</li>
                      <li><strong>Diretriz Operacional:</strong> Priorizar municípios dessa faixa de baixo IDH-M nas ações indutoras do Sistema (editais da PNAB/LPG, repasse prioritário de kits de acervo e orientações técnicas de reabertura).</li>
                    </ul>
                  </div>
                </div>

                <!-- Os Maiores Gargalos Demográficos -->
                <div class="dash-panel-box">
                  <div class="panel-box-header">
                    <h4>Top 10 Municípios Mais Populosos Desassistidos</h4>
                    <span class="badge-count">≥ 20.000 Habitantes</span>
                  </div>
                  <div class="dash-top-list">
                    ${maiores20k.slice(0, 10).map((m, idx) => `
                      <div class="dash-list-row">
                        <span class="list-rank">${idx + 1}</span>
                        <div class="list-info">
                          <strong>${m.municipio}</strong>
                          <small>${m.regiao_intermediaria} • ${(m.situacao_cadastral === 'fechada_reforma' || m.situacao === 'fechada') ? (m.motivo || 'Fechada/Reforma') : (m.situacao_cadastral === 'apenas_comunitaria' ? 'Apenas Comunitária' : 'Sem informação atualizada')}</small>
                        </div>
                        <div class="list-metric">
                          <span class="metric-num">${(m.populacao_2022 || 0).toLocaleString('pt-BR')} hab.</span>
                          <span class="metric-pill ${(m.situacao_cadastral === 'fechada_reforma' || m.situacao === 'fechada') ? 'danger' : 'warning'}">
                            ${(m.situacao_cadastral === 'fechada_reforma' || m.situacao === 'fechada') ? 'Fechada/Reforma' : (m.situacao_cadastral === 'apenas_comunitaria' ? 'Apenas Comunitária' : 'Sem informação atualizada')}
                          </span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>

              </div>

            </div>

            <!-- ABA 3: ICMS CULTURAL & DAC -->
            <div class="dash-tab-panel ${this.activeTab === 'icms_dac' ? 'active' : ''}" id="dash-panel-icms_dac">
              
              <div class="dash-section-intro">
                <div class="intro-icon">🏛️</div>
                <div>
                  <h3>Inteligência Estratégica: ICMS Patrimônio Cultural & DAC</h3>
                  <p>Cruzamento da Pontuação Oficial do IEPHA (Exercício 2025-2027 - PORTARIA IEPHA-MG  34/2024 ANEXO II - QIA) com a Declaração de Acervos Culturais para bibliotecas públicas.</p>
                </div>
              </div>

              <!-- Comparativo de Alavancagem e Panorama da DAC Completa -->
              <div class="dash-kpi-grid">
                
                <div class="dash-kpi-card green">
                  <div class="kpi-icon">💰</div>
                  <div class="kpi-title">Média ICMS Geral: Com DAC</div>
                  <div class="kpi-value">${icmsCruzado.mediaComDac.toFixed(2)} pts</div>
                  <div class="kpi-sub">Média no Q I-A: ${icmsCruzado.mediaQiaComDac.toFixed(2)} pts (243 municípios)</div>
                  <div class="kpi-footer-badge success">+ 39% de pontuação geral sobre municípios sem DAC</div>
                </div>

                <div class="dash-kpi-card amber">
                  <div class="kpi-icon">📉</div>
                  <div class="kpi-title">Média ICMS Geral: Sem DAC</div>
                  <div class="kpi-value">${icmsCruzado.mediaSemDac.toFixed(2)} pts</div>
                  <div class="kpi-sub">Média no Q I-A: ${icmsCruzado.mediaQiaSemDac.toFixed(2)} pts (205 municípios)</div>
                  <div class="kpi-footer-badge warning">Déficit de -0,70 pt no Q I-A e menor repasse Robin Hood</div>
                </div>

                <div class="dash-kpi-card purple">
                  <div class="kpi-icon">🏛️</div>
                  <div class="kpi-title">DAC Completa (Histórico)</div>
                  <div class="kpi-value">${icmsCruzado.dacCompletaHistorico.length} mun.</div>
                  <div class="kpi-sub">Arquivo + Biblioteca + Museu (0,30 pt no Q I-A)</div>
                  <div class="kpi-footer-badge info">⭐ ${icmsCruzado.dacCompletaConstantes.length} municípios com 100% de constância (5/5 anos)</div>
                </div>

                <div class="dash-kpi-card blue">
                  <div class="kpi-icon">📜</div>
                  <div class="kpi-title">Critério Normativo da DAC</div>
                  <div class="kpi-value">+0,10 pt / ano</div>
                  <div class="kpi-sub">Pontuação no Quadro I-A (subitem 3.4) do IEPHA por deferimento anual</div>
                  <div class="kpi-footer-badge info">PORTARIA IEPHA-MG 34/2024 ANEXO II - QIA (máx. 0,30 pt)</div>
                </div>

                <div class="dash-kpi-card red">
                  <div class="kpi-icon">🎯</div>
                  <div class="kpi-title">Alvos de Indução da DAC</div>
                  <div class="kpi-value">${icmsCruzado.todosSemDac.length} mun.</div>
                  <div class="kpi-sub">Municípios com biblioteca aberta sem DAC (de 448 mun.)</div>
                  <div class="kpi-footer-badge danger">${icmsCruzado.lanternaSemDac.length} na lanterna (≤ 2 pts) • ${icmsCruzado.zeroQuadro1a.length} com Q I-A zerado (0,00 pt)</div>
                </div>

              </div>

              <!-- PAINEL: MUNICÍPIOS COM DAC COMPLETA (ARQUIVO, BIBLIOTECA E MUSEUS - 2021 A 2025) -->
              <div class="dash-panel-box full-width" style="margin-bottom: 1.5rem; border-left: 4px solid #7c3aed;">
                <div class="panel-box-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
                  <div>
                    <h4 style="color: #5b21b6; display: flex; align-items: center; gap: 0.5rem;">
                      <span>🏛️</span> Tríplice Coroa da Salvaguarda: Municípios com DAC Completa (Arquivo + Biblioteca + Museu)
                    </h4>
                    <span style="font-size: 0.8rem; color: #64748b; display: block; margin-top: 0.2rem;">
                      Série histórica oficial (2021 a 2025): 21 municípios já alcançaram a pontuação máxima de 0,30 pt no Quadro I-A do IEPHA
                    </span>
                  </div>
                  <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn-subfilter-pill active" id="btn-toggle-dac-completa" onclick="window.SEBPC_Dashboard.toggleGaleriaDacCompleta()" style="background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; cursor: pointer;">
                      👁️ Ver Galeria dos 21 Municípios Históricos
                    </button>
                  </div>
                </div>

                <!-- Destaque dos 4 municípios 100% constantes -->
                <div style="background: #faf5ff; border: 1px dashed #c4b5fd; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 0.75rem;">
                  <div style="font-size: 0.82rem; font-weight: 700; color: #5b21b6; margin-bottom: 0.35rem;">
                    ⭐ Municípios de Excelência Contínua (DAC Completa em TODOS os 5 anos — 2021 a 2025):
                  </div>
                  <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
                    <span class="dash-status-pill" style="background: #ffffff; color: #6d28d9; border: 1px solid #c4b5fd; font-weight: 600;">👑 Divinópolis (5/5 anos • Q I-A: 3,80 pts)</span>
                    <span class="dash-status-pill" style="background: #ffffff; color: #6d28d9; border: 1px solid #c4b5fd; font-weight: 600;">👑 Ouro Preto (5/5 anos • Q I-A: 4,00 pts)</span>
                    <span class="dash-status-pill" style="background: #ffffff; color: #6d28d9; border: 1px solid #c4b5fd; font-weight: 600;">👑 Poços de Caldas (5/5 anos • Q I-A: 4,00 pts)</span>
                    <span class="dash-status-pill" style="background: #ffffff; color: #6d28d9; border: 1px solid #c4b5fd; font-weight: 600;">👑 Uberlândia (5/5 anos • Q I-A: 4,00 pts)</span>
                  </div>
                </div>

                <!-- Tabela da DAC Completa (recolhível/visível) -->
                <div id="galeria-dac-completa-wrapper" class="dash-table-wrapper" style="max-height: 380px; overflow-y: auto;">
                  <table class="dash-data-table">
                    <thead style="position: sticky; top: 0; background: #f5f3ff; z-index: 5;">
                      <tr>
                        <th style="width: 40px;">#</th>
                        <th>Município</th>
                        <th>Região Intermediária</th>
                        <th>Constância Histórica</th>
                        <th>Exercícios com DAC Completa (Arquivo + Biblio + Museu)</th>
                        <th>Pontuação Q I-A (IEPHA)</th>
                        <th>ICMS Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${icmsCruzado.dacCompletaHistorico.map((m, idx) => `
                        <tr>
                          <td><strong>${idx + 1}</strong></td>
                          <td><strong>${m.municipio}</strong> ${m.totalAnos === 5 ? '⭐' : ''}</td>
                          <td>${m.regiao}</td>
                          <td><span class="badge-gain" style="${m.totalAnos === 5 ? 'background:#f3e8ff;color:#6b21a8;' : ''}">${m.constancia}</span></td>
                          <td>
                            <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                              ${m.anos.map(ano => `<span class="dash-status-pill" style="font-size: 0.72rem; padding: 2px 6px; background: ${ano === 2025 ? '#ecfdf5;color:#065f46;border-color:#a7f3d0' : '#f1f5f9;color:#334155'}; font-weight: 600;">${ano}</span>`).join('')}
                            </div>
                          </td>
                          <td><span style="font-weight: 700; color: #1e293b;">${m.qia.toFixed(2)} pts</span></td>
                          <td><span style="font-weight: 600; color: #0284c7;">${m.icmsTotal.toFixed(2)} pts</span></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Tabela dos Municípios com Biblioteca Aberta sem DAC -->
              <div class="dash-panel-box full-width">
                <div class="panel-box-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
                  <div>
                    <h4>Radar ICMS | DAC: Municípios com Biblioteca Aberta sem Certificação DAC</h4>
                    <span style="font-size: 0.8rem; color: #64748b; display: block; margin-top: 0.2rem;">
                      Universo prioritário de ${icmsCruzado.todosSemDac.length} municípios que podem somar +0,10 pt/ano no Quadro I-A (subitem 3.4) do ICMS Patrimônio Cultural
                    </span>
                  </div>
                  <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                    <button type="button" class="btn-subfilter-pill active" id="btn-icms-tab-todos" onclick="window.SEBPC_Dashboard.setFiltroIcms('todos')" title="Ver todos os municípios com biblioteca aberta sem DAC">Todos sem DAC (${icmsCruzado.todosSemDac.length})</button>
                    <button type="button" class="btn-subfilter-pill highlight-warning" id="btn-icms-tab-lanterna" onclick="window.SEBPC_Dashboard.setFiltroIcms('lanterna')" title="Municípios com pontuação total do ICMS até 2,00 pontos">🔥 Lanterna ICMS ≤ 2 pts (${icmsCruzado.lanternaSemDac.length})</button>
                    <button type="button" class="btn-subfilter-pill" id="btn-icms-tab-zero1a" onclick="window.SEBPC_Dashboard.setFiltroIcms('zero1a')" title="Municípios com pontuação zero no Quadro I-A de Política Cultural">📜 Quadro I-A Zerado (${icmsCruzado.zeroQuadro1a.length})</button>
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding: 0.25rem 0;">
                  <input 
                    type="text" 
                    id="dash-icms-search" 
                    placeholder="🔍 Buscar município ou região..." 
                    oninput="window.SEBPC_Dashboard.filtrarTabelaIcms(this.value)"
                    style="padding: 0.45rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.82rem; width: 280px; background: #fff;">
                  <span style="font-size: 0.82rem; color: #334155; font-weight: 600;" id="dash-icms-count">
                    Mostrando ${icmsCruzado.todosSemDac.length} municípios com biblioteca pública sem DAC
                  </span>
                </div>

                <div class="dash-table-wrapper" style="max-height: 520px; overflow-y: auto;">
                  <table class="dash-data-table" id="table-radar-icms">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                      <tr>
                        <th style="width: 40px;">#</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaIcms(1, 'text')" style="cursor: pointer;" title="Clique para ordenar por Município">Município ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaIcms(2, 'text')" style="cursor: pointer;" title="Clique para ordenar por Região">Região Intermediária ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaIcms(3, 'num')" style="cursor: pointer;" title="Clique para ordenar por População">População (2022) ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaIcms(4, 'num')" style="cursor: pointer;" title="Clique para ordenar por Pontuação Geral">Pontuação Geral ICMS ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaIcms(5, 'num')" style="cursor: pointer;" title="Clique para ordenar por Pontuação Q I-A">Pontuação Q I-A (IEPHA) ⇅</th>
                        <th>Impacto da DAC no Q I-A</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${icmsCruzado.todosSemDac.map((m, idx) => `
                        <tr class="icms-row" data-search="${m.municipio.toLowerCase()} ${m.regiao.toLowerCase()}" data-lanterna="${m.pontuacao_total <= 2.0 ? '1' : '0'}" data-zero1a="${m.quadro_1a === 0 ? '1' : '0'}">
                          <td><strong>${idx + 1}</strong></td>
                          <td><strong>${m.municipio}</strong></td>
                          <td>${m.regiao}</td>
                          <td>${m.populacao.toLocaleString('pt-BR')} hab.</td>
                          <td><span class="${m.pontuacao_total <= 2.0 ? 'badge-score-low' : ''}">${m.pontuacao_total.toFixed(2)} pts</span></td>
                          <td><span class="${m.quadro_1a === 0 ? 'badge-score-low' : ''}">${m.quadro_1a.toFixed(2)} pts</span></td>
                          <td><span class="badge-gain">+0,10 pt a cada ano deferido</span></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            <!-- ABA 4: AÇÕES DO SISTEMA & PPAG -->
            <div class="dash-tab-panel ${this.activeTab === 'acoes_ppag' ? 'active' : ''}" id="dash-panel-acoes_ppag">
              
              <div class="dash-section-intro">
                <div class="intro-icon">📈</div>
                <div>
                  <h3>Ações do Sistema Estadual de Bibliotecas & Execução do PPAG (2023 - 2026)</h3>
                  <p>Monitoramento integrado das Ações 4337 (Capacitação Técnica) e 4336 (Apoio, Estruturação e Articulação às Bibliotecas) sem menção a pessoas físicas, com base exclusiva nas planilhas estatísticas e consolidadas oficiais do Drive.</p>
                </div>
              </div>

              <!-- DIVISOR: AÇÃO 4337 PPAG -->
              <div class="dash-ppag-section-divider">
                <h4><span>🎓</span> Ação 4337 PPAG: Capacitação e Formação Técnica</h4>
                <p>Distinção rigorosa: Meta Formal do PPAG (Inscritos) vs. Atendimento Real do Sistema (Participantes Concluintes)</p>
              </div>

              <!-- Cartões Ação 4337 -->
              <div class="dash-kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 1.25rem;">
                <div class="dash-kpi-card blue">
                  <div class="kpi-icon">📝</div>
                  <div class="kpi-title">Meta Formal PPAG (Ação 4337)</div>
                  <div class="kpi-value">${historicoPpag.metaPpagInscritos.total.toLocaleString('pt-BR')}</div>
                  <div class="kpi-sub">Total de pessoas inscritas nas ações formativas</div>
                  <div class="kpi-footer-badge info">Demanda pactuada no SIGPLAN</div>
                </div>

                <div class="dash-kpi-card teal">
                  <div class="kpi-icon">👥</div>
                  <div class="kpi-title">Atendimento do Sistema (Ação 4337)</div>
                  <div class="kpi-value">${historicoPpag.atendimentoParticipantes.total.toLocaleString('pt-BR')}</div>
                  <div class="kpi-sub">Profissionais e gestores que compareceram e concluíram</div>
                  <div class="kpi-footer-badge success">Presença e frequência real</div>
                </div>

                <div class="dash-kpi-card purple">
                  <div class="kpi-icon">🗺️</div>
                  <div class="kpi-title">Municípios Atendidos 2026</div>
                  <div class="kpi-value">${historicoPpag.municipiosAtendidos['2026']}</div>
                  <div class="kpi-sub">Municípios atendidos no exercício atual (jan a out)</div>
                  <div class="kpi-footer-badge info">Salto de cobertura consolidado</div>
                </div>
              </div>

              <!-- Gráfico Comparativo 4337 -->
              <div class="dash-panel-box full-width" style="margin-bottom: 1.5rem;">
                <div class="panel-box-header">
                  <h4>Ação 4337: Demanda Formal (Inscritos) vs. Presença Efetiva (Participantes)</h4>
                  <span class="badge-count">Série Anual 2023–2026</span>
                </div>
                <div style="padding: 0.5rem 0 0.25rem;">
                  ${this.renderTimelineCards4337(historicoPpag)}
                </div>
                <div class="panel-box-footer-note" style="margin-top: 0.85rem; padding: 0.75rem 0.85rem; background: #f8fafc; border-left: 3px solid #0284c7; border-radius: 4px; font-style: normal; color: #334155; line-height: 1.5; font-size: 0.78rem;">
                  <strong>Distinção Metodológica:</strong> Para fins de <em>Meta do PPAG</em>, contabiliza-se o número formal de inscritos nas atividades formativas. Para fins de <em>Atendimento do Sistema</em>, computam-se exclusivamente os profissionais e gestores que compareceram e concluíram as capacitações presenciais ou síncronas. <strong>Regra para cursos EAD:</strong> para o curso EAD autoinstrucional de fluxo contínuo (<em>Bibliotecas: Memória do Mundo</em> em 2025 com 1.295 inscrições), computam-se exclusivamente os inscritos na Meta do PPAG, sem cômputo de participantes presenciais/síncronos no Atendimento do Sistema.
                </div>
              </div>

              <!-- DIVISOR: AÇÃO 4336 PPAG -->
              <div class="dash-ppag-section-divider emerald">
                <h4><span>🏛️</span> Ação 4336 PPAG: Apoio, Estruturação e Articulação às Bibliotecas</h4>
                <p>Composição oficial dos 4 eixos operacionais registrados nos consolidados estatísticos do SEBPC/MG</p>
              </div>

              <!-- 4 Eixos Oficiais da Ação 4336 -->
              <div class="dash-eixo-card-grid">
                
                <!-- Eixo 1: Doação de Livros -->
                <div class="dash-eixo-card">
                  <div>
                    <span class="eixo-card-tag books">Eixo 1 • Livros</span>
                    <div class="eixo-card-title">Doação de Livros 4336</div>
                    <div class="eixo-card-val">${historicoPpag.doacaoLivros.totalLivros.toLocaleString('pt-BR')}</div>
                    <div class="eixo-card-desc">Exemplares e acervos repassados pela Diretoria (coordenação Silvania Alves)</div>
                  </div>
                  <div class="eixo-card-breakdown">
                    <div>• 2023: 11.298 livros (19 mun.)</div>
                    <div>• 2024: 9.640 livros (14 mun.)</div>
                    <div>• 2025: 7.902 livros (12 mun.)</div>
                    <div>• 2026: 6.317 livros (8 mun.)</div>
                  </div>
                </div>

                <!-- Eixo 2: Visitas Técnicas -->
                <div class="dash-eixo-card">
                  <div>
                    <span class="eixo-card-tag visits">Eixo 2 • Visitas</span>
                    <div class="eixo-card-title">Visitas 4336</div>
                    <div class="eixo-card-val">${historicoPpag.visitas.totalVisitas}</div>
                    <div class="eixo-card-desc">Visitas técnicas em campo aos municípios e recepção de equipes na sede da DLLLB</div>
                  </div>
                  <div class="eixo-card-breakdown">
                    <div>• 2023: 30 visitas (18 campo + 12 sede)</div>
                    <div>• 2024: 6 visitas (2 campo + 4 sede)</div>
                    <div>• 2025: 33 visitas (15 campo + 18 sede)</div>
                    <div>• 2026: 9 visitas (3 campo + 6 sede)</div>
                  </div>
                </div>

                <!-- Eixo 3: Exposições Literárias Itinerantes -->
                <div class="dash-eixo-card">
                  <div>
                    <span class="eixo-card-tag expos">Eixo 3 • Exposições</span>
                    <div class="eixo-card-title">Exposições Literárias 4336</div>
                    <div class="eixo-card-val">${historicoPpag.exposicoes.totalMunAtendidos} mun.</div>
                    <div class="eixo-card-desc">Circulação estadual dos módulos expográficos (coordenação Mireille de Paula)</div>
                  </div>
                  <div class="eixo-card-breakdown">
                    <div>• 2023: 47 municípios atendidos</div>
                    <div>• 2024: 40 municípios atendidos</div>
                    <div>• 2025: 39 municípios atendidos</div>
                    <div>• 2026: 19 municípios atendidos</div>
                  </div>
                </div>

                <!-- Eixo 4: Orientações Técnicas -->
                <div class="dash-eixo-card">
                  <div>
                    <span class="eixo-card-tag advisory">Eixo 4 • Assessorias</span>
                    <div class="eixo-card-title">Orientações Técnicas 4336</div>
                    <div class="eixo-card-val">${historicoPpag.orientacoesTecnicas.totalAssessoriasQuadrienio.toLocaleString('pt-BR')}</div>
                    <div class="eixo-card-desc">Total de assessorias técnicas prestadas às equipes municipais (coordenação Grazielle Santiago / DAC)</div>
                  </div>
                  <div class="eixo-card-breakdown">
                    <div>• Pareceres DAC emitidos: <strong>${historicoPpag.orientacoesTecnicas.totalDac}</strong></div>
                    <div>• E-mail / App / SEI: 17.538 registros</div>
                    <div>• Videoconferência ou telefone: contínuo</div>
                    <div>• 2.330 assessorias formais auditadas</div>
                  </div>
                </div>

              </div>

              <!-- Matriz Completa Consolidada -->
              <div class="dash-panel-box full-width" style="margin-top: 1.25rem;">
                <div class="panel-box-header">
                  <h4>Matriz Quadrienal de Monitoramento PPAG & Ações do Sistema (2023 - 2026)</h4>
                  <span class="badge-count">Consolidado Auditado do Google Drive</span>
                </div>
                <div class="dash-table-wrapper" style="overflow-x: auto; margin-top: 0.5rem;">
                  <table class="dash-data-table">
                    <thead>
                      <tr>
                        <th rowspan="2" style="vertical-align: middle;">Exercício</th>
                        <th rowspan="2" style="vertical-align: middle;">Municípios Atendidos Únicos</th>
                        <th colspan="2" style="text-align: center; background: #e0f2fe; color: #0369a1; border-bottom: 1px solid #bae6fd;">Ação 4337 (Capacitação Técnica)</th>
                        <th colspan="4" style="text-align: center; background: #dcfce7; color: #166534; border-bottom: 1px solid #bbf7d0;">Ação 4336 (Apoio e Articulação)</th>
                        <th rowspan="2" style="vertical-align: middle;">Status da Fonte</th>
                      </tr>
                      <tr>
                        <th style="background: #f0f9ff;">Inscritos (Meta PPAG)</th>
                        <th style="background: #f0f9ff;">Participantes (Atendimento)</th>
                        <th style="background: #f0fdf4;">Doação de Livros</th>
                        <th style="background: #f0fdf4;">Visitas Técnicas</th>
                        <th style="background: #f0fdf4;">Exposições Literárias</th>
                        <th style="background: #f0fdf4;">Orientações Técnicas (Assessorias / DAC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>2023</strong></td>
                        <td>325</td>
                        <td>4.012</td>
                        <td>2.178</td>
                        <td>11.298 livros (19 mun.)</td>
                        <td>30 visitas</td>
                        <td>47 mun. atendidos</td>
                        <td>596 assessorias (168 DAC)</td>
                        <td><span class="badge-status online">Consolidado Fechado</span></td>
                      </tr>
                      <tr>
                        <td><strong>2024</strong></td>
                        <td>271</td>
                        <td>3.432</td>
                        <td>1.173</td>
                        <td>9.640 livros (14 mun.)</td>
                        <td>6 visitas</td>
                        <td>40 mun. atendidos</td>
                        <td>500 assessorias (164 DAC)</td>
                        <td><span class="badge-status online">Consolidado Fechado</span></td>
                      </tr>
                      <tr>
                        <td><strong>2025</strong></td>
                        <td>316</td>
                        <td><strong>2.914</strong>*</td>
                        <td>746</td>
                        <td>7.902 livros (12 mun.)</td>
                        <td>33 visitas</td>
                        <td>39 mun. atendidos</td>
                        <td>734 assessorias (243 DAC)</td>
                        <td><span class="badge-status online">Consolidado Fechado</span></td>
                      </tr>
                      <tr>
                        <td><strong>2026</strong></td>
                        <td><strong>270</strong></td>
                        <td><strong>2.768</strong></td>
                        <td><strong>1.586</strong></td>
                        <td><strong>6.317 livros</strong> (8 mun.)</td>
                        <td>9 visitas</td>
                        <td>19 mun. atendidos</td>
                        <td><strong>500 assessorias</strong> (148 DAC)</td>
                        <td><span class="badge-status info">Jan a Out/2026</span></td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr style="background: #f1f5f9; font-weight: 800; border-top: 2px solid #cbd5e1;">
                        <td>Total Quadriênio</td>
                        <td>-</td>
                        <td><strong>13.126</strong></td>
                        <td>5.683</td>
                        <td>35.157 livros</td>
                        <td>78 visitas</td>
                        <td>145 mun. atendidos</td>
                        <td>2.330 assessorias (723 DAC)</td>
                        <td><span class="badge-status success">Auditado Drive</span></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div style="font-size: 0.74rem; color: #64748b; margin-top: 0.6rem; text-align: right; line-height: 1.4;">
                  <strong>Fontes Oficiais:</strong> Planilhas anuais de Consolidados de Ações do Sistema (2019 a 2026) e Planejamento/Frequência das Atividades de Formação do Google Drive oficial do SEBPC/MG. Sem estimativas hipotéticas.
                </div>
              </div>

            </div>


            <!-- ABA 5: PERFIL INSTITUCIONAL & MUNIC (IBGE) -->
            <div class="dash-tab-panel ${this.activeTab === 'munic_ibge' ? 'active' : ''}" id="dash-panel-munic_ibge">
              
              <div class="dash-section-intro">
                <div class="intro-icon">🏛️</div>
                <div>
                  <h3>Diagnóstico Institucional da Gestão Cultural Municipal (Pesquisa MUNIC / IBGE)</h3>
                  <p>Cruzamento estrutural com a base de dados públicos do IBGE mapeando órgãos gestores, instâncias colegiadas e perfil de recursos humanos nos 853 municípios de Minas Gerais.</p>
                </div>
              </div>

              <!-- Banner de Destaque Estratégico para Busca Ativa -->
              <div class="dash-panel-box full-width" style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-left: 4px solid #10b981; margin-bottom: 1.25rem; padding: 1.1rem 1.35rem;">
                <div style="display: flex; gap: 1rem; align-items: flex-start;">
                  <div style="font-size: 2.2rem; line-height: 1;">💡</div>
                  <div>
                    <h4 style="color: #065f46; font-size: 0.98rem; font-weight: 700; margin-bottom: 0.35rem;">
                      Oportunidade de Articulação Institucional: 214 municípios sem biblioteca pública possuem Conselho Municipal de Cultura ativo
                    </h4>
                    <p style="color: #047857; font-size: 0.82rem; line-height: 1.45; margin: 0;">
                      Diferente de contatos isolados com gabinetes de prefeitos sujeitos à alta rotatividade eleitoral, o <strong>Conselho Municipal de Cultura</strong> é uma instância colegiada legal com participação direta da sociedade civil e de agentes culturais locais. Em <strong>54,2% dos municípios sem biblioteca</strong>, o conselho já existe e atua como canal prioritário para o SEBPC/MG pautar a criação ou reativação da biblioteca pública por projeto de lei municipal.
                    </p>
                  </div>
                </div>
              </div>

              <!-- Cartões Síntese do Perfil Institucional MUNIC/IBGE -->
              <div class="dash-kpi-grid">
                
                <div class="dash-kpi-card indigo">
                  <div class="kpi-icon">🤝</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Secretaria Conjunta</span>
                    <span class="kpi-value">669 <small style="font-size:0.55em;font-weight:600;">(78,4%)</small></span>
                    <span class="kpi-subtext">Cultura unida à Educação, Turismo ou Esporte</span>
                  </div>
                </div>

                <div class="dash-kpi-card purple">
                  <div class="kpi-icon">🏛️</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Secretaria Exclusiva</span>
                    <span class="kpi-value">83 <small style="font-size:0.55em;font-weight:600;">(9,7%)</small></span>
                    <span class="kpi-subtext">Órgão gestor exclusivo de cultura</span>
                  </div>
                </div>

                <div class="dash-kpi-card emerald">
                  <div class="kpi-icon">👥</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Conselhos de Cultura Ativos</span>
                    <span class="kpi-value">503 <small style="font-size:0.55em;font-weight:600;">(59,0%)</small></span>
                    <span class="kpi-subtext">214 deles em municípios sem biblioteca</span>
                  </div>
                </div>

                <div class="dash-kpi-card blue">
                  <div class="kpi-icon">💰</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Fundos de Cultura Criados</span>
                    <span class="kpi-value">542 <small style="font-size:0.55em;font-weight:600;">(63,5%)</small></span>
                    <span class="kpi-subtext">230 deles em municípios sem biblioteca</span>
                  </div>
                </div>

                <div class="dash-kpi-card amber">
                  <div class="kpi-icon">📜</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Planos de Cultura por Lei</span>
                    <span class="kpi-value">82 <small style="font-size:0.55em;font-weight:600;">(9,6%)</small></span>
                    <span class="kpi-subtext">Política decenal aprovada em lei municipal</span>
                  </div>
                </div>

                <div class="dash-kpi-card rose">
                  <div class="kpi-icon">🏆</div>
                  <div class="kpi-content">
                    <span class="kpi-label">Tripé Completo (CPF)</span>
                    <span class="kpi-value">67 <small style="font-size:0.55em;font-weight:600;">(7,9%)</small></span>
                    <span class="kpi-subtext">Conselho + Plano + Fundo instituídos juntos</span>
                  </div>
                </div>

              </div>

              <!-- Gráficos e Comparações de Fortalecimento Institucional -->
              <div class="dash-panel-grid">
                
                <!-- Card 1: Distribuição dos Órgãos Gestores -->
                <div class="dash-panel-box">
                  <div class="panel-header">
                    <h4>🏛️ Estrutura dos Órgãos Gestores de Cultura (853 mun.)</h4>
                    <span class="badge-neutral">MUNIC / IBGE</span>
                  </div>
                  <div class="panel-body">
                    <div class="dash-hbar-list">
                      <div class="dash-hbar-item">
                        <div class="dash-hbar-label">
                          <span>Secretaria em Conjunto (Educação/Turismo/Esporte)</span>
                          <strong>669 (78,4%)</strong>
                        </div>
                        <div class="dash-hbar-track">
                          <div class="dash-hbar-fill fill-blue" style="width: 78.4%;"></div>
                        </div>
                      </div>
                      <div class="dash-hbar-item">
                        <div class="dash-hbar-label">
                          <span>Setor Subordinado / Departamento / Divisão</span>
                          <strong>85 (10,0%)</strong>
                        </div>
                        <div class="dash-hbar-track">
                          <div class="dash-hbar-fill fill-amber" style="width: 10.0%;"></div>
                        </div>
                      </div>
                      <div class="dash-hbar-item">
                        <div class="dash-hbar-label">
                          <span>Secretaria Exclusiva de Cultura</span>
                          <strong>83 (9,7%)</strong>
                        </div>
                        <div class="dash-hbar-track">
                          <div class="dash-hbar-fill fill-purple" style="width: 9.7%;"></div>
                        </div>
                      </div>
                      <div class="dash-hbar-item">
                        <div class="dash-hbar-label">
                          <span>Sem Estrutura Formal de Gestão</span>
                          <strong>16 (1,9%)</strong>
                        </div>
                        <div class="dash-hbar-track">
                          <div class="dash-hbar-fill fill-rose" style="width: 1.9%;"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Card 2: Comparativo Institucional Com vs Sem Biblioteca -->
                <div class="dash-panel-box">
                  <div class="panel-header">
                    <h4>📊 Comparativo Institucional (Com vs. Sem Biblioteca)</h4>
                    <span class="badge-neutral">Impacto Estrutural</span>
                  </div>
                  <div class="panel-body">
                    <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
                      <thead>
                        <tr style="border-bottom: 2px solid #e2e8f0; color: #475569; text-align: left;">
                          <th style="padding: 0.4rem 0.2rem;">Indicador Institucional</th>
                          <th style="padding: 0.4rem 0.2rem; text-align: center; color: #047857;">Com Biblioteca (458)</th>
                          <th style="padding: 0.4rem 0.2rem; text-align: center; color: #b91c1c;">Sem Biblioteca (395)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 0.45rem 0.2rem;"><strong>Conselho de Cultura Ativo</strong></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #047857;">63,1% <small>(289)</small></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #b91c1c;">54,2% <small>(214)</small></td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 0.45rem 0.2rem;"><strong>Fundo de Cultura Criado</strong></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #047857;">68,1% <small>(312)</small></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #b91c1c;">58,2% <small>(230)</small></td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 0.45rem 0.2rem;"><strong>Plano de Cultura por Lei</strong></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #047857;">12,2% <small>(56)</small></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #b91c1c;">6,6% <small>(26)</small></td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                          <td style="padding: 0.45rem 0.2rem;"><strong>Tripé CPF Completo</strong></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #047857;">10,3% <small>(47)</small></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center; font-weight: 700; color: #b91c1c;">5,1% <small>(20)</small></td>
                        </tr>
                        <tr>
                          <td style="padding: 0.45rem 0.2rem;"><strong>Servidores Temporários (Média)</strong></td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center;">26,2%</td>
                          <td style="padding: 0.45rem 0.2rem; text-align: center;">28,9%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              <!-- TABELA DE BUSCA ATIVA INSTITUCIONAL -->
              <div class="dash-panel-box full-width" style="margin-top: 1.25rem;">
                <div class="panel-header" style="flex-wrap: wrap; gap: 0.75rem;">
                  <div>
                    <h4>📋 Matriz de Articulação Institucional nos 395 Municípios sem Biblioteca</h4>
                    <p style="font-size: 0.78rem; color: #64748b; margin: 0.15rem 0 0 0;">
                      Selecione um filtro estratégico para direcionar contatos e agendas de busca ativa pelo Sistema de Bibliotecas.
                    </p>
                  </div>
                  
                  <!-- Filtros Rápidos por Botão -->
                  <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    <button type="button" class="btn-icms-tab active" id="btn-munic-tab-conselho" onclick="window.SEBPC_Dashboard.setFiltroMunic('conselho')">
                      ⭐ Com Conselho Ativo (214)
                    </button>
                    <button type="button" class="btn-icms-tab" id="btn-munic-tab-fundo" onclick="window.SEBPC_Dashboard.setFiltroMunic('fundo')">
                      💰 Com Fundo Criado (230)
                    </button>
                    <button type="button" class="btn-icms-tab" id="btn-munic-tab-cpf" onclick="window.SEBPC_Dashboard.setFiltroMunic('cpf')">
                      🏆 Tripé CPF da Cultura (20)
                    </button>
                    <button type="button" class="btn-icms-tab" id="btn-munic-tab-exclusiva" onclick="window.SEBPC_Dashboard.setFiltroMunic('exclusiva')">
                      🏛️ Sec. Exclusiva (34)
                    </button>
                    <button type="button" class="btn-icms-tab" id="btn-munic-tab-todos" onclick="window.SEBPC_Dashboard.setFiltroMunic('todos')">
                      Todos os 395
                    </button>
                  </div>
                </div>

                <!-- Barra de Busca Textual -->
                <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; margin-bottom: 0.85rem; padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 6px;">
                  <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <input 
                      type="text" 
                      id="dash-munic-search" 
                      placeholder="🔍 Buscar município, região ou gestor..." 
                      oninput="window.SEBPC_Dashboard.filtrarTabelaMunic(this.value)"
                      style="padding: 0.45rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.82rem; width: 300px; background: #fff;">
                    <span style="font-size: 0.78rem; color: #64748b;">
                      (Dica: clique no cabeçalho para ordenar por população, nome ou conselho)
                    </span>
                  </div>
                  <span style="font-size: 0.82rem; color: #047857; font-weight: 700;" id="dash-munic-count">
                    Mostrando 214 municípios com Conselho de Cultura
                  </span>
                </div>

                <!-- Tabela de Dados Institucionais MUNIC -->
                <div class="dash-table-wrapper" style="max-height: 540px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                  <table class="dash-data-table" id="table-munic-perfil">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                      <tr>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(0, 'text')" style="cursor: pointer;" title="Clique para ordenar por Município">Município ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(1, 'text')" style="cursor: pointer;" title="Clique para ordenar por Região">Região ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(2, 'num')" style="cursor: pointer;" title="Clique para ordenar por População">População (2022) ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(3, 'text')" style="cursor: pointer;" title="Clique para ordenar por Órgão Gestor">Órgão Gestor ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(4, 'text')" style="cursor: pointer; text-align: center;" title="Clique para ordenar por Conselho">Conselho ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(5, 'text')" style="cursor: pointer; text-align: center;" title="Clique para ordenar por Fundo">Fundo ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(6, 'text')" style="cursor: pointer; text-align: center;" title="Clique para ordenar por Plano">Plano ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(7, 'text')" style="cursor: pointer; text-align: center;" title="Clique para ordenar por Tripé CPF">CPF ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(8, 'text')" style="cursor: pointer;" title="Clique para ordenar por Escolaridade">Escolaridade Gestor ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaMunic(9, 'num')" style="cursor: pointer;" title="Clique para ordenar por % Concursados">% Concursados ⇅</th>
                        <th style="text-align: center;">Ficha de Articulação</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(() => {
                        const municList = (this.municData && this.municData.dados) ? this.municData.dados : [];
                        const semBibList = municList.filter(m => !m.tem_biblioteca_publica);
                        
                        // Map de geoJsonData para regiao e populacao
                        const munGeoMap = {};
                        if (state.geoJsonData && state.geoJsonData.features) {
                          state.geoJsonData.features.forEach(f => {
                            munGeoMap[f.properties.id] = {
                              pop: f.properties.populacao_2022 || 0,
                              regiao: f.properties.regiao_intermediaria || '-'
                            };
                          });
                        }

                        return semBibList.map(m => {
                          const geo = munGeoMap[m.codigo_ibge] || {};
                          const pop = geo.pop || 0;
                          const regiao = geo.regiao || '-';
                          const temConselho = m.conselho_cultura === 'Sim';
                          const temFundo = m.fundo_cultura === 'Sim';
                          const temPlano = m.plano_cultura === 'Sim';
                          const temCpf = !!m.cpf_cultura;
                          const isExclusiva = m.orgao_gestor && m.orgao_gestor.includes('exclusiva');
                          const pctConc = m.recursos_humanos ? m.recursos_humanos.pct_concursados : null;
                          const pctTemp = m.recursos_humanos ? m.recursos_humanos.pct_temporarios : null;

                          return `
                            <tr class="munic-row" 
                                data-search="${m.municipio.toLowerCase()} ${regiao.toLowerCase()} ${(m.orgao_gestor || '').toLowerCase()} ${(m.escolaridade_gestor || '').toLowerCase()}"
                                data-conselho="${temConselho ? '1' : '0'}"
                                data-fundo="${temFundo ? '1' : '0'}"
                                data-cpf="${temCpf ? '1' : '0'}"
                                data-exclusiva="${isExclusiva ? '1' : '0'}"
                                style="${temConselho ? '' : 'display: none;'}">
                              <td><strong>${m.municipio}</strong></td>
                              <td>${regiao}</td>
                              <td>${pop.toLocaleString('pt-BR')} hab.</td>
                              <td><span style="font-size:0.75rem; color:#334155;">${m.orgao_gestor || '-'}</span></td>
                              <td style="text-align: center;">
                                <span class="badge-tipo-compact ${temConselho ? 'comunitaria' : 'fechada'}" style="font-size:0.68rem;">
                                  ${temConselho ? 'Sim' : 'Não'}
                                </span>
                              </td>
                              <td style="text-align: center;">
                                <span class="badge-tipo-compact ${temFundo ? 'comunitaria' : 'fechada'}" style="font-size:0.68rem;">
                                  ${temFundo ? 'Sim' : 'Não'}
                                </span>
                              </td>
                              <td style="text-align: center;">
                                <span class="badge-tipo-compact ${temPlano ? 'comunitaria' : 'fechada'}" style="font-size:0.68rem;">
                                  ${temPlano ? 'Sim' : 'Não'}
                                </span>
                              </td>
                              <td style="text-align: center;">
                                ${temCpf ? '<span style="background:#fef3c7;color:#92400e;font-weight:700;font-size:0.68rem;padding:0.12rem 0.4rem;border-radius:4px;border:1px solid #fde68a;">CPF</span>' : '<span style="color:#94a3b8;font-size:0.75rem;">-</span>'}
                              </td>
                              <td><span style="font-size:0.75rem;">${m.escolaridade_gestor || '-'}</span></td>
                              <td>
                                ${pctConc !== null ? `<span style="font-weight:600;color:#0369a1;">${pctConc}%</span> <small style="color:#64748b;">(temp: ${pctTemp}%)</small>` : '-'}
                              </td>
                              <td style="text-align: center;">
                                <button type="button" 
                                        onclick="window.SEBPC_Dashboard.copiarFichaMunic('${m.codigo_ibge}')" 
                                        title="Copiar Ficha de Articulação deste município"
                                        style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.72rem; font-weight: 600; color: #1e293b; cursor: pointer; transition: all 0.2s;">
                                  📋 Copiar Ficha
                                </button>
                              </td>
                            </tr>
                          `;
                        }).join('');
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>


            <!-- ABA 5: TABELA DE BUSCA ATIVA -->
            <div class="dash-tab-panel ${this.activeTab === 'tabela_prioridades' ? 'active' : ''}" id="dash-panel-tabela_prioridades">
              
              <div class="dash-section-intro">
                <div class="intro-icon">📋</div>
                <div>
                  <h3>Matriz Territorial de Busca Ativa dos ${totalMunSemPub} Municípios Desassistidos</h3>
                  <p>Tabela dinâmica consolidando população oficial, motivo cadastral, IDH-M e pontuação no ICMS Cultural para embasamento de viagens e articulações políticas.</p>
                </div>
              </div>

              <div class="dash-panel-box full-width">
                <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; margin-bottom: 0.85rem; padding: 0.25rem 0;">
                  <div style="display: flex; gap: 0.75rem; align-items: center;">
                    <input 
                      type="text" 
                      id="dash-busca-ativa-search" 
                      placeholder="🔍 Buscar município ou região..." 
                      oninput="window.SEBPC_Dashboard.filtrarTabelaBuscaAtiva(this.value)"
                      style="padding: 0.45rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.82rem; width: 280px; background: #fff;">
                    <span style="font-size: 0.78rem; color: #64748b;">
                      (Dica: ordene clicando nas colunas ou filtre pelo nome)
                    </span>
                  </div>
                  <span style="font-size: 0.82rem; color: #334155; font-weight: 600;" id="dash-busca-ativa-count">
                    Mostrando ${desassistidos.length} municípios desassistidos
                  </span>
                </div>

                <div class="dash-table-wrapper" style="max-height: 520px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;">
                  <table class="dash-data-table" id="table-busca-ativa">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 5; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                      <tr>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(0, 'text')" style="cursor: pointer;" title="Clique para ordenar por Município">Município ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(1, 'text')" style="cursor: pointer;" title="Clique para ordenar por Região">Região ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(2, 'num')" style="cursor: pointer;" title="Clique para ordenar por População">População (2022) ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(3, 'porte')" style="cursor: pointer;" title="Clique para ordenar por Porte">Porte ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(4, 'num')" style="cursor: pointer;" title="Clique para ordenar por IDH-M">IDH-M ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(5, 'num')" style="cursor: pointer;" title="Clique para ordenar por ICMS">ICMS 2026 ⇅</th>
                        <th onclick="window.SEBPC_Dashboard.ordenarTabelaBuscaAtiva(6, 'text')" style="cursor: pointer;" title="Clique para ordenar por Situação">Situação Cadastral ⇅</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${desassistidos.map(m => {
                        const mNorm = this.norm(m.municipio);
                        const icmsInfo = (this.icmsData && this.icmsData[mNorm]) || {};
                        const ibgeKey = String(m.codigo_ibge || '').trim();
                        const idhmInfo = (this.idhmData && (this.idhmData[ibgeKey] || this.idhmData[m.codigo_ibge])) || {};
                        const pop = m.populacao_2022 || 0;
                        const porte = pop >= 100000 ? 'Grande' : (pop >= 20000 ? 'Médio' : 'Pequeno');
                        const sitTexto = (m.situacao_cadastral === 'fechada_reforma' || m.situacao === 'fechada')
                          ? (m.motivo || 'Fechada ou em Reforma')
                          : (m.situacao_cadastral === 'apenas_comunitaria'
                            ? 'Apenas Comunitária'
                            : 'Sem informação atualizada');
                        return `
                          <tr class="busca-ativa-row" data-search="${m.municipio.toLowerCase()} ${(m.regiao_intermediaria || '').toLowerCase()} ${porte.toLowerCase()}">
                            <td><strong>${m.municipio}</strong></td>
                            <td>${m.regiao_intermediaria || '-'}</td>
                            <td>${pop.toLocaleString('pt-BR')} hab.</td>
                            <td><span class="badge-porte ${porte.toLowerCase()}">${porte}</span></td>
                            <td>${idhmInfo.idhm ? Number(idhmInfo.idhm).toFixed(3) : '-'}</td>
                            <td>${icmsInfo.pontuacao_total ? Number(icmsInfo.pontuacao_total).toFixed(2) + ' pts' : '-'}</td>
                            <td><span class="badge-situacao ${(m.situacao_cadastral === 'fechada_reforma' || m.situacao === 'fechada') ? 'danger' : 'muted'}">${sitTexto}</span></td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>

        </div>
      `;
    },

    /**
     * Gráfico Donut em SVG Nativo
     */
    renderDonutChart: function (data) {
      const total = data.reduce((acc, cur) => acc + cur.val, 0);
      let cumulativePercent = 0;
      const size = 180;
      const center = size / 2;
      const radius = 65;
      const strokeWidth = 30;

      let paths = data.map(slice => {
        const percent = slice.val / total;
        const strokeDasharray = `${percent * 2 * Math.PI * radius} ${2 * Math.PI * radius}`;
        const strokeDashoffset = -cumulativePercent * 2 * Math.PI * radius;
        cumulativePercent += percent;

        return `
          <circle cx="${center}" cy="${center}" r="${radius}"
            fill="transparent"
            stroke="${slice.color}"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${strokeDasharray}"
            stroke-dashoffset="${strokeDashoffset}"
            transform="rotate(-90 ${center} ${center})">
            <title>${slice.label}: ${slice.val} (${(percent * 100).toFixed(1)}%)</title>
          </circle>
        `;
      }).join('');

      return `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="dash-svg-donut">
          ${paths}
          <text x="${center}" y="${center + 5}" text-anchor="middle" font-size="20" font-weight="bold" fill="#0f172a">${total}</text>
          <text x="${center}" y="${center + 20}" text-anchor="middle" font-size="10" fill="#64748b">equipamentos</text>
        </svg>
      `;
    },

    /**
     * Gráfico de Barras Horizontais em SVG Nativo
     */
    renderHorizontalBarChart: function (items) {
      return `
        <div class="dash-hbar-list">
          ${items.map(it => {
            const pct = (it.val / it.total) * 100;
            return `
              <div class="dash-hbar-item">
                <div class="hbar-label-row">
                  <span class="hbar-name">${it.label}</span>
                  <span class="hbar-val"><strong>${it.val}</strong> (${pct.toFixed(1)}%)</span>
                </div>
                <div class="hbar-track">
                  <div class="hbar-fill" style="width: ${pct}%; background: ${it.color};"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    /**
     * Gráfico de Barras Empilhadas em SVG
     */
    renderStackedBarChart: function (faixas) {
      return `
        <div class="dash-stacked-bars">
          ${faixas.map(f => {
            const total = f.com + f.sem;
            const pctCom = total > 0 ? (f.com / total) * 100 : 0;
            const pctSem = total > 0 ? (f.sem / total) * 100 : 0;
            return `
              <div class="stacked-bar-item">
                <div class="stacked-bar-header">
                  <span>${f.faixa}</span>
                  <small>${total} municípios</small>
                </div>
                <div class="stacked-bar-track">
                  <div class="bar-slice blue" style="width: ${pctCom}%;" title="Com Biblioteca: ${f.com} (${pctCom.toFixed(1)}%)">${pctCom > 15 ? pctCom.toFixed(0) + '%' : ''}</div>
                  <div class="bar-slice red" style="width: ${pctSem}%;" title="Sem Biblioteca: ${f.sem} (${pctSem.toFixed(1)}%)">${pctSem > 15 ? pctSem.toFixed(0) + '%' : ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    /**
     * Gráfico Timeline de Barras Verticais
     */
    renderBarChartTimeline: function (data, maxVal, colorClass) {
      const fillClass = colorClass ? colorClass : '';
      return `
        <div class="dash-vbar-timeline">
          ${data.map(d => {
            const hPct = Math.min(100, Math.max(10, (d.val / maxVal) * 100));
            const displayVal = typeof d.val === 'number' ? d.val.toLocaleString('pt-BR') : d.val;
            return `
              <div class="vbar-col">
                <div class="vbar-val-top">${displayVal}</div>
                <div class="vbar-track-vert">
                  <div class="vbar-fill-vert ${fillClass}" style="height: ${hPct}%;"></div>
                </div>
                <div class="vbar-year">${d.ano}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    },

    /**
     * Linha do Tempo e Cards Anuais da Ação 4337 (Proposta 1: Taxa de Efetividade e Comparativo Visual)
     */
    renderTimelineCards4337: function (h) {
      const anos = [
        {
          ano: '2023',
          status: 'Consolidado',
          statusClass: 'online',
          inscritos: h.metaPpagInscritos['2023'],
          participantes: h.atendimentoParticipantes['2023'],
          destaque: 'Retomada presencial e encontros regionais'
        },
        {
          ano: '2024',
          status: 'Consolidado',
          statusClass: 'online',
          inscritos: h.metaPpagInscritos['2024'],
          participantes: h.atendimentoParticipantes['2024'],
          destaque: 'Capacitações virtuais e apoio aos editais'
        },
        {
          ano: '2025',
          status: 'Consolidado',
          statusClass: 'online',
          inscritos: h.metaPpagInscritos['2025'],
          participantes: h.atendimentoParticipantes['2025'],
          destaque: 'Curso EAD (1.295 insc.), Alexandria e Hist. do Livro',
          notaEspecial: 'No curso EAD computam-se apenas inscritos (Meta PPAG), não participantes'
        },
        {
          ano: '2026',
          status: 'Jan a Out/2026',
          statusClass: 'info',
          active: true,
          inscritos: h.metaPpagInscritos['2026'],
          participantes: h.atendimentoParticipantes['2026'],
          destaque: 'VI SEIL, Grupo Alexandria e IA na Catalogação'
        }
      ];

      const maxVal = 4012;

      const cardsHtml = anos.map(d => {
        const wInsc = Math.min(100, Math.max(12, Math.round((d.inscritos / maxVal) * 100)));
        const wPart = Math.min(100, Math.max(12, Math.round((d.participantes / maxVal) * 100)));
        const taxa = ((d.participantes / d.inscritos) * 100).toFixed(1).replace('.', ',');
        const highlightClass = d.participantes >= d.inscritos ? 'highlight' : 'normal';

        return `
          <div class="dash-timeline-card ${d.active ? 'active-year' : ''}">
            <div class="timeline-card-header">
              <span class="timeline-year">${d.ano}</span>
              <span class="badge-status ${d.statusClass}">${d.status}</span>
            </div>

            <div class="timeline-metric-row">
              <div class="metric-info">
                <span class="metric-label"><span class="bullet blue"></span> Meta Formal (Inscritos)</span>
                <span class="metric-val blue">${d.inscritos.toLocaleString('pt-BR')}</span>
              </div>
              <div class="metric-bar-track" title="Meta Formal: ${d.inscritos.toLocaleString('pt-BR')} inscritos">
                <div class="metric-bar-fill blue" style="width: ${wInsc}%;"></div>
              </div>
            </div>

            <div class="timeline-metric-row">
              <div class="metric-info">
                <span class="metric-label"><span class="bullet emerald"></span> Atendimento (Concluintes)</span>
                <span class="metric-val emerald">${d.participantes.toLocaleString('pt-BR')}</span>
              </div>
              <div class="metric-bar-track" title="Atendimento Real: ${d.participantes.toLocaleString('pt-BR')} concluintes">
                <div class="metric-bar-fill emerald" style="width: ${wPart}%;"></div>
              </div>
            </div>

            <div class="timeline-conversion-badge ${highlightClass}">
              <span>Taxa de Presença / Conclusão:</span>
              <strong>${taxa}%</strong>
            </div>

            <div class="timeline-card-note">
              📌 ${d.destaque}
              ${d.notaEspecial ? `<div style="font-size: 0.69rem; color: #0369a1; margin-top: 0.35rem; font-style: italic; line-height: 1.3;">ℹ️ ${d.notaEspecial}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      const taxaGeral = ((h.atendimentoParticipantes.total / h.metaPpagInscritos.total) * 100).toFixed(1).replace('.', ',');

      return `
        <div class="dash-timeline-4337-wrap">
          <div class="dash-timeline-4337-grid">
            ${cardsHtml}
          </div>

          <div class="dash-timeline-summary-bar">
            <div class="summary-stat">
              <span class="summary-label">Total Quadriênio (Inscritos / Meta PPAG):</span>
              <span class="summary-val blue">${h.metaPpagInscritos.total.toLocaleString('pt-BR')} inscritos</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-stat">
              <span class="summary-label">Total Quadriênio (Atendimento Real):</span>
              <span class="summary-val emerald">${h.atendimentoParticipantes.total.toLocaleString('pt-BR')} profissionais capacitados</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-stat">
              <span class="summary-label">Efetividade Média Geral:</span>
              <span class="summary-val purple">${taxaGeral}% de presença</span>
            </div>
          </div>
        </div>
      `;
    },

    /**
     * Cálculos Estatísticos Auxiliares
     */
    calcularAnaliseIdhm: function (allLibs, desassistidos) {
      // Faixas de IDH-M: Muito Baixo (<0.550), Baixo (0.550 - 0.699), Médio (0.700 - 0.799), Alto/Muito Alto (>=0.800)
      const faixas = [
        { faixa: 'Muito Baixo / Baixo (< 0,650)', com: 88, sem: 122 },
        { faixa: 'Médio (0,650 a 0,749)', com: 284, sem: 248 },
        { faixa: 'Alto / Muito Alto (≥ 0,750)', com: 75, sem: 36 }
      ];
      return { faixas };
    },

    calcularAnaliseIcms: function (allLibs, desassistidos) {
      const munComPublicaMap = {};

      // Mapeia os 448 municípios únicos com biblioteca pública municipal aberta e status de DAC
      allLibs.filter(b => b.tipo === 'Pública Municipal').forEach(b => {
        const mNorm = this.norm(b.municipio);
        const hasDac = boolSafe(b.dac && b.dac.possui_dac);
        if (!munComPublicaMap[mNorm]) {
          munComPublicaMap[mNorm] = {
            municipio: b.municipio,
            regiao: b.regiao_intermediaria || '-',
            populacao: b.populacao_2022 || 0,
            hasDac: hasDac
          };
        } else if (hasDac) {
          munComPublicaMap[mNorm].hasDac = true;
        }
      });

      let comDacScores = [];
      let semDacScores = [];
      let qiaComDacScores = [];
      let qiaSemDacScores = [];
      let todosSemDac = [];
      let lanterna = [];
      let zeroQuadro1a = [];

      Object.keys(munComPublicaMap).forEach(mNorm => {
        const munInfo = munComPublicaMap[mNorm];
        const icms = this.icmsData[mNorm] || { pontuacao_total: 0, quadro_1a: 0 };
        const qiaScore = icms.quadro_1a !== undefined ? icms.quadro_1a : (icms.quadro_1a_conselho || 0);
        const totScore = icms.pontuacao_total || 0;

        if (munInfo.hasDac) {
          comDacScores.push(totScore);
          qiaComDacScores.push(qiaScore);
        } else {
          semDacScores.push(totScore);
          qiaSemDacScores.push(qiaScore);
          const item = {
            municipio: munInfo.municipio,
            regiao: munInfo.regiao,
            populacao: munInfo.populacao,
            pontuacao_total: totScore,
            quadro_1a: qiaScore
          };
          todosSemDac.push(item);
          if (totScore <= 2.0) {
            lanterna.push(item);
          }
          if (qiaScore === 0) {
            zeroQuadro1a.push(item);
          }
        }
      });

      const mediaComDac = comDacScores.length ? comDacScores.reduce((a, b) => a + b, 0) / comDacScores.length : 15.85;
      const mediaSemDac = semDacScores.length ? semDacScores.reduce((a, b) => a + b, 0) / semDacScores.length : 11.39;
      const mediaQiaComDac = qiaComDacScores.length ? qiaComDacScores.reduce((a, b) => a + b, 0) / qiaComDacScores.length : 3.19;
      const mediaQiaSemDac = qiaSemDacScores.length ? qiaSemDacScores.reduce((a, b) => a + b, 0) / qiaSemDacScores.length : 2.49;

      // Ordena por menor pontuação total para priorizar os mais necessitados
      todosSemDac.sort((a, b) => a.pontuacao_total - b.pontuacao_total);
      lanterna.sort((a, b) => a.pontuacao_total - b.pontuacao_total);
      zeroQuadro1a.sort((a, b) => a.pontuacao_total - b.pontuacao_total);

      // Série Histórica Oficial (2021 a 2025): 21 municípios únicos que alcançaram DAC Completa (Arquivo + Biblioteca + Museu = 0,30 pt no Q I-A)
      const dacCompletaHistorico = [
        { municipio: "Divinópolis", regiao: "Divinópolis", totalAnos: 5, anos: [2021, 2022, 2023, 2024, 2025], anosStr: "2021 a 2025", constancia: "100% (5/5 anos)", icmsTotal: 16.60, qia: 3.80 },
        { municipio: "Ouro Preto", regiao: "Belo Horizonte", totalAnos: 5, anos: [2021, 2022, 2023, 2024, 2025], anosStr: "2021 a 2025", constancia: "100% (5/5 anos)", icmsTotal: 63.00, qia: 4.00 },
        { municipio: "Poços de Caldas", regiao: "Pouso Alegre", totalAnos: 5, anos: [2021, 2022, 2023, 2024, 2025], anosStr: "2021 a 2025", constancia: "100% (5/5 anos)", icmsTotal: 21.86, qia: 4.00 },
        { municipio: "Uberlândia", regiao: "Uberlândia", totalAnos: 5, anos: [2021, 2022, 2023, 2024, 2025], anosStr: "2021 a 2025", constancia: "100% (5/5 anos)", icmsTotal: 21.93, qia: 4.00 },
        { municipio: "Campo Belo", regiao: "Varginha", totalAnos: 4, anos: [2021, 2023, 2024, 2025], anosStr: "2021, 2023, 2024, 2025", constancia: "80% (4/5 anos)", icmsTotal: 20.37, qia: 3.20 },
        { municipio: "Paracatu", regiao: "Patos de Minas", totalAnos: 4, anos: [2021, 2023, 2024, 2025], anosStr: "2021, 2023, 2024, 2025", constancia: "80% (4/5 anos)", icmsTotal: 26.80, qia: 3.80 },
        { municipio: "Varginha", regiao: "Varginha", totalAnos: 4, anos: [2021, 2022, 2023, 2024], anosStr: "2021 a 2024", constancia: "80% (4/5 anos)", icmsTotal: 26.95, qia: 4.00 },
        { municipio: "Patos de Minas", regiao: "Patos de Minas", totalAnos: 3, anos: [2021, 2022, 2023], anosStr: "2021 a 2023", constancia: "60% (3/5 anos)", icmsTotal: 19.50, qia: 3.50 },
        { municipio: "Itabira", regiao: "Belo Horizonte", totalAnos: 2, anos: [2023, 2025], anosStr: "2023, 2025", constancia: "40% (2/5 anos)", icmsTotal: 23.07, qia: 3.70 },
        { municipio: "Itajubá", regiao: "Pouso Alegre", totalAnos: 2, anos: [2021, 2022], anosStr: "2021, 2022", constancia: "40% (2/5 anos)", icmsTotal: 3.60, qia: 0.00 },
        { municipio: "Machado", regiao: "Varginha", totalAnos: 2, anos: [2021, 2025], anosStr: "2021, 2025", constancia: "40% (2/5 anos)", icmsTotal: 16.90, qia: 3.70 },
        { municipio: "São Sebastião do Paraíso", regiao: "Passos", totalAnos: 2, anos: [2021, 2022], anosStr: "2021, 2022", constancia: "40% (2/5 anos)", icmsTotal: 18.70, qia: 3.70 },
        { municipio: "Carangola", regiao: "Juiz de Fora", totalAnos: 1, anos: [2024], anosStr: "2024", constancia: "20% (1/5 ano)", icmsTotal: 15.78, qia: 3.80 },
        { municipio: "Formiga", regiao: "Divinópolis", totalAnos: 1, anos: [2025], anosStr: "2025", constancia: "20% (1/5 ano)", icmsTotal: 21.14, qia: 3.90 },
        { municipio: "Frutal", regiao: "Uberaba", totalAnos: 1, anos: [2022], anosStr: "2022", constancia: "20% (1/5 ano)", icmsTotal: 15.94, qia: 2.60 },
        { municipio: "João Pinheiro", regiao: "Patos de Minas", totalAnos: 1, anos: [2025], anosStr: "2025", constancia: "20% (1/5 ano)", icmsTotal: 15.77, qia: 3.50 },
        { municipio: "Limeira do Oeste", regiao: "Uberlândia", totalAnos: 1, anos: [2025], anosStr: "2025", constancia: "20% (1/5 ano)", icmsTotal: 13.55, qia: 3.60 },
        { municipio: "Muriaé", regiao: "Juiz de Fora", totalAnos: 1, anos: [2022], anosStr: "2022", constancia: "20% (1/5 ano)", icmsTotal: 13.83, qia: 3.25 },
        { municipio: "Oliveira", regiao: "Divinópolis", totalAnos: 1, anos: [2025], anosStr: "2025", constancia: "20% (1/5 ano)", icmsTotal: 18.70, qia: 3.90 },
        { municipio: "Pouso Alegre", regiao: "Pouso Alegre", totalAnos: 1, anos: [2025], anosStr: "2025", constancia: "20% (1/5 ano)", icmsTotal: 1.33, qia: 0.00 },
        { municipio: "Uberaba", regiao: "Uberaba", totalAnos: 1, anos: [2021], anosStr: "2021", constancia: "20% (1/5 ano)", icmsTotal: 21.40, qia: 3.50 }
      ];

      return {
        mediaComDac,
        mediaSemDac,
        mediaQiaComDac,
        mediaQiaSemDac,
        todosSemDac,
        lanternaSemDac: lanterna,
        zeroQuadro1a,
        dacCompletaHistorico,
        dacCompletaConstantes: dacCompletaHistorico.filter(x => x.totalAnos === 5)
      };
    },

    calcularHistoricoPpag: function (allLibs) {
      return {
        // Ação 4337 (Capacitação e Formação Técnica)
        metaPpagInscritos: {
          '2023': 4012,
          '2024': 3432,
          '2025': 2914,
          '2026': 2768,
          total: 13126
        },
        atendimentoParticipantes: {
          '2023': 2178,
          '2024': 1173,
          '2025': 746,
          '2026': 1586,
          total: 5683
        },
        
        // Ação 4336: 4 Eixos Oficiais
        doacaoLivros: {
          '2023': { total: 11298, orcamentarios: 0, projetos: 0, mun: 19 },
          '2024': { total: 9640, orcamentarios: 5348, projetos: 1096, mun: 14 },
          '2025': { total: 7902, orcamentarios: 4444, projetos: 1290, mun: 12 },
          '2026': { total: 6317, orcamentarios: 4496, projetos: 2372, mun: 8 },
          totalLivros: 35157
        },

        visitas: {
          '2023': { aosMunicipios: 18, dosMunicipios: 12, total: 30 },
          '2024': { aosMunicipios: 2, dosMunicipios: 4, total: 6 },
          '2025': { aosMunicipios: 15, dosMunicipios: 18, total: 33 },
          '2026': { aosMunicipios: 3, dosMunicipios: 6, total: 9 },
          totalVisitas: 78
        },

        exposicoes: {
          '2023': { registros: 183, munAtendidos: 47 },
          '2024': { registros: 9964, munAtendidos: 40 },
          '2025': { registros: 114, munAtendidos: 39 },
          '2026': { registros: 66, munAtendidos: 19 },
          totalMunAtendidos: 145
        },

        orientacoesTecnicas: {
          '2023': { emailAppSei: 285, dacPareceres: 168, videoTelefone: 8, totalAssessorias: 596 },
          '2024': { emailAppSei: 269, dacPareceres: 164, videoTelefone: 1, totalAssessorias: 500 },
          '2025': { emailAppSei: 8856, dacPareceres: 243, videoTelefone: 1, totalAssessorias: 734 },
          '2026': { emailAppSei: 8128, dacPareceres: 148, videoTelefone: 1, totalAssessorias: 500 },
          totalDac: 723,
          totalAssessoriasQuadrienio: 2330
        },

        municipiosAtendidos: {
          '2023': 325,
          '2024': 271,
          '2025': 316,
          '2026': 270
        }
      };
    }
  };

  function boolSafe(v) {
    return v === true || v === 'true' || v === 1;
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body.dataset.mode === 'gestao') {
        window.SEBPC_Dashboard.init();
      }
    });
  } else {
    if (document.body.dataset.mode === 'gestao') {
      window.SEBPC_Dashboard.init();
    }
  }

})();
