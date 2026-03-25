(function () {
  if (!window.supabase || !window.PRESENTATION_SUPABASE_CONFIG) {
    throw new Error('Supabase client configuration could not be loaded.');
  }

  const { createClient } = window.supabase;
  const config = window.PRESENTATION_SUPABASE_CONFIG;
  const pagesCache = new Map();
  let titlesCache = null;
  let stateCache = null;
  let hasFetchedState = false;

  const client = createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  function getDefaultState() {
    return {
      id: config.stateRowId,
      mode: 'waiting',
      current_team_id: null,
      current_page_no: 1,
      timer_state: 'reset',
      timer_remain_secs: 300,
      timer_last_action_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  function normalizeState(row) {
    return Object.assign(getDefaultState(), row || {});
  }

  function cacheState(row) {
    stateCache = normalizeState(row);
    hasFetchedState = true;
    return stateCache;
  }

  function getCachedState() {
    return normalizeState(stateCache);
  }

  function buildTimerData(state) {
    const safeState = state || {};
    return {
      state: safeState.timer_state || 'reset',
      remain: Number.isFinite(safeState.timer_remain_secs) ? safeState.timer_remain_secs : 0,
      lastAction: safeState.timer_last_action_at || new Date().toISOString()
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

  async function fetchState() {
    const { data, error } = await client
      .from(config.stateTable)
      .select('*')
      .eq('id', config.stateRowId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return cacheState(data);
  }

  async function fetchPages(teamId, options) {
    if (!teamId) {
      return [];
    }

    const force = Boolean(options && options.force);
    const cacheKey = String(teamId);

    if (!force && pagesCache.has(cacheKey)) {
      return pagesCache.get(cacheKey);
    }

    const { data, error } = await client
      .from(config.pagesTable)
      .select('*')
      .eq('team_id', teamId)
      .order('page_no', { ascending: true });

    if (error) {
      throw error;
    }

    const pages = data || [];
    pagesCache.set(cacheKey, pages);
    return pages;
  }

  async function fetchAllTitles(options) {
    const force = Boolean(options && options.force);

    if (!force && Array.isArray(titlesCache)) {
      return titlesCache;
    }

    const { data, error } = await client
      .from(config.pagesTable)
      .select('team_id, page_no, title')
      .order('team_id', { ascending: true })
      .order('page_no', { ascending: true });

    if (error) {
      throw error;
    }

    titlesCache = (data || []).filter(function (row) {
      return row.title;
    });

    return titlesCache;
  }

  function invalidateTeamPages(teamId) {
    if (teamId) {
      pagesCache.delete(String(teamId));
    }

    titlesCache = null;
  }

  function invalidateAllPages() {
    pagesCache.clear();
    titlesCache = null;
  }

  function getCachedPages(teamId) {
    if (!teamId) {
      return null;
    }

    return pagesCache.get(String(teamId)) || null;
  }

  function getCachedTitles() {
    return Array.isArray(titlesCache) ? titlesCache : null;
  }

  async function savePages(teamId, pagesData) {
    const rows = pagesData.map(function (page, index) {
      return {
        team_id: teamId,
        page_no: index + 1,
        title: page.title,
        content: page.content
      };
    });

    const { error: upsertError } = await client
      .from(config.pagesTable)
      .upsert(rows, { onConflict: 'team_id,page_no' });

    if (upsertError) {
      throw upsertError;
    }

    const { error: deleteError } = await client
      .from(config.pagesTable)
      .delete()
      .eq('team_id', teamId)
      .gt('page_no', rows.length);

    if (deleteError) {
      throw deleteError;
    }

    invalidateTeamPages(teamId);
  }

  async function setState(partialState) {
    const currentState = hasFetchedState ? getCachedState() : await fetchState();
    const nextState = Object.assign({}, currentState, partialState, {
      id: config.stateRowId,
      updated_at: new Date().toISOString()
    });

    const { data, error } = await client
      .from(config.stateTable)
      .update(nextState)
      .eq('id', config.stateRowId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return cacheState(data);
    }

    const { data: upsertedData, error: upsertError } = await client
      .from(config.stateTable)
      .upsert(nextState)
      .select('*')
      .single();

    if (upsertError) {
      throw upsertError;
    }

    return cacheState(upsertedData);
  }

  function buildDisplayPayloadFromStateSync(state) {
    const normalizedState = cacheState(state);
    const timer = buildTimerData(normalizedState);

    if (normalizedState.mode === 'finale') {
      const titles = getCachedTitles();

      if (!titles) {
        return null;
      }

      return {
        status: 'finale',
        titles: titles.map(function (row) {
          return {
            team: row.team_id,
            title: row.title
          };
        }),
        timer: timer
      };
    }

    if (normalizedState.mode !== 'show' || !normalizedState.current_team_id) {
      return {
        status: 'waiting',
        timer: timer
      };
    }

    const pages = getCachedPages(normalizedState.current_team_id);

    if (!pages) {
      return null;
    }

    if (!pages.length) {
      return {
        status: 'nodata',
        teamId: normalizedState.current_team_id,
        timer: timer
      };
    }

    const pageMatch = pages.find(function (page) {
      return page.page_no === normalizedState.current_page_no;
    }) || pages[0];

    return {
      status: 'show',
      teamId: normalizedState.current_team_id,
      currentPage: pageMatch.page_no,
      totalPages: pages.length,
      title: pageMatch.title,
      content: pageMatch.content,
      timer: timer
    };
  }

  async function fetchDisplayPayloadForState(state, options) {
    const normalizedState = cacheState(state);
    const timer = buildTimerData(normalizedState);

    if (normalizedState.mode === 'finale') {
      const titles = await fetchAllTitles({ force: Boolean(options && options.forceTitles) });
      return {
        status: 'finale',
        titles: titles.map(function (row) {
          return {
            team: row.team_id,
            title: row.title
          };
        }),
        timer: timer
      };
    }

    if (normalizedState.mode !== 'show' || !normalizedState.current_team_id) {
      return {
        status: 'waiting',
        timer: timer
      };
    }

    const pages = await fetchPages(normalizedState.current_team_id, {
      force: Boolean(options && options.forcePages)
    });

    if (!pages.length) {
      return {
        status: 'nodata',
        teamId: normalizedState.current_team_id,
        timer: timer
      };
    }

    const pageMatch = pages.find(function (page) {
      return page.page_no === normalizedState.current_page_no;
    }) || pages[0];

    return {
      status: 'show',
      teamId: normalizedState.current_team_id,
      currentPage: pageMatch.page_no,
      totalPages: pages.length,
      title: pageMatch.title,
      content: pageMatch.content,
      timer: timer
    };
  }

  async function fetchDisplayPayload(options) {
    const state = await fetchState();
    return fetchDisplayPayloadForState(state, options);
  }

  function subscribeToPresentationChanges(channelName, callback) {
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: config.stateTable
        },
        callback
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: config.pagesTable
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
    fetchState: fetchState,
    fetchPages: fetchPages,
    fetchAllTitles: fetchAllTitles,
    savePages: savePages,
    setState: setState,
    fetchDisplayPayload: fetchDisplayPayload,
    fetchDisplayPayloadForState: fetchDisplayPayloadForState,
    buildDisplayPayloadFromStateSync: buildDisplayPayloadFromStateSync,
    buildTimerData: buildTimerData,
    computeRemainingSeconds: computeRemainingSeconds,
    getCachedState: getCachedState,
    hydrateState: cacheState,
    getCachedPages: getCachedPages,
    invalidateTeamPages: invalidateTeamPages,
    invalidateAllPages: invalidateAllPages,
    subscribeToPresentationChanges: subscribeToPresentationChanges,
    unsubscribe: unsubscribe
  };
})();
