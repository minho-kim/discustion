(function () {
  if (!window.supabase || !window.PRESENTATION_SUPABASE_CONFIG) {
    throw new Error('Supabase client configuration could not be loaded.');
  }

  const { createClient } = window.supabase;
  const config = window.PRESENTATION_SUPABASE_CONFIG;
  const pagesCache = new Map();
  let publicDisplayCache = null;

  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  function getDefaultPublicDisplay() {
    return {
      id: config.publicDisplayRowId,
      status: 'waiting',
      team_id: null,
      current_page: 1,
      total_pages: 1,
      title: '',
      content: '',
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
