(function () {
  function getConfig(options) {
    const baseConfig = Object.assign(
      {
        enabled: true,
        rememberMinutes: 480,
        pages: {}
      },
      window.PRESENTATION_ADMIN_CONFIG || {}
    );
    const pageKey = options && options.pageKey;
    const pageConfig = pageKey && baseConfig.pages
      ? baseConfig.pages[pageKey] || {}
      : {};

    return Object.assign({}, baseConfig, pageConfig);
  }

  function getAdminEndpoint() {
    const supabaseConfig = window.PRESENTATION_SUPABASE_CONFIG || {};

    if (!supabaseConfig.url || !supabaseConfig.adminFunctionName) {
      throw new Error('Admin authentication endpoint is not configured.');
    }

    return supabaseConfig.url.replace(/\/$/, '') + '/functions/v1/' + supabaseConfig.adminFunctionName + '/auth';
  }

  function readSession(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeSession(storageKey, session) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(session));
    } catch (error) {
      return;
    }
  }

  function clearSession(storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      return;
    }
  }

  function isValidSession(session) {
    return Boolean(
      session &&
      session.accessToken &&
      Number(session.expiresAt) > Date.now()
    );
  }

  function createOverlay(pageTitle) {
    const overlay = document.createElement('div');
    overlay.id = 'pinGateOverlay';
    overlay.innerHTML = [
      '<div id="pinGatePanel">',
      '  <h1>관리용 PIN</h1>',
      '  <p class="pin-desc">' + pageTitle + '에 들어가려면 PIN을 입력하세요.</p>',
      '  <form id="pinGateForm">',
      '    <input id="pinGateInput" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN 입력">',
      '    <button id="pinGateSubmit" type="submit">잠금 해제</button>',
      '  </form>',
      '  <p id="pinGateError" class="pin-error"></p>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);
    return overlay;
  }

  function unlockPage(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }

    document.documentElement.classList.remove('pin-locked');
  }

  async function authenticate(scope, pin, rememberMinutes) {
    const response = await fetch(getAdminEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scope: scope,
        pin: pin,
        rememberMinutes: rememberMinutes
      })
    });

    let payload = null;

    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      const message = payload && payload.error
        ? payload.error
        : '관리 인증에 실패했습니다.';
      throw new Error(message);
    }

    return payload;
  }

  function getSession(options) {
    const config = getConfig(options);
    const session = readSession(config.storageKey);

    if (!isValidSession(session)) {
      clearSession(config.storageKey);
      return null;
    }

    return session;
  }

  function getAccessToken(options) {
    const session = getSession(options);
    return session ? session.accessToken : '';
  }

  function mount(options) {
    const config = getConfig(options);
    const pageTitle = (options && options.pageTitle) || '관리 화면';

    return new Promise(function (resolve) {
      if (!config.enabled) {
        unlockPage(null);
        resolve(null);
        return;
      }

      const existingSession = getSession(options);

      if (existingSession) {
        unlockPage(null);
        resolve(existingSession);
        return;
      }

      clearSession(config.storageKey);

      const overlay = createOverlay(pageTitle);
      const form = document.getElementById('pinGateForm');
      const input = document.getElementById('pinGateInput');
      const submitBtn = document.getElementById('pinGateSubmit');
      const errorText = document.getElementById('pinGateError');

      input.focus();

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        errorText.innerText = '';
        submitBtn.disabled = true;
        submitBtn.innerText = '확인 중...';

        try {
          const session = await authenticate(
            config.scope || (options && options.pageKey) || '',
            input.value.trim(),
            config.rememberMinutes
          );
          writeSession(config.storageKey, session);
          unlockPage(overlay);
          resolve(session);
        } catch (error) {
          errorText.innerText = error.message || 'PIN이 일치하지 않습니다.';
          input.select();
          submitBtn.disabled = false;
          submitBtn.innerText = '잠금 해제';
        }
      });
    });
  }

  function reset(options) {
    const config = getConfig(options);
    clearSession(config.storageKey);
  }

  window.PresentationPinGate = {
    mount: mount,
    reset: reset,
    getSession: getSession,
    getAccessToken: getAccessToken
  };
})();
