(function () {
  if (!window.supabase || !window.PRESENTATION_SUPABASE_CONFIG) {
    throw new Error('Supabase client configuration could not be loaded.');
  }

  const { createClient } = window.supabase;
  const config = window.PRESENTATION_SUPABASE_CONFIG;

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

  function buildTimerData(state) {
    return {
      state: state.timer_state || 'reset',
      remain: Number.isFinite(state.timer_remain_secs) ? state.timer_remain_secs : 0,
      lastAction: state.timer_last_action_at || new Date().toISOString()
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

    return normalizeState(data);
  }

  async function fetchPages(teamId) {
    if (!teamId) {
      return [];
    }

    const { data, error } = await client
      .from(config.pagesTable)
      .select('*')
      .eq('team_id', teamId)
      .order('page_no', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  async function fetchAllTitles() {
    const { data, error } = await client
      .from(config.pagesTable)
      .select('team_id, page_no, title')
      .order('team_id', { ascending: true })
      .order('page_no', { ascending: true });

    if (error) {
      throw error;
    }

    return (data || []).filter(function (row) {
      return row.title;
    });
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
  }

  async function setState(partialState) {
    const currentState = await fetchState();
    const nextState = Object.assign({}, currentState, partialState, {
      id: config.stateRowId,
      updated_at: new Date().toISOString()
    });

    const { error } = await client
      .from(config.stateTable)
      .upsert(nextState);

    if (error) {
      throw error;
    }

    return nextState;
  }

  async function fetchDisplayPayload() {
    const state = await fetchState();
    const timer = buildTimerData(state);

    if (state.mode === 'finale') {
      const titles = await fetchAllTitles();
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

    if (state.mode !== 'show' || !state.current_team_id) {
      return {
        status: 'waiting',
        timer: timer
      };
    }

    const pages = await fetchPages(state.current_team_id);

    if (!pages.length) {
      return {
        status: 'nodata',
        teamId: state.current_team_id,
        timer: timer
      };
    }

    const pageMatch = pages.find(function (page) {
      return page.page_no === state.current_page_no;
    }) || pages[0];

    return {
      status: 'show',
      teamId: state.current_team_id,
      currentPage: pageMatch.page_no,
      totalPages: pages.length,
      title: pageMatch.title,
      content: pageMatch.content,
      timer: timer
    };
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
    buildTimerData: buildTimerData,
    computeRemainingSeconds: computeRemainingSeconds,
    subscribeToPresentationChanges: subscribeToPresentationChanges,
    unsubscribe: unsubscribe
  };
})();
