(function () {
  if (!window.supabase || !window.PRESENTATION_SUPABASE_CONFIG) {
    throw new Error('Supabase client configuration could not be loaded.');
  }

  const { createClient } = window.supabase;
  const config = window.PRESENTATION_SUPABASE_CONFIG;
  const pagesCache = new Map();
  let publicDisplayCache = null;
  const DEFAULT_WAITING_MESSAGE = '발표를 대기 중입니다.';
  const DEFAULT_OPENING_SLIDES = Object.freeze([
    Object.freeze({
      title: '용인시민 100인 연석회의',
      body: '미래의 풍요와 오늘의 삶을 함께 보듬는 용인을 위해\n시민의 지혜를 모으는 자리에 오신 것을 환영합니다.',
      note: ''
    }),
    Object.freeze({
      title: '개회 선언',
      body: '지금부터 \'용인시민 100인 연석회의 공론장\'을 시작하겠습니다.',
      note: ''
    }),
    Object.freeze({
      title: '환영 및 참가자 안내',
      body: '바쁘신 와중에도 함께해주신 시민 여러분, 진심으로 감사합니다.\n오늘 이 자리는 다양한 세대와 분야의 시민 100인이 모여\n용인의 현재와 미래를 함께 이야기하는 자리입니다.',
      note: ''
    }),
    Object.freeze({
      title: '공론장 목적',
      body: '전문가가 아닌 시민이 직접 정책을 만드는 자리입니다.\n정답을 찾는 자리가 아니라, 서로의 경험과 생각을 모아\n실제 지방선거 후보자에게 제안할 \'시민 정책\'을 도출합니다.',
      note: ''
    }),
    Object.freeze({
      title: '진행 방식 안내',
      body: '총 10개의 주제 테이블이 운영됩니다.\n자신이 관심 있고 직접 이야기 나누고 싶은 주제 테이블에서\n테이블별 퍼실리테이터의 안내에 따라 논의를 진행합니다.',
      note: '지역 불균형 / 돌봄 시스템 / 기후·에너지 / 맞춤형 일자리 / 주택·교통 / 시민참여 / 지역경제 등'
    }),
    Object.freeze({
      title: '우리의 3가지 약속',
      body: '첫째. 서로의 의견을 존중합니다.\n둘째. 발언 기회를 공평하게 나눕니다.\n셋째. 비판보다는 제안을 중심으로 이야기합니다.',
      note: ''
    }),
    Object.freeze({
      title: '테이블 논의 시작',
      body: '퍼실리테이터와 함께 구체적인 논의를 시작합니다.\n\n[입열기]\n나는 어떻게 이 자리에 참여하게 되었나요?\n생활, 일, 지역에서의 경험을 편하게 나누어 주세요.',
      note: ''
    }),
    Object.freeze({
      title: '문제 드러내기 및 쟁점 정리',
      body: '개인의 경험과 불편함을 우리 모두의 문제로 확장합니다.\n유사한 의견을 묶고 점 스티커 투표를 통해\n가장 중요하고 시급하며 실현 가능한 우선순위 쟁점을 선택합니다.',
      note: ''
    }),
    Object.freeze({
      title: '정책 아이디어 도출 및 정교화',
      body: '선택된 문제를 해결하기 위한 아이디어를 쏟아냅니다.\n평가하지 않기, 많이 내기, 자유롭게 말하기.\n도출된 아이디어를 현실적이고 설득력 있는 시민 정책으로 다듬습니다.',
      note: ''
    }),
    Object.freeze({
      title: '전체 공유 및 발표',
      body: '각 테이블에서 논의된 핵심 쟁점과 정책 제안을 전체와 함께 나눕니다.\n여러분의 이야기가 어떻게 모였는지 확인해 보겠습니다.',
      note: ''
    }),
    Object.freeze({
      title: '전체 기념 사진 촬영',
      body: '모든 발표가 마무리되었습니다.\n오늘의 소중한 자리를 기억하며, 참석해주신 100인의 시민 여러분과\n함께 기념 사진을 촬영하겠습니다.',
      note: ''
    }),
    Object.freeze({
      title: '폐회 및 마무리',
      body: '긴 시간 함께해주신 시민 여러분, 진심으로 감사합니다.\n오늘 도출된 제안은 지방선거 후보자에게 소중히 전달하겠습니다.\n이상으로 용인시민 100인 연석회의를 모두 마치겠습니다.',
      note: ''
    })
  ]);

  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  function cloneOpeningSlides(slides) {
    return (Array.isArray(slides) ? slides : []).map(function (slide) {
      return {
        title: typeof slide.title === 'string' ? slide.title : '',
        body: typeof slide.body === 'string' ? slide.body : '',
        note: typeof slide.note === 'string' ? slide.note : ''
      };
    });
  }

  function normalizeOpeningSlides(slides) {
    const normalized = cloneOpeningSlides(
      Array.isArray(slides) && slides.length ? slides : DEFAULT_OPENING_SLIDES
    );

    return normalized.length ? normalized : cloneOpeningSlides(DEFAULT_OPENING_SLIDES);
  }

  function getDefaultOpeningSlides() {
    return cloneOpeningSlides(DEFAULT_OPENING_SLIDES);
  }

  function getDefaultPublicDisplay() {
    return {
      id: config.publicDisplayRowId,
      status: 'waiting',
      team_id: null,
      current_page: 1,
      total_pages: 1,
      title: '',
      content: '',
      opening_slides: getDefaultOpeningSlides(),
      waiting_message: DEFAULT_WAITING_MESSAGE,
      timer_state: 'reset',
      timer_remain_secs: 300,
      timer_last_action_at: new Date().toISOString(),
      finale_titles: [],
      updated_at: new Date().toISOString()
    };
  }

  function normalizePublicDisplay(row) {
    const normalized = Object.assign(getDefaultPublicDisplay(), row || {});
    normalized.finale_titles = Array.isArray(normalized.finale_titles)
      ? normalized.finale_titles
      : [];
    normalized.opening_slides = normalizeOpeningSlides(normalized.opening_slides);
    normalized.waiting_message = typeof normalized.waiting_message === 'string' && normalized.waiting_message.trim()
      ? normalized.waiting_message.trim()
      : DEFAULT_WAITING_MESSAGE;
    return normalized;
  }

  function cachePublicDisplay(row) {
    publicDisplayCache = normalizePublicDisplay(row);
    return publicDisplayCache;
  }

  function getCachedPublicDisplay() {
    return normalizePublicDisplay(publicDisplayCache);
  }

  function buildTimerData(source) {
    const safeSource = source || {};
    return {
      state: safeSource.timer_state || 'reset',
      remain: Number.isFinite(safeSource.timer_remain_secs) ? safeSource.timer_remain_secs : 0,
      lastAction: safeSource.timer_last_action_at || new Date().toISOString()
    };
  }

  function computeRemainingSeconds(timerData, nowMs) {
    const safeNowMs = typeof nowMs === 'number' ? nowMs : Date.now();
    const remain = Number(timerData && timerData.remain) || 0;

    if (!timerData || timerData.state !== 'playing') {
      return Math.max(0, remain);
    }

    const lastActionMs = new Date(timerData.lastAction || 0).getTime();
    const elapsed = Number.isFinite(lastActionMs)
      ? Math.floor((safeNowMs - lastActionMs) / 1000)
      : 0;

    return Math.max(0, remain - Math.max(0, elapsed));
  }

  function buildDisplayPayloadFromPublicDisplay(row) {
    const display = cachePublicDisplay(row);
    const timer = buildTimerData(display);

    if (display.status === 'finale') {
      return {
        status: 'finale',
        titles: display.finale_titles,
        timer: timer
      };
    }

    if (display.status === 'opening') {
      const slides = normalizeOpeningSlides(display.opening_slides);
      const totalPages = Math.max(1, slides.length);
      const currentPage = Math.min(
        Math.max(1, Number(display.current_page) || 1),
        totalPages
      );
      const slide = slides[currentPage - 1] || slides[0] || { title: '', body: '', note: '' };

      return {
        status: 'opening',
        currentPage: currentPage,
        totalPages: totalPages,
        slides: slides,
        slide: slide,
        timer: timer
      };
    }

    if (display.status === 'show') {
      return {
        status: 'show',
        teamId: display.team_id,
        currentPage: display.current_page,
        totalPages: display.total_pages,
        title: display.title,
        content: display.content,
        timer: timer
      };
    }

    if (display.status === 'nodata') {
      return {
        status: 'nodata',
        teamId: display.team_id,
        timer: timer
      };
    }

    return {
      status: 'waiting',
      waitingMessage: display.waiting_message || DEFAULT_WAITING_MESSAGE,
      timer: timer
    };
  }

  async function fetchPublicDisplay() {
    const { data, error } = await client
      .from(config.displayTable)
      .select('*')
      .eq('id', config.publicDisplayRowId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return cachePublicDisplay(data);
  }

  function getAdminEndpoint(path) {
    const safePath = path.charAt(0) === '/' ? path : '/' + path;
    return config.url.replace(/\/$/, '') + '/functions/v1/' + config.adminFunctionName + safePath;
  }

  async function parseJsonResponse(response) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async function callAdminApi(path, options) {
    const settings = options || {};
    const headers = Object.assign({}, settings.headers || {});

    if (settings.accessToken) {
      headers.Authorization = 'Bearer ' + settings.accessToken;
    }

    if (settings.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(getAdminEndpoint(path), {
      method: settings.method || 'GET',
      headers: headers,
      body: settings.body !== undefined ? JSON.stringify(settings.body) : undefined
    });
    const payload = await parseJsonResponse(response);

    if (!response.ok) {
      const error = new Error((payload && payload.error) || '관리 API 요청에 실패했습니다.');
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async function adminFetchPages(teamId, accessToken, options) {
    if (!teamId) {
      return [];
    }

    const force = Boolean(options && options.force);
    const cacheKey = String(teamId);

    if (!force && pagesCache.has(cacheKey)) {
      return pagesCache.get(cacheKey);
    }

    const payload = await callAdminApi('/pages?teamId=' + encodeURIComponent(teamId), {
      accessToken: accessToken
    });
    const pages = payload && Array.isArray(payload.pages) ? payload.pages : [];
    pagesCache.set(cacheKey, pages);
    return pages;
  }

  function invalidateTeamPages(teamId) {
    if (teamId) {
      pagesCache.delete(String(teamId));
    }
  }

  function invalidateAllPages() {
    pagesCache.clear();
  }

  async function adminSavePages(teamId, pagesData, accessToken) {
    const payload = await callAdminApi('/pages', {
      method: 'POST',
      accessToken: accessToken,
      body: {
        teamId: teamId,
        pages: pagesData
      }
    });

    invalidateTeamPages(teamId);
    return payload;
  }

  async function adminDeleteTeamPages(teamId, accessToken) {
    const payload = await callAdminApi('/pages?teamId=' + encodeURIComponent(teamId), {
      method: 'DELETE',
      accessToken: accessToken
    });

    invalidateTeamPages(teamId);
    return payload;
  }

  async function adminDeleteAllPages(accessToken) {
    const payload = await callAdminApi('/pages', {
      method: 'DELETE',
      accessToken: accessToken
    });

    invalidateAllPages();

    if (payload && payload.publicDisplay) {
      cachePublicDisplay(payload.publicDisplay);
    }

    return payload;
  }

  async function adminSetState(partialState, accessToken) {
    const payload = await callAdminApi('/state', {
      method: 'POST',
      accessToken: accessToken,
      body: {
        state: partialState
      }
    });

    if (payload && payload.publicDisplay) {
      cachePublicDisplay(payload.publicDisplay);
    }

    return payload;
  }

  function subscribeToPresentationChanges(channelName, callback) {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: config.displayTable
        },
        callback
      )
      .subscribe();

    return channel;
  }

  function unsubscribe(channel) {
    if (channel) {
      client.removeChannel(channel);
    }
  }

  window.PresentationStore = {
    client: client,
    config: config,
    fetchPublicDisplay: fetchPublicDisplay,
    getCachedPublicDisplay: getCachedPublicDisplay,
    hydratePublicDisplay: cachePublicDisplay,
    buildDisplayPayloadFromPublicDisplay: buildDisplayPayloadFromPublicDisplay,
    buildTimerData: buildTimerData,
    computeRemainingSeconds: computeRemainingSeconds,
    getDefaultOpeningSlides: getDefaultOpeningSlides,
    normalizeOpeningSlides: normalizeOpeningSlides,
    adminFetchPages: adminFetchPages,
    adminSavePages: adminSavePages,
    adminDeleteTeamPages: adminDeleteTeamPages,
    adminDeleteAllPages: adminDeleteAllPages,
    adminSetState: adminSetState,
    invalidateTeamPages: invalidateTeamPages,
    invalidateAllPages: invalidateAllPages,
    subscribeToPresentationChanges: subscribeToPresentationChanges,
    unsubscribe: unsubscribe
  };
})();
