/**
 * Sistema de Bibliotecas Públicas e Comunitárias de Minas Gerais
 * Aplicação Interativa com Google Maps Platform
 * 
 * Atribuição Obrigatória: gmp_git_agentskills_v1
 */

(function () {
  'use strict';

  // =========================================================================
  // Constantes e Estado da Aplicação
  // =========================================================================
  const MG_CENTER = [-18.5122, -44.5550];
  const MG_DEFAULT_ZOOM = 7;
  const STORAGE_KEY_API_KEY = 'gmp_bibliotecas_mg_api_key';

  const state = {
    allLibraries: [],
    closedLibraries: [],
    allMgSemAtiva: [],
    filteredLibraries: [],
    statistics: {},
    regioesCores: {},
    geoJsonData: null,
    estadoGeoJsonData: null,
    mascaraForaMgGeoJsonData: null,
    selectedLibraryId: null,
    
    // Google Maps Instances
    map: null,
    baseTileLayer: null,
    currentBaseMap: 'esri',
    infoWindow: null,
    markers: [],
    markerClusterer: null,
    geocoder: null,
    activeMarker: null,
    stateBorderLayer: null,
    outsideMgLayer: null,
    stateBackgroundLayer: null,
    
    // Camadas Territoriais Cartográficas
    layers: {
      markers: true,
      municipalLimits: true,
      regionalDivision: true, // Sempre ativada por padrão para exibir as 13 regiões logo ao abrir
      coverageChoropleth: false,
      popBubbles: false
    },
    popBubbleMarkers: [],
    sortOrder: 'alpha',
    
    // Filtros Ativos
    filters: {
      searchTerm: '',
      type: 'all', // all, 'Pública Municipal', 'Comunitária', 'Estadual'
      region: 'all',
      municipality: 'all',
      bibliobrStatus: 'all',
      bibliobrOnly: false,
      pnldOnly: false,
      nmmbOnly: false,
      nmmbEdition: 'all',
      dacOnly: false,
      sistemaAcoesOnly: false,
      sistemaAcoes2025Only: false,
      sistemaAcoes2024Only: false,
      sistemaAcoes2023Only: false,
      seilOnly: false,
      seilEdition: 'all',
      redeIntegraOnly: false,
      onlyClosed: false,       // EXIBIR APENAS fechadas / sem biblioteca
      closedSubMode: 'all'     // 'all' (405), 'maiores_20k' (28), 'fechada' (5), 'sem_dados_4_anos' (7), 'sem_registro' (387), 'apenas_comunitaria' (6)
    }
  };
  window.__state = state;

  // =========================================================================
  // Estilo Claro, Limpo e de Alto Contraste (Acessibilidade Visual)
  // =========================================================================
  const LIGHT_MAP_STYLES = [
    { elementType: "geometry", stylers: [{ color: "#e8f5e9" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#0f172a" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 4 }] },
    { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }] },
    { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
    { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
    { featureType: "administrative.neighborhood", stylers: [{ visibility: "on" }] },
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#e8f5e9" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#cbd5e1" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#94a3b8" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#1e293b" }] },
    { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#e0f2fe" }] }
  ];

  // =========================================================================
  // Inicialização dos Dados
  // =========================================================================
  function getFeatureCenter(feature) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    function traverse(coords) {
      if (typeof coords[0] === 'number') {
        const lng = coords[0];
        const lat = coords[1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      } else if (Array.isArray(coords)) {
        coords.forEach(traverse);
      }
    }
    if (feature && feature.geometry && feature.geometry.coordinates) {
      traverse(feature.geometry.coordinates);
    }
    if (minLat === 90) return { lat: -18.5122, lng: -44.5550 };
    return {
      lat: Number(((minLat + maxLat) / 2).toFixed(6)),
      lng: Number(((minLng + maxLng) / 2).toFixed(6))
    };
  }

  function classifyClosedLibraries() {
    const munStatusMap = {};
    if (state.geoJsonData && state.geoJsonData.features) {
      state.geoJsonData.features.forEach(f => {
        if (f.properties && f.properties.name) {
          munStatusMap[f.properties.name] = f.properties.status_cultural;
        }
      });
    }

    state.closedLibraries.forEach(item => {
      const munName = item.municipio;
      const st = munStatusMap[munName];
      const obs = (item.observacao || '').toLowerCase();
      const nome = (item.nome || '').toLowerCase();
      const isFechada = (st === 'Fechada / Reforma' || obs.includes('fechada') || obs.includes('reforma') || nome.includes('fechada') || munName === 'Brazópolis' || munName === "Olhos-d' Água");
      item.situacao = isFechada ? 'fechada' : 'sem_biblioteca';
    });

    // Construir lista de todos os 405 municípios de MG sem biblioteca pública ativa
    if (state.geoJsonData && state.geoJsonData.features) {
      const closedByMun = {};
      state.closedLibraries.forEach(cl => {
        if (!closedByMun[cl.municipio]) closedByMun[cl.municipio] = cl;
      });

      const allSemAtiva = [];
      state.geoJsonData.features.forEach(f => {
        if (!f.properties.tem_biblioteca_publica) {
          const mName = f.properties.name;
          const p = f.properties;
          const sit = p.situacao_cadastral || 'sem_registro_historico';
          if (closedByMun[mName]) {
            const item = closedByMun[mName];
            item.situacao_cadastral = sit;
            item.populacao_2022 = p.populacao_2022 || 0;
            item.populacao_formatada = p.populacao_formatada || (item.populacao_2022 ? item.populacao_2022.toLocaleString('pt-BR') : '');
            allSemAtiva.push(item);
          } else {
            const center = getFeatureCenter(f);
            allSemAtiva.push({
              id: `sem_biblio_${p.id}`,
              nome: sit === 'apenas_comunitaria' ? `Apenas Biblioteca Comunitária (${mName})` : `Sem Biblioteca Pública (${mName})`,
              tipo: sit === 'apenas_comunitaria' ? 'Comunitária' : 'Sem Biblioteca',
              municipio: mName,
              codigo_ibge: p.id,
              regiao_intermediaria: p.regiao_intermediaria || 'Não Informada',
              endereco: 'Município sem biblioteca pública ativa cadastrada',
              bairro: '',
              telefone: '',
              email: '',
              responsavel: '',
              observacao: p.status_cultural || 'Município de Minas Gerais sem biblioteca pública ativa registrada no Sistema Estadual.',
              status: p.status_cultural || 'Sem informação atualizada',
              situacao: (sit === 'fechada_reforma' || sit === 'declarado_sem_biblioteca') ? 'fechada' : 'sem_biblioteca',
              situacao_cadastral: sit,
              lat: center.lat,
              lng: center.lng,
              precisao_localizacao: 'municipio',
              populacao_2022: p.populacao_2022 || 0,
              populacao_formatada: p.populacao_formatada || (p.populacao_2022 ? p.populacao_2022.toLocaleString('pt-BR') : ''),
              nmmb: null,
              dac: null,
              acoes_sistema_2026: null,
              acoes_sistema_2025: null,
              acoes_sistema_2024: null,
              acoes_sistema_2023: null,
              seil: null,
              foto_fachada: null,
              foto_fachada_thumb: null
            });
          }
        }
      });
      state.allMgSemAtiva = allSemAtiva;
    }
  }

  function initData() {
    if (window.BIBLIOTECAS_DATA) {
      state.allLibraries = window.BIBLIOTECAS_DATA.bibliotecas || [];
      state.closedLibraries = window.BIBLIOTECAS_DATA.bibliotecas_fechadas || [];
      state.statistics = window.BIBLIOTECAS_DATA.estatisticas || {};
      state.regioesCores = window.BIBLIOTECAS_DATA.regioes_cores || {};
    }
    if (window.MUNICIPIOS_GEOJSON) {
      state.geoJsonData = window.MUNICIPIOS_GEOJSON;
    }
    if (window.ESTADO_MG_GEOJSON) {
      state.estadoGeoJsonData = window.ESTADO_MG_GEOJSON;
    }
    if (window.MASCARA_FORA_MG_GEOJSON) {
      state.mascaraForaMgGeoJsonData = window.MASCARA_FORA_MG_GEOJSON;
    }

    // Mapear população do Censo IBGE 2022 para todas as bibliotecas ativas e fechadas
    if (state.geoJsonData && state.geoJsonData.features) {
      const popMap = {};
      state.geoJsonData.features.forEach(f => {
        if (f.properties && f.properties.name) {
          popMap[f.properties.name] = {
            pop: f.properties.populacao_2022 || 0,
            fmt: f.properties.populacao_formatada || (f.properties.populacao_2022 ? f.properties.populacao_2022.toLocaleString('pt-BR') : '')
          };
        }
      });

      state.allLibraries.forEach(lib => {
        if (popMap[lib.municipio]) {
          lib.populacao_2022 = popMap[lib.municipio].pop;
          lib.populacao_formatada = popMap[lib.municipio].fmt;
        }
      });

      state.closedLibraries.forEach(lib => {
        if (popMap[lib.municipio]) {
          lib.populacao_2022 = popMap[lib.municipio].pop;
          lib.populacao_formatada = popMap[lib.municipio].fmt;
        }
      });
    }

    classifyClosedLibraries();

    updateHeaderStats();
    populateDropdowns();
    renderRegionalLegend();
    applyFilters();
  }

  // =========================================================================
  // Atualização dos Indicadores e Dropdowns
  // =========================================================================
  function updateHeaderStats() {
    const stats = state.statistics;
    const statTotalEl = document.getElementById('stat-total');
    const statPubEl = document.getElementById('stat-publicas');
    const statMunComPubEl = document.getElementById('stat-mun-com-pub');
    const statSemPubEl = document.getElementById('stat-sem-publica');
    const statComEl = document.getElementById('stat-comunitarias');
    const statEstEl = document.getElementById('stat-estaduais');
    const statPnldEl = document.getElementById('stat-pnld');
    const statNmmbEl = document.getElementById('stat-nmmb');
    const statDacEl = document.getElementById('stat-dac');
    const statSistemaEl = document.getElementById('stat-sistema-acoes');
    const statSeilEl = document.getElementById('stat-seil');
    const typeSelect = document.getElementById('filter-type');
    if (typeSelect) {
      const typeCounts = {
        all: (state.allLibraries || []).length || 568,
        'Pública Municipal': 0,
        'Comunitária': 0,
        'Estadual': 0
      };
      (state.allLibraries || []).forEach(b => {
        if (typeCounts[b.tipo] !== undefined) {
          typeCounts[b.tipo]++;
        }
      });
      const typeOptMap = {
        'all': `Todas as Ativas (${typeCounts.all})`,
        'Pública Municipal': `📘 Públicas Municipais (${typeCounts['Pública Municipal']})`,
        'Comunitária': `👥 Comunitárias (${typeCounts['Comunitária']})`,
        'Estadual': `🏛️ Estadual (${typeCounts['Estadual']})`
      };
      Array.from(typeSelect.options).forEach(opt => {
        if (typeOptMap[opt.value]) {
          opt.textContent = typeOptMap[opt.value];
        }
      });
    }

    const statCobEl = document.getElementById('stat-cobertura');

    if (statTotalEl) statTotalEl.textContent = stats.total_equipamentos_ativos || stats.total_bibliotecas_ativas || state.allLibraries.length || 557;
    if (statPubEl) statPubEl.textContent = stats.total_bibliotecas_publicas || (stats.total_por_tipo ? (stats.total_por_tipo['Pública Municipal'] + (stats.total_por_tipo['Estadual'] || 0)) : 503);
    if (statMunComPubEl) statMunComPubEl.textContent = `(${stats.municipios_com_biblioteca_publica || 448} mun.)`;
    if (statSemPubEl) statSemPubEl.textContent = stats.municipios_sem_biblioteca_publica || 405;
    if (statComEl) statComEl.textContent = stats.total_bibliotecas_comunitarias || (stats.total_por_tipo ? stats.total_por_tipo['Comunitária'] : 54);
    if (statEstEl) statEstEl.textContent = stats.total_por_tipo ? stats.total_por_tipo['Estadual'] : 1;
    if (statPnldEl) statPnldEl.textContent = stats.total_com_livros_pnld || 229;
    if (statNmmbEl) statNmmbEl.textContent = stats.total_com_nmmb || 267;
    if (statDacEl) statDacEl.textContent = stats.total_com_dac || 242;
    if (statSistemaEl) statSistemaEl.textContent = stats.total_municipios_atendidos_acoes_2026 || stats.total_municipios_atendidos_sistema_2026 || 184;
    if (statSeilEl) statSeilEl.textContent = stats.total_com_seil || 265;

    const cobVal = stats.cobertura_publica_percentual || stats.porcentagem_cobertura_estadual || '52.5';
    if (statCobEl) statCobEl.textContent = `${Number(cobVal).toFixed(1)}%`;

    const statCobMunEl = document.getElementById('stat-cobertura-mun');
    if (statCobMunEl) {
      statCobMunEl.textContent = `(${stats.municipios_com_biblioteca_publica || 448} mun.)`;
    }

    const labelBibliobr = document.getElementById('label-bibliobr-count');
    if (labelBibliobr) {
      let bibCount = 0;
      (state.allLibraries || []).forEach(b => {
        const norm = normalizeBibliobrStatus(b.status_bibliobr);
        if (norm !== 'Não' && norm !== 'Não iniciou o cadastro') bibCount++;
      });
      labelBibliobr.textContent = `🏛️ Cadastradas na BiblioBR (${bibCount || 424})`;
    }

    const selectBiblioStatus = document.getElementById('select-status-bibliobr');
    if (selectBiblioStatus) {
      const counts = {
        all: 0,
        cadastradas: 0,
        'Aguardando análise': 0,
        'Aprovado': 0,
        'Em análise Gestor Minc': 0,
        'Em diligência': 0,
        'Indeferido': 0,
        'Não iniciou o cadastro': 0,
        'Não': 0,
        'Rascunho': 0
      };
      (state.allLibraries || []).forEach(b => {
        counts.all++;
        const norm = normalizeBibliobrStatus(b.status_bibliobr);
        if (counts[norm] !== undefined) {
          counts[norm]++;
        }
        if (norm !== 'Não' && norm !== 'Não iniciou o cadastro') {
          counts.cadastradas++;
        }
      });
      const optMap = {
        'all': `Todos os status BiblioBR (${counts.all})`,
        'cadastradas': `🏛️ Cadastradas na BiblioBR (${counts.cadastradas})`,
        'Aguardando análise': `⏳ Aguardando análise (${counts['Aguardando análise']})`,
        'Aprovado': `✅ Aprovado (${counts['Aprovado']})`,
        'Em análise Gestor Minc': `🔍 Em análise Gestor MinC (${counts['Em análise Gestor Minc']})`,
        'Em diligência': `⚠️ Em diligência (${counts['Em diligência']})`,
        'Indeferido': `❌ Indeferido (${counts['Indeferido']})`,
        'Não iniciou o cadastro': `⚪ Não iniciou o cadastro (${counts['Não iniciou o cadastro']})`,
        'Não': `⚪ Não iniciou o cadastro (${counts['Não iniciou o cadastro']})`,
        'Rascunho': `📝 Rascunho (${counts['Rascunho']})`
      };
      Array.from(selectBiblioStatus.options).forEach(opt => {
        if (optMap[opt.value]) {
          opt.textContent = optMap[opt.value];
        }
      });
    }

    const labelPnld = document.getElementById('label-pnld-count');
    if (labelPnld) {
      const pnldCount = stats.total_com_livros_pnld || 229;
      labelPnld.textContent = `📚 Programa PNLD+ (${pnldCount})`;
    }

    const labelNmmb = document.getElementById('label-nmmb-count');
    if (labelNmmb) {
      const nmmbCount = stats.total_com_nmmb || 276;
      labelNmmb.textContent = `🌙 Noite Mineira (${nmmbCount})`;
    }

    // Subfiltro Noite Mineira - Edições
    const nmmbEditionSelect = document.getElementById('select-nmmb-edition');
    const subfiltersNmmb = document.getElementById('subfilters-nmmb');
    if (nmmbEditionSelect && state.allLibraries && state.allLibraries.length > 0) {
      const edCounts = {};
      let totalNmmbLibs = 0;
      state.allLibraries.forEach(b => {
        if (b.nmmb && b.nmmb.participou) {
          totalNmmbLibs++;
          (b.nmmb.edicoes || []).forEach(ed => {
            edCounts[ed] = (edCounts[ed] || 0) + 1;
          });
        }
      });

      const currentVal = state.filters.nmmbEdition || 'all';
      nmmbEditionSelect.innerHTML = '';
      
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = `Todas as 18 Edições (${totalNmmbLibs} bibliotecas)`;
      nmmbEditionSelect.appendChild(optAll);

      const sortedEds = Object.keys(edCounts).sort((a, b) => {
        const numA = parseInt((a.match(/(\d+)ª/) || [0, 0])[1], 10);
        const numB = parseInt((b.match(/(\d+)ª/) || [0, 0])[1], 10);
        return numB - numA;
      });

      sortedEds.forEach(ed => {
        const opt = document.createElement('option');
        opt.value = ed;
        const count = edCounts[ed] || 0;
        let suffix = '';
        if (ed.includes('18ª')) suffix = ' — Consciência Negra';
        opt.textContent = `${ed}${suffix} (${count} ${count === 1 ? 'biblioteca' : 'bibliotecas'})`;
        nmmbEditionSelect.appendChild(opt);
      });

      nmmbEditionSelect.value = currentVal;

      if (subfiltersNmmb) {
        const pAll = subfiltersNmmb.querySelector('[data-ed="all"]');
        if (pAll) pAll.textContent = `Todas (${totalNmmbLibs})`;
        const p18 = subfiltersNmmb.querySelector('[data-ed^="18ª"]');
        if (p18) p18.textContent = `18ª Consciência Negra (${edCounts['18ª (26/11/2026)'] || 80})`;
        const p17 = subfiltersNmmb.querySelector('[data-ed^="17ª"]');
        if (p17) p17.textContent = `17ª (${edCounts['17ª (18/06/2026)'] || 121})`;
        const p16 = subfiltersNmmb.querySelector('[data-ed^="16ª"]');
        if (p16) p16.textContent = `16ª (${edCounts['16ª (09/04/2026)'] || 113})`;
        const p15 = subfiltersNmmb.querySelector('[data-ed^="15ª"]');
        if (p15) p15.textContent = `15ª (${edCounts['15ª (26/02/2026)'] || 132})`;
      }
    }

    const labelDac = document.getElementById('label-dac-count');
    if (labelDac) {
      const dacCount = stats.total_com_dac || 242;
      labelDac.textContent = `🏛️ Certificação DAC (${dacCount})`;
    }

    const labelSistema = document.getElementById('label-sistema-count');
    if (labelSistema) {
      const sistemaCount = stats.total_com_acoes_sistema_2026 || 252;
      labelSistema.textContent = `2026 (${sistemaCount})`;
    }

    const labelSistema2025 = document.getElementById('label-sistema-2025-count');
    if (labelSistema2025) {
      const sistemaCount2025 = stats.total_com_acoes_sistema_2025 || 368;
      labelSistema2025.textContent = `2025 (${sistemaCount2025})`;
    }

    const labelSistema2024 = document.getElementById('label-sistema-2024-count');
    if (labelSistema2024) {
      const sistemaCount2024 = stats.total_com_acoes_sistema_2024 || 315;
      labelSistema2024.textContent = `2024 (${sistemaCount2024})`;
    }

    const labelSistema2023 = document.getElementById('label-sistema-2023-count');
    if (labelSistema2023) {
      const sistemaCount2023 = stats.total_com_acoes_sistema_2023 || 341;
      labelSistema2023.textContent = `2023 (${sistemaCount2023})`;
    }

    const labelSeil = document.getElementById('label-seil-count');
    if (labelSeil) {
      const seilCount = stats.total_com_seil || 268;
      labelSeil.textContent = `📖 Semana da Literatura - SEIL (${seilCount})`;
    }

    // Subfiltro SEIL - Edições
    const seilEditionSelect = document.getElementById('select-seil-edition');
    const subfiltersSeil = document.getElementById('subfilters-seil');
    if (seilEditionSelect && state.allLibraries && state.allLibraries.length > 0) {
      const edCounts = {};
      let totalSeilLibs = 0;
      state.allLibraries.forEach(b => {
        if (b.seil && b.seil.participou) {
          totalSeilLibs++;
          (b.seil.edicoes || []).forEach(ed => {
            const edStr = String(ed);
            edCounts[edStr] = (edCounts[edStr] || 0) + 1;
          });
        }
      });

      const currentVal = state.filters.seilEdition || 'all';
      seilEditionSelect.innerHTML = '';

      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = `Todas as 6 Edições (${totalSeilLibs} bibliotecas)`;
      seilEditionSelect.appendChild(optAll);

      const sortedEds = Object.keys(edCounts).sort((a, b) => {
        const numA = parseInt((a.match(/(\d+)ª/) || a.match(/(\d+)/) || [0, 0])[1], 10);
        const numB = parseInt((b.match(/(\d+)ª/) || b.match(/(\d+)/) || [0, 0])[1], 10);
        return numB - numA;
      });

      sortedEds.forEach(ed => {
        const opt = document.createElement('option');
        opt.value = ed;
        const count = edCounts[ed] || 0;
        const numMatch = ed.match(/(\d+)ª/);
        const yearMatch = ed.match(/(202\d)/);
        let label = ed;
        if (numMatch && yearMatch) {
          label = `${numMatch[1]} Edição (${yearMatch[1]})`;
        }
        opt.textContent = `${label} (${count} ${count === 1 ? 'biblioteca' : 'bibliotecas'})`;
        seilEditionSelect.appendChild(opt);
      });

      seilEditionSelect.value = currentVal;

      if (subfiltersSeil) {
        const pAll = subfiltersSeil.querySelector('[data-ed="all"]');
        if (pAll) pAll.textContent = `Todas (${totalSeilLibs})`;
        const pills = subfiltersSeil.querySelectorAll('.btn-subfilter-pill-seil[data-ed]');
        pills.forEach(p => {
          const edKey = p.getAttribute('data-ed');
          if (edKey && edKey !== 'all') {
            const numM = edKey.match(/^(\d+ª)/);
            let c = edCounts[edKey] || 0;
            if (!c && numM) {
              for (const k in edCounts) {
                if (k.startsWith(numM[1])) { c = edCounts[k]; break; }
              }
            }
            if (numM) {
              p.textContent = `${numM[1]} (${c})`;
            }
          }
        });
      }
    }

    const labelOnlyClosed = document.getElementById('label-only-closed-count');
    const allDesassistidos = (state.allMgSemAtiva && state.allMgSemAtiva.length) ? state.allMgSemAtiva : state.closedLibraries;
    const closedCount = stats.municipios_sem_biblioteca_publica || (allDesassistidos && allDesassistidos.length) || 405;
    if (labelOnlyClosed) {
      labelOnlyClosed.textContent = `📕 Bibliotecas Inativas (${closedCount})`;
    }

    const subfiltersClosed = document.getElementById('subfilters-closed');
    if (subfiltersClosed && allDesassistidos && allDesassistidos.length > 0) {
      const count20k = allDesassistidos.filter(x => (x.populacao_2022 || 0) >= 20000).length;
      const countFechada = allDesassistidos.filter(x => x.situacao_cadastral === 'fechada_reforma' || x.situacao === 'fechada' || x.situacao_cadastral === 'declarado_sem_biblioteca').length;
      const countSemDadosReg = allDesassistidos.filter(x => x.situacao_cadastral === 'sem_informacao_4_anos' || x.situacao_cadastral === 'sem_registro_historico').length;

      const pAll = subfiltersClosed.querySelector('[data-submode="all"]');
      if (pAll) pAll.textContent = `Todas Inativas (${closedCount})`;
      const p20k = subfiltersClosed.querySelector('[data-submode="maiores_20k"]');
      if (p20k) p20k.textContent = `🔥 > 20k hab. (${count20k})`;
      const pFech = subfiltersClosed.querySelector('[data-submode="fechada"]');
      if (pFech) pFech.textContent = `📕 Fechada/Reforma (${countFechada})`;
      const pSemDadosReg = subfiltersClosed.querySelector('[data-submode="sem_dados_registro"]');
      if (pSemDadosReg) pSemDadosReg.textContent = `⚠️ Sem informação atualizada (${countSemDadosReg})`;
    }

    const statPopCobEl = document.getElementById('stat-populacao-cobertura');
    const statPopTotEl = document.getElementById('stat-populacao-total');
    if (statPopCobEl) {
      const popPct = stats.cobertura_populacional_percentual || 83.4;
      statPopCobEl.textContent = `${popPct.toFixed(1)}%`;
    }
    if (statPopTotEl) {
      const popAtendida = stats.populacao_com_publica || 17128362;
      const popMilhoes = (popAtendida / 1000000).toFixed(1).replace('.', ',');
      statPopTotEl.textContent = `(${popMilhoes}M hab.)`;
    }

    const labelRedeIntegra = document.getElementById('label-rede-integra-count');
    if (labelRedeIntegra) {
      const poloCount = stats.total_polos_rede_integra_geraes || 24;
      labelRedeIntegra.textContent = `🌐 Rede Integra Geraes - Polos (${poloCount})`;
    }

    const filterTypeSelect = document.getElementById('filter-type');
    if (filterTypeSelect && filterTypeSelect.options && filterTypeSelect.options.length >= 4) {
      const totCount = stats.total_equipamentos_ativos || stats.total_bibliotecas_ativas || state.allLibraries.length || 556;
      const pubCount = stats.total_por_tipo ? stats.total_por_tipo['Pública Municipal'] : 501;
      const comCount = stats.total_por_tipo ? stats.total_por_tipo['Comunitária'] : 54;
      const estCount = stats.total_por_tipo ? stats.total_por_tipo['Estadual'] : 1;

      filterTypeSelect.options[0].textContent = `Todas as Ativas (${totCount})`;
      filterTypeSelect.options[1].textContent = `📘 Públicas Municipais (${pubCount})`;
      filterTypeSelect.options[2].textContent = `👥 Comunitárias (${comCount})`;
      filterTypeSelect.options[3].textContent = `🏛️ Estadual (${estCount})`;
    }
  }

  function populateDropdowns() {
    // Regiões Intermediárias
    const regionSelect = document.getElementById('filter-region');
    if (regionSelect) {
      const regions = state.statistics.regioes_intermediarias || Object.keys(state.regioesCores);
      regions.sort().forEach(reg => {
        const opt = document.createElement('option');
        opt.value = reg;
        opt.textContent = reg;
        regionSelect.appendChild(opt);
      });
    }
  }

  // =========================================================================
  // =========================================================================
  // Paleta Harmoniosa e Distinta para as 13 Regiões Geográficas Intermediárias
  // (Cores cartograficamente equilibradas e diversificadas, sem proximidade
  //  cromática entre regiões vizinhas)
  // =========================================================================
  const HIGH_CONTRAST_REGIOES_CORES = {
    'Belo Horizonte': '#1d4ed8',        // Azul Royal Cobalto (Central)
    'Montes Claros': '#c2410c',         // Terracota Quente do Norte
    'Teófilo Otoni': '#4338ca',         // Índigo Ultramar Profundo (Nordeste / Mucuri)
    'Governador Valadares': '#0f766e',  // Verde Petróleo / Peacock Teal (Leste / Rio Doce)
    'Ipatinga': '#db2777',              // Magenta Rosado Nobre (Vale do Aço)
    'Juiz de Fora': '#7e22ce',          // Púrpura Real (Zona da Mata)
    'Juíz de Fora': '#7e22ce',          // Variação com acento
    'Barbacena': '#ea580c',             // Coral Laranja Radiante (Campo das Vertentes)
    'Varginha': '#047857',              // Verde Esmeralda Nobre (Sul de Minas - Leste)
    'Pouso Alegre': '#9f1239',          // Vinho Carmim Imperial (Sul de Minas - Oeste)
    'Divinópolis': '#0284c7',           // Azul Cerúleo / Ciano Oceânico (Centro-Oeste)
    'Patos de Minas': '#ca8a04',        // Âmbar Ouro Velho (Alto Paranaíba)
    'Uberaba': '#78350f',               // Marrom Bronze / Canela (Triângulo Sul)
    'Uberlândia': '#be185d'             // Framboesa Berry (Triângulo Norte)
  };

  // Versões em tom pastel suave para preenchimento de linhas de tabelas e planilhas Excel
  const REGIOES_PASTEL_CORES = {
    'Belo Horizonte': { bg: 'EFF6FF', badge: '1D4ED8', text: '1E3A8A' },
    'Montes Claros': { bg: 'FFFBEB', badge: 'C2410C', text: '78350F' },
    'Teófilo Otoni': { bg: 'EEF2FF', badge: '4338CA', text: '312E81' },
    'Governador Valadares': { bg: 'F0FDFA', badge: '0F766E', text: '134E4A' },
    'Ipatinga': { bg: 'FDF2F8', badge: 'DB2777', text: '831843' },
    'Juiz de Fora': { bg: 'FAF5FF', badge: '7E22CE', text: '581C87' },
    'Juíz de Fora': { bg: 'FAF5FF', badge: '7E22CE', text: '581C87' },
    'Barbacena': { bg: 'FFF7ED', badge: 'EA580C', text: '7C2D12' },
    'Varginha': { bg: 'ECFDF5', badge: '047857', text: '064E3B' },
    'Pouso Alegre': { bg: 'FFF1F2', badge: '9F1239', text: '881337' },
    'Divinópolis': { bg: 'F0F9FF', badge: '0284C7', text: '0C4A6E' },
    'Patos de Minas': { bg: 'FEFCE8', badge: 'CA8A04', text: '713F12' },
    'Uberaba': { bg: 'FEF3C7', badge: '78350F', text: '451A03' },
    'Uberlândia': { bg: 'FDF4FF', badge: 'BE185D', text: '701A75' }
  };

  function renderRegionalLegend() {
    const legendContainer = document.getElementById('regional-legend-grid');
    if (!legendContainer) return;
    legendContainer.innerHTML = '';

    const sortedRegions = Object.keys(HIGH_CONTRAST_REGIOES_CORES).filter(r => r !== 'Juíz de Fora').sort();
    sortedRegions.forEach(reg => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.title = `Região Intermediária: ${reg}`;
      item.innerHTML = `
        <span class="legend-color-box" style="background: ${HIGH_CONTRAST_REGIOES_CORES[reg]}"></span>
        <span>${reg}</span>
      `;
      legendContainer.appendChild(item);
    });
  }

  // =========================================================================
  // Motor de Busca e Filtragem
  // =========================================================================
  function formatBibliobrDisplay(status) {
    if (!status) return 'Não iniciou o cadastro';
    const s = String(status).trim().toLowerCase();
    if (s === 'não' || s === 'nao' || s.includes('não cadastrado') || s.includes('nao cadastrado') || s.includes('não iniciou') || s.includes('nao iniciou') || s === '') {
      return 'Não iniciou o cadastro';
    }
    return status;
  }

  function normalizeBibliobrStatus(status) {
    if (!status) return 'Não iniciou o cadastro';
    const s = String(status).trim().toLowerCase();
    if (s.includes('aguardando')) return 'Aguardando análise';
    if (s === 'aprovado' || s === 'aprovada') return 'Aprovado';
    if (s.includes('gestor')) return 'Em análise Gestor Minc';
    if (s.includes('dilig')) return 'Em diligência';
    if (s.includes('indeferid')) return 'Indeferido';
    if (s.includes('rascunho')) return 'Rascunho';
    if (s === 'não' || s === 'nao' || s.includes('não cadastrado') || s.includes('nao cadastrado') || s.includes('não iniciou') || s.includes('nao iniciou') || s === '') return 'Não iniciou o cadastro';
    return status;
  }

  function normalizeStr(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function applyFilters() {
    const rawTerm = (state.filters.searchTerm || '').trim();
    const term = normalizeStr(rawTerm);
    const selectedType = state.filters.type;
    const selectedRegion = state.filters.region;
    const selectedMun = state.filters.municipality;
    const pnldOnly = state.filters.pnldOnly;
    const nmmbOnly = state.filters.nmmbOnly;
    const redeIntegraOnly = state.filters.redeIntegraOnly;
    const onlyClosed = state.filters.onlyClosed;
    const closedSubMode = state.filters.closedSubMode;

    let baseList = [];
    if (onlyClosed) {
      const allDesassistidos = (state.allMgSemAtiva && state.allMgSemAtiva.length > 0) ? state.allMgSemAtiva : state.closedLibraries;
      if (closedSubMode === 'all') {
        baseList = [...allDesassistidos];
      } else if (closedSubMode === 'maiores_20k') {
        baseList = allDesassistidos.filter(x => (x.populacao_2022 || 0) >= 20000);
      } else if (closedSubMode === 'fechada') {
        baseList = allDesassistidos.filter(x => x.situacao_cadastral === 'fechada_reforma' || x.situacao === 'fechada' || x.situacao_cadastral === 'declarado_sem_biblioteca');
      } else if (closedSubMode === 'sem_dados_registro' || closedSubMode === 'sem_dados_4_anos' || closedSubMode === 'sem_registro') {
        baseList = allDesassistidos.filter(x => x.situacao_cadastral === 'sem_informacao_4_anos' || x.situacao_cadastral === 'sem_registro_historico');
      } else {
        baseList = [...allDesassistidos];
      }
    } else if (selectedType === 'fechadas_all' || selectedType === 'fechadas_only' || selectedType === 'sem_biblio_only' || selectedType === 'all_mg_sem_ativa') {
      const allDesassistidos = (state.allMgSemAtiva && state.allMgSemAtiva.length > 0) ? state.allMgSemAtiva : state.closedLibraries;
      if (selectedType === 'fechadas_all') baseList = [...allDesassistidos];
      else if (selectedType === 'fechadas_only') baseList = allDesassistidos.filter(x => x.situacao_cadastral === 'fechada_reforma' || x.situacao === 'fechada' || x.situacao_cadastral === 'declarado_sem_biblioteca');
      else if (selectedType === 'sem_biblio_only') baseList = allDesassistidos.filter(x => x.situacao === 'sem_biblioteca' || x.tipo === 'Sem Biblioteca');
      else if (selectedType === 'all_mg_sem_ativa') baseList = [...allDesassistidos];
    } else {
      baseList = [...state.allLibraries];
    }

    const words = term ? term.split(/\s+/).filter(w => w.length > 0) : [];

    state.filteredLibraries = baseList.filter(item => {
      // Filtro Tipo (ignorado se onlyClosed estiver ativo, pois closedSubMode já faz o recorte específico)
      if (!onlyClosed && selectedType !== 'all') {
        if (selectedType === 'Pública Municipal' && item.tipo !== 'Pública Municipal') return false;
        if (selectedType === 'Comunitária' && item.tipo !== 'Comunitária') return false;
        if (selectedType === 'Estadual' && item.tipo !== 'Estadual') return false;
        if (selectedType === 'fechadas_all' && item.status === 'Ativa') return false;
        if (selectedType === 'fechadas_only' && (item.status === 'Ativa' || item.situacao !== 'fechada')) return false;
        if (selectedType === 'sem_biblio_only' && (item.status === 'Ativa' || item.situacao !== 'sem_biblioteca')) return false;
        if (selectedType === 'all_mg_sem_ativa' && item.status === 'Ativa') return false;
        if (selectedType === 'Fechada' && item.status === 'Ativa') return false;
      }

      // Filtro Região
      if (selectedRegion !== 'all' && item.regiao_intermediaria !== selectedRegion) {
        return false;
      }

      // Filtro Município
      if (selectedMun !== 'all' && item.municipio !== selectedMun) {
        return false;
      }

      // Filtro Status BiblioBR (seleção única exclusiva de status ou cadastradas)
      if (state.filters.bibliobrStatus && state.filters.bibliobrStatus !== 'all') {
        const targetStatus = state.filters.bibliobrStatus;
        const norm = normalizeBibliobrStatus(item.status_bibliobr);
        if (targetStatus === 'cadastradas') {
          if (norm === 'Não') return false;
        } else if (norm !== targetStatus) {
          return false;
        }
      } else if (state.filters.bibliobrOnly) {
        const norm = normalizeBibliobrStatus(item.status_bibliobr);
        if (norm === 'Não') return false;
      }

      // Filtro PNLD+ (Bibliotecas que receberam livros do programa)
      if (pnldOnly) {
        const q = item.quantidade_livros;
        const hasBooks = q !== null && q !== undefined && String(q).trim() !== '' && String(q).trim() !== '0';
        if (!hasBooks) return false;
      }

      // Filtro Noite Mineira de Museus e Bibliotecas (NMMB)
      if (nmmbOnly) {
        if (!item.nmmb || !item.nmmb.participou) return false;
        if (state.filters.nmmbEdition && state.filters.nmmbEdition !== 'all') {
          const targetEd = state.filters.nmmbEdition;
          const numMatch = targetEd.match(/^(\d+ª)/);
          const participatesInEd = item.nmmb.edicoes && item.nmmb.edicoes.some(ed => {
            if (ed === targetEd) return true;
            if (numMatch && (ed.startsWith(numMatch[1]) || ed.includes(numMatch[1]))) return true;
            return false;
          });
          if (!participatesInEd) return false;
        }
      }

      // Filtro Declaração de Acervos Culturais (DAC)
      if (state.filters.dacOnly) {
        if (!item.dac || !item.dac.possui_dac) return false;
      }

      // Filtro Ações do Sistema Estadual (2026)
      if (state.filters.sistemaAcoesOnly) {
        if (!item.acoes_sistema_2026 || !item.acoes_sistema_2026.atendido) return false;
      }

      // Filtro Ações do Sistema Estadual (2025)
      if (state.filters.sistemaAcoes2025Only) {
        if (!item.acoes_sistema_2025 || !item.acoes_sistema_2025.atendido) return false;
      }

      // Filtro Ações do Sistema Estadual (2024)
      if (state.filters.sistemaAcoes2024Only) {
        if (!item.acoes_sistema_2024 || !item.acoes_sistema_2024.atendido) return false;
      }

      // Filtro Ações do Sistema Estadual (2023)
      if (state.filters.sistemaAcoes2023Only) {
        if (!item.acoes_sistema_2023 || !item.acoes_sistema_2023.atendido) return false;
      }

      // Filtro Semana Estadual de Incentivo à Literatura (SEIL)
      if (state.filters.seilOnly) {
        if (!item.seil || !item.seil.participou) return false;
        if (state.filters.seilEdition && state.filters.seilEdition !== 'all') {
          const targetEd = state.filters.seilEdition;
          const numMatch = targetEd.match(/^(\d+ª)/);
          const yearMatch = targetEd.match(/(202\d)/);
          const participatesInEd = item.seil.edicoes && item.seil.edicoes.some(ed => {
            const edStr = String(ed);
            if (edStr === targetEd) return true;
            if (numMatch && (edStr.startsWith(numMatch[1]) || edStr.includes(numMatch[1]))) return true;
            if (yearMatch && edStr.includes(yearMatch[1])) return true;
            return false;
          });
          if (!participatesInEd) return false;
        }
      }

      // Filtro Bibliotecas-Polo Rede Integra Geraes (24 polos regionais)
      if (redeIntegraOnly) {
        if (!item.rede_integra_geraes_polo) return false;
      }

      // Busca Textual Livre: pesquisa inteligente no município, nome da biblioteca, endereço, bairro e responsável
      if (words.length > 0) {
        const itemStr = normalizeStr([
          item.nome,
          item.municipio,
          item.endereco,
          item.bairro,
          item.responsavel,
          item.processo_sei,
          item.id_bibliobr,
          item.status_bibliobr,
          item.ciclo_pnld,
          item.observacao
        ].join(' '));

        const itemCepDigits = (item.cep || '').replace(/\D/g, '');

        const matchesAllWords = words.every(word => {
          if (itemStr.includes(word)) return true;
          const wordDigits = word.replace(/\D/g, '');
          if (wordDigits.length >= 4 && itemCepDigits.includes(wordDigits)) return true;
          return false;
        });

        if (!matchesAllWords) {
          return false;
        }
      }

      return true;
    });

    // Ordenação inteligente por relevância (se houver termo digitado) ou por critério selecionado
    if (term) {
      state.filteredLibraries.sort((a, b) => {
        const aMun = normalizeStr(a.municipio);
        const bMun = normalizeStr(b.municipio);
        const aExact = aMun === term;
        const bExact = bMun === term;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStartMun = aMun.startsWith(term);
        const bStartMun = bMun.startsWith(term);
        if (aStartMun && !bStartMun) return -1;
        if (!aStartMun && bStartMun) return 1;

        const aName = normalizeStr(a.nome);
        const bName = normalizeStr(b.nome);
        const aStartName = aName.startsWith(term);
        const bStartName = bName.startsWith(term);
        if (aStartName && !bStartName) return -1;
        if (!aStartName && bStartName) return 1;

        return aMun.localeCompare(bMun, 'pt-BR') || aName.localeCompare(bName, 'pt-BR');
      });
    } else {
      if (state.sortOrder === 'pop_desc') {
        state.filteredLibraries.sort((a, b) => (b.populacao_2022 || 0) - (a.populacao_2022 || 0));
      } else if (state.sortOrder === 'pop_asc') {
        state.filteredLibraries.sort((a, b) => (a.populacao_2022 || 0) - (b.populacao_2022 || 0));
      } else {
        state.filteredLibraries.sort((a, b) => {
          return (a.municipio || '').localeCompare(b.municipio || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });
      }
    }

    updateCardsList();
    updateMapMarkers();
    updatePopBubbles();
    applyGeoJsonStyles();
    adjustMapViewForFiltered();
  }

  // =========================================================================
  // Ajuste Automático de Câmera/Limites do Mapa ao Filtrar
  // =========================================================================
  function adjustMapViewForFiltered() {
    if (!state.map) return;

    // Se há uma biblioteca específica selecionada, ela já mantém o seu zoom
    if (state.selectedLibraryId) return;

    const hasSearch = !!(state.filters.searchTerm || '').trim();
    const hasRegion = state.filters.region !== 'all';
    const hasType = state.filters.type !== 'all';

    // Se não há filtro ativo ou nenhum resultado
    if (!hasSearch && !hasRegion && !hasType) {
      return;
    }

    if (state.filteredLibraries.length === 0) {
      return;
    }

    // Se encontrou exatamente 1 biblioteca
    if (state.filteredLibraries.length === 1) {
      const lib = state.filteredLibraries[0];
      state.map.setView([lib.lat, lib.lng], 15, { animate: true });
      showZoomIndicator(lib.municipio || 'Município');
      return;
    }

    // Se encontrou várias bibliotecas (ex: todas da cidade digitada ou da região)
    const latLngs = state.filteredLibraries.map(l => [l.lat, l.lng]);
    const bounds = L.latLngBounds(latLngs);
    state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
  }

  // =========================================================================
  // Renderização da Lista de Cards Compactos na Sidebar
  // (Apenas nome e município, com Tooltip Rico no Hover)
  // =========================================================================
  function updateCardsList() {
    const listContainer = document.getElementById('library-cards-list');
    const countEl = document.getElementById('results-count');
    const clearSelBtn = document.getElementById('btn-clear-selection');
    if (!listContainer) return;

    if (countEl) {
      const count = state.filteredLibraries.length;
      if (state.filters.onlyClosed) {
        if (state.filters.closedSubMode === 'maiores_20k') {
          countEl.textContent = `${count} municípios com biblioteca inativa (>20k hab.)`;
        } else if (state.filters.closedSubMode === 'fechada') {
          countEl.textContent = `${count} ${count === 1 ? 'biblioteca inativa (fechada/desativada)' : 'bibliotecas inativas (fechadas/desativadas)'}`;
        } else if (state.filters.closedSubMode === 'sem_dados_registro' || state.filters.closedSubMode === 'sem_dados_4_anos' || state.filters.closedSubMode === 'sem_registro') {
          countEl.textContent = `${count} bibliotecas inativas sem informação atualizada`;
        } else {
          countEl.textContent = `${count} bibliotecas inativas`;
        }
      } else {
        countEl.textContent = `${count} ${count === 1 ? 'biblioteca ativa' : 'bibliotecas ativas'}`;
      }
    }

    if (clearSelBtn) {
      clearSelBtn.style.display = state.selectedLibraryId ? 'inline-block' : 'none';
    }

    if (state.filteredLibraries.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state" style="padding: 2rem 0.5rem; text-align: center; color: #64748b;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
          <h3 style="font-size: 0.95rem; color: #1e293b; margin-bottom: 0.2rem;">Nenhum resultado</h3>
          <p style="font-size: 0.8rem;">Ajuste ou limpe os filtros para visualizar bibliotecas.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Renderiza os cards compactos
    const displayList = state.filteredLibraries.slice(0, 200);

    const isGestaoMode = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao');

    displayList.forEach(item => {
      const card = document.createElement('div');
      const isComunitaria = item.tipo === 'Comunitária';
      const isEstadual = item.tipo === 'Estadual';
      const isSemBiblio = item.situacao === 'sem_biblioteca' || item.tipo === 'Sem Biblioteca';
      const isFechada = item.status !== 'Ativa' || isSemBiblio;
      const sitCad = item.situacao_cadastral || (item.status !== 'Ativa' ? 'sem_registro_historico' : 'com_publica');
      const isSemDadosOuRegistro = sitCad === 'sem_informacao_4_anos' || sitCad === 'sem_registro_historico';

      let typeClass = 'publica';
      if (isComunitaria) typeClass = 'comunitaria';
      else if (isEstadual) typeClass = 'estadual';
      else if (isSemDadosOuRegistro) typeClass = 'warning-triangle';
      else if (isSemBiblio || isFechada) typeClass = 'fechada';

      card.className = `library-card-compact ${typeClass}`;
      if (state.selectedLibraryId === item.id) {
        card.classList.add('selected');
      }
      card.dataset.id = item.id;

      const nmmbBadge = (item.nmmb && item.nmmb.participou)
        ? `<span class="badge-nmmb-compact" title="Participante da Noite Mineira (${item.nmmb.total_edicoes} edições)">🌙 ${item.nmmb.total_edicoes} ed.</span>`
        : '';

      const dacBadge = (item.dac && item.dac.possui_dac)
        ? `<span class="badge-dac-compact" title="Certificação DAC (${item.dac.total_certificacoes} ${item.dac.total_certificacoes === 1 ? 'ano' : 'anos'}): ${item.dac.anos.join(', ')}">🏛️ DAC (${item.dac.total_certificacoes}a)</span>`
        : '';

      const hasSis2026 = (item.acoes_sistema_2026 && item.acoes_sistema_2026.atendido);
      const hasSis2025 = (item.acoes_sistema_2025 && item.acoes_sistema_2025.atendido);
      const hasSis2024 = (item.acoes_sistema_2024 && item.acoes_sistema_2024.atendido);
      const hasSis2023 = (item.acoes_sistema_2023 && item.acoes_sistema_2023.atendido);
      const sisAnos = [];
      if (hasSis2023) sisAnos.push("'23");
      if (hasSis2024) sisAnos.push("'24");
      if (hasSis2025) sisAnos.push("'25");
      if (hasSis2026) sisAnos.push("'26");
      let sistemaBadge = '';
      if (sisAnos.length === 4) {
        sistemaBadge = `<span class="badge-sistema-compact" title="Atendida pelo Sistema Estadual em 2023, 2024, 2025 e 2026 (Série Histórica Quadriênio)">🎓 Sistema '23-'26</span>`;
      } else if (sisAnos.length > 0) {
        sistemaBadge = `<span class="badge-sistema-compact" title="Atendida pelo Sistema Estadual em ${sisAnos.map(a => '20' + a.slice(1)).join(', ')}">🎓 Sistema ${sisAnos.join('/')}</span>`;
      }

      const seilBadge = (item.seil && item.seil.participou)
        ? `<span class="badge-seil-compact" title="Participante da Semana da Literatura - SEIL (${item.seil.total_edicoes} ${item.seil.total_edicoes === 1 ? 'edição' : 'edições'}, ${item.seil.total_atividades} atividades)">📖 SEIL (${item.seil.total_edicoes}a)</span>`
        : '';

      const fotoBadge = item.foto_fachada
        ? `<span class="badge-foto-compact" title="Possui registro fotográfico oficial da fachada">📷 Foto</span>`
        : '';

      const poloBadge = (item.rede_integra_geraes_polo && isGestaoMode)
        ? `<span class="badge-polo-compact" title="Biblioteca-Polo Regional da Rede Integra Geraes (SEBPC/Secult-MG)">🌐 Polo Regional</span>`
        : '';

      const pnldBadge = item.quantidade_livros
        ? `<span class="badge-pnld-compact" title="Contemplada pelo Programa PNLD+ com ${escapeHtml(item.quantidade_livros)} exemplares recebidos">📚 ${escapeHtml(item.quantidade_livros)} PNLD+</span>`
        : '';

      // Indicadores Demográficos
      const pop = item.populacao_2022 || 0;
      const popBadge = pop > 0 ? `<span class="badge-pop-compact" title="População Censo IBGE 2022: ${pop.toLocaleString('pt-BR')} hab.">👥 ${item.populacao_formatada || pop.toLocaleString('pt-BR')}</span>` : '';

      let popAlertBadge = '';
      if (isSemBiblio || isFechada) {
        if (pop >= 50000) {
          popAlertBadge = `<span class="badge-pop-alert tier-50k" title="Grande Vazio Demográfico: Município com mais de 50.000 habitantes sem biblioteca pública ativa">⚠️ Grande Vazio (&gt;50k)</span>`;
        } else if (pop >= 20000) {
          popAlertBadge = `<span class="badge-pop-alert tier-20k" title="Vazio Demográfico Regional: Município com mais de 20.000 habitantes sem biblioteca pública ativa">⚡ Vazio (&gt;20k)</span>`;
        }
      }

      let tipoIcon = '📘 ';
      if (item.tipo === 'Comunitária') tipoIcon = '👥 ';
      else if (item.tipo === 'Estadual') tipoIcon = '🏛️ ';
      else if (isFechada) tipoIcon = '📕 ';
      else if (isSemBiblio || isSemDadosOuRegistro) tipoIcon = '⚠️ ';

      // Ordem dos títulos: no mapa público (!isGestaoMode), Município vem na 1ª linha e Biblioteca na 2ª linha
      const primaryTitle = !isGestaoMode
        ? `📍 ${escapeHtml(item.municipio)}`
        : escapeHtml(formatDisplayName(item.nome));

      const secondaryTitle = !isGestaoMode
        ? escapeHtml(formatDisplayName(item.nome))
        : `📍 ${escapeHtml(item.municipio)}`;

      card.innerHTML = `
        <div class="card-title-row" style="display: flex; align-items: center; justify-content: space-between; gap: 0.35rem;">
          <div class="card-mun-title" style="font-size: 0.83rem; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📍 ${escapeHtml(item.municipio)}
          </div>
          <button type="button" class="btn-card-ficha" title="Abrir ficha completa da biblioteca" data-id="${escapeHtml(item.id)}" style="flex-shrink: 0; padding: 1px 6px; font-size: 0.69rem;">
            📄 Ficha Completa
          </button>
        </div>
        <div class="card-name-title" style="font-size: 0.77rem; color: #334155; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;" title="${escapeHtml(item.nome)}">
          ${escapeHtml(formatDisplayName(item.nome))}
        </div>
        <div class="card-bibliobr-row" style="font-size: 0.71rem; color: #475569; display: flex; align-items: center; gap: 0.25rem; margin-top: 2px;">
          <span style="font-weight: 600; color: #334155;">🏛️ BiblioBR:</span>
          <span style="color: ${item.status_bibliobr === 'Aprovado' ? '#047857' : (item.status_bibliobr === 'Indeferido' ? '#b91c1c' : (item.status_bibliobr === 'Em Diligência' ? '#b45309' : '#64748b'))}; font-weight: 600;">
            ${escapeHtml(formatBibliobrDisplay(item.status_bibliobr))}
          </span>
          ${item.id_bibliobr ? `<span style="color: #64748b; font-family: monospace; font-size: 0.68rem;">(${escapeHtml(item.id_bibliobr)})</span>` : ''}
        </div>
      `;

      // Evento de Clique no botão "Ficha Completa" do Card
      const btnFicha = card.querySelector('.btn-card-ficha');
      if (btnFicha) {
        btnFicha.addEventListener('click', (e) => {
          e.stopPropagation();
          showDetailsModal(item);
        });
      }

      // Duplo clique no card também abre a ficha completa
      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        showDetailsModal(item);
      });

      // Evento de Clique: Seleciona e centraliza no mapa
      card.addEventListener('click', () => {
        if (state.selectedLibraryId === item.id) {
          deselectCurrentLibrary();
        } else {
          selectAndCenterLibrary(item);
        }
      });

      // Eventos de Hover desativados (tooltip na lista lateral removido)
      // card.addEventListener('mouseenter', (e) => showCardRichTooltip(item, e));
      // card.addEventListener('mousemove', (e) => positionCardRichTooltip(e));
      // card.addEventListener('mouseleave', () => hideCardRichTooltip());

      fragment.appendChild(card);
    });

    if (state.filteredLibraries.length > 200) {
      const notice = document.createElement('div');
      notice.className = 'results-summary-bar';
      notice.style.textAlign = 'center';
      notice.style.justifyContent = 'center';
      notice.textContent = `Exibindo 200 de ${state.filteredLibraries.length} bibliotecas. Digite um nome para filtrar.`;
      fragment.appendChild(notice);
    }

    listContainer.appendChild(fragment);
  }

  // =========================================================================
  // Tooltip Rico Flutuante para Hover nos Cards
  // =========================================================================
  function showCardRichTooltip(item, event) {
    const tooltipEl = document.getElementById('card-rich-tooltip');
    if (!tooltipEl) return;

    const isGestao = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao');
    const isExact = item.precisao_localizacao === 'endereco_exato';

    tooltipEl.innerHTML = `
      <div class="tooltip-header">
        ${escapeHtml(item.nome)}
      </div>
      <div class="tooltip-row">
        <strong>Município:</strong> ${escapeHtml(item.municipio)} ${item.regiao_intermediaria ? `(${escapeHtml(item.regiao_intermediaria)})` : ''}
      </div>
      ${item.populacao_2022 ? `
        <div class="tooltip-row" style="color: #1e293b;">
          <strong>População (IBGE 2022):</strong> 👥 ${escapeHtml(item.populacao_formatada || item.populacao_2022.toLocaleString('pt-BR'))} hab.
        </div>
      ` : ''}
      ${((item.situacao === 'sem_biblioteca' || item.status !== 'Ativa') && (item.populacao_2022 || 0) >= 20000) ? `
        <div class="tooltip-row" style="color: ${(item.populacao_2022 >= 50000) ? '#991b1b' : '#9a3412'}; background: ${(item.populacao_2022 >= 50000) ? '#fef2f2' : '#fff7ed'}; border: 1px solid ${(item.populacao_2022 >= 50000) ? '#fca5a5' : '#fed7aa'}; padding: 0.25rem 0.45rem; border-radius: 4px; font-weight: 700; margin: 0.2rem 0;">
          ${(item.populacao_2022 >= 50000) ? '⚠️ Grande Vazio Demográfico (&gt;50k hab.)' : '⚡ Vazio Demográfico Regional (20k–50k)'}
        </div>
      ` : ''}
      ${item.endereco ? `
        <div class="tooltip-row">
          <strong>Endereço:</strong> ${escapeHtml(item.endereco)}${item.bairro ? `, ${escapeHtml(item.bairro)}` : ''}
        </div>
      ` : ''}
      ${item.cep ? `<div class="tooltip-row"><strong>CEP:</strong> ${escapeHtml(item.cep)}</div>` : ''}
      ${(() => {
        const tel = formatFixedPhoneOnly(item.telefone);
        return tel ? `<div class="tooltip-row"><strong>Tel:</strong> ${escapeHtml(tel)}</div>` : '';
      })()}
      ${item.email ? `<div class="tooltip-row"><strong>E-mail:</strong> ${escapeHtml(item.email)}</div>` : ''}
      ${item.quantidade_livros ? `<div class="tooltip-row"><strong>Acervo PNLD+:</strong> ${escapeHtml(item.quantidade_livros)} exemplares</div>` : ''}
      ${isGestao && item.status === 'Ativa' ? (
        item.processo_sei ? `
          <div class="tooltip-row" style="background: #f8fafc; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #e2e8f0; margin: 0.25rem 0; font-family: monospace; font-size: 0.76rem;">
            <strong style="font-family: sans-serif;">📂 Processo SEI:</strong> ${escapeHtml(item.processo_sei)}
          </div>
        ` : `
          <div class="tooltip-row" style="color: #b91c1c; background: #fef2f2; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #fecaca; margin: 0.25rem 0; font-size: 0.76rem;">
            <strong>⚠️ Processo SEI:</strong> Não informado
          </div>
        `
      ) : ''}
      ${item.ciclo_pnld ? `
        <div class="tooltip-row" style="background: #fdf2f8; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #fbcfe8; margin: 0.25rem 0; font-size: 0.78rem;">
          <strong>📚 Ciclo PNLD+:</strong> ${escapeHtml(item.ciclo_pnld)}
        </div>
      ` : ''}
      ${isGestao && item.status === 'Ativa' && (item.status_bibliobr || item.id_bibliobr) ? `
        <div class="tooltip-row" style="background: #f0fdfa; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #ccfbf1; margin: 0.25rem 0; font-size: 0.78rem;">
          <strong>🏛️ GOV.BR BiblioBR:</strong> ${escapeHtml(formatBibliobrDisplay(item.status_bibliobr))}${item.id_bibliobr ? ` (ID: ${escapeHtml(item.id_bibliobr)})` : ''}
        </div>
      ` : ''}
      ${isGestao && item.acoes_sistema_2026 && item.acoes_sistema_2026.atendido ? `
        <div class="tooltip-row" style="color: #065f46; background: #ecfdf5; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #a7f3d0; margin: 0.25rem 0;">
          <strong>🎓 Ações do Sistema (2026):</strong> ${[
            item.acoes_sistema_2026.participantes_capacitados > 0 ? `${item.acoes_sistema_2026.participantes_capacitados} ${item.acoes_sistema_2026.participantes_capacitados === 1 ? 'capacitação' : 'capacitações'}` : '',
            item.acoes_sistema_2026.livros_doados_dlllb > 0 ? `${item.acoes_sistema_2026.livros_doados_dlllb} livros` : '',
            item.acoes_sistema_2026.exposicoes_itinerantes > 0 ? `${item.acoes_sistema_2026.exposicoes_itinerantes} ${item.acoes_sistema_2026.exposicoes_itinerantes === 1 ? 'exposição' : 'exposições'}` : '',
            item.acoes_sistema_2026.total_assessorias > 0 ? `${item.acoes_sistema_2026.total_assessorias} ${item.acoes_sistema_2026.total_assessorias === 1 ? 'assessoria' : 'assessorias'}` : ''
          ].filter(Boolean).join(' | ') || 'Atendida pelo Sistema'}
        </div>
      ` : ''}
      ${isGestao && item.acoes_sistema_2025 && item.acoes_sistema_2025.atendido ? `
        <div class="tooltip-row" style="color: #047857; background: #f0fdf4; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #bbf7d0; margin: 0.25rem 0;">
          <strong>🎓 Ações do Sistema (2025):</strong> ${[
            item.acoes_sistema_2025.participantes_capacitados > 0 ? `${item.acoes_sistema_2025.participantes_capacitados} ${item.acoes_sistema_2025.participantes_capacitados === 1 ? 'capacitação' : 'capacitações'}` : '',
            item.acoes_sistema_2025.livros_doados_dlllb > 0 ? `${item.acoes_sistema_2025.livros_doados_dlllb} livros` : '',
            item.acoes_sistema_2025.exposicoes_itinerantes > 0 ? `${item.acoes_sistema_2025.exposicoes_itinerantes} ${item.acoes_sistema_2025.exposicoes_itinerantes === 1 ? 'exposição' : 'exposições'}` : '',
            item.acoes_sistema_2025.total_assessorias > 0 ? `${item.acoes_sistema_2025.total_assessorias} ${item.acoes_sistema_2025.total_assessorias === 1 ? 'assessoria' : 'assessorias'}` : '',
            ((item.acoes_sistema_2025.visitas_campo || 0) + (item.acoes_sistema_2025.visitas_sede || 0)) > 0 ? `${(item.acoes_sistema_2025.visitas_campo || 0) + (item.acoes_sistema_2025.visitas_sede || 0)} ${((item.acoes_sistema_2025.visitas_campo || 0) + (item.acoes_sistema_2025.visitas_sede || 0)) === 1 ? 'visita técnica' : 'visitas técnicas'}` : ''
          ].filter(Boolean).join(' | ') || 'Atendida pelo Sistema'}
        </div>
      ` : ''}
      ${isGestao && item.acoes_sistema_2024 && item.acoes_sistema_2024.atendido ? `
        <div class="tooltip-row" style="color: #047857; background: #f0fdf4; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #bbf7d0; margin: 0.25rem 0;">
          <strong>🎓 Ações do Sistema (2024):</strong> ${[
            item.acoes_sistema_2024.participantes_capacitados > 0 ? `${item.acoes_sistema_2024.participantes_capacitados} ${item.acoes_sistema_2024.participantes_capacitados === 1 ? 'capacitação' : 'capacitações'}` : '',
            item.acoes_sistema_2024.livros_doados_dlllb > 0 ? `${item.acoes_sistema_2024.livros_doados_dlllb} livros` : '',
            item.acoes_sistema_2024.exposicoes_itinerantes > 0 ? `${item.acoes_sistema_2024.exposicoes_itinerantes} ${item.acoes_sistema_2024.exposicoes_itinerantes === 1 ? 'exposição' : 'exposições'}` : '',
            item.acoes_sistema_2024.total_assessorias > 0 ? `${item.acoes_sistema_2024.total_assessorias} ${item.acoes_sistema_2024.total_assessorias === 1 ? 'assessoria' : 'assessorias'}` : '',
            ((item.acoes_sistema_2024.visitas_campo || 0) + (item.acoes_sistema_2024.visitas_sede || 0)) > 0 ? `${(item.acoes_sistema_2024.visitas_campo || 0) + (item.acoes_sistema_2024.visitas_sede || 0)} ${((item.acoes_sistema_2024.visitas_campo || 0) + (item.acoes_sistema_2024.visitas_sede || 0)) === 1 ? 'visita técnica' : 'visitas técnicas'}` : ''
          ].filter(Boolean).join(' | ') || 'Atendida pelo Sistema'}
        </div>
      ` : ''}
      ${isGestao && item.acoes_sistema_2023 && item.acoes_sistema_2023.atendido ? `
        <div class="tooltip-row" style="color: #047857; background: #f0fdf4; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #bbf7d0; margin: 0.25rem 0;">
          <strong>🎓 Ações do Sistema (2023):</strong> ${[
            item.acoes_sistema_2023.participantes_capacitados > 0 ? `${item.acoes_sistema_2023.participantes_capacitados} ${item.acoes_sistema_2023.participantes_capacitados === 1 ? 'capacitação' : 'capacitações'}` : '',
            item.acoes_sistema_2023.livros_doados_dlllb > 0 ? `${item.acoes_sistema_2023.livros_doados_dlllb} livros` : '',
            item.acoes_sistema_2023.exposicoes_itinerantes > 0 ? `${item.acoes_sistema_2023.exposicoes_itinerantes} ${item.acoes_sistema_2023.exposicoes_itinerantes === 1 ? 'exposição' : 'exposições'}` : '',
            item.acoes_sistema_2023.total_assessorias > 0 ? `${item.acoes_sistema_2023.total_assessorias} ${item.acoes_sistema_2023.total_assessorias === 1 ? 'assessoria' : 'assessorias'}` : '',
            ((item.acoes_sistema_2023.visitas_campo || 0) + (item.acoes_sistema_2023.visitas_sede || 0)) > 0 ? `${(item.acoes_sistema_2023.visitas_campo || 0) + (item.acoes_sistema_2023.visitas_sede || 0)} ${((item.acoes_sistema_2023.visitas_campo || 0) + (item.acoes_sistema_2023.visitas_sede || 0)) === 1 ? 'visita técnica' : 'visitas técnicas'}` : ''
          ].filter(Boolean).join(' | ') || 'Atendida pelo Sistema'}
        </div>
      ` : ''}
      ${item.seil && item.seil.participou ? `
        <div class="tooltip-row" style="color: #6b21a8; background: #faf5ff; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #e9d5ff; margin: 0.25rem 0;">
          <strong>📖 SEIL:</strong> ${item.seil.total_edicoes} ${item.seil.total_edicoes === 1 ? 'edição' : 'edições'} (${item.seil.total_atividades} atividades)
        </div>
      ` : ''}
      ${item.dac && item.dac.possui_dac ? `
        <div class="tooltip-row" style="color: #9a3412; background: #fff7ed; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #fed7aa; margin: 0.25rem 0;">
          <strong>🏛️ Certificação DAC:</strong> ${item.dac.total_certificacoes} ${item.dac.total_certificacoes === 1 ? 'ano' : 'anos'} (${escapeHtml((item.dac.anos || []).join(', '))})
        </div>
      ` : ''}
      ${item.nmmb && item.nmmb.participou ? `
        <div class="tooltip-row" style="color: #854d0e; background: #fefce8; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #fef08a; margin: 0.25rem 0;">
          <strong>🌙 Noite Mineira:</strong> ${item.nmmb.total_edicoes} ${item.nmmb.total_edicoes === 1 ? 'edição' : 'edições'}${item.nmmb.total_atividades ? ` (${item.nmmb.total_atividades} ativ.)` : ''}
        </div>
      ` : ''}
      ${(item.rede_integra_geraes_polo && isGestao) ? `
        <div class="tooltip-row" style="color: #065f46; background: #ecfdf5; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #a7f3d0; margin: 0.25rem 0;">
          <strong>🌐 Polo Regional:</strong> Rede Integra Geraes (SEBPC/Secult-MG)
        </div>
      ` : ''}
      <div class="tooltip-badge-row">
        <span class="badge-tipo-compact ${item.tipo === 'Comunitária' ? 'comunitaria' : (item.tipo === 'Estadual' ? 'estadual' : (item.status !== 'Ativa' ? 'fechada' : 'publica'))}">
          ${item.status === 'Ativa' ? (item.tipo === 'Comunitária' ? '👥 ' : (item.tipo === 'Estadual' ? '🏛️ ' : '📘 ')) : '📕 '}${item.status === 'Ativa' ? escapeHtml(item.tipo) : 'Biblioteca Inativa'}
        </span>
        <span class="meta-pill ${isExact ? 'precision-exact' : ''}" style="font-size: 0.68rem;">
          ${isExact ? '📍 Endereço Exato' : '🏛️ Sede Municipal'}
        </span>
      </div>
      <div style="margin-top: 0.45rem; padding-top: 0.35rem; border-top: 1px dashed #cbd5e1; font-size: 0.72rem; color: #2563eb; font-weight: 600; text-align: center;">
        💡 Clique no botão "📄 Ficha Completa" para abrir a ficha oficial
      </div>
    `;

    tooltipEl.style.display = 'block';
    positionCardRichTooltip(event);
  }

  function positionCardRichTooltip(event) {
    const tooltipEl = document.getElementById('card-rich-tooltip');
    if (!tooltipEl) return;

    const x = event.clientX + 18;
    let y = event.clientY - 30;

    // Previne corte na parte inferior da tela
    const maxH = window.innerHeight - 220;
    if (y > maxH) {
      y = maxH;
    }
    if (y < 10) y = 10;

    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  function hideCardRichTooltip() {
    const tooltipEl = document.getElementById('card-rich-tooltip');
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
    }
  }

  // =========================================================================
  // Controle do Indicador de Zoom e Centralização Territorial
  // =========================================================================
  function showZoomIndicator(municipio) {
    const el = document.getElementById('map-zoom-indicator');
    const txt = document.getElementById('zoom-indicator-text');
    if (el) {
      if (txt && municipio) {
        txt.textContent = `Aproximado em: ${municipio}`;
      }
      el.style.display = 'flex';
    }
  }

  function hideZoomIndicator() {
    const el = document.getElementById('map-zoom-indicator');
    if (el) {
      el.style.display = 'none';
    }
  }

  function recenterToStateView() {
    deselectCurrentLibrary();
    hideZoomIndicator();
    if (state.map) {
      state.map.setView(MG_CENTER, MG_DEFAULT_ZOOM, { animate: true });
    }
  }

  // =========================================================================
  // Seleção e Desseleção de Biblioteca
  // =========================================================================
  function selectAndCenterLibrary(lib, openPopup = true) {
    state.selectedLibraryId = lib.id;

    // Atualizar classe selected nos cards
    document.querySelectorAll('.library-card-compact').forEach(c => {
      c.classList.toggle('selected', c.dataset.id === lib.id);
    });

    const clearSelBtn = document.getElementById('btn-clear-selection');
    if (clearSelBtn) clearSelBtn.style.display = 'inline-block';

    // Destaque visual no pino/bolinha
    state.markers.forEach(m => {
      const el = m.getElement ? m.getElement() : (m.element || null);
      if (el) {
        const isTarget = m.libraryData && m.libraryData.id === lib.id;
        el.classList.toggle('selected', isTarget);
      }
    });

    if (state.map) {
      state.map.setView([lib.lat, lib.lng], Math.max(state.map.getZoom(), 16), { animate: true });
      applyGeoJsonStyles();
      updateStateBackgroundStyle();
      showZoomIndicator(lib.municipio || 'Município');

      if (openPopup) {
        const targetMarker = state.markers.find(m => m.libraryData && m.libraryData.id === lib.id);
        if (targetMarker) {
          if (state.markerClusterGroup && state.markerClusterGroup.hasLayer(targetMarker)) {
            state.markerClusterGroup.zoomToShowLayer(targetMarker, () => {
              targetMarker.openPopup();
            });
          } else {
            targetMarker.openPopup();
          }
        } else {
          openLibraryInfoWindow(lib, { lat: lib.lat, lng: lib.lng });
        }
      }
    }
  }

  function deselectCurrentLibrary() {
    state.selectedLibraryId = null;

    document.querySelectorAll('.library-card-compact').forEach(c => c.classList.remove('selected'));
    
    state.markers.forEach(m => {
      const el = m.getElement ? m.getElement() : (m.element || null);
      if (el) el.classList.remove('selected');
    });

    const clearSelBtn = document.getElementById('btn-clear-selection');
    if (clearSelBtn) clearSelBtn.style.display = 'none';

    if (state.map) {
      state.map.closePopup();
    }
    state.currentPopup = null;

    hideZoomIndicator();
    applyGeoJsonStyles();
    updateStateBackgroundStyle();
  }

  // =========================================================================
  // Provedores de Mapa Base (Sem custo / Sem bloqueio 403 / 100% Compatível)
  // =========================================================================
  const BASE_MAP_PROVIDERS = {
    osm: {
      url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
      options: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19
      }
    },
    hot: {
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      options: {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://www.hotosm.org/" target="_blank" rel="noopener">Humanitarian OpenStreetMap Team</a>',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19
      }
    },
    esri: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: {
        attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors',
        maxZoom: 19
      }
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        attribution: 'Tiles &copy; Esri, Earthstar Geographics, Maxar',
        maxZoom: 19
      }
    },
    topo: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      options: {
        attribution: 'Tiles &copy; Esri &mdash; USGS, NOAA',
        maxZoom: 19
      }
    },
    // Compatibilidade reversa: redireciona os antigos nomes CARTO para provedores 100% livres de marcas d'água
    voyager: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      options: {
        attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors',
        maxZoom: 19
      }
    },
    positron: {
      url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
      options: {
        attribution: '&copy; OpenStreetMap contributors',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19
      }
    }
  };

  function setBaseMap(providerKey) {
    const provider = BASE_MAP_PROVIDERS[providerKey] || BASE_MAP_PROVIDERS.esri;
    state.currentBaseMap = providerKey;
    if (state.baseTileLayer && state.map) {
      state.map.removeLayer(state.baseTileLayer);
    }
    state.baseTileLayer = L.tileLayer(provider.url, provider.options).addTo(state.map);
    if (state.baseTileLayer.bringToBack) {
      state.baseTileLayer.bringToBack();
    }
  }

  // =========================================================================
  // Leaflet Integration & Layer Management (100% Local / Zero Custo / Sem CDN)
  // =========================================================================
  function initLeafletMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement || typeof L === 'undefined') return;

    try {
      // 1. Inicializa o mapa com Leaflet (coordenadas de MG, zoom 7)
      state.map = L.map('map', {
        center: MG_CENTER,
        zoom: MG_DEFAULT_ZOOM,
        minZoom: 5,
        maxZoom: 19,
        zoomControl: false,
        attributionControl: true
      });

      // 2. Controle de zoom posicionado no canto inferior direito
      L.control.zoom({ position: 'bottomright' }).addTo(state.map);

      // 3. Camada Base Configurável (Padrão: Esri Vias e Logradouros)
      setBaseMap('esri');

      // 4. Fechou popup ou clicou no fundo do mapa -> Desseleciona biblioteca ativa
      state.map.on('click', () => {
        deselectCurrentLibrary();
      });

      // 5. Mudança de zoom: atualiza opacidade territorial (zoom de rua >= 13 fica transparente para revelar vias)
      state.map.on('zoomend', () => {
        applyGeoJsonStyles();
        updateStateBackgroundStyle();
      });

      // 6. Inicializar Clusterer com badges elegantes
      initMarkerClusterer();

      // 7. Layer group para bolhas de população (>20k hab.)
      state.popBubbleLayer = L.layerGroup().addTo(state.map);

      // 8. Carregar camadas territoriais GeoJSON (fora de MG, fundo MG, 853 municípios e contorno)
      initGeoJsonLayers();

      // 9. Renderizar marcadores de bibliotecas
      updateMapMarkers();

      // 10. Renderizar bolhas de população se camada ativa
      updatePopBubbles();

      console.log('Leaflet inicializado com sucesso.');
    } catch (err) {
      console.error('Erro ao inicializar mapa Leaflet:', err);
    }
  }

  // =========================================================================
  // Clusterer Configurado para Agrupamento Regional em Zoom Out
  // =========================================================================
  function initMarkerClusterer() {
    if (typeof L === 'undefined' || !L.markerClusterGroup || !state.map) return;

    state.markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 10,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        let size = 28;
        if (count > 50) size = 36;
        else if (count > 20) size = 32;

        return L.divIcon({
          html: `<div class="map-cluster-badge" style="width:${size}px;height:${size}px;line-height:${size}px;" title="${count} bibliotecas nesta região">${count}</div>`,
          className: 'leaflet-custom-cluster',
          iconSize: L.point(size, size)
        });
      }
    });

    state.map.addLayer(state.markerClusterGroup);
  }

  // =========================================================================
  // Estilização Dinâmica do Fundo do Estado de Minas Gerais
  // =========================================================================
  function updateStateBackgroundStyle() {
    if (!state.map) return;
    const currentZoom = state.map.getZoom() || MG_DEFAULT_ZOOM;
    const isStreetZoom = currentZoom >= 13 || !!state.selectedLibraryId;

    if (state.stateBackgroundLayer) {
      state.stateBackgroundLayer.setStyle({
        fillColor: '#ffffff',
        fillOpacity: isStreetZoom ? 0.0 : 0.40,
        stroke: false
      });
    }

    if (state.outsideMgPolygon) {
      state.outsideMgPolygon.setStyle({
        fillColor: '#dcfce7',
        fillOpacity: isStreetZoom ? 0.0 : 0.30
      });
    }
  }

  // =========================================================================
  // Camadas GeoJSON: Municípios, Regiões e Contorno do Estado
  // =========================================================================
  function initGeoJsonLayers() {
    if (!state.map || typeof L === 'undefined') return;

    // 0A. Camada da Área Externa a Minas Gerais (Verde clarinho suave com 30% de opacidade)
    if (state.estadoGeoJsonData && state.estadoGeoJsonData.features && state.estadoGeoJsonData.features[0]) {
      const mgCoords = state.estadoGeoJsonData.features[0].geometry.coordinates[0];
      const outerBox = [
        [15.0, -95.0],
        [15.0, -20.0],
        [-45.0, -20.0],
        [-45.0, -95.0]
      ];
      const innerHole = mgCoords.map(pt => [pt[1], pt[0]]);

      state.outsideMgPolygon = L.polygon([outerBox, innerHole], {
        fillColor: '#dcfce7',
        fillOpacity: 0.30,
        stroke: false,
        interactive: false
      }).addTo(state.map);
    }

    // 0B. Camada de Fundo de Minas Gerais em Branco com 40% de Opacidade
    if (state.estadoGeoJsonData) {
      state.stateBackgroundLayer = L.geoJSON(state.estadoGeoJsonData, {
        style: {
          fillColor: '#ffffff',
          fillOpacity: 0.40,
          stroke: false,
          interactive: false
        }
      }).addTo(state.map);
    }

    // 1. Camada dos 853 Municípios e Regiões Intermediárias
    if (state.geoJsonData) {
      state.municipalityLayer = L.geoJSON(state.geoJsonData, {
        style: (feature) => getFeatureStyle(feature),
        onEachFeature: (feature, layer) => {
          layer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              const munName = feature.properties ? feature.properties.name : null;
              if (munName) {
                const searchInput = document.getElementById('search-input');
                const btnClearSearch = document.getElementById('btn-clear-search');
                if (searchInput) {
                  searchInput.value = munName;
                  state.filters.searchTerm = munName;
                  state.filters.municipality = 'all';
                  if (btnClearSearch) btnClearSearch.classList.add('visible');
                  applyFilters();
                }
              }
            },
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({
                weight: 2.0,
                color: '#1e293b',
                opacity: 0.95
              });
              if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                l.bringToFront();
              }
            },
            mouseout: (e) => {
              if (state.municipalityLayer) {
                state.municipalityLayer.resetStyle(e.target);
              }
            }
          });
        }
      }).addTo(state.map);
    }

    // 2. Camada de Contorno Permanente do Estado de Minas Gerais (Alto Contraste)
    if (state.estadoGeoJsonData) {
      state.stateBorderLayer = L.geoJSON(state.estadoGeoJsonData, {
        style: {
          color: '#0f172a',
          weight: 2.5,
          opacity: 1.0,
          fill: false,
          interactive: false
        }
      }).addTo(state.map);
    }
  }

  function getFeatureStyle(feature) {
    const currentZoom = state.map ? (state.map.getZoom() || MG_DEFAULT_ZOOM) : MG_DEFAULT_ZOOM;
    const isStreetZoom = currentZoom >= 13 || !!state.selectedLibraryId;

    const hasLibraries = feature.properties.tem_biblioteca;
    const hasPublica = feature.properties.tem_biblioteca_publica;
    const situacao = feature.properties.situacao_cadastral || (hasPublica ? 'com_publica' : 'sem_registro_historico');
    const regName = feature.properties.regiao_intermediaria;
    const regColor = HIGH_CONTRAST_REGIOES_CORES[regName] || '#4338ca';

    let visible = state.layers.municipalLimits || state.layers.regionalDivision || state.layers.coverageChoropleth || state.filters.onlyClosed;
    if (!visible) {
      return { stroke: false, fill: false, opacity: 0, fillOpacity: 0 };
    }

    if (isStreetZoom) {
      return {
        fillColor: '#ffffff',
        fillOpacity: 0.0,
        color: '#94a3b8',
        weight: 1.0,
        opacity: state.layers.municipalLimits ? 0.35 : 0.08
      };
    }

    let fillColor = '#ffffff';
    let fillOpacity = 0.40;
    let strokeColor = '#94a3b8';
    let strokeWeight = 0.8;
    let strokeOpacity = 0.75;

    if (state.layers.coverageChoropleth || state.filters.onlyClosed) {
      const pop = feature.properties.populacao_2022 || 0;
      const isHighlight20k = state.filters.onlyClosed && state.filters.closedSubMode === 'maiores_20k';
      const isHighlightFechada = state.filters.onlyClosed && state.filters.closedSubMode === 'fechada';
      const isHighlightSemDadosReg = state.filters.onlyClosed && (state.filters.closedSubMode === 'sem_dados_registro' || state.filters.closedSubMode === 'sem_dados_4_anos' || state.filters.closedSubMode === 'sem_registro');

      if (hasPublica || situacao === 'com_publica') {
        fillColor = state.filters.onlyClosed ? '#f8fafc' : '#bbf7d0';
        strokeColor = state.filters.onlyClosed ? '#cbd5e1' : '#15803d';
        fillOpacity = state.filters.onlyClosed ? 0.08 : 0.40;
        strokeWeight = 0.7;
        strokeOpacity = state.filters.onlyClosed ? 0.35 : 0.75;
      } else {
        let baseFill = '#fef08a';
        let baseStroke = '#ca8a04';

        if (situacao === 'fechada_reforma' || situacao === 'declarado_sem_biblioteca') {
          baseFill = '#fecaca';
          baseStroke = '#dc2626';
        } else if (situacao === 'sem_informacao_4_anos' || situacao === 'sem_registro_historico') {
          baseFill = '#fef08a';
          baseStroke = '#ca8a04';
        } else if (situacao === 'apenas_comunitaria') {
          baseFill = '#ddd6fe';
          baseStroke = '#7c3aed';
        }

        fillColor = baseFill;

        if (isHighlightSemDadosReg) {
          if (situacao === 'sem_informacao_4_anos' || situacao === 'sem_registro_historico') {
            fillColor = '#fef08a';
            fillOpacity = pop >= 20000 ? 0.75 : 0.48;
            strokeWeight = pop >= 20000 ? 2.0 : 1.2;
            strokeColor = '#b45309';
            strokeOpacity = 1.0;
          } else {
            fillColor = '#f8fafc';
            fillOpacity = 0.05;
            strokeWeight = 0.5;
            strokeColor = '#e2e8f0';
            strokeOpacity = 0.25;
          }
        } else if (isHighlightFechada) {
          if (situacao === 'fechada_reforma' || situacao === 'declarado_sem_biblioteca') {
            fillColor = '#fecaca';
            fillOpacity = pop >= 20000 ? 0.75 : 0.55;
            strokeWeight = pop >= 20000 ? 2.0 : 1.4;
            strokeColor = '#b91c1c';
            strokeOpacity = 1.0;
          } else {
            fillColor = '#f8fafc';
            fillOpacity = 0.05;
            strokeWeight = 0.5;
            strokeColor = '#e2e8f0';
            strokeOpacity = 0.25;
          }
        } else if (isHighlight20k) {
          if (pop >= 20000) {
            fillOpacity = pop >= 50000 ? 0.82 : 0.65;
            strokeWeight = pop >= 50000 ? 2.5 : 1.8;
            strokeColor = pop >= 50000 ? '#7f1d1d' : '#9a3412';
            strokeOpacity = 1.0;
          } else {
            fillColor = '#f8fafc';
            fillOpacity = 0.05;
            strokeWeight = 0.5;
            strokeColor = '#e2e8f0';
            strokeOpacity = 0.25;
          }
        } else {
          if (pop >= 50000) {
            fillOpacity = 0.72;
            strokeWeight = 2.2;
            strokeColor = (situacao === 'sem_informacao_4_anos' || situacao === 'sem_registro_historico') ? '#b45309' : '#7f1d1d';
            strokeOpacity = 0.95;
          } else if (pop >= 20000) {
            fillOpacity = 0.55;
            strokeWeight = 1.5;
            strokeColor = (situacao === 'sem_informacao_4_anos' || situacao === 'sem_registro_historico') ? '#ca8a04' : '#9a3412';
            strokeOpacity = 0.9;
          } else if (pop >= 10000) {
            fillOpacity = 0.40;
            strokeWeight = 1.0;
            strokeColor = baseStroke;
            strokeOpacity = 0.8;
          } else if (pop >= 5000) {
            fillOpacity = 0.28;
            strokeWeight = 0.75;
            strokeColor = baseStroke;
            strokeOpacity = 0.7;
          } else {
            fillOpacity = 0.18;
            strokeWeight = 0.55;
            strokeColor = baseStroke;
            strokeOpacity = 0.6;
          }
        }
      }
    } else if (state.layers.regionalDivision) {
      fillColor = regColor;
      fillOpacity = 0.40;
      strokeColor = regColor;
      strokeWeight = 1.2;
      strokeOpacity = 0.85;
    }

    if (!state.layers.municipalLimits) {
      strokeOpacity = 0.15;
    }

    return {
      fillColor: fillColor,
      fillOpacity: fillOpacity,
      color: strokeColor,
      weight: strokeWeight,
      opacity: strokeOpacity
    };
  }

  function applyGeoJsonStyles() {
    if (state.municipalityLayer) {
      state.municipalityLayer.setStyle(feature => getFeatureStyle(feature));
    }
  }

  // =========================================================================
  // Criação dos Marcadores de Bibliotecas
  // =========================================================================
  function updateMapMarkers() {
    if (!state.map || !state.markerClusterGroup) return;

    state.markerClusterGroup.clearLayers();
    state.markers = [];

    if (!state.layers.markers) return;

    const newMarkers = [];

    state.filteredLibraries.forEach(lib => {
      const position = [lib.lat, lib.lng];
      const isComunitaria = lib.tipo === 'Comunitária';
      const isEstadual = lib.tipo === 'Estadual';
      const isSemBiblio = lib.situacao === 'sem_biblioteca' || lib.tipo === 'Sem Biblioteca';
      const sit = lib.situacao_cadastral || (lib.status !== 'Ativa' ? 'sem_registro_historico' : 'com_publica');
      const isSemDadosOuRegistro = sit === 'sem_informacao_4_anos' || sit === 'sem_registro_historico';

      let dot;
      if (isSemDadosOuRegistro) {
        dot = document.createElement('div');
        dot.className = 'map-warning-marker';
        dot.title = `${lib.municipio}: Sem dados atualizados de biblioteca pública (Sistema Estadual)`;
        dot.innerHTML = `
          <svg viewBox="0 0 24 24" width="24" height="24" class="marker-warning-svg">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#facc15" stroke="#854d0e" stroke-width="1.8" stroke-linejoin="round"/>
            <line x1="12" y1="9" x2="12" y2="13" stroke="#713f12" stroke-width="2.3" stroke-linecap="round"/>
            <circle cx="12" cy="17" r="1.15" fill="#713f12"/>
          </svg>
        `;
      } else {
        let typeClass = 'publica';
        if (isComunitaria) typeClass = 'comunitaria';
        else if (isEstadual) typeClass = 'estadual';
        else if (lib.status !== 'Ativa' || isSemBiblio) typeClass = 'fechada';

        dot = document.createElement('div');
        dot.className = `map-dot-marker ${typeClass}`;

        if (lib.tipo === 'Estadual') {
          dot.innerHTML = `
            <svg class="marker-book-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2L2 7h20L12 2z"></path>
            </svg>
          `;
        } else if (lib.status === 'Ativa') {
          dot.innerHTML = `
            <svg class="marker-book-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
          `;
        } else if (isSemBiblio) {
          dot.innerHTML = `
            <svg class="marker-book-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          `;
        } else {
          dot.innerHTML = `
            <svg class="marker-book-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              <line x1="9" y1="7" x2="15" y2="7"></line>
              <line x1="9" y1="11" x2="13" y2="11"></line>
            </svg>
          `;
        }
      }

      const hasNmmb = lib.nmmb && lib.nmmb.participou;
      if (hasNmmb) {
        dot.classList.add('has-nmmb');
        if (state.filters.nmmbOnly) {
          dot.classList.add('nmmb-highlight');
        }
      }

      const hasDac = lib.dac && lib.dac.possui_dac;
      if (hasDac) {
        dot.classList.add('has-dac');
        if (state.filters.dacOnly) {
          dot.classList.add('dac-highlight');
        }
      }

      const hasSistema2026 = lib.acoes_sistema_2026 && lib.acoes_sistema_2026.atendido;
      const hasSistema2025 = lib.acoes_sistema_2025 && lib.acoes_sistema_2025.atendido;
      const hasSistema2024 = lib.acoes_sistema_2024 && lib.acoes_sistema_2024.atendido;
      const hasSistema2023 = lib.acoes_sistema_2023 && lib.acoes_sistema_2023.atendido;
      const hasSistema = hasSistema2026 || hasSistema2025 || hasSistema2024 || hasSistema2023;
      if (hasSistema) {
        dot.classList.add('has-sistema');
        if ((state.filters.sistemaAcoesOnly && hasSistema2026) || 
            (state.filters.sistemaAcoes2025Only && hasSistema2025) || 
            (state.filters.sistemaAcoes2024Only && hasSistema2024) ||
            (state.filters.sistemaAcoes2023Only && hasSistema2023)) {
          dot.classList.add('sistema-highlight');
        }
      }

      const hasSeil = lib.seil && lib.seil.participou;
      if (hasSeil) {
        dot.classList.add('has-seil');
        if (state.filters.seilOnly) {
          dot.classList.add('seil-highlight');
        }
      }

      const isPolo = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao') && !!lib.rede_integra_geraes_polo;
      if (isPolo) {
        dot.classList.add('has-polo');
        if (state.filters.redeIntegraOnly) {
          dot.classList.add('polo-highlight');
        }
      }

      const hasPnld = !!(lib.quantidade_livros && String(lib.quantidade_livros).trim() !== '' && String(lib.quantidade_livros).trim() !== '0');
      if (hasPnld) {
        dot.classList.add('has-pnld');
        if (state.filters.pnldOnly) {
          dot.classList.add('pnld-highlight');
        }
      }

      const poloSuffix = isPolo ? ' | 🌐 Polo Rede Integra Geraes' : '';
      const pnldSuffix = hasPnld ? ` | 📚 PNLD+ (${lib.quantidade_livros} livros)` : '';
      const hasBibliobr = (lib.id_bibliobr && String(lib.id_bibliobr).trim() !== '') || (lib.status_bibliobr && lib.status_bibliobr.toLowerCase() !== 'não' && lib.status_bibliobr.toLowerCase() !== 'não cadastrado');
      const bibliobrSuffix = hasBibliobr ? ` | 🏛️ BiblioBR (${lib.status_bibliobr || 'Cadastrada'})` : '';
      const nmmbSuffix = hasNmmb ? ` | 🌙 Noite Mineira (${lib.nmmb.total_edicoes} ed.)` : '';
      const dacSuffix = hasDac ? ` | 🏛️ DAC (${lib.dac.total_certificacoes}a)` : '';
      let sistemaSuffix = '';
      const sisYears = [];
      if (hasSistema2023) sisYears.push('2023');
      if (hasSistema2024) sisYears.push('2024');
      if (hasSistema2025) sisYears.push('2025');
      if (hasSistema2026) sisYears.push('2026');
      if (sisYears.length > 0) {
        sistemaSuffix = ` | 🎓 Sistema (${sisYears.join(', ')})`;
      }
      const seilSuffix = hasSeil ? ` | 📖 SEIL (${lib.seil.total_edicoes}a - ${lib.seil.total_atividades} ativ.)` : '';
      const markerTitle = `${lib.nome} (${lib.municipio})${poloSuffix}${pnldSuffix}${bibliobrSuffix}${nmmbSuffix}${dacSuffix}${sistemaSuffix}${seilSuffix}`;
      dot.title = markerTitle;
      if (state.selectedLibraryId === lib.id) {
        dot.classList.add('selected');
      }

      const customIcon = L.divIcon({
        html: dot,
        className: 'leaflet-custom-marker-wrap',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const marker = L.marker(position, {
        icon: customIcon,
        title: markerTitle,
        zIndexOffset: lib.tipo === 'Estadual' ? 1000 : 100
      });

      marker.libraryData = lib;

      marker.bindPopup(() => getLibraryInfoWindowHtml(lib), {
        offset: [0, -14],
        className: 'custom-infowindow-popup',
        maxWidth: 380,
        autoPan: true,
        autoPanPadding: [40, 40]
      });

      marker.on('click', () => {
        selectAndCenterLibrary(lib, false);
      });

      marker.on('popupopen', () => {
        state.selectedLibraryId = lib.id;
        document.querySelectorAll('.library-card-compact').forEach(c => c.classList.toggle('selected', c.dataset.id === lib.id));
        const clearBtn = document.getElementById('btn-clear-selection');
        if (clearBtn) clearBtn.style.display = 'inline-block';
        showZoomIndicator(lib.municipio || 'Município');
      });

      marker.on('popupclose', () => {
        if (state.selectedLibraryId === lib.id) {
          deselectCurrentLibrary();
        }
      });

      marker.on('dblclick', (e) => {
        if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        showDetailsModal(lib);
      });

      newMarkers.push(marker);
    });

    state.markers = newMarkers;
    state.markerClusterGroup.addLayers(state.markers);
  }

  // =========================================================================
  // Bolhas de População (>20.000 hab. em municípios sem biblioteca pública)
  // =========================================================================
  function updatePopBubbles() {
    if (!state.map || !state.popBubbleLayer) return;

    state.popBubbleLayer.clearLayers();
    state.popBubbleMarkers = [];

    if (!state.layers.popBubbles) return;
    if (!state.geoJsonData || !state.geoJsonData.features) return;

    const candidates = [];
    let allowedMunCodes = null;
    let allowedMunNames = null;

    if (state.filters.onlyClosed) {
      allowedMunCodes = new Set(state.filteredLibraries.map(l => String(l.codigo_ibge || '')));
      allowedMunNames = new Set(state.filteredLibraries.map(l => l.municipio));
    }

    state.geoJsonData.features.forEach(f => {
      const p = f.properties;
      const code = String(p.id || '');
      const name = p.name;

      if (allowedMunCodes && !allowedMunCodes.has(code) && !allowedMunNames.has(name)) {
        return;
      }

      if (state.filters.region !== 'all' && p.regiao_intermediaria !== state.filters.region) {
        return;
      }

      if (state.filters.searchTerm) {
        const term = state.filters.searchTerm.toLowerCase();
        if (!name.toLowerCase().includes(term) && !code.includes(term)) {
          return;
        }
      }

      if (!p.tem_biblioteca_publica && (p.populacao_2022 || 0) >= 20000) {
        const center = getFeatureCenter(f);
        candidates.push({
          nome: p.name,
          codigo_ibge: p.id,
          regiao_intermediaria: p.regiao_intermediaria,
          status_cultural: p.status_cultural || 'Sem informação atualizada',
          situacao_cadastral: p.situacao_cadastral,
          populacao: p.populacao_2022,
          populacao_fmt: p.populacao_formatada || p.populacao_2022.toLocaleString('pt-BR'),
          lat: center.lat,
          lng: center.lng
        });
      }
    });

    candidates.forEach(mun => {
      const is50k = mun.populacao >= 50000;
      const popK = (mun.populacao / 1000).toFixed(0) + 'k';

      const bubbleEl = document.createElement('div');
      bubbleEl.className = `pop-bubble-marker ${is50k ? 'tier-50k' : 'tier-20k'}`;
      if (is50k) {
        bubbleEl.innerHTML = `
          <div class="bubble-pulse"></div>
          <div class="bubble-pop-txt">${popK}</div>
        `;
      } else {
        bubbleEl.innerHTML = `<div class="bubble-pop-txt">${popK}</div>`;
      }

      const titleTxt = `${mun.nome}: ${mun.populacao_fmt} hab. (Censo 2022) - Município sem biblioteca pública ativa`;
      bubbleEl.title = titleTxt;

      const bubbleIcon = L.divIcon({
        html: bubbleEl,
        className: 'leaflet-custom-bubble-wrap',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker([mun.lat, mun.lng], {
        icon: bubbleIcon,
        title: titleTxt,
        zIndexOffset: is50k ? 1200 : 950
      });

      const tierLabel = is50k ? '⚠️ Grande Vazio Demográfico (>50 mil hab.)' : '⚡ Vazio Demográfico Regional (20k–50k hab.)';
        const tierColor = is50k ? '#991b1b' : '#9a3412';
        const tierBg = is50k ? '#fef2f2' : '#fff7ed';

        const content = `
          <div class="info-window-card" style="max-width: 320px;">
            <div class="iw-header">
              <span class="iw-type-badge ${is50k ? 'fechada' : 'comunitaria'}" style="background: ${tierBg}; color: ${tierColor}; border: 1px solid ${is50k ? '#f87171' : '#fdba74'}; font-weight: 700;">
                ${tierLabel}
              </span>
              <h3 class="iw-title" style="margin-top: 0.35rem;">${escapeHtml(mun.nome)}</h3>
              <div class="iw-city">📍 Região Intermediária de ${escapeHtml(mun.regiao_intermediaria || 'MG')}</div>
            </div>
            <div style="margin: 0.65rem 0; padding: 0.6rem 0.75rem; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.8rem; line-height: 1.45;">
              <div style="font-size: 0.95rem; font-weight: 700; color: #1e293b; margin-bottom: 0.25rem;">
                👥 ${escapeHtml(mun.populacao_fmt)} habitantes
              </div>
              <div style="color: #64748b; font-size: 0.75rem;">Dados do Censo Demográfico IBGE 2022</div>
              <div style="margin-top: 0.45rem; padding-top: 0.45rem; border-top: 1px dashed #cbd5e1; color: ${tierColor}; font-weight: 600;">
                Situação: ${escapeHtml(mun.status_cultural)}
              </div>
            </div>
            <div class="iw-actions">
              <button type="button" class="btn-iw-details" id="btn-iw-filter-mun" style="width: 100%; text-align: center; justify-content: center;">
                🔍 Filtrar este Município na Lista
              </button>
            </div>
          </div>
        `;

        marker.bindPopup(content, {
          offset: [0, -10],
          className: 'custom-infowindow-popup',
          maxWidth: 340,
          autoPan: true
        });

        marker.on('click', () => {
          state.map.setView([mun.lat, mun.lng], Math.max(state.map.getZoom(), 10), { animate: true });
          showZoomIndicator(mun.nome);
        });

        marker.on('popupopen', () => {
          const btnFilter = document.getElementById('btn-iw-filter-mun');
          if (btnFilter) {
            btnFilter.onclick = () => {
              const munSelect = document.getElementById('select-municipio');
              if (munSelect) {
                munSelect.value = mun.nome;
                state.filters.municipality = mun.nome;
                state.filters.onlyClosed = true;
                const onlyClosedCheck = document.getElementById('check-only-closed');
                if (onlyClosedCheck) onlyClosedCheck.checked = true;
                applyFilters();
              }
            };
          }
        });

        state.popBubbleMarkers.push(marker);
      state.popBubbleLayer.addLayer(marker);
    });
  }

  // =========================================================================
  // InfoWindow Estilizada
  // =========================================================================
  function getLibraryInfoWindowHtml(lib) {
    const isGestao = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao');
    const isComunitaria = lib.tipo === 'Comunitária';
    const isEstadual = lib.tipo === 'Estadual';
    const isFechada = lib.status !== 'Ativa';
    const sitCad = lib.situacao_cadastral || (lib.status !== 'Ativa' ? 'sem_registro_historico' : 'com_publica');
    const isSemDadosOuRegistro = sitCad === 'sem_informacao_4_anos' || sitCad === 'sem_registro_historico';
    let badgeClass = 'publica';
    let tipoIcon = '📘 ';
    if (isComunitaria) {
      badgeClass = 'comunitaria';
      tipoIcon = '👥 ';
    } else if (isEstadual) {
      badgeClass = 'estadual';
      tipoIcon = '🏛️ ';
    } else if (isFechada) {
      badgeClass = 'fechada';
      tipoIcon = '📕 ';
    }

    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lib.nome}, ${lib.endereco || ''}, ${lib.municipio}, MG`)}`;
    const isExact = lib.precisao_localizacao === 'endereco_exato';

    const fotoThumb = (lib.foto_fachada_thumb || lib.foto_fachada) ? `
      <div class="iw-fachada-wrap" style="cursor: pointer;" onclick="window.__showDetailsModalById && window.__showDetailsModalById('${escapeHtml(lib.id)}')">
        <img src="${escapeHtml(lib.foto_fachada_thumb || lib.foto_fachada)}" alt="Fachada" class="iw-fachada-img" loading="lazy">
        <span class="iw-fachada-tag">🏛️ Fachada</span>
      </div>
    ` : '';

    return `
      <div class="custom-infowindow">
        ${fotoThumb}
        <div class="iw-header" style="cursor: pointer;" onclick="window.__showDetailsModalById && window.__showDetailsModalById('${escapeHtml(lib.id)}')">
          <div class="iw-title" style="cursor: pointer;">${escapeHtml(lib.nome)}</div>
          ${(lib.status === 'Ativa')
            ? `<span class="badge-tipo ${badgeClass}">${tipoIcon}${escapeHtml(lib.tipo)}</span>`
            : (isSemDadosOuRegistro
                ? `<span class="badge-tipo warning-triangle">⚠️ Inativa (Sem informação atualizada)</span>`
                : `<span class="badge-tipo fechada">📕 Inativa (Fechada/Reforma)</span>`
              )
          }
        </div>
        <div class="iw-mun-row">
          📍 ${escapeHtml(lib.municipio)} ${lib.regiao_intermediaria ? `(${escapeHtml(lib.regiao_intermediaria)})` : ''}
        </div>
        ${lib.endereco ? `<div class="iw-address"><strong>Endereço:</strong> ${escapeHtml(lib.endereco)}${lib.bairro ? `, ${escapeHtml(lib.bairro)}` : ''}${lib.cep ? ` - CEP: ${escapeHtml(lib.cep)}` : ''}</div>` : ''}

        <div class="iw-contacts">
          ${lib.responsavel ? `<div><strong>Responsável:</strong> ${escapeHtml(lib.responsavel)}</div>` : ''}
          ${(() => {
            const tel = formatFixedPhoneOnly(lib.telefone);
            return tel ? `<div><strong>Tel:</strong> <a href="tel:${escapeHtml(tel.replace(/[^\d+]/g, ''))}">${escapeHtml(tel)}</a></div>` : '';
          })()}
          ${lib.email ? `<div><strong>E-mail:</strong> <a href="mailto:${escapeHtml(lib.email)}">${escapeHtml(lib.email)}</a></div>` : ''}
          ${lib.horario_funcionamento && lib.horario_funcionamento.resumo ? `
            <div style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px dashed #cbd5e1; font-size: 0.8rem; line-height: 1.4; color: #1e293b;">
              <strong style="color: #047857; display: inline-flex; align-items: center; gap: 0.2rem;">🕒 Horário:</strong>
              <span>${escapeHtml(lib.horario_funcionamento.resumo)}</span>
            </div>
          ` : (lib.status === 'Ativa' ? `
            <div style="margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px dashed #cbd5e1; font-size: 0.78rem; color: #64748b; font-style: italic;">
              <strong style="color: #64748b;">🕒 Horário:</strong> A consultar com o município
            </div>
          ` : '')}
        </div>
        <div class="iw-actions">
          <button type="button" class="btn-iw-details" id="btn-iw-view-details" data-lib-id="${escapeHtml(lib.id)}" onclick="window.__showDetailsModalById && window.__showDetailsModalById('${escapeHtml(lib.id)}')">
            📄 Ver Ficha Completa
          </button>
        </div>
      </div>
    `;
  }

  function openLibraryInfoWindow(lib, position) {
    if (!state.map) return;
    const pos = position || { lat: lib.lat, lng: lib.lng };
    const content = getLibraryInfoWindowHtml(lib);

    if (state.currentPopup && state.map) {
      state.map.closePopup(state.currentPopup);
    }

    state.currentPopup = L.popup({
      offset: [0, -14],
      className: 'custom-infowindow-popup',
      maxWidth: 380,
      autoPan: true,
      autoPanPadding: [40, 40]
    })
    .setLatLng([pos.lat, pos.lng])
    .setContent(content)
    .openOn(state.map);

    state.currentPopup.on('remove', () => {
      if (state.selectedLibraryId === lib.id) {
        deselectCurrentLibrary();
      }
    });

    setTimeout(() => {
      const btnDetails = document.getElementById('btn-iw-view-details');
      if (btnDetails) {
        btnDetails.onclick = (e) => {
          if (e) e.preventDefault();
          showDetailsModal(lib);
        };
      }
    }, 40);
  }

  // =========================================================================
  // Modal de Detalhes da Biblioteca
  // =========================================================================
  function formatNmmbEdicoesGrouped(edicoesList) {
    if (!edicoesList || !Array.isArray(edicoesList) || edicoesList.length === 0) return 'Nenhuma edição registrada';
    const byYear = {};
    edicoesList.forEach(ed => {
      const s = String(ed || '');
      const mYear = s.match(/202\d/);
      const year = mYear ? mYear[0] : 'Outros';
      const mNum = s.match(/(\d+)/);
      const num = mNum ? parseInt(mNum[1], 10) : 0;
      const label = num > 0 ? (num + 'ª') : s.split('(')[0].trim();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push({ num, label });
    });
    const parts = [];
    const validYears = Object.keys(byYear).filter(y => y !== 'Outros').sort((a, b) => Number(b) - Number(a));
    validYears.forEach(year => {
      byYear[year].sort((a, b) => a.num - b.num);
      const labels = byYear[year].map(x => x.label).join(', ');
      parts.push(year + ' (' + labels + ')');
    });
    if (byYear['Outros']) {
      const labels = byYear['Outros'].map(x => x.label).join(', ');
      parts.push('Outros (' + labels + ')');
    }
    return parts.join('; ');
  }

  function formatDisplayName(name) {
    if (!name) return '';
    return String(name).replace(/Biblioteca\s+P[úu]blica\s+Municipal/gi, 'BPM');
  }

  function showDetailsModal(lib) {
    window.__showDetailsModal = showDetailsModal;
    const modal = document.getElementById('details-modal');
    const modalBody = document.getElementById('modal-details-content');
    const modalTitle = document.getElementById('modal-library-title');
    if (!modal || !modalBody) return;

    const isGestao = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao');

    if (modalTitle) modalTitle.textContent = lib.nome;
    const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lib.nome}, ${lib.endereco || ''}, ${lib.municipio}, MG`)}`;

    const fotoHeader = lib.foto_fachada ? `
      <div class="modal-fachada-wrap">
        <img src="${escapeHtml(lib.foto_fachada)}" alt="Foto da fachada de ${escapeHtml(lib.nome)}" class="modal-fachada-img" loading="lazy">
        <div class="modal-fachada-badge">🏛️ Foto da Fachada Oficial</div>
      </div>
    ` : '';

    modalBody.innerHTML = `
      ${fotoHeader}
      <div class="details-grid">
        <div class="detail-item full-width">
          <span class="detail-label">Nome Oficial</span>
          <span class="detail-val" style="font-size: 1.05rem; font-weight: 700;">${escapeHtml(lib.nome)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Tipo de Biblioteca</span>
          <span class="detail-val">
            ${lib.status === 'Ativa'
              ? (lib.tipo === 'Pública Municipal' ? '<span class="badge-tipo publica">📘 Pública Municipal</span>' :
                (lib.tipo === 'Comunitária' ? '<span class="badge-tipo comunitaria">👥 Comunitária</span>' :
                (lib.tipo === 'Estadual' ? '<span class="badge-tipo estadual">🏛️ Estadual</span>' :
                `<span class="badge-tipo fechada">${escapeHtml(lib.tipo)}</span>`)))
              : `<span class="badge-tipo fechada">📕 Biblioteca Inativa</span>`
            }
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Status Cadastral</span>
          <span class="detail-val">
            ${lib.status === 'Ativa'
              ? '<strong>✅ Ativa (Aberta)</strong>'
              : `<strong>📕 Inativa</strong> (${(lib.situacao_cadastral === 'sem_informacao_4_anos' || lib.situacao_cadastral === 'sem_registro_historico') ? 'Sem informação atualizada' : 'Fechada / Em Reforma'})`
            }
          </span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Município</span>
          <span class="detail-val">${escapeHtml(lib.municipio)} (Cód. IBGE: ${escapeHtml(lib.codigo_ibge || 'N/A')})</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">População (Censo IBGE 2022)</span>
          <span class="detail-val"><strong>👥 ${escapeHtml(lib.populacao_formatada || (lib.populacao_2022 ? lib.populacao_2022.toLocaleString('pt-BR') : 'Não informada'))} hab.</strong></span>
        </div>
        <div class="detail-item full-width">
          <span class="detail-label">Região Intermediária (IBGE)</span>
          <span class="detail-val">${escapeHtml(lib.regiao_intermediaria || 'Não informada')}</span>
        </div>
        ${((lib.situacao === 'sem_biblioteca' || lib.status !== 'Ativa') && (lib.populacao_2022 || 0) >= 20000) ? `
          <div class="detail-item full-width" style="background: ${(lib.populacao_2022 >= 50000) ? '#fef2f2' : '#fff7ed'}; border: 1.5px solid ${(lib.populacao_2022 >= 50000) ? '#f87171' : '#fdba74'}; border-radius: 8px; padding: 0.75rem;">
            <div style="font-weight: 700; color: ${(lib.populacao_2022 >= 50000) ? '#991b1b' : '#9a3412'}; font-size: 0.92rem;">
              ${(lib.populacao_2022 >= 50000) ? '⚠️ Grande Vazio Demográfico de Minas Gerais (>50 mil habitantes)' : '⚡ Vazio Demográfico Regional (20 a 50 mil habitantes)'}
            </div>
            <p style="margin: 0.35rem 0 0 0; font-size: 0.82rem; color: ${(lib.populacao_2022 >= 50000) ? '#7f1d1d' : '#7c2d12'};">
              Este município possui expressivo contingente populacional e conta com biblioteca inativa (sem biblioteca pública aberta/ativa registrada no Sistema Estadual de Bibliotecas de MG).
            </p>
          </div>
        ` : ''}
        <div class="detail-item full-width">
          <span class="detail-label">Endereço completo</span>
          <span class="detail-val">${escapeHtml(lib.endereco || 'Não informado')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Bairro</span>
          <span class="detail-val">${escapeHtml(lib.bairro || 'Não informado')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">CEP</span>
          <span class="detail-val">${escapeHtml(lib.cep || 'Não informado')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Responsável</span>
          <span class="detail-val">${escapeHtml(lib.responsavel || 'Não informado')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Telefone (Fixo Institucional)</span>
          <span class="detail-val">${(() => {
            const tel = formatFixedPhoneOnly(lib.telefone);
            return tel ? `<a href="tel:${escapeHtml(tel.replace(/[^\d+]/g, ''))}">${escapeHtml(tel)}</a>` : 'Não informado';
          })()}</span>
        </div>
        <div class="detail-item full-width">
          <span class="detail-label">E-mail</span>
          <span class="detail-val">${lib.email ? `<a href="mailto:${escapeHtml(lib.email)}">${escapeHtml(lib.email)}</a>` : 'Não informado'}</span>
        </div>
        <div class="detail-item full-width" style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 0.65rem 0.85rem;">
          <span class="detail-label" style="color: #166534; font-weight: 700; font-size: 0.8rem;">🕒 Horário de Funcionamento (Atendimento ao Público)</span>
          <span class="detail-val" style="color: #14532d; font-size: 0.9rem; font-weight: 600; margin-top: 0.2rem; display: block; line-height: 1.45;">
            ${lib.horario_funcionamento && lib.horario_funcionamento.resumo
              ? escapeHtml(lib.horario_funcionamento.resumo)
              : '<span style="color: #64748b; font-style: italic; font-weight: 400;">Horário não informado no cadastro da Plataforma Minas Criativa. Consulte a biblioteca.</span>'
            }
          </span>
        </div>
        <div class="detail-item full-width" style="background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 8px; padding: 0.65rem 0.85rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.25rem;">
            <span class="detail-label" style="color: #9d174d; font-weight: 700; margin-bottom: 0;">📚 Programa PNLD+ Bibliotecas</span>
            <span style="font-size: 0.68rem; color: #9d174d; background: #fce7f3; border: 1px solid #fbcfe8; padding: 1px 8px; border-radius: 9999px; font-weight: 600;">Dado Autodeclarado</span>
          </div>
          <span class="detail-val" style="color: #831843; font-size: 0.88rem; display: block; line-height: 1.45;">
            ${(lib.ciclo_pnld || lib.quantidade_livros) ? `
              <strong>${escapeHtml(lib.ciclo_pnld || 'PNLD+')}</strong>: ${lib.quantidade_livros ? `<strong>${escapeHtml(lib.quantidade_livros)} exemplares recebidos</strong>` : '<span style="color: #64748b; font-style: italic;">Ainda não recebeu – aguardando próxima remessa</span>'}
              <small style="color: #64748b; font-size: 0.74rem; display: block; margin-top: 3px; font-style: italic;">* Informação autodeclarada pela biblioteca ou secretaria municipal.</small>
            ` : '<span style="color: #64748b; font-style: italic;">Não participante ou não informado</span>'}
          </span>
        </div>
        ${isGestao ? `
          <div class="detail-item">
            <span class="detail-label">Cadastro na GOV.BR BiblioBR?</span>
            <span class="detail-val"><strong style="color: ${lib.status_bibliobr === 'Aprovado' ? '#047857' : (lib.status_bibliobr === 'Indeferido' ? '#b91c1c' : (lib.status_bibliobr === 'Em Diligência' ? '#b45309' : '#1e293b'))};">${escapeHtml(formatBibliobrDisplay(lib.status_bibliobr))}</strong>${lib.id_bibliobr ? ` <span style="font-family: monospace; font-size: 0.85rem; color: #475569;">(ID: ${escapeHtml(lib.id_bibliobr)})</span>` : ''}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Processo SEI</span>
            <span class="detail-val">${lib.processo_sei ? `<strong style="font-family: monospace; font-size: 0.85rem; color: #1e293b;">${escapeHtml(lib.processo_sei)}</strong>` : '<span style="color: #dc2626; font-weight: 600;">⚠️ Não informado</span>'}</span>
          </div>
          ${lib.observacao ? `
            <div class="detail-item full-width">
              <span class="detail-label">Observações da Equipe do Sistema</span>
              <span class="detail-val" style="color: #475569; font-style: italic;">${escapeHtml(lib.observacao)}</span>
            </div>
          ` : ''}
        ` : ''}
        ${(() => {
          if (!isGestao) return '';
          const s26 = (lib.acoes_sistema_2026 && lib.acoes_sistema_2026.atendido) ? lib.acoes_sistema_2026 : null;
          const s25 = (lib.acoes_sistema_2025 && lib.acoes_sistema_2025.atendido) ? lib.acoes_sistema_2025 : null;
          const s24 = (lib.acoes_sistema_2024 && lib.acoes_sistema_2024.atendido) ? lib.acoes_sistema_2024 : null;
          const s23 = (lib.acoes_sistema_2023 && lib.acoes_sistema_2023.atendido) ? lib.acoes_sistema_2023 : null;
          if (!s26 && !s25 && !s24 && !s23) return '';

          const totCapacitacoes = (s26?.participantes_capacitados || 0) + (s25?.participantes_capacitados || 0) + (s24?.participantes_capacitados || 0) + (s23?.participantes_capacitados || 0);
          const totLivros = (s26?.livros_doados_dlllb || 0) + (s25?.livros_doados_dlllb || 0) + (s24?.livros_doados_dlllb || 0) + (s23?.livros_doados_dlllb || 0);
          const totExposicoes = (s26?.exposicoes_itinerantes || 0) + (s25?.exposicoes_itinerantes || 0) + (s24?.exposicoes_itinerantes || 0) + (s23?.exposicoes_itinerantes || 0);
          const totAssessorias = (s26?.total_assessorias || 0) + (s25?.total_assessorias || 0) + (s24?.total_assessorias || 0) + (s23?.total_assessorias || 0);
          const totVisitas = ((s25?.visitas_campo || 0) + (s25?.visitas_sede || 0) + (s24?.visitas_campo || 0) + (s24?.visitas_sede || 0) + (s23?.visitas_campo || 0) + (s23?.visitas_sede || 0));

          const yearsCount = (s26 ? 1 : 0) + (s25 ? 1 : 0) + (s24 ? 1 : 0) + (s23 ? 1 : 0);
          const badgeText = yearsCount === 4 
            ? 'Atendida no Quadriênio (2023–2026)' 
            : `Atendida em ${yearsCount} ${yearsCount === 1 ? 'ano' : 'anos'}`;

          const formatYearDetails = (s) => {
            if (!s) return '';
            const items = [
              s.participantes_capacitados > 0 ? `<strong>${s.participantes_capacitados}</strong> ${s.participantes_capacitados === 1 ? 'capacitação' : 'capacitações'}` : '',
              s.total_assessorias > 0 ? `<strong>${s.total_assessorias}</strong> ${s.total_assessorias === 1 ? 'assessoria' : 'assessorias'}` : '',
              s.livros_doados_dlllb > 0 ? `<strong>${s.livros_doados_dlllb}</strong> livros` : '',
              s.exposicoes_itinerantes > 0 ? `<strong>${s.exposicoes_itinerantes}</strong> ${s.exposicoes_itinerantes === 1 ? 'exposição' : 'exposições'}` : '',
              ((s.visitas_campo || 0) + (s.visitas_sede || 0)) > 0 ? `<strong>${(s.visitas_campo || 0) + (s.visitas_sede || 0)}</strong> ${((s.visitas_campo || 0) + (s.visitas_sede || 0)) === 1 ? 'visita' : 'visitas'}` : ''
            ].filter(Boolean);
            if (items.length === 0) {
              return '<div class="chip-line" style="color: #64748b; font-style: italic;">Atendimento institucional</div>';
            }
            return items.map(it => `<div class="chip-line">${it}</div>`).join('');
          };

          const summaryParts = [
            totCapacitacoes > 0 ? `<strong>${totCapacitacoes}</strong> ${totCapacitacoes === 1 ? 'capacitação' : 'capacitações'}` : '',
            totAssessorias > 0 ? `<strong>${totAssessorias}</strong> ${totAssessorias === 1 ? 'assessoria' : 'assessorias'}` : '',
            totLivros > 0 ? `<strong>${totLivros.toLocaleString('pt-BR')}</strong> livros` : '',
            totExposicoes > 0 ? `<strong>${totExposicoes}</strong> ${totExposicoes === 1 ? 'exposição' : 'exposições'}` : '',
            totVisitas > 0 ? `<strong>${totVisitas}</strong> ${totVisitas === 1 ? 'visita' : 'visitas'}` : ''
          ].filter(Boolean);

          return `
            <div class="modal-sistema-box full-width" style="grid-column: span 2;">
              <div class="modal-sistema-top-line">
                <div class="modal-sistema-title-group">
                  <span>🎓</span>
                  <span style="font-weight: 700; color: #065f46; font-size: 0.84rem;">Atuação do Sistema Estadual:</span>
                  <span style="font-size: 0.82rem; color: #047857; font-weight: 600;">
                    ${summaryParts.join(' • ')}
                  </span>
                </div>
                <span class="modal-sistema-badge">${badgeText}</span>
              </div>

              <!-- Timeline Contínua em Chips Inline (Opção 2) -->
              <div class="modal-sistema-chips-row">
                ${s23 ? `
                  <div class="sistema-chip">
                    <span class="chip-year">2023</span>
                    <span class="chip-txt">${formatYearDetails(s23)}</span>
                  </div>
                ` : ''}
                ${s24 ? `
                  <div class="sistema-chip">
                    <span class="chip-year">2024</span>
                    <span class="chip-txt">${formatYearDetails(s24)}</span>
                  </div>
                ` : ''}
                ${s25 ? `
                  <div class="sistema-chip">
                    <span class="chip-year">2025</span>
                    <span class="chip-txt">${formatYearDetails(s25)}</span>
                  </div>
                ` : ''}
                ${s26 ? `
                  <div class="sistema-chip">
                    <span class="chip-year">2026 (1ºS)</span>
                    <span class="chip-txt">${formatYearDetails(s26)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        })()}
        ${lib.seil && lib.seil.participou ? `
          <div class="modal-seil-box full-width" style="grid-column: span 2;">
            <div class="modal-seil-header">
              <div class="modal-seil-title" data-tooltip="Esta instituição participa ativamente da Semana Estadual de Incentivo à Literatura (instituída pela Lei Estadual nº 23.595/2020 e promovida anualmente pela SECULT-MG / DLLLB na terceira semana de abril), mobilizando a comunidade em torno do livro, leitura e literatura." data-tooltip-title="📖 Semana Estadual de Incentivo à Literatura">
                <span>📖</span>
                <span>Semana Estadual de Incentivo à Literatura</span>
                <span class="tooltip-info-icon" aria-hidden="true">ℹ</span>
              </div>
              <span class="modal-seil-badge">${lib.seil.total_edicoes} ${lib.seil.total_edicoes === 1 ? 'Edição' : 'Edições'} | ${lib.seil.total_atividades} ativ.</span>
            </div>
            <div class="modal-seil-edicoes-list">
              ${(lib.seil.edicoes_detalhes || []).map(ed => `
                <div class="modal-seil-edicao-item">
                  <div class="modal-seil-edicao-head">
                    <span>${escapeHtml(ed.edicao || '')} (${escapeHtml(String(ed.ano || ''))})</span>
                    <span class="modal-seil-edicao-tema">Tema: "${escapeHtml(ed.tema || '')}"</span>
                  </div>
                  ${ed.atividades && ed.atividades.length > 0 ? `
                    <div class="modal-seil-atividades-sample">
                      <strong>Ações:</strong> ${escapeHtml(ed.atividades.slice(0, 3).join('; '))}${ed.atividades.length > 3 ? ` <em>(+${ed.atividades.length - 3} outras)</em>` : ''}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${lib.dac && lib.dac.possui_dac ? `
          <div class="modal-dac-box full-width" style="grid-column: span 2;">
            <div class="modal-dac-header">
              <div class="modal-dac-title" data-tooltip="Esta biblioteca pública municipal possui acervo de memória/patrimonial oficialmente reconhecido pelo Estado de Minas Gerais (SECULT/IEPHA)." data-tooltip-title="🏛️ Declaração de Acervos Culturais (DAC - ICMS Cultural)">
                <span>🏛️</span>
                <span>Declaração de Acervos Culturais (DAC - ICMS Cultural)</span>
                <span class="tooltip-info-icon" aria-hidden="true">ℹ</span>
              </div>
              <span class="modal-dac-badge">${lib.dac.total_certificacoes} ${lib.dac.total_certificacoes === 1 ? 'Ano Deferido' : 'Anos Deferidos'}</span>
            </div>
            <div style="font-size: 0.78rem; color: #7c2d12; line-height: 1.5; background: #fff7ed; padding: 0.5rem 0.65rem; border-radius: 6px; border: 1px dashed #fb923c;">
              <div><strong>Exercícios com certificação deferida:</strong> ${escapeHtml((lib.dac.anos || []).join(', '))}</div>
              <div style="margin-top: 3px;"><strong>Pontuação no IEPHA (Quadro I-A):</strong> ${lib.dac.total_certificacoes ? (lib.dac.total_certificacoes * 0.1).toFixed(2) + ' pts acumulados (+0,10 pt por ano)' : '+0,10 pt por ano deferido'}</div>
            </div>
          </div>
        ` : ''}
        ${lib.nmmb && lib.nmmb.participou ? `
          <div class="modal-nmmb-box full-width" style="grid-column: span 2;">
            <div class="modal-nmmb-header">
              <div class="modal-nmmb-title" data-tooltip="Esta instituição integra a programação noturna oficial articulada pela SECULT-MG, promovendo dinamização do espaço cultural e acesso ampliado à comunidade." data-tooltip-title="🌙 Noite Mineira de Museus e Bibliotecas (NMMB)">
                <span>🌙</span>
                <span>Noite Mineira de Museus e Bibliotecas (NMMB)</span>
                <span class="tooltip-info-icon" aria-hidden="true">ℹ</span>
              </div>
              <span class="modal-nmmb-badge">${lib.nmmb.total_edicoes} ${lib.nmmb.total_edicoes === 1 ? 'Edição' : 'Edições'}${lib.nmmb.total_atividades ? ` | ${lib.nmmb.total_atividades} ativ.` : ''}</span>
            </div>
            <div style="font-size: 0.78rem; color: #854d0e; line-height: 1.5; background: #fffbe6; padding: 0.5rem 0.65rem; border-radius: 6px; border: 1px dashed #facc15;">
              <div><strong>Edições com participação:</strong> ${escapeHtml(formatNmmbEdicoesGrouped(lib.nmmb.edicoes))}</div>
              <div style="margin-top: 4px;"><strong>Atividades desenvolvidas:</strong> ${escapeHtml(Array.isArray(lib.nmmb.atividades) ? lib.nmmb.atividades.join(', ') : `${lib.nmmb.total_atividades || 1} atividades culturais registradas`)}</div>
            </div>
          </div>
        ` : ''}
        ${(lib.rede_integra_geraes_polo && isGestao) ? `
          <div class="modal-polo-box full-width" style="grid-column: span 2; background: #ecfdf5; border: 1.5px solid #a7f3d0; border-left: 4px solid #059669; border-radius: 8px; padding: 0.85rem; margin-top: 0.5rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; color: #065f46; font-size: 0.95rem;">
                <span>🌐</span>
                <span>Biblioteca-Polo Regional da Rede Integra Geraes</span>
              </div>
              <span style="font-size: 0.72rem; background: #d1fae5; color: #047857; padding: 2px 8px; border-radius: 9999px; font-weight: 700; border: 1px solid #a7f3d0;">SEBPC / Secult-MG</span>
            </div>
            <p style="font-size: 0.84rem; color: #065f46; margin: 0; line-height: 1.45;">
              Equipamento cultural integrante das <strong>24 Bibliotecas-Polo Regionais de Minas Gerais</strong>, atuando como articulador e centro de referência para integração das bibliotecas públicas e comunitárias de sua região intermediária.
            </p>
          </div>
        ` : ''}
        <div class="detail-item full-width" style="margin-top: 0.5rem; background: #f8fafc; padding: 0.75rem; border-radius: 8px;">
          <span class="detail-label">Precisão das Coordenadas</span>
          <span class="detail-val">
            ${lib.precisao_localizacao === 'endereco_exato' 
              ? '✅ <strong>Endereço Exato</strong> (Posicionamento no logradouro cadastrado).' 
              : '🏛️ <strong>Sede Municipal</strong> (Coordenada oficial da sede do município via IBGE).'}
            <br><small style="color: #64748b;">Latitude: ${lib.lat}, Longitude: ${lib.lng}</small>
          </span>
        </div>
      </div>
    `;

    const btnModalRoute = document.getElementById('btn-modal-route');
    if (btnModalRoute) {
      btnModalRoute.href = routeUrl;
    }

    modal.classList.add('open');
  }

    function openPopulacaoModal() {
    const modal = document.getElementById('populacao-modal');
    const container = document.getElementById('modal-populacao-content');
    if (!modal || !container) return;

    const stats = state.statistics || {};
    const popTotNum = stats.populacao_total_mg || 20539989;
    const popComNum = stats.populacao_com_publica || 17140903;
    const popSemNum = stats.populacao_sem_publica || (popTotNum - popComNum);

    const popTot = popTotNum.toLocaleString('pt-BR');
    const popCom = popComNum.toLocaleString('pt-BR');
    const popSem = popSemNum.toLocaleString('pt-BR');

    const cobPopNum = (stats.cobertura_populacional_percentual != null) 
      ? Number(stats.cobertura_populacional_percentual) 
      : ((popComNum / popTotNum) * 100);
    const cobPop = cobPopNum.toFixed(1);

    const cobMunNum = (stats.cobertura_publica_percentual != null) 
      ? Number(stats.cobertura_publica_percentual) 
      : 52.5;
    const cobMun = cobMunNum.toFixed(1);

    const munCom = stats.municipios_com_biblioteca_publica || 448;
    const munTot = 853;
    const munSem = munTot - munCom;

    const percCobPop = cobPop.replace('.', ',');
    const percSemPop = (100 - Number(cobPop)).toFixed(1).replace('.', ',');
    const percCobMun = cobMun.replace('.', ',');
    const percSemMun = (100 - Number(cobMun)).toFixed(1).replace('.', ',');

    container.innerHTML = `
      <!-- Cards de Indicadores Principais -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; margin-bottom: 1.15rem;">
        
        <!-- Card 1: Cobertura Populacional -->
        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 10px; padding: 0.95rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72rem; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.3rem;">
            🏛️ População Atendida
          </div>
          <div style="font-size: 1.9rem; font-weight: 800; color: #166534; line-height: 1.1;">
            ${percCobPop}%
          </div>
          <div style="font-size: 0.82rem; color: #15803d; font-weight: 700; margin-top: 0.35rem;">
            ${popCom} habitantes
          </div>
          <div style="font-size: 0.72rem; color: #16a34a; margin-top: 0.2rem; line-height: 1.3;">
            residem em municípios com biblioteca pública ativa
          </div>
        </div>

        <!-- Card 2: Cobertura Territorial -->
        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #93c5fd; border-radius: 10px; padding: 0.95rem; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72rem; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.3rem;">
            🗺️ Cobertura Territorial
          </div>
          <div style="font-size: 1.9rem; font-weight: 800; color: #1e40af; line-height: 1.1;">
            ${percCobMun}%
          </div>
          <div style="font-size: 0.82rem; color: #1d4ed8; font-weight: 700; margin-top: 0.35rem;">
            ${munCom} de ${munTot} municípios
          </div>
          <div style="font-size: 0.72rem; color: #2563eb; margin-top: 0.2rem; line-height: 1.3;">
            possuem biblioteca pública municipal aberta
          </div>
        </div>

      </div>

      <!-- Barra Visual de Distribuição Populacional -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1.15rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">
          <span>Distribuição Populacional em Minas Gerais</span>
          <span style="color: #64748b; font-weight: 600;">Total: ${popTot} hab.</span>
        </div>
        <div style="height: 16px; background: #fee2e2; border-radius: 8px; overflow: hidden; display: flex; box-shadow: inset 0 1px 2px rgba(0,0,0,0.08);">
          <div style="width: ${cobPop}%; background: linear-gradient(90deg, #10b981 0%, #059669 100%); border-radius: 8px 0 0 8px; transition: width 0.6s ease;" title="Com biblioteca: ${percCobPop}%"></div>
          <div style="width: ${100 - Number(cobPop)}%; background: #f87171;" title="Sem biblioteca: ${percSemPop}%"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.73rem; color: #475569; margin-top: 0.45rem; flex-wrap: wrap; gap: 0.35rem;">
          <span style="display: inline-flex; align-items: center; gap: 0.3rem;">
            <span style="width: 9px; height: 9px; border-radius: 50%; background: #059669; display: inline-block;"></span>
            Com biblioteca: <strong style="color: #065f46;">${popCom}</strong> (${percCobPop}%)
          </span>
          <span style="display: inline-flex; align-items: center; gap: 0.3rem;">
            <span style="width: 9px; height: 9px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
            Sem biblioteca: <strong style="color: #991b1b;">${popSem}</strong> (${percSemPop}%)
          </span>
        </div>
      </div>

      <!-- Bloco de Diagnóstico Estratégico -->
      <div style="background: #ffffff; border: 1px solid #e0e7ff; border-left: 4px solid #6366f1; border-radius: 0 10px 10px 0; padding: 0.85rem 1rem; box-shadow: 0 2px 5px rgba(0,0,0,0.04); font-size: 0.83rem; line-height: 1.55; color: #334155;">
        <div style="font-weight: 700; color: #312e81; display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.4rem; font-size: 0.88rem;">
          <span>📊 Comparativo Estratégico (Território vs. População)</span>
        </div>
        <p style="margin: 0 0 0.5rem 0;">
          Embora <strong>${percSemMun}%</strong> dos municípios mineiros (${munSem} de ${munTot} cidades) não possuam biblioteca pública aberta no momento, eles concentram apenas <strong>${percSemPop}%</strong> da população de Minas Gerais. Trata-se predominantemente de cidades de menor porte demográfico.
        </p>
        <p style="margin: 0; color: #475569; font-size: 0.79rem; border-top: 1px dashed #cbd5e1; padding-top: 0.45rem;">
          Por outro lado, os municípios cobertos concentram <strong>${percCobPop}%</strong> de todos os cidadãos do estado, evidenciando o alcance demográfico de alta relevância das bibliotecas públicas municipais existentes.
        </p>
      </div>
    `;

    modal.classList.add('open');
  }

  function showDetailsModalById(id) {
    if (!id) return;
    const all = [
      ...(state.allLibraries || []),
      ...(state.allMgSemAtiva || []),
      ...(state.filteredLibraries || [])
    ];
    const lib = all.find(l => String(l.id) === String(id));
    if (lib) {
      showDetailsModal(lib);
    } else {
      console.warn('Biblioteca não encontrada para ID:', id);
    }
  }

  window.__showDetailsModal = showDetailsModal;
  window.__showDetailsModalById = showDetailsModalById;

  // Delegação global de cliques para abertura de fichas (em cards, mapas e popups)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-iw-view-details, .btn-iw-details, .btn-card-ficha');
    if (btn) {
      e.stopPropagation();
      const id = btn.dataset.libId || btn.dataset.id || state.selectedLibraryId;
      if (id) {
        showDetailsModalById(id);
      }
    }
  });

  // =========================================================================
  // Exportação de Arquivos (Excel e CSV) com Carimbo de Data/Hora/Minuto
  // =========================================================================
  function getExportTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const d = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    return `${y}-${m}-${d}_${hh}h${mm}`;
  }

  function exportFilteredToCSV() {
    if (state.filteredLibraries.length === 0) {
      alert('Não há dados filtrados para exportação.');
      return;
    }

    const cleanVal = (val) => {
      const s = String(val || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""').trim();
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };

    const headers = [
      'Município', 'Código IBGE', 'Região Intermediária', 'Processo SEI', 'Nome da Biblioteca',
      'Tipo', 'Status', 'Cadastro na GOV.BR BiblioBR?', 'ID BIBLIOBR', 'Ciclo PNLD+', 'Qtd Livros PNLD', 'Observação Sistema',
      'Endereço', 'Bairro', 'CEP', 'Responsável',
      'Telefone', 'E-mail',
      'Participa NMMB', 'Edições NMMB', 'Atividades NMMB',
      'Possui DAC', 'Anos DAC Deferida', 'Total Anos DAC', 'Processos SEI DAC',
      'Atendida Sistema 2026', 'Participantes Capacitados 2026', 'Livros Doados DLLLB 2026', 'Exposições Itinerantes 2026', 'Assessorias Técnicas 2026',
      'Atendida Sistema 2025', 'Participantes Capacitados 2025', 'Livros Doados DLLLB 2025', 'Exposições Itinerantes 2025', 'Assessorias Técnicas 2025', 'Visitas Técnicas 2025',
      'Atendida Sistema 2024', 'Participantes Capacitados 2024', 'Livros Doados DLLLB 2024', 'Exposições Itinerantes 2024', 'Assessorias Técnicas 2024', 'Visitas Técnicas 2024',
      'Atendida Sistema 2023', 'Participantes Capacitados 2023', 'Livros Doados DLLLB 2023', 'Exposições Itinerantes 2023', 'Assessorias Técnicas 2023', 'Visitas Técnicas 2023',
      'Participa SEIL', 'Edições SEIL', 'Total Edições SEIL', 'Total Atividades SEIL',
      'Polo Regional Rede Integra Geraes',
      'Latitude', 'Longitude', 'Precisão'
    ];

    const rows = state.filteredLibraries.map(b => [
      `"${cleanVal(b.municipio)}"`,
      `"${cleanVal(b.codigo_ibge)}"`,
      `"${cleanVal(b.regiao_intermediaria)}"`,
      `"${cleanVal(b.processo_sei)}"`,
      `"${cleanVal(b.nome)}"`,
      `"${cleanVal(b.tipo)}"`,
      `"${cleanVal(b.status)}"`,
      `"${cleanVal(b.status_bibliobr)}"`,
      `"${cleanVal(b.id_bibliobr)}"`,
      `"${cleanVal(b.ciclo_pnld)}"`,
      `"${cleanVal(b.quantidade_livros)}"`,
      `"${cleanVal(b.observacao)}"`,
      `"${cleanVal(b.endereco)}"`,
      `"${cleanVal(b.bairro)}"`,
      `"${cleanVal(b.cep)}"`,
      `"${cleanVal(b.responsavel)}"`,
      `"${cleanVal(b.telefone)}"`,
      `"${cleanVal(b.email)}"`,
      `"${b.nmmb && b.nmmb.participou ? 'Sim' : 'Não'}"`,
      `"${b.nmmb && b.nmmb.participou ? b.nmmb.total_edicoes : 0}"`,
      `"${cleanVal(b.nmmb && b.nmmb.participou ? (b.nmmb.atividades || []).join(', ') : '')}"`,
      `"${b.dac && b.dac.possui_dac ? 'Sim' : 'Não'}"`,
      `"${cleanVal(b.dac && b.dac.possui_dac ? (b.dac.anos || []).join(', ') : '')}"`,
      `"${b.dac && b.dac.possui_dac ? b.dac.total_certificacoes : 0}"`,
      `"${cleanVal(b.dac && b.dac.possui_dac && b.dac.processos_sei ? Object.entries(b.dac.processos_sei).map(([y, p]) => `${y}: ${p}`).join(' | ') : '')}"`,
      `"${b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? 'Sim' : 'Não'}"`,
      `"${b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? b.acoes_sistema_2026.participantes_capacitados : 0}"`,
      `"${b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? b.acoes_sistema_2026.livros_doados_dlllb : 0}"`,
      `"${b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? b.acoes_sistema_2026.exposicoes_itinerantes : 0}"`,
      `"${b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? b.acoes_sistema_2026.total_assessorias : 0}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? 'Sim' : 'Não'}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? b.acoes_sistema_2025.participantes_capacitados : 0}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? b.acoes_sistema_2025.livros_doados_dlllb : 0}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? b.acoes_sistema_2025.exposicoes_itinerantes : 0}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? b.acoes_sistema_2025.total_assessorias : 0}"`,
      `"${b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? (b.acoes_sistema_2025.visitas_campo || 0) + (b.acoes_sistema_2025.visitas_sede || 0) : 0}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? 'Sim' : 'Não'}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? b.acoes_sistema_2024.participantes_capacitados : 0}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? b.acoes_sistema_2024.livros_doados_dlllb : 0}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? b.acoes_sistema_2024.exposicoes_itinerantes : 0}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? b.acoes_sistema_2024.total_assessorias : 0}"`,
      `"${b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? (b.acoes_sistema_2024.visitas_campo || 0) + (b.acoes_sistema_2024.visitas_sede || 0) : 0}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? 'Sim' : 'Não'}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? b.acoes_sistema_2023.participantes_capacitados : 0}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? b.acoes_sistema_2023.livros_doados_dlllb : 0}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? b.acoes_sistema_2023.exposicoes_itinerantes : 0}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? b.acoes_sistema_2023.total_assessorias : 0}"`,
      `"${b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? (b.acoes_sistema_2023.visitas_campo || 0) + (b.acoes_sistema_2023.visitas_sede || 0) : 0}"`,
      `"${b.seil && b.seil.participou ? 'Sim' : 'Não'}"`,
      `"${cleanVal(b.seil && b.seil.participou ? (b.seil.edicoes || []).join(', ') : '')}"`,
      `"${b.seil && b.seil.participou ? b.seil.total_edicoes : 0}"`,
      `"${b.seil && b.seil.participou ? b.seil.total_atividades : 0}"`,
      `"${b.rede_integra_geraes_polo ? 'Sim' : 'Não'}"`,
      b.lat,
      b.lng,
      `"${cleanVal(b.precisao_localizacao)}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bibliotecas_mg_${getExportTimestamp()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // =========================================================================
  // Exportação Diagnóstico Territorial Completo (853 Municípios de MG)
  // =========================================================================
  function exportDiagnosticoTerritorial853() {
    if (!state.geoJsonData || !state.geoJsonData.features || state.geoJsonData.features.length === 0) {
      alert('Dados territoriais dos municípios de MG não carregados.');
      return;
    }

    const headers = [
      'Código IBGE',
      'Município',
      'Região Intermediária',
      'População (Censo IBGE 2022)',
      'Possui Biblioteca Pública Ativa',
      'Situação Cadastral',
      'Status Cultural Resumido',
      'Polo Rede Integra Geraes',
      'Total Bibliotecas Ativas',
      'Total Bibliotecas Públicas',
      'Total Bibliotecas Comunitárias',
      'Nomes das Bibliotecas',
      'Responsável Principal',
      'Telefone',
      'E-mail',
      'Endereço',
      'Bairro',
      'CEP',
      'Ações do Sistema 2026',
      'Ações do Sistema 2025',
      'Ações do Sistema 2024',
      'Ações do Sistema 2023',
      'Participa SEIL',
      'Possui DAC Deferida',
      'Participa Noite Mineira (NMMB)'
    ];

    // Criar mapa de bibliotecas ativas e fechadas por código IBGE
    const bibsByIbge = {};
    (state.allLibraries || []).forEach(b => {
      const code = b.codigo_ibge;
      if (code) {
        bibsByIbge[code] = bibsByIbge[code] || [];
        bibsByIbge[code].push(b);
      }
    });

    const closedByIbge = {};
    (state.closedLibraries || []).forEach(b => {
      const code = b.codigo_ibge;
      if (code) {
        closedByIbge[code] = b;
      }
    });

    const situacaoLabels = {
      'com_publica': 'Ativa (Aberta)',
      'fechada_reforma': 'Inativa (Fechada ou em Reforma)',
      'declarado_sem_biblioteca': 'Inativa (Declarado Sem Biblioteca)',
      'sem_informacao_4_anos': 'Inativa (Sem informação atualizada)',
      'apenas_comunitaria': 'Ativa (Apenas Comunitária)',
      'sem_registro_historico': 'Inativa (Sem informação atualizada)'
    };

    const sortedFeatures = [...state.geoJsonData.features].sort((a, b) => {
      return (a.properties.name || '').localeCompare(b.properties.name || '', 'pt-BR');
    });

    const cleanVal = (val) => {
      const s = String(val || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""').trim();
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };

    const rows = sortedFeatures.map(f => {
      const p = f.properties || {};
      const mid = String(p.id);
      const activeList = bibsByIbge[mid] || [];
      const primaryLib = activeList[0] || closedByIbge[mid] || {};

      const hasPublica = !!p.tem_biblioteca_publica;
      const situacaoCode = p.situacao_cadastral || (hasPublica ? 'com_publica' : 'sem_registro_historico');
      const situacaoExtenso = situacaoLabels[situacaoCode] || situacaoCode;

      return [
        `"${cleanVal(mid)}"`,
        `"${cleanVal(p.name)}"`,
        `"${cleanVal(p.regiao_intermediaria)}"`,
        `"${cleanVal(p.populacao_2022)}"`,
        `"${hasPublica ? 'Sim' : 'Não'}"`,
        `"${cleanVal(situacaoExtenso)}"`,
        `"${hasPublica ? 'Ativa' : 'Inativa'}"`,
        `"${p.tem_polo_rede_integra ? 'Sim' : 'Não'}"`,
        `"${p.total_bibliotecas || activeList.length}"`,
        `"${p.total_bibliotecas_publicas || (hasPublica ? activeList.filter(x => x.tipo !== 'Comunitária').length : 0)}"`,
        `"${p.total_bibliotecas_comunitarias || activeList.filter(x => x.tipo === 'Comunitária').length}"`,
        `"${cleanVal(p.nomes_bibliotecas && p.nomes_bibliotecas.length > 0 ? p.nomes_bibliotecas.join(' | ') : (primaryLib.nome || ''))}"`,
        `"${cleanVal(primaryLib.responsavel)}"`,
        `"${cleanVal(primaryLib.telefone)}"`,
        `"${cleanVal(primaryLib.email)}"`,
        `"${cleanVal(primaryLib.endereco)}"`,
        `"${cleanVal(primaryLib.bairro)}"`,
        `"${cleanVal(primaryLib.cep)}"`,
        `"${p.tem_acoes_2026 ? 'Sim' : 'Não'}"`,
        `"${p.tem_acoes_2025 || p.tem_acoes_sistema_2025 ? 'Sim' : 'Não'}"`,
        `"${p.tem_acoes_2024 || p.tem_acoes_sistema_2024 ? 'Sim' : 'Não'}"`,
        `"${p.tem_acoes_2023 || p.tem_acoes_sistema_2023 ? 'Sim' : 'Não'}"`,
        `"${p.tem_seil ? 'Sim' : 'Não'}"`,
        `"${p.tem_dac ? 'Sim' : 'Não'}"`,
        `"${p.tem_nmmb ? 'Sim' : 'Não'}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `diagnostico_territorial_853_municipios_mg_${getExportTimestamp()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // =========================================================================
  // Exportação Excel Formatado (.xlsx) com Lazy Loading de ExcelJS (~1 MB)
  // =========================================================================
  async function ensureExcelJSLoaded() {
    if (window.ExcelJS) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'vendor/exceljs.min.js';
      script.onload = () => resolve(Boolean(window.ExcelJS));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  async function exportFilteredToExcel() {
    if (!(await ensureExcelJSLoaded())) {
      alert('Biblioteca ExcelJS não disponível. Por favor, utilize a exportação em CSV.');
      return;
    }

    if (state.filteredLibraries.length === 0) {
      alert('Não há dados filtrados para exportação.');
      return;
    }

    const isGestao = (typeof document !== 'undefined' && document.body && document.body.dataset && document.body.dataset.mode === 'gestao');
    const cleanVal = (val) => {
      const s = String(val || '').replace(/[\r\n]+/g, ' ').trim();
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    const workbook = new ExcelJS.Workbook();
    workbook.creator = isGestao ? 'SEBPM/SECULT-MG - Observatório Territorial' : 'SEBPM/SECULT-MG - Sistema Estadual de Bibliotecas';
    workbook.created = new Date();

    const isCoverage = state.layers.coverageChoropleth || state.filters.onlyClosed;
    const modeDesc = isCoverage ? 'Situação Cadastral / Cobertura Territorial' : '13 Regiões Geográficas Intermediárias';

    function colToLetter(colIndex) {
      let temp, letter = '';
      while (colIndex > 0) {
        temp = (colIndex - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colIndex = Math.floor((colIndex - temp - 1) / 26);
      }
      return letter;
    }

    // -----------------------------------------------------------------------
    // ABA 1: BIBLIOTECAS DE MG
    // -----------------------------------------------------------------------
    const ws = workbook.addWorksheet('Bibliotecas de MG', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
    });

    const headers = isGestao ? [
      'Município', 'Código IBGE', 'Região Intermediária', 'Processo SEI', 'Nome da Biblioteca',
      'Tipo de Biblioteca', 'Status Cadastral', 'Cadastro na GOV.BR BiblioBR?', 'ID Bibliobr',
      'Acervo PNLD+ (Exemplares)', 'Ciclo PNLD+', 'Observações da Equipe',
      'Logradouro / Endereço', 'Bairro', 'CEP', 'Responsável', 'Telefone Institucional', 'E-mail Institucional',
      'Participa Noite Mineira (NMMB)', 'Possui Certificação DAC',
      'Atuação Sistema 2026', 'Atuação Sistema 2025', 'Atuação Sistema 2024', 'Atuação Sistema 2023',
      'Participa Semana Literatura (SEIL)', 'Polo Rede Integra Geraes', 'Latitude', 'Longitude'
    ] : [
      'Município', 'Código IBGE', 'Região Intermediária', 'Nome da Biblioteca',
      'Tipo de Biblioteca', 'Acervo PNLD+ (Exemplares)', 'Ciclo PNLD+',
      'Logradouro / Endereço', 'Bairro', 'CEP', 'Responsável', 'Telefone Institucional', 'E-mail Institucional',
      'Participa Semana Literatura (SEIL)', 'Participa Noite Mineira (NMMB)', 'Latitude', 'Longitude'
    ];

    const lastColLetter = colToLetter(headers.length);

    // Banner de Título Institucional
    ws.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = ws.getCell('A1');
    titleCell.value = isGestao ?
      'SISTEMA ESTADUAL DE BIBLIOTECAS DE MINAS GERAIS • PAINEL DE GESTÃO E DIAGNÓSTICO TERRITORIAL' :
      'SISTEMA ESTADUAL DE BIBLIOTECAS PÚBLICAS E COMUNITÁRIAS DE MINAS GERAIS (SEBPC/MG)';
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }
    };
    titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    // Subtítulo e Metadados
    ws.mergeCells(`A2:${lastColLetter}2`);
    const subtitleCell = ws.getCell('A2');
    subtitleCell.value = `Relatório de Equipamentos Culturais • Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} • Total: ${state.filteredLibraries.length} equipamentos • Camada Ativa: ${modeDesc}`;
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    subtitleCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FFE2E8F0' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Linha de espaçamento
    ws.getRow(3).height = 6;

    // Cabeçalhos de Colunas
    const headerRow = ws.getRow(4);
    headerRow.height = 28;
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }
      };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        right: { style: 'thin', color: { argb: 'FF475569' } }
      };
    });

    // Inserção dos registros com colorização dinâmica harmoniosa
    state.filteredLibraries.forEach((b, rIdx) => {
      const rowNum = rIdx + 5;
      const row = ws.getRow(rowNum);
      row.height = 20;

      let rowBgHex = 'FFFFFFFF';
      const regPastel = REGIOES_PASTEL_CORES[b.regiao_intermediaria] || { bg: 'FFFFFF', badge: '1D4ED8', text: '000000' };

      if (isCoverage) {
        if (b.status === 'Ativa') {
          rowBgHex = 'FFECFDF5';
        } else {
          rowBgHex = 'FFFEF2F2';
        }
      } else {
        rowBgHex = 'FF' + regPastel.bg;
      }

      const rowValues = isGestao ? [
        cleanVal(b.municipio),
        cleanVal(b.codigo_ibge),
        cleanVal(b.regiao_intermediaria),
        cleanVal(b.processo_sei),
        cleanVal(b.nome),
        cleanVal(b.tipo),
        cleanVal(b.status),
        cleanVal(b.status_bibliobr),
        cleanVal(b.id_bibliobr),
        b.quantidade_livros ? Number(b.quantidade_livros) : (b.ciclo_pnld ? 0 : null),
        cleanVal(b.ciclo_pnld),
        cleanVal(b.observacao),
        cleanVal(b.endereco),
        cleanVal(b.bairro),
        cleanVal(b.cep),
        cleanVal(b.responsavel),
        cleanVal(b.telefone),
        cleanVal(b.email),
        b.nmmb && b.nmmb.participou ? 'Sim' : 'Não',
        b.dac && b.dac.possui_dac ? 'Sim' : 'Não',
        b.acoes_sistema_2026 && b.acoes_sistema_2026.atendido ? 'Sim' : 'Não',
        b.acoes_sistema_2025 && b.acoes_sistema_2025.atendido ? 'Sim' : 'Não',
        b.acoes_sistema_2024 && b.acoes_sistema_2024.atendido ? 'Sim' : 'Não',
        b.acoes_sistema_2023 && b.acoes_sistema_2023.atendido ? 'Sim' : 'Não',
        b.seil && b.seil.participou ? 'Sim' : 'Não',
        b.rede_integra_geraes_polo ? 'Sim' : 'Não',
        b.lat || null,
        b.lng || null
      ] : [
        cleanVal(b.municipio),
        cleanVal(b.codigo_ibge),
        cleanVal(b.regiao_intermediaria),
        cleanVal(b.nome),
        cleanVal(b.tipo),
        b.quantidade_livros ? Number(b.quantidade_livros) : (b.ciclo_pnld ? 0 : null),
        cleanVal(b.ciclo_pnld),
        cleanVal(b.endereco),
        cleanVal(b.bairro),
        cleanVal(b.cep),
        cleanVal(b.responsavel),
        cleanVal(b.telefone),
        cleanVal(b.email),
        b.seil && b.seil.participou ? 'Sim' : 'Não',
        b.nmmb && b.nmmb.participou ? 'Sim' : 'Não',
        b.lat || null,
        b.lng || null
      ];

      rowValues.forEach((val, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = val;

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBgHex }
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };

        if (cIdx === 2) {
          // Coluna Região Intermediária: destaque com a cor oficial da região
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF' + regPastel.badge } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if ((isGestao ? cIdx === 9 : cIdx === 5) && typeof val === 'number') {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F766E' } };
        } else if ((isGestao ? [26, 27] : [15, 16]).includes(cIdx)) {
          cell.numFmt = '0.000000';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if ((isGestao ? [1, 3, 6, 7, 8, 10, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25] : [1, 4, 6, 9, 10, 13, 14]).includes(cIdx)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    ws.columns.forEach((col, idx) => {
      let maxLen = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber >= 4) {
          const str = cell.value ? String(cell.value) : '';
          if (str.length > maxLen) maxLen = str.length;
        }
      });
      col.width = Math.min(Math.max(maxLen + 3, 12), 46);
    });

    ws.autoFilter = `A4:${lastColLetter}4`;

    // -----------------------------------------------------------------------
    // ABA 2: RESUMO EXECUTIVO POR REGIÃO INTERMEDIÁRIA
    // -----------------------------------------------------------------------
    const wsResumo = workbook.addWorksheet('Resumo por Região');
    const rColCount = isGestao ? 7 : 6;
    const rLastColLetter = colToLetter(rColCount);

    wsResumo.mergeCells(`A1:${rLastColLetter}1`);
    const rTitle = wsResumo.getCell('A1');
    rTitle.value = 'RESUMO EXECUTIVO POR REGIÃO INTERMEDIÁRIA (IBGE) - MINAS GERAIS';
    rTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    rTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    rTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wsResumo.getRow(1).height = 26;

    const rHeaders = isGestao ? [
      'Região Intermediária',
      'Total Bibliotecas',
      'Públicas Municipais',
      'Públicas Estaduais',
      'Comunitárias',
      'Total Livros PNLD+ Distribuídos',
      'Com Ações do Sistema'
    ] : [
      'Região Intermediária',
      'Total Bibliotecas Ativas',
      'Públicas Municipais',
      'Públicas Estaduais',
      'Comunitárias',
      'Total Livros PNLD+ Distribuídos'
    ];

    const rHeaderRow = wsResumo.getRow(3);
    rHeaderRow.height = 24;
    rHeaders.forEach((h, idx) => {
      const cell = rHeaderRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF64748B' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF64748B' } },
        right: { style: 'thin', color: { argb: 'FF64748B' } }
      };
    });

    const regGroups = {};
    const allRegs = Object.keys(HIGH_CONTRAST_REGIOES_CORES).filter(r => r !== 'Juíz de Fora').sort();
    allRegs.forEach(r => {
      regGroups[r] = { total: 0, publicas: 0, estaduais: 0, comunitarias: 0, pnldTotal: 0, comAcoes: 0 };
    });

    state.filteredLibraries.forEach(b => {
      const reg = b.regiao_intermediaria === 'Juíz de Fora' ? 'Juiz de Fora' : b.regiao_intermediaria;
      if (!regGroups[reg]) {
        regGroups[reg] = { total: 0, publicas: 0, estaduais: 0, comunitarias: 0, pnldTotal: 0, comAcoes: 0 };
      }
      const g = regGroups[reg];
      g.total++;
      if (b.tipo === 'Comunitária') g.comunitarias++;
      else if (b.tipo === 'Estadual') g.estaduais++;
      else g.publicas++;

      if (b.quantidade_livros) g.pnldTotal += Number(b.quantidade_livros) || 0;
      if (b.acoes_sistema_2026?.atendido || b.acoes_sistema_2025?.atendido || b.acoes_sistema_2024?.atendido || b.acoes_sistema_2023?.atendido) {
        g.comAcoes++;
      }
    });

    let currentRRow = 4;
    allRegs.forEach(r => {
      const g = regGroups[r];
      const row = wsResumo.getRow(currentRRow);
      row.height = 20;
      const regPastel = REGIOES_PASTEL_CORES[r] || { bg: 'FFFFFF', badge: '1D4ED8' };

      const vals = isGestao ?
        [r, g.total, g.publicas, g.estaduais, g.comunitarias, g.pnldTotal, g.comAcoes] :
        [r, g.total, g.publicas, g.estaduais, g.comunitarias, g.pnldTotal];

      vals.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + regPastel.bg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
        if (cIdx === 0) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF' + regPastel.badge } };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '#,##0';
        }
      });
      currentRRow++;
    });

    // Linha Total Geral
    const totRow = wsResumo.getRow(currentRRow);
    totRow.height = 22;
    totRow.getCell(1).value = 'TOTAL GERAL';
    for (let c = 2; c <= rColCount; c++) {
      const cLet = colToLetter(c);
      totRow.getCell(c).value = { formula: `SUM(${cLet}4:${cLet}${currentRRow - 1})` };
    }

    for (let c = 1; c <= rColCount; c++) {
      const cell = totRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
      if (c > 1) cell.numFmt = '#,##0';
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF38BDF8' } },
        bottom: { style: 'medium', color: { argb: 'FF38BDF8' } }
      };
    }

    wsResumo.columns = isGestao ?
      [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 28 }, { width: 22 }] :
      [{ width: 28 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 28 }];

    // Download do arquivo .xlsx
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filePrefix = isGestao ? 'bibliotecas_mg_gestao' : 'bibliotecas_mg';
    link.setAttribute('download', `${filePrefix}_${getExportTimestamp()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Exportação Diagnóstico Territorial (853 Municípios) em Excel (.xlsx)
  // =========================================================================
  async function exportDiagnosticoToExcel() {
    if (!window.ExcelJS) {
      alert('Biblioteca ExcelJS não disponível. Por favor, utilize a exportação em CSV.');
      return;
    }

    if (!state.geoJsonData || !state.geoJsonData.features || state.geoJsonData.features.length === 0) {
      alert('Dados territoriais dos municípios de MG não carregados.');
      return;
    }

    const cleanVal = (val) => String(val || '').replace(/[\r\n]+/g, ' ').trim();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SEBPC/MG - Sistema Estadual de Bibliotecas Públicas e Comunitárias';
    workbook.created = new Date();

    const situacaoLabels = {
      'com_publica': 'Ativa (Com Biblioteca Pública Municipal/Estadual)',
      'fechada_reforma': 'Inativa (Biblioteca Pública Fechada ou em Reforma)',
      'declarado_sem_biblioteca': 'Inativa (Declarado pelo Município sem biblioteca)',
      'sem_informacao_4_anos': 'Inativa (Sem informação atualizada)',
      'sem_registro_historico': 'Inativa (Sem informação atualizada)',
      'apenas_comunitaria': 'Apenas Biblioteca Comunitária (Sem Pública)'
    };

    const bibsByIbge = {};
    const closedByIbge = {};
    state.allLibraries.forEach(b => {
      const mid = String(b.codigo_ibge);
      if (!bibsByIbge[mid]) bibsByIbge[mid] = [];
      bibsByIbge[mid].push(b);
    });
    state.closedLibraries.forEach(b => {
      const mid = String(b.codigo_ibge);
      closedByIbge[mid] = b;
    });

    const sortedFeatures = [...state.geoJsonData.features].sort((a, b) => {
      return (a.properties.name || '').localeCompare(b.properties.name || '', 'pt-BR');
    });

    // -----------------------------------------------------------------------
    // ABA 1: DIAGNÓSTICO DOS 853 MUNICÍPIOS
    // -----------------------------------------------------------------------
    const ws = workbook.addWorksheet('Diagnóstico 853 Municípios', {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
    });

    ws.mergeCells('A1:U1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'DIAGNÓSTICO TERRITORIAL DAS BIBLIOTECAS PÚBLICAS - 853 MUNICÍPIOS DE MINAS GERAIS';
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:U2');
    const subtitleCell = ws.getCell('A2');
    subtitleCell.value = `Panorama Cartográfico Oficial dos 853 Municípios • Censo Demográfico IBGE 2022 • Emissão: ${new Date().toLocaleDateString('pt-BR')} • SEBPC/MG`;
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    subtitleCell.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FFE2E8F0' } };
    subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    ws.getRow(3).height = 6;

    const headers = [
      'Código IBGE', 'Município', 'Região Intermediária', 'População (Censo 2022)',
      'Possui Biblioteca Pública Ativa?', 'Situação Cadastral Detalhada', 'Status Cultural',
      'Polo Rede Integra Geraes', 'Total Bibliotecas Ativas', 'Públicas', 'Comunitárias',
      'Nomes dos Equipamentos Culturais', 'Responsável Principal', 'Telefone', 'E-mail',
      'Logradouro / Endereço', 'Bairro', 'CEP', 'Ações Sistema 2026', 'Ações Sistema 2025', 'Certificação DAC'
    ];

    const headerRow = ws.getRow(4);
    headerRow.height = 28;
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF475569' } },
        right: { style: 'thin', color: { argb: 'FF475569' } }
      };
    });

    sortedFeatures.forEach((f, rIdx) => {
      const rowNum = rIdx + 5;
      const row = ws.getRow(rowNum);
      row.height = 20;

      const p = f.properties || {};
      const mid = String(p.id);
      const activeList = bibsByIbge[mid] || [];
      const primaryLib = activeList[0] || closedByIbge[mid] || {};
      const hasPublica = !!p.tem_biblioteca_publica;
      const situacaoCode = p.situacao_cadastral || (hasPublica ? 'com_publica' : 'sem_registro_historico');
      const situacaoExtenso = situacaoLabels[situacaoCode] || situacaoCode;

      let rowBgHex = 'FFFFFFFF';
      let statusTextColor = 'FF1E293B';

      if (hasPublica || situacaoCode === 'com_publica') {
        rowBgHex = 'FFECFDF5'; // Verde suave
        statusTextColor = 'FF065F46';
      } else if (situacaoCode === 'fechada_reforma' || situacaoCode === 'declarado_sem_biblioteca') {
        rowBgHex = 'FFFEF2F2'; // Vermelho suave
        statusTextColor = 'FF991B1B';
      } else if (situacaoCode === 'sem_informacao_4_anos' || situacaoCode === 'sem_registro_historico') {
        rowBgHex = 'FFFEFCE8'; // Amarelo suave
        statusTextColor = 'FF854D0E';
      } else if (situacaoCode === 'apenas_comunitaria') {
        rowBgHex = 'FFFAF5FF'; // Lilás suave
        statusTextColor = 'FF6B21A8';
      }

      const rowValues = [
        cleanVal(mid),
        cleanVal(p.name),
        cleanVal(p.regiao_intermediaria),
        p.populacao_2022 ? Number(p.populacao_2022) : 0,
        hasPublica ? 'Sim' : 'Não',
        cleanVal(situacaoExtenso),
        hasPublica ? 'Ativa' : 'Inativa',
        p.tem_polo_rede_integra ? 'Sim' : 'Não',
        p.total_bibliotecas || activeList.length,
        p.total_bibliotecas_publicas || (hasPublica ? activeList.filter(x => x.tipo !== 'Comunitária').length : 0),
        p.total_bibliotecas_comunitarias || activeList.filter(x => x.tipo === 'Comunitária').length,
        cleanVal(p.nomes_bibliotecas && p.nomes_bibliotecas.length > 0 ? p.nomes_bibliotecas.join(' | ') : (primaryLib.nome || '')),
        cleanVal(primaryLib.responsavel),
        cleanVal(primaryLib.telefone),
        cleanVal(primaryLib.email),
        cleanVal(primaryLib.endereco),
        cleanVal(primaryLib.bairro),
        cleanVal(primaryLib.cep),
        p.tem_acoes_2026 ? 'Sim' : 'Não',
        p.tem_acoes_2025 || p.tem_acoes_sistema_2025 ? 'Sim' : 'Não',
        p.tem_dac ? 'Sim' : 'Não'
      ];

      rowValues.forEach((val, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = val;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgHex } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };

        if (cIdx === 3 && typeof val === 'number') {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        } else if (cIdx === 4 || cIdx === 6) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: statusTextColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if ([0, 7, 8, 9, 10, 13, 17, 18, 19, 20].includes(cIdx)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      });
    });

    ws.columns.forEach((col, idx) => {
      let maxLen = headers[idx] ? headers[idx].length : 10;
      col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber >= 4) {
          const str = cell.value ? String(cell.value) : '';
          if (str.length > maxLen) maxLen = str.length;
        }
      });
      col.width = Math.min(Math.max(maxLen + 3, 12), 48);
    });

    ws.autoFilter = 'A4:U4';

    // -----------------------------------------------------------------------
    // ABA 2: QUADRO SÍNTESE ESTADUAL
    // -----------------------------------------------------------------------
    const wsQuadro = workbook.addWorksheet('Quadro Síntese Estadual');
    wsQuadro.mergeCells('A1:C1');
    const qTitle = wsQuadro.getCell('A1');
    qTitle.value = 'INDICADORES CONSOLIDADOS DO ESTADO DE MINAS GERAIS';
    qTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    qTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    qTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wsQuadro.getRow(1).height = 26;

    const s = state.statistics || {};
    const munComPub = s.municipios_com_biblioteca_publica || 448;
    const munSemPub = s.municipios_sem_biblioteca_publica || 405;
    const cobPct = s.cobertura_publica_percentual || 52.52;
    const popComPub = s.populacao_com_publica || 17140903;
    const popCobPct = s.cobertura_populacional_percentual || 83.45;
    const totEquip = s.total_equipamentos_ativos || 557;
    const totPub = s.total_bibliotecas_publicas || 503;
    const totMunPub = (s.total_por_tipo && s.total_por_tipo['Pública Municipal']) || 502;
    const totCom = s.total_bibliotecas_comunitarias || (s.total_por_tipo && s.total_por_tipo['Comunitária']) || 54;
    const totPnld = s.total_com_livros_pnld || 229;
    const totPolos = s.total_polos_rede_integra_geraes || 24;

    const statsData = [
      ['Total de Municípios de Minas Gerais', 853, '100% da malha territorial'],
      ['Municípios com Biblioteca Pública Ativa', munComPub, `${cobPct}% de cobertura territorial`],
      ['Municípios sem Biblioteca Pública Ativa (Desassistidos)', munSemPub, `${(100 - cobPct).toFixed(1)}% com vazio ou pendência`],
      ['População Residente com Acesso a Biblioteca Pública', popComPub, `${popCobPct}% dos habitantes (Censo 2022)`],
      ['População Total do Estado de Minas Gerais', 20539989, 'Censo IBGE 2022 oficial'],
      ['Total de Equipamentos Culturais Ativos', totEquip, `${totPub} públicas (${totMunPub} municipais + 1 estadual) e ${totCom} comunitárias`],
      ['Bibliotecas Atendidas com Acervo PNLD+', totPnld, 'Sincronizado com Programa Nacional'],
      ['Bibliotecas-Polo da Rede Integra Geraes', totPolos, 'Polos regionais de capacitação']
    ];

    statsData.forEach((row, idx) => {
      const rNum = idx + 3;
      const wsR = wsQuadro.getRow(rNum);
      wsR.height = 22;
      wsR.getCell(1).value = row[0];
      wsR.getCell(2).value = row[1];
      wsR.getCell(3).value = row[2];

      wsR.getCell(1).font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
      wsR.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      wsR.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

      wsR.getCell(2).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0284C7' } };
      wsR.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
      wsR.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
      if (typeof row[1] === 'number') wsR.getCell(2).numFmt = '#,##0';

      wsR.getCell(3).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
      wsR.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };

      for (let c = 1; c <= 3; c++) {
        wsR.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      }
    });

    wsQuadro.columns = [{ width: 45 }, { width: 18 }, { width: 40 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `diagnostico_territorial_853_municipios_mg_${getExportTimestamp()}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  window.exportFilteredToCSV = exportFilteredToCSV;
  window.exportFilteredToExcel = exportFilteredToExcel;
  window.exportDiagnosticoTerritorial853 = exportDiagnosticoTerritorial853;
  window.exportDiagnosticoToExcel = exportDiagnosticoToExcel;

  // =========================================================================
  // Gerenciamento da Chave de API Google Maps
  // =========================================================================
  function showApiKeyBanner(visible) {
    const banner = document.getElementById('map-api-banner');
    if (banner) {
      banner.style.display = visible ? 'flex' : 'none';
    }
  }

  function setupApiKeyModal() {
    const inputKey = document.getElementById('input-api-key');
    const btnSave = document.getElementById('btn-save-api-key');
    const savedKey = localStorage.getItem(STORAGE_KEY_API_KEY);

    if (inputKey && savedKey) {
      inputKey.value = savedKey;
    }

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const val = inputKey.value.trim();
        if (val) {
          localStorage.setItem(STORAGE_KEY_API_KEY, val);
          alert('Chave de API salva com sucesso! A página será recarregada para carregar o Google Maps.');
          window.location.reload();
        } else {
          localStorage.removeItem(STORAGE_KEY_API_KEY);
          alert('Chave removida. A página será recarregada.');
          window.location.reload();
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isCellPhone(phoneStr) {
    if (!phoneStr) return false;
    const clean = phoneStr.trim();
    if (/(cel|celular|whats|whatsapp|zap|móvel|movel)/i.test(clean)) return true;
    const digits = clean.replace(/\D/g, '');
    if (digits.startsWith('0800') || digits.startsWith('0300')) return false;
    const d = digits.replace(/^55/, '').replace(/^0/, '');
    if (d.length === 11 && d[2] === '9') return true;
    if (d.length === 10 && d[2] === '9') return true;
    if (d.length === 9 && d[0] === '9') return true;
    if (d.length === 8 && d[0] === '9') return true;
    return false;
  }

  function formatFixedPhoneOnly(phoneStr) {
    if (!phoneStr) return '';
    const parts = phoneStr.split(/[\/;|]|\s+e\s+/).map(p => p.trim()).filter(Boolean);
    const kept = parts.filter(p => !isCellPhone(p));
    return kept.join(' / ').trim();
  }

  // =========================================================================
  // Configuração dos Event Listeners
  // =========================================================================
  
  // =========================================================================
  // Tooltip Harmonizado da Plataforma (SEBPC/MG)
  // =========================================================================
  function initHarmonizedTooltips() {
    let tooltipEl = document.getElementById('sebpc-harmonized-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'sebpc-harmonized-tooltip';
      tooltipEl.className = 'harmonized-tooltip';
      document.body.appendChild(tooltipEl);
    }

    let activeTarget = null;
    let hideTimeout = null;

    function showTooltip(el) {
      const text = el.getAttribute('data-tooltip') || el.dataset.tooltip;
      if (!text) return;

      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }

      activeTarget = el;
      const title = el.getAttribute('data-tooltip-title') || '';

      tooltipEl.innerHTML = `
        ${title ? `<div class="tooltip-heading">${escapeHtml(title)}</div>` : ''}
        <div class="tooltip-body">${escapeHtml(text)}</div>
      `;

      tooltipEl.classList.remove('pos-above', 'pos-below', 'visible');
      tooltipEl.style.display = 'block';

      const rect = el.getBoundingClientRect();
      const tipWidth = tooltipEl.offsetWidth;
      const tipHeight = tooltipEl.offsetHeight;

      // Prefer positioning above the element
      let top = rect.top - tipHeight - 10;
      let posClass = 'pos-above';

      if (top < 10) {
        // If not enough room above, place below
        top = rect.bottom + 10;
        posClass = 'pos-below';
      }

      let left = rect.left + (rect.width / 2) - (tipWidth / 2);
      let arrowLeftPercent = 50;

      // Bound to viewport horizontally
      if (left < 12) {
        left = 12;
        arrowLeftPercent = Math.max(15, Math.min(85, ((rect.left + rect.width / 2 - left) / tipWidth) * 100));
      } else if (left + tipWidth > window.innerWidth - 12) {
        left = window.innerWidth - tipWidth - 12;
        arrowLeftPercent = Math.max(15, Math.min(85, ((rect.left + rect.width / 2 - left) / tipWidth) * 100));
      }

      tooltipEl.style.setProperty('--arrow-left', `${arrowLeftPercent}%`);
      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.classList.add(posClass);

      requestAnimationFrame(() => {
        tooltipEl.classList.add('visible');
      });
    }

    function hideTooltip() {
      activeTarget = null;
      tooltipEl.classList.remove('visible');
      hideTimeout = setTimeout(() => {
        if (!activeTarget) {
          tooltipEl.style.display = 'none';
        }
      }, 150);
    }

    document.body.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target) {
        showTooltip(target);
      }
    });

    document.body.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && target === activeTarget) {
        if (e.relatedTarget && target.contains(e.relatedTarget)) return;
        hideTooltip();
      }
    });

    // Capture all scrolls (window, modal body, sidebar) to avoid detached tooltips
    document.addEventListener('scroll', () => {
      if (activeTarget) hideTooltip();
    }, { capture: true, passive: true });
  }

  function setupEventListeners() {
    initHarmonizedTooltips();
    // Seletor de Mapa Base (OSM / Voyager / Positron)
    const baseMapSelect = document.getElementById('select-base-map');
    if (baseMapSelect) {
      baseMapSelect.value = state.currentBaseMap || 'esri';
      baseMapSelect.addEventListener('change', (e) => {
        setBaseMap(e.target.value);
      });
    }


    // Busca textual com debounce
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');
    let debounceTimer;

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const val = e.target.value;
        if (btnClearSearch) {
          btnClearSearch.classList.toggle('visible', val.length > 0);
        }
        debounceTimer = setTimeout(() => {
          state.filters.searchTerm = val;
          applyFilters();
        }, 200);
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        btnClearSearch.classList.remove('visible');
        state.filters.searchTerm = '';
        recenterToStateView();
        applyFilters();
      });
    }

    // Controle de Recolhimento dos Filtros na Sidebar (Silvania UX)
    const btnToggleFilters = document.getElementById('btn-toggle-filters');
    const filtersCollapsibleBody = document.getElementById('filters-collapsible-body');
    const toggleFiltersIcon = document.getElementById('toggle-filters-icon');
    if (btnToggleFilters && filtersCollapsibleBody) {
      btnToggleFilters.addEventListener('click', () => {
        const isCollapsed = filtersCollapsibleBody.classList.toggle('collapsed');
        if (toggleFiltersIcon) {
          toggleFiltersIcon.textContent = isCollapsed ? '▸' : '▾';
        }
      });
    }

    // Dropdown Tipo de Biblioteca e Controles de Fechadas / Sem Biblioteca
    const typeSelect = document.getElementById('filter-type');
    const onlyClosedCheck = document.getElementById('check-only-closed');
    const subfiltersClosed = document.getElementById('subfilters-closed');

    function updateActivePill(mode) {
      if (!subfiltersClosed) return;
      const pills = subfiltersClosed.querySelectorAll('.btn-subfilter-pill');
      pills.forEach(p => {
        if (p.getAttribute('data-submode') === mode) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        state.filters.type = val;
        state.filters.onlyClosed = false;
        if (onlyClosedCheck) onlyClosedCheck.checked = false;
        if (subfiltersClosed) subfiltersClosed.style.display = 'none';
        applyFilters();
      });
    }

    // Dropdown Região Intermediária
    const regionSelect = document.getElementById('filter-region');
    if (regionSelect) {
      regionSelect.addEventListener('change', (e) => {
        state.filters.region = e.target.value;
        applyFilters();
      });
    }

    // Select Status BiblioBR (Seleção única exclusiva dos 7 status da coluna N)
    const selectBiblioStatus = document.getElementById('select-status-bibliobr');
    if (selectBiblioStatus) {
      selectBiblioStatus.addEventListener('change', (e) => {
        state.filters.bibliobrStatus = e.target.value;
        applyFilters();
      });
    }

    // Checkbox BiblioBR (Legado / Retrocompatibilidade)
    const biblioCheck = document.getElementById('check-bibliobr-only');
    if (biblioCheck) {
      biblioCheck.addEventListener('change', (e) => {
        state.filters.bibliobrOnly = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox PNLD+
    const pnldCheck = document.getElementById('check-pnld-only');
    if (pnldCheck) {
      pnldCheck.addEventListener('change', (e) => {
        state.filters.pnldOnly = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Noite Mineira (NMMB) e Subfiltro de Edições
    const nmmbCheck = document.getElementById('check-nmmb-only');
    const subfiltersNmmb = document.getElementById('subfilters-nmmb');
    const nmmbEditionSelect = document.getElementById('select-nmmb-edition');
    if (nmmbCheck) {
      nmmbCheck.addEventListener('change', (e) => {
        state.filters.nmmbOnly = e.target.checked;
        if (subfiltersNmmb) {
          subfiltersNmmb.style.display = e.target.checked ? 'flex' : 'none';
        }
        if (!e.target.checked) {
          state.filters.nmmbEdition = 'all';
          if (nmmbEditionSelect) nmmbEditionSelect.value = 'all';
          if (subfiltersNmmb) {
            const pills = subfiltersNmmb.querySelectorAll('.btn-subfilter-pill-nmmb');
            pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === 'all'));
          }
        }
        applyFilters();
      });
    }

    if (nmmbEditionSelect) {
      nmmbEditionSelect.addEventListener('change', (e) => {
        state.filters.nmmbEdition = e.target.value;
        if (!state.filters.nmmbOnly && e.target.value !== 'all') {
          state.filters.nmmbOnly = true;
          if (nmmbCheck) nmmbCheck.checked = true;
          if (subfiltersNmmb) subfiltersNmmb.style.display = 'flex';
        }
        if (subfiltersNmmb) {
          const pills = subfiltersNmmb.querySelectorAll('.btn-subfilter-pill-nmmb');
          pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === e.target.value));
        }
        applyFilters();
      });
    }

    if (subfiltersNmmb) {
      const pills = subfiltersNmmb.querySelectorAll('.btn-subfilter-pill-nmmb');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          const ed = pill.getAttribute('data-ed') || 'all';
          state.filters.nmmbEdition = ed;
          if (nmmbEditionSelect) nmmbEditionSelect.value = ed;
          pills.forEach(p => p.classList.toggle('active', p === pill));
          if (!state.filters.nmmbOnly) {
            state.filters.nmmbOnly = true;
            if (nmmbCheck) nmmbCheck.checked = true;
            subfiltersNmmb.style.display = 'flex';
          }
          applyFilters();
        });
      });
    }

    // Checkbox Declaração de Acervos Culturais (DAC)
    const dacCheck = document.getElementById('check-dac-only');
    if (dacCheck) {
      dacCheck.addEventListener('change', (e) => {
        state.filters.dacOnly = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Ações do Sistema Estadual 2026
    const sistemaCheck = document.getElementById('check-sistema-acoes');
    if (sistemaCheck) {
      sistemaCheck.addEventListener('change', (e) => {
        state.filters.sistemaAcoesOnly = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Ações do Sistema Estadual 2025
    const sistema2025Check = document.getElementById('check-sistema-acoes-2025');
    if (sistema2025Check) {
      sistema2025Check.addEventListener('change', (e) => {
        state.filters.sistemaAcoes2025Only = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Ações do Sistema Estadual 2024
    const sistema2024Check = document.getElementById('check-sistema-acoes-2024');
    if (sistema2024Check) {
      sistema2024Check.addEventListener('change', (e) => {
        state.filters.sistemaAcoes2024Only = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Ações do Sistema Estadual 2023
    const sistema2023Check = document.getElementById('check-sistema-acoes-2023');
    if (sistema2023Check) {
      sistema2023Check.addEventListener('change', (e) => {
        state.filters.sistemaAcoes2023Only = e.target.checked;
        applyFilters();
      });
    }

    // Checkbox Semana Estadual de Incentivo à Literatura (SEIL) e Subfiltro de Edições
    const seilCheck = document.getElementById('check-seil-only');
    const subfiltersSeil = document.getElementById('subfilters-seil');
    const seilEditionSelect = document.getElementById('select-seil-edition');
    if (seilCheck) {
      seilCheck.addEventListener('change', (e) => {
        state.filters.seilOnly = e.target.checked;
        if (subfiltersSeil) {
          subfiltersSeil.style.display = e.target.checked ? 'flex' : 'none';
        }
        if (!e.target.checked) {
          state.filters.seilEdition = 'all';
          if (seilEditionSelect) seilEditionSelect.value = 'all';
          if (subfiltersSeil) {
            const pills = subfiltersSeil.querySelectorAll('.btn-subfilter-pill-seil');
            pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === 'all'));
          }
        }
        applyFilters();
      });
    }

    if (seilEditionSelect) {
      seilEditionSelect.addEventListener('change', (e) => {
        state.filters.seilEdition = e.target.value;
        if (!state.filters.seilOnly && e.target.value !== 'all') {
          state.filters.seilOnly = true;
          if (seilCheck) seilCheck.checked = true;
          if (subfiltersSeil) subfiltersSeil.style.display = 'flex';
        }
        if (subfiltersSeil) {
          const pills = subfiltersSeil.querySelectorAll('.btn-subfilter-pill-seil');
          pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === e.target.value));
        }
        applyFilters();
      });
    }

    if (subfiltersSeil) {
      const pills = subfiltersSeil.querySelectorAll('.btn-subfilter-pill-seil');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          const ed = pill.getAttribute('data-ed') || 'all';
          state.filters.seilEdition = ed;
          if (seilEditionSelect) seilEditionSelect.value = ed;
          pills.forEach(p => p.classList.toggle('active', p === pill));
          if (!state.filters.seilOnly) {
            state.filters.seilOnly = true;
            if (seilCheck) seilCheck.checked = true;
            subfiltersSeil.style.display = 'flex';
          }
          applyFilters();
        });
      });
    }

    // Checkbox Exibir Apenas Fechadas / Sem Biblioteca
    if (onlyClosedCheck) {
      onlyClosedCheck.addEventListener('change', (e) => {
        state.filters.onlyClosed = e.target.checked;
        if (e.target.checked) {
          if (subfiltersClosed) subfiltersClosed.style.display = 'flex';
          state.filters.type = 'all';
          if (typeSelect) typeSelect.value = 'all';
        } else {
          if (subfiltersClosed) subfiltersClosed.style.display = 'none';
        }
        applyFilters();
      });
    }

    // Botões Pílula de Sub-Filtro (Todas, Fechadas, Sem Biblioteca, MG Sem Ativa, > 20k hab.)
    if (subfiltersClosed) {
      const pills = subfiltersClosed.querySelectorAll('.btn-subfilter-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          const submode = pill.getAttribute('data-submode');
          state.filters.closedSubMode = submode;
          state.filters.onlyClosed = true;
          if (onlyClosedCheck) onlyClosedCheck.checked = true;
          updateActivePill(submode);

          const sortSelect = document.getElementById('select-sort-order');
          if (submode === 'maiores_20k') {
            state.sortOrder = 'pop_desc';
            if (sortSelect) sortSelect.value = 'pop_desc';
          }

          applyFilters();
        });
      });
    }

    // Checkbox Rede Integra Geraes (24 Polos)
    const redeIntegraCheck = document.getElementById('check-rede-integra');
    if (redeIntegraCheck) {
      redeIntegraCheck.addEventListener('change', (e) => {
        state.filters.redeIntegraOnly = e.target.checked;
        applyFilters();
      });
    }

    // Botão Desmarcar Seleção
    const btnClearSel = document.getElementById('btn-clear-selection');
    if (btnClearSel) {
      btnClearSel.addEventListener('click', deselectCurrentLibrary);
    }

    // Botão Limpar Filtros
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        state.filters.searchTerm = '';
        state.filters.type = 'all';
        state.filters.region = 'all';
        state.filters.municipality = 'all';
        state.filters.bibliobrStatus = 'all';
        state.filters.bibliobrOnly = false;
        state.filters.pnldOnly = false;
        state.filters.nmmbOnly = false;
        state.filters.nmmbEdition = 'all';
        state.filters.dacOnly = false;
        state.filters.sistemaAcoesOnly = false;
        state.filters.sistemaAcoes2025Only = false;
        state.filters.sistemaAcoes2024Only = false;
        state.filters.sistemaAcoes2023Only = false;
        state.filters.seilOnly = false;
        state.filters.seilEdition = 'all';
        state.filters.redeIntegraOnly = false;
        state.filters.onlyClosed = false;
        state.filters.closedSubMode = 'all';

        if (searchInput) searchInput.value = '';
        if (btnClearSearch) btnClearSearch.classList.remove('visible');
        if (regionSelect) regionSelect.value = 'all';
        if (typeSelect) typeSelect.value = 'all';
        const selectBiblioStatusEl = document.getElementById('select-status-bibliobr');
        if (selectBiblioStatusEl) selectBiblioStatusEl.value = 'all';
        if (biblioCheck) biblioCheck.checked = false;
        if (pnldCheck) pnldCheck.checked = false;
        if (nmmbCheck) nmmbCheck.checked = false;
        if (subfiltersNmmb) subfiltersNmmb.style.display = 'none';
        if (nmmbEditionSelect) nmmbEditionSelect.value = 'all';
        if (subfiltersNmmb) {
          const pills = subfiltersNmmb.querySelectorAll('.btn-subfilter-pill-nmmb');
          pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === 'all'));
        }
        if (dacCheck) dacCheck.checked = false;
        if (sistemaCheck) sistemaCheck.checked = false;
        if (sistema2025Check) sistema2025Check.checked = false;
        if (sistema2024Check) sistema2024Check.checked = false;
        if (sistema2023Check) sistema2023Check.checked = false;
        if (seilCheck) seilCheck.checked = false;
        if (subfiltersSeil) subfiltersSeil.style.display = 'none';
        if (seilEditionSelect) seilEditionSelect.value = 'all';
        if (subfiltersSeil) {
          const pills = subfiltersSeil.querySelectorAll('.btn-subfilter-pill-seil');
          pills.forEach(p => p.classList.toggle('active', p.getAttribute('data-ed') === 'all'));
        }
        if (onlyClosedCheck) onlyClosedCheck.checked = false;
        if (redeIntegraCheck) redeIntegraCheck.checked = false;
        if (subfiltersClosed) subfiltersClosed.style.display = 'none';
        updateActivePill('all');

        state.sortOrder = 'alpha';
        const sortSelect = document.getElementById('select-sort-order');
        if (sortSelect) sortSelect.value = 'alpha';

        recenterToStateView();
        applyFilters();
      });
    }

    // Seletor de Ordenação (A-Z, Maior População, Menor População)
    const selectSortOrder = document.getElementById('select-sort-order');
    if (selectSortOrder) {
      selectSortOrder.addEventListener('change', (e) => {
        state.sortOrder = e.target.value;
        applyFilters();
      });
    }

    // Botão Recentralizar Minas Gerais (Visão Geral de MG)
    const btnRecenter = document.getElementById('btn-recenter-map');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', recenterToStateView);
    }

    // Botão Indicador Flutuante Voltar ao Mapa Geral (Silvania UX)
    const btnZoomReset = document.getElementById('btn-zoom-reset');
    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', recenterToStateView);
    }
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    if (btnToggleSidebar && sidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    // Abrir/Fechar Painel de Camadas e Legendas
    const btnToggleLayers = document.getElementById('btn-toggle-layers-panel');
    const layersPanel = document.getElementById('map-layers-panel');
    if (btnToggleLayers && layersPanel) {
      btnToggleLayers.addEventListener('click', () => {
        const isOpen = layersPanel.classList.toggle('open');
        btnToggleLayers.classList.toggle('open', isOpen);
      });
    }

    // Switches de Camadas
    const layerMarkersCheck = document.getElementById('layer-markers');
    if (layerMarkersCheck) {
      layerMarkersCheck.addEventListener('change', (e) => {
        state.layers.markers = e.target.checked;
        updateMapMarkers();
      });
    }

    const layerLimitsCheck = document.getElementById('layer-limits');
    if (layerLimitsCheck) {
      layerLimitsCheck.addEventListener('change', (e) => {
        state.layers.municipalLimits = e.target.checked;
        applyGeoJsonStyles();
      });
    }

    const layerRegionalCheck = document.getElementById('layer-regional');
    const legendRegionsBlock = document.getElementById('legend-regions-block');
    if (layerRegionalCheck) {
      layerRegionalCheck.addEventListener('change', (e) => {
        state.layers.regionalDivision = e.target.checked;
        applyGeoJsonStyles();
        if (legendRegionsBlock) {
          legendRegionsBlock.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }

    const layerCoverageCheck = document.getElementById('layer-coverage');
    const legendCoverageBlock = document.getElementById('legend-coverage-block');
    if (layerCoverageCheck) {
      layerCoverageCheck.addEventListener('change', (e) => {
        state.layers.coverageChoropleth = e.target.checked;
        applyGeoJsonStyles();
        if (legendCoverageBlock) {
          legendCoverageBlock.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }

    const layerPopBubblesCheck = document.getElementById('layer-pop-bubbles');
    const legendPopBlock = document.getElementById('legend-pop-block');
    if (layerPopBubblesCheck) {
      layerPopBubblesCheck.addEventListener('change', (e) => {
        state.layers.popBubbles = e.target.checked;
        updatePopBubbles();
        if (legendPopBlock) {
          legendPopBlock.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }


    // Controle do Menu Suspenso "Exportar"
    const exportDropdownWrapper = document.getElementById('export-dropdown-wrapper');
    const btnExportMenu = document.getElementById('btn-export-menu');
    const exportDropdownMenu = document.getElementById('export-dropdown-menu');

    function closeExportDropdown() {
      if (exportDropdownWrapper) exportDropdownWrapper.classList.remove('open');
      if (exportDropdownMenu) exportDropdownMenu.classList.remove('active');
      if (btnExportMenu) btnExportMenu.setAttribute('aria-expanded', 'false');
    }

    if (btnExportMenu && exportDropdownMenu) {
      btnExportMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = exportDropdownWrapper.classList.toggle('open');
        exportDropdownMenu.classList.toggle('active', isOpen);
        btnExportMenu.setAttribute('aria-expanded', String(isOpen));
      });

      // Fechar dropdown ao clicar fora
      document.addEventListener('click', (e) => {
        if (exportDropdownWrapper && !exportDropdownWrapper.contains(e.target)) {
          closeExportDropdown();
        }
      });
    }

    // 1. Exportação Excel Formatado (.xlsx) com Cores do Mapa
    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
      btnExportExcel.addEventListener('click', () => {
        closeExportDropdown();
        exportFilteredToExcel();
      });
    }

    // 2. Exportação CSV Filtrado (.csv)
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        closeExportDropdown();
        exportFilteredToCSV();
      });
    }

    // 3. Exportação Diagnóstico Territorial dos 853 Municípios em Excel (.xlsx)
    const btnExportExcelDiag = document.getElementById('btn-export-excel-diag');
    if (btnExportExcelDiag) {
      btnExportExcelDiag.addEventListener('click', () => {
        closeExportDropdown();
        exportDiagnosticoToExcel();
      });
    }

    // 4. Exportação Diagnóstico Territorial dos 853 Municípios em CSV (.csv)
    const btnExportDiag = document.getElementById('btn-export-diagnostico');
    if (btnExportDiag) {
      btnExportDiag.addEventListener('click', () => {
        closeExportDropdown();
        exportDiagnosticoTerritorial853();
      });
    }

    // Sincronização em Tempo Real com o Google Drive
    const btnSync = document.getElementById('btn-sync-drive');
    if (btnSync) {
      btnSync.addEventListener('click', async () => {
        btnSync.disabled = true;
        btnSync.style.opacity = '0.7';
        btnSync.innerHTML = '<span id="sync-icon" class="sync-icon-spin" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path></svg></span> <span>Sincronizando...</span>';
        try {
          const resp = await fetch('/api/sync-drive', { method: 'POST' });
          const res = await resp.json();
          if (res.status === 'success') {
            alert(`✅ SINCRONIZAÇÃO COM O GOOGLE DRIVE CONCLUÍDA!\n\nTodas as planilhas online foram baixadas e processadas em tempo real.\n\nResultados Oficiais:\n• Municípios COM Biblioteca Pública: ${res.estatisticas.municipios_com_biblioteca_publica} (${res.estatisticas.total_bibliotecas_publicas} bibliotecas)\n• Municípios SEM Biblioteca Pública: ${res.estatisticas.municipios_sem_biblioteca_publica}\n• Cobertura Estadual: ${res.estatisticas.cobertura_publica_percentual}%\n• Fechamento Total: ${res.estatisticas.total_municipios_mg} municípios de Minas Gerais.`);
            window.location.reload();
          } else {
            alert(`⚠️ Aviso ao sincronizar com Google Drive:\n${res.message || 'Erro desconhecido'}`);
          }
        } catch (e) {
          console.error('Erro na sincronização:', e);
          alert(`⚠️ Erro ao comunicar com a API Central (${window.SEBPC_API_URL || 'http://localhost:8090'}):\n${e.message || e}`);
        } finally {
          btnSync.disabled = false;
          btnSync.style.opacity = '1';
          btnSync.innerHTML = '<span id="sync-icon" class="sync-icon-box" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path></svg></span> <span>Sincronizar</span>';
        }
      });
    }

    // Clique no indicador 'Sem Pública' para filtrar no mapa
    const pillSemPub = document.getElementById('pill-sem-publica');
    if (pillSemPub) {
      pillSemPub.addEventListener('click', () => {
        const typeSelect = document.getElementById('filter-type');
        if (typeSelect) {
          typeSelect.value = 'fechadas_all';
          typeSelect.dispatchEvent(new Event('change'));
        }
      });
    }

    // Clique no indicador 'Estadual' para localizar e centralizar na Praça da Liberdade
    const pillEstadual = document.getElementById('pill-estadual');
    if (pillEstadual) {
      pillEstadual.addEventListener('click', () => {
        const estLib = state.allLibraries.find(b => b.tipo === 'Estadual');
        if (estLib) {
          selectAndCenterLibrary(estLib);
        } else {
          const typeSelect = document.getElementById('filter-type');
          if (typeSelect) {
            typeSelect.value = 'Estadual';
            typeSelect.dispatchEvent(new Event('change'));
          }
        }
      });
    }

    // Clique no indicador 'População' para exibir diagnóstico demográfico do Censo 2022
    const pillPop = document.getElementById('pill-populacao');
    if (pillPop) {
      pillPop.addEventListener('click', () => {
        openPopulacaoModal();
      });
    }

    // Modais
    document.querySelectorAll('.btn-modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('open');
        }
      });
    });

    const btnOpenApiKey = document.getElementById('btn-open-api-key');
    const apiKeyModal = document.getElementById('api-key-modal');
    if (btnOpenApiKey && apiKeyModal) {
      btnOpenApiKey.addEventListener('click', () => {
        apiKeyModal.classList.add('open');
      });
    }

    const btnOpenKeyFromBanner = document.getElementById('btn-banner-key');
    if (btnOpenKeyFromBanner && apiKeyModal) {
      btnOpenKeyFromBanner.addEventListener('click', () => {
        apiKeyModal.classList.add('open');
      });
    }
  }

  // =========================================================================
  // Inicialização Geral (Consumo 100% via API Central HTTP)
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.SEBPC_loadBootstrapData === 'function') {
      await window.SEBPC_loadBootstrapData('gestao');
    }
    initData();
    if (window.SEBPC_Dashboard && typeof window.SEBPC_Dashboard.init === 'function') {
      window.SEBPC_Dashboard.init();
    }
    setupEventListeners();
    initLeafletMap();
  });

})();
