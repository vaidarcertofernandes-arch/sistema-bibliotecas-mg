/**
 * Configuração, Autenticação HMAC e Cliente HTTP da API Central — Plataforma de Gestão (SEBPC/MG)
 * Suporta consumo via API Central local (00_API_e_Dados) e fallback estático de alta disponibilidade
 * com validação criptográfica (Web Crypto SHA-256) para GitHub Pages / hospedagem sem backend em nuvem.
 * Inclui persistência via Cookies + LocalStorage para manter o usuário conectado.
 */
(function () {
  'use strict';

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const DEFAULT_API_URL = isLocalHost ? 'http://localhost:8090' : '';
  window.SEBPC_API_URL = (window.SEBPC_API_URL || localStorage.getItem('sebpc_api_url') || DEFAULT_API_URL).replace(/\/+$/, '');

  const TOKEN_KEY = 'sebpc_auth_token';
  const EXP_KEY = 'sebpc_auth_exp';
  const AUTH_FLAG_KEY = 'sebpc_gestao_auth';
  const COOKIE_TTL_SEC = 7 * 24 * 3600; // 7 dias conectado

  let pendingAuthResolve = null;

  // Hashes autorizados para autenticação autônoma no frontend (ex: GitHub Pages)
  const STATIC_AUTH_HASHES = new Set([
    '8c071412cbcde9f184943b76a29b5ee7246794a778c1d9def33d920ec61706b1', // sebpc2026
    '5095233c5be4841586a4a2c53bd0a25e191a6ac826636e1cb39561de2e547fd2',
    '0d727cd2e7de9f357005aaafac6d7af10dea0b2ea808169a65c5d1e381a833fd',
    '66567bf3f60cc231a4ec86cb502b84e4ab2b8bce0bd3d492ad366bdce53a4091'
  ]);

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, maxAgeSec) {
    const expDate = new Date(Date.now() + maxAgeSec * 1000);
    const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAgeSec}; expires=${expDate.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  }

  async function sha256Hex(str) {
    if (!window.crypto || !window.crypto.subtle) {
      return str === 'sebpc2026' ? '8c071412cbcde9f184943b76a29b5ee7246794a778c1d9def33d920ec61706b1' : '';
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuf = await window.crypto.subtle.digest('SHA-256', data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getStoredToken() {
    const tok = getCookie(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(getCookie(EXP_KEY) || localStorage.getItem(EXP_KEY) || sessionStorage.getItem(EXP_KEY) || 0);
    if (!tok) return null;
    if (exp && Math.floor(Date.now() / 1000) > exp) {
      clearStoredToken();
      return null;
    }
    return tok;
  }

  function setStoredToken(token, expiresAt) {
    const nowSec = Math.floor(Date.now() / 1000);
    const finalExp = (expiresAt && expiresAt > nowSec) ? Math.max(expiresAt, nowSec + COOKIE_TTL_SEC) : (nowSec + COOKIE_TTL_SEC);
    const maxAge = Math.max(3600, finalExp - nowSec);

    setCookie(TOKEN_KEY, token, maxAge);
    setCookie(EXP_KEY, String(finalExp), maxAge);
    setCookie(AUTH_FLAG_KEY, 'true', maxAge);

    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EXP_KEY, String(finalExp));
      localStorage.setItem(AUTH_FLAG_KEY, 'true');
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(EXP_KEY, String(finalExp));
      sessionStorage.setItem(AUTH_FLAG_KEY, 'true');
    } catch (e) {
      // Ignora caso storage esteja restrito
    }
  }

  function clearStoredToken() {
    deleteCookie(TOKEN_KEY);
    deleteCookie(EXP_KEY);
    deleteCookie(AUTH_FLAG_KEY);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(EXP_KEY);
      sessionStorage.removeItem(AUTH_FLAG_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      localStorage.removeItem(AUTH_FLAG_KEY);
    } catch (e) {
      // Ignora
    }
  }

  window.toggleGestaoPasswordVisibility = function () {
    const input = document.getElementById('auth-gate-input');
    const btn = document.getElementById('auth-toggle-pwd');
    const eyeOpen = document.getElementById('auth-eye-open');
    const eyeClosed = document.getElementById('auth-eye-closed');
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    if (eyeOpen && eyeClosed) {
      eyeOpen.style.display = isPassword ? 'none' : 'block';
      eyeClosed.style.display = isPassword ? 'block' : 'none';
    }
    if (btn) {
      const label = isPassword ? 'Ocultar senha' : 'Mostrar senha';
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    }
    input.focus();
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const staticBase = '../00_API_e_Dados/data';

    if (typeof input === 'string') {
      if (input.startsWith('/api/')) {
        if (window.SEBPC_API_URL) {
          input = window.SEBPC_API_URL + input;
          urlStr = input;
        } else {
          // Mapeamento de rotas para fallback estático
          if (input.includes('/bibliotecas')) input = `${staticBase}/bibliotecas.json`;
          else if (input.includes('/municipios')) input = `${staticBase}/municipios_mg.json`;
          else if (input.includes('/estado')) input = `${staticBase}/estado_mg.json`;
          else if (input.includes('/mascara')) input = `${staticBase}/mascara_fora_mg.json`;
          else if (input.includes('/idhm')) input = `${staticBase}/idhm_municipios_mg.json`;
          else if (input.includes('/icms')) input = `${staticBase}/icms_patrimonio_cultural_2026.json`;
          else if (input.includes('/munic')) input = `${staticBase}/munic_cultura_mg.json`;
          urlStr = input;
        }
      } else if (input === 'data/idhm_municipios_mg.json') {
        input = window.SEBPC_API_URL ? `${window.SEBPC_API_URL}/api/gestao/idhm` : `${staticBase}/idhm_municipios_mg.json`;
        urlStr = input;
      } else if (input === 'data/icms_patrimonio_cultural_2026.json') {
        input = window.SEBPC_API_URL ? `${window.SEBPC_API_URL}/api/gestao/icms` : `${staticBase}/icms_patrimonio_cultural_2026.json`;
        urlStr = input;
      } else if (input === 'data/munic_cultura_mg.json') {
        input = window.SEBPC_API_URL ? `${window.SEBPC_API_URL}/api/gestao/munic` : `${staticBase}/munic_cultura_mg.json`;
        urlStr = input;
      }
    }

    const tok = getStoredToken();
    if (tok && window.SEBPC_API_URL && urlStr.startsWith(window.SEBPC_API_URL)) {
      init = Object.assign({}, init);
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${tok}`);
      }
      init.headers = headers;
    }

    return originalFetch(input, init).then((res) => {
      if (res.status === 401 && !urlStr.includes('/api/auth/login')) {
        clearStoredToken();
        showAuthOverlay();
      }
      return res;
    });
  };

  function ensureAuthOverlayDom() {
    let overlay = document.getElementById('auth-gate-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'auth-gate-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="background:#fff;color:#1e293b;max-width:420px;width:100%;border-radius:16px;padding:28px 24px;box-shadow:0 20px 50px rgba(0,0,0,0.35);text-align:center;font-family:system-ui,-apple-system,sans-serif;">
        <div style="margin-bottom:12px;">
          <svg viewBox="0 0 32 32" width="38" height="38" aria-hidden="true">
            <polygon points="16,3 30,28 2,28" fill="#b91c1c" />
          </svg>
        </div>
        <h2 style="margin:0 0 6px;font-size:1.25rem;color:#0f172a;">Área de Gestão Estratégica</h2>
        <p style="margin:0 0 18px;font-size:0.85rem;color:#64748b;">Sistema Estadual de Bibliotecas Públicas e Comunitárias de Minas Gerais (SEBPC/MG)</p>
        <form id="auth-gate-form" onsubmit="event.preventDefault(); window.checkGestaoAuth();">
          <label for="auth-gate-input" style="display:block;text-align:left;font-size:0.82rem;font-weight:600;margin-bottom:6px;color:#334155;">Senha de Acesso da Equipe:</label>
          <div class="auth-input-wrapper" style="position:relative;width:100%;margin-bottom:10px;">
            <input type="password" id="auth-gate-input" placeholder="Digite a senha institucional..." required autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px 42px 10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.95rem;" />
            <button type="button" id="auth-toggle-pwd" class="btn-toggle-pwd" onclick="window.toggleGestaoPasswordVisibility()" title="Mostrar senha" aria-label="Mostrar senha" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:#64748b;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
              <svg id="auth-eye-open" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <svg id="auth-eye-closed" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none;">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            </button>
          </div>
          <div id="auth-gate-error" style="display:none;color:#b91c1c;font-size:0.82rem;margin-bottom:10px;font-weight:600;">⚠️ Senha incorreta. Tente novamente.</div>
          <button type="submit" id="auth-gate-btn" style="width:100%;padding:11px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">Entrar na Plataforma de Gestão</button>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showAuthOverlay() {
    const overlay = ensureAuthOverlayDom();
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    const input = document.getElementById('auth-gate-input');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function hideAuthOverlay(immediate) {
    const overlay = document.getElementById('auth-gate-overlay');
    if (overlay) {
      if (immediate) {
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
      } else {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 200);
      }
    }
  }

  window.SEBPC_Auth = {
    getToken: getStoredToken,
    isAuthenticated: function () {
      return Boolean(getStoredToken());
    },
    login: async function (password) {
      const cleaned = String(password || '').trim().toLowerCase();
      
      // Tentativa 1: Validar via API Central se configurada
      if (window.SEBPC_API_URL) {
        try {
          const res = await originalFetch(`${window.SEBPC_API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: cleaned })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.status === 'ok' && data.token) {
            setStoredToken(data.token, data.expires_at);
            return { ok: true, token: data.token };
          }
          if (res.status === 401) {
            return { ok: false, message: data.message || 'Senha institucional incorreta.' };
          }
        } catch (apiErr) {
          console.warn('[SEBPC Auth] Falha ao contatar API de login, tentando validação local segura...', apiErr);
        }
      }

      // Tentativa 2: Validação segura estática (GitHub Pages / Standalone)
      const hash = await sha256Hex(cleaned);
      if (STATIC_AUTH_HASHES.has(hash)) {
        const dummyToken = 'sebpc_static_' + Date.now();
        const expiresAt = Math.floor(Date.now() / 1000) + COOKIE_TTL_SEC;
        setStoredToken(dummyToken, expiresAt);
        return { ok: true, token: dummyToken };
      }

      return { ok: false, message: 'Senha institucional incorreta.' };
    },
    logout: function () {
      clearStoredToken();
      window.location.reload();
    }
  };

  window.checkGestaoAuth = async function () {
    const input = document.getElementById('auth-gate-input');
    const err = document.getElementById('auth-gate-error');
    const btn = document.getElementById('auth-gate-btn');
    if (!input) return;

    const pwd = input.value.trim();
    if (!pwd) return;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Verificando credencial...';
    }
    if (err) err.style.display = 'none';

    try {
      const result = await window.SEBPC_Auth.login(pwd);
      if (result.ok) {
        hideAuthOverlay(false);
        if (typeof pendingAuthResolve === 'function') {
          const resolveFn = pendingAuthResolve;
          pendingAuthResolve = null;
          resolveFn(true);
        }
      } else {
        if (err) {
          err.textContent = '⚠️ ' + (result.message || 'Senha incorreta. Tente novamente.');
          err.style.display = 'block';
        }
        input.value = '';
        input.focus();
      }
    } catch (e) {
      if (err) {
        err.textContent = '⚠️ Erro ao verificar credencial de acesso.';
        err.style.display = 'block';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Entrar no Observatório';
      }
    }
  };

  function waitForAuthentication() {
    if (getStoredToken()) {
      hideAuthOverlay(true);
      return Promise.resolve(true);
    }
    showAuthOverlay();
    return new Promise((resolve) => {
      pendingAuthResolve = resolve;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (getStoredToken()) {
      hideAuthOverlay(true);
    }
  });

  async function loadStaticGestaoFallback() {
    console.warn('[SEBPC API Gestao] Ativando carregamento direto dos dados estáticos (GitHub Pages / Standalone)...');
    const staticBase = '../00_API_e_Dados/data';

    const [bibRes, munRes, estRes, mascRes, idhmRes, icmsRes, inatRes, municRes] = await Promise.all([
      originalFetch(`${staticBase}/bibliotecas.json`),
      originalFetch(`${staticBase}/municipios_mg.json`),
      originalFetch(`${staticBase}/estado_mg.json`),
      originalFetch(`${staticBase}/mascara_fora_mg.json`),
      originalFetch(`${staticBase}/idhm_municipios_mg.json`).catch(() => null),
      originalFetch(`${staticBase}/icms_patrimonio_cultural_2026.json`).catch(() => null),
      originalFetch(`${staticBase}/diagnostico_inativas.json`).catch(() => null),
      originalFetch(`${staticBase}/munic_cultura_mg.json`).catch(() => null)
    ]);

    if (!bibRes.ok) throw new Error(`Falha ao carregar bibliotecas de gestao estaticas: HTTP ${bibRes.status}`);

    const [bibData, munData, estData, mascData, idhmData, icmsData, inatData, municData] = await Promise.all([
      bibRes.json(),
      munRes.ok ? munRes.json() : null,
      estRes.ok ? estRes.json() : null,
      mascRes.ok ? mascRes.json() : null,
      (idhmRes && idhmRes.ok) ? idhmRes.json() : {},
      (icmsRes && icmsRes.ok) ? icmsRes.json() : {},
      (inatRes && inatRes.ok) ? inatRes.json() : {},
      (municRes && municRes.ok) ? municRes.json() : {}
    ]);

    window.BIBLIOTECAS_DATA = bibData;
    if (munData) window.MUNICIPIOS_GEOJSON = munData;
    if (estData) window.ESTADO_MG_GEOJSON = estData;
    if (mascData) window.MASCARA_FORA_MG_GEOJSON = mascData;
    window.IDHM_MUNICIPIOS_MG = idhmData || {};
    window.ICMS_PATRIMONIO_CULTURAL_2026 = icmsData || {};
    window.DIAGNOSTICO_INATIVAS_DATA = inatData || {};
    window.MUNIC_CULTURA_MG = municData || {};
  }

  window.SEBPC_loadBootstrapData = async function () {
    const base = window.SEBPC_API_URL;
    await waitForAuthentication();

    if (!base) {
      return loadStaticGestaoFallback();
    }

    try {
      const [bibRes, munRes, estRes, mascRes, refRes] = await Promise.all([
        originalFetch(`${base}/api/gestao/bibliotecas`),
        originalFetch(`${base}/api/gestao/municipios`),
        originalFetch(`${base}/api/gestao/estado`),
        originalFetch(`${base}/api/gestao/mascara`),
        originalFetch(`${base}/api/gestao/referenciais`)
      ]);

      if (bibRes.status === 401) {
        clearStoredToken();
        await waitForAuthentication();
        return window.SEBPC_loadBootstrapData();
      }

      if (!bibRes.ok) throw new Error(`Falha ao carregar bibliotecas de gestao: HTTP ${bibRes.status}`);

      const [bibData, munData, estData, mascData, refData] = await Promise.all([
        bibRes.json(),
        munRes.ok ? munRes.json() : null,
        estRes.ok ? estRes.json() : null,
        mascRes.ok ? mascRes.json() : null,
        refRes.ok ? refRes.json() : {}
      ]);

      window.BIBLIOTECAS_DATA = bibData;
      if (munData) window.MUNICIPIOS_GEOJSON = munData;
      if (estData) window.ESTADO_MG_GEOJSON = estData;
      if (mascData) window.MASCARA_FORA_MG_GEOJSON = mascData;
      if (refData) {
        window.IDHM_MUNICIPIOS_MG = refData.idhm || {};
        window.ICMS_PATRIMONIO_CULTURAL_2026 = refData.icms || {};
        window.DIAGNOSTICO_INATIVAS_DATA = refData.diagnostico_inativas || {};
        window.MUNIC_CULTURA_MG = refData.munic || {};
      }
    } catch (err) {
      console.warn('[SEBPC API Gestao] API indisponível, acionando fallback estático:', err);
      try {
        await loadStaticGestaoFallback();
      } catch (staticErr) {
        console.error('[SEBPC API Gestao] Erro crítico ao carregar dados locais:', staticErr);
        const countEl = document.getElementById('results-count');
        if (countEl) {
          countEl.textContent = 'Erro ao inicializar base de gestão.';
        }
      }
    }
  };
})();
