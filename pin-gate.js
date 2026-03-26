(function () {
  function getConfig(options) {
    const baseConfig = Object.assign(
      {
        enabled: true,
        pin: '',
        storageKey: 'discussion_presentation_admin_unlock_until',
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

  function readUnlockUntil(storageKey) {
    try {
      return Number(localStorage.getItem(storageKey) || 0);
    } catch (error) {
      return 0;
    }
  }

  function writeUnlockUntil(storageKey, value) {
    try {
      localStorage.setItem(storageKey, String(value));
    } catch (error) {
      return;
    }
  }

  function clearUnlock(storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      return;
    }
  }

  function isUnlocked(config) {
    return readUnlockUntil(config.storageKey) > Date.now();
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
      '    <button type="submit">잠금 해제</button>',
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

  function mount(options) {
    const config = getConfig(options);
    const pageTitle = (options && options.pageTitle) || '관리 화면';

    return new Promise(function (resolve) {
      if (!config.enabled || !config.pin) {
        unlockPage(null);
        resolve(true);
        return;
      }

      if (isUnlocked(config)) {
        unlockPage(null);
        resolve(true);
        return;
      }

      clearUnlock(config.storageKey);

      const overlay = createOverlay(pageTitle);
      const form = document.getElementById('pinGateForm');
      const input = document.getElementById('pinGateInput');
      const errorText = document.getElementById('pinGateError');

      input.focus();

      form.addEventListener('submit', function (event) {
        event.preventDefault();

        if (input.value === String(config.pin)) {
          const unlockUntil = Date.now() + config.rememberMinutes * 60 * 1000;
          writeUnlockUntil(config.storageKey, unlockUntil);
          unlockPage(overlay);
          resolve(true);
          return;
        }

        errorText.innerText = 'PIN이 일치하지 않습니다.';
        input.select();
      });
    });
  }

  function reset(options) {
    const config = getConfig(options);
    clearUnlock(config.storageKey);
  }

  window.PresentationPinGate = {
    mount: mount,
    reset: reset
  };
})();
