import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FUNCTION_NAME = 'presentation-admin'
const encoder = new TextEncoder()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Content-Type': 'application/json',
}

const INLINE_SECRETS: Record<string, string> = {
  PRESENTATION_INPUT_PIN: '114341',
  PRESENTATION_CONTROL_PIN: '536085',
  PRESENTATION_ADMIN_TOKEN_SECRET: 'n3-4Fv7F02BTFUOGtopYzffoGNpMQMDaa16zsdcyZ5N5TTsLnptlqxhGHcZrYQVq',
  PRESENTATION_ADMIN_SESSION_MINUTES: '480',
}

const DEFAULT_OPENING_SLIDES = [
  {
    title: '용인시민 100인 연석회의',
    body: '미래의 풍요와 오늘의 삶을 함께 보듬는 용인을 위해\n시민의 지혜를 모으는 자리에 오신 것을 환영합니다.',
    note: '',
  },
  {
    title: '개회 선언',
    body: '지금부터 \'용인시민 100인 연석회의 공론장\'을 시작하겠습니다.',
    note: '',
  },
  {
    title: '환영 및 참가자 안내',
    body: '바쁘신 와중에도 함께해주신 시민 여러분, 진심으로 감사합니다.\n오늘 이 자리는 다양한 세대와 분야의 시민 100인이 모여\n용인의 현재와 미래를 함께 이야기하는 자리입니다.',
    note: '',
  },
  {
    title: '공론장 목적',
    body: '전문가가 아닌 시민이 직접 정책을 만드는 자리입니다.\n정답을 찾는 자리가 아니라, 서로의 경험과 생각을 모아\n실제 지방선거 후보자에게 제안할 \'시민 정책\'을 도출합니다.',
    note: '',
  },
  {
    title: '진행 방식 안내',
    body: '총 10개의 주제 테이블이 운영됩니다.\n자신이 관심 있고 직접 이야기 나누고 싶은 주제 테이블에서\n테이블별 퍼실리테이터의 안내에 따라 논의를 진행합니다.',
    note: '지역 불균형 / 돌봄 시스템 / 기후·에너지 / 맞춤형 일자리 / 주택·교통 / 시민참여 / 지역경제 등',
  },
  {
    title: '우리의 3가지 약속',
    body: '첫째. 서로의 의견을 존중합니다.\n둘째. 발언 기회를 공평하게 나눕니다.\n셋째. 비판보다는 제안을 중심으로 이야기합니다.',
    note: '',
  },
  {
    title: '테이블 논의 시작',
    body: '퍼실리테이터와 함께 구체적인 논의를 시작합니다.\n\n[입열기]\n나는 어떻게 이 자리에 참여하게 되었나요?\n생활, 일, 지역에서의 경험을 편하게 나누어 주세요.',
    note: '',
  },
  {
    title: '문제 드러내기 및 쟁점 정리',
    body: '개인의 경험과 불편함을 우리 모두의 문제로 확장합니다.\n유사한 의견을 묶고 점 스티커 투표를 통해\n가장 중요하고 시급하며 실현 가능한 우선순위 쟁점을 선택합니다.',
    note: '',
  },
  {
    title: '정책 아이디어 도출 및 정교화',
    body: '선택된 문제를 해결하기 위한 아이디어를 쏟아냅니다.\n평가하지 않기, 많이 내기, 자유롭게 말하기.\n도출된 아이디어를 현실적이고 설득력 있는 시민 정책으로 다듬습니다.',
    note: '',
  },
  {
    title: '전체 공유 및 발표',
    body: '각 테이블에서 논의된 핵심 쟁점과 정책 제안을 전체와 함께 나눕니다.\n여러분의 이야기가 어떻게 모였는지 확인해 보겠습니다.',
    note: '',
  },
  {
    title: '전체 기념 사진 촬영',
    body: '모든 발표가 마무리되었습니다.\n오늘의 소중한 자리를 기억하며, 참석해주신 100인의 시민 여러분과\n함께 기념 사진을 촬영하겠습니다.',
    note: '',
  },
  {
    title: '폐회 및 마무리',
    body: '긴 시간 함께해주신 시민 여러분, 진심으로 감사합니다.\n오늘 도출된 제안은 지방선거 후보자에게 소중히 전달하겠습니다.\n이상으로 용인시민 100인 연석회의를 모두 마치겠습니다.',
    note: '',
  },
]

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const TABLES = {
  pages: 'discussion_presentation_pages',
  state: 'discussion_presentation_state',
  display: 'discussion_public_display',
}

const SESSION_MINUTES = Math.max(
  10,
  Math.min(
    Number((Deno.env.get('PRESENTATION_ADMIN_SESSION_MINUTES') || INLINE_SECRETS.PRESENTATION_ADMIN_SESSION_MINUTES) || 480) || 480,
    24 * 60
  )
)

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  })
}

function getRoutePath(req: Request) {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean)
  const functionIndex = parts.indexOf(FUNCTION_NAME)
  const route = functionIndex >= 0 ? parts.slice(functionIndex + 1) : []
  return '/' + route.join('/')
}

function getSecret(name: string) {
  const value = Deno.env.get(name) || INLINE_SECRETS[name]

  if (!value) {
    throw new Error(`Missing secret: ${name}`)
  }

  return value
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function signValue(value: string) {
  const secret = getSecret('PRESENTATION_ADMIN_TOKEN_SECRET')
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function issueToken(scope: string, rememberMinutes: number) {
  const exp = Math.floor(Date.now() / 1000) + rememberMinutes * 60
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        scope,
        exp,
      })
    )
  )
  const signature = await signValue(payload)

  return {
    accessToken: `${payload}.${signature}`,
    expiresAt: exp * 1000,
    scope,
  }
}

async function verifyToken(req: Request, allowedScopes: string[]) {
  const authHeader = req.headers.get('Authorization') || ''

  if (!authHeader.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: '관리 인증이 필요합니다.' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const token = authHeader.slice(7).trim()
  const [payloadEncoded, signature] = token.split('.')

  if (!payloadEncoded || !signature) {
    throw new Response(JSON.stringify({ error: '유효하지 않은 인증 토큰입니다.' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const expectedSignature = await signValue(payloadEncoded)

  if (expectedSignature !== signature) {
    throw new Response(JSON.stringify({ error: '유효하지 않은 인증 토큰입니다.' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadEncoded)))

  if (!payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new Response(JSON.stringify({ error: '관리 인증이 만료되었습니다.' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  if (!allowedScopes.includes(payload.scope)) {
    throw new Response(JSON.stringify({ error: '권한이 없는 작업입니다.' }), {
      status: 403,
      headers: corsHeaders,
    })
  }

  return payload
}

function normalizeRememberMinutes(value: unknown) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return SESSION_MINUTES
  }

  return Math.max(10, Math.min(Math.floor(numeric), 24 * 60))
}

function validateTeamId(teamId: unknown) {
  const numeric = Number(teamId)

  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 10) {
    throw new Error('teamId는 1~10 사이의 정수여야 합니다.')
  }

  return numeric
}

function validatePages(pages: unknown) {
  if (!Array.isArray(pages) || !pages.length) {
    throw new Error('최소 1개의 페이지가 필요합니다.')
  }

  return pages.map((page, index) => {
    const title = typeof page?.title === 'string' ? page.title.trim() : ''
    const content = typeof page?.content === 'string' ? page.content.trim() : ''

    if (!title || !content) {
      throw new Error(`${index + 1}번째 페이지의 주제와 내용을 모두 입력해 주세요.`)
    }

    return {
      team_id: 0,
      page_no: index + 1,
      title,
      content,
    }
  })
}

function cloneOpeningSlides(slides: Array<Record<string, unknown>>) {
  return slides.map((slide) => ({
    title: typeof slide.title === 'string' ? slide.title : '',
    body: typeof slide.body === 'string' ? slide.body : '',
    note: typeof slide.note === 'string' ? slide.note : '',
  }))
}

function getDefaultOpeningSlides() {
  return cloneOpeningSlides(DEFAULT_OPENING_SLIDES)
}

function validateOpeningSlides(openingSlides: unknown) {
  if (!Array.isArray(openingSlides) || !openingSlides.length) {
    throw new Error('오프닝 슬라이드는 최소 1장 이상이어야 합니다.')
  }

  if (openingSlides.length > 20) {
    throw new Error('오프닝 슬라이드는 최대 20장까지 저장할 수 있습니다.')
  }

  return openingSlides.map((slide, index) => {
    const title = typeof slide?.title === 'string' ? slide.title.trim() : ''
    const body = typeof slide?.body === 'string' ? slide.body.trim() : ''
    const note = typeof slide?.note === 'string' ? slide.note.trim() : ''

    if (!title && !body) {
      throw new Error(`${index + 1}번째 오프닝 슬라이드에 제목 또는 본문이 필요합니다.`)
    }

    if (title.length > 120) {
      throw new Error(`${index + 1}번째 오프닝 슬라이드 제목은 120자 이하로 입력해 주세요.`)
    }

    if (body.length > 1200) {
      throw new Error(`${index + 1}번째 오프닝 슬라이드 본문은 1200자 이하로 입력해 주세요.`)
    }

    if (note.length > 240) {
      throw new Error(`${index + 1}번째 오프닝 슬라이드 보조 문구는 240자 이하로 입력해 주세요.`)
    }

    return { title, body, note }
  })
}

async function fetchStateRow() {
  const { data, error } = await supabaseAdmin
    .from(TABLES.state)
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (
    data || {
      id: 1,
      mode: 'waiting',
      current_team_id: null,
      current_page_no: 1,
      opening_slides: getDefaultOpeningSlides(),
      waiting_message: '발표를 대기 중입니다.',
      timer_state: 'reset',
      timer_remain_secs: 300,
      timer_last_action_at: new Date().toISOString(),
    }
  )
}

async function fetchPublicDisplayRow() {
  const { data, error } = await supabaseAdmin
    .from(TABLES.display)
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function resetStateToWaiting() {
  const currentState = await fetchStateRow()
  const nextState = {
    id: 1,
    mode: 'waiting',
    current_team_id: null,
    current_page_no: 1,
    opening_slides: Array.isArray(currentState.opening_slides) && currentState.opening_slides.length
      ? currentState.opening_slides
      : getDefaultOpeningSlides(),
    waiting_message: '발표를 대기 중입니다.',
    timer_state: 'reset',
    timer_remain_secs: 300,
    timer_last_action_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from(TABLES.state)
    .update(nextState)
    .eq('id', 1)
    .select('*')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || nextState
}

function sanitizeStatePatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}

  if (input.mode !== undefined) {
    if (!['waiting', 'opening', 'show', 'finale'].includes(String(input.mode))) {
      throw new Error('mode 값이 올바르지 않습니다.')
    }

    patch.mode = input.mode
  }

  if (input.current_team_id !== undefined) {
    patch.current_team_id = input.current_team_id === null
      ? null
      : validateTeamId(input.current_team_id)
  }

  if (input.current_page_no !== undefined) {
    const pageNo = Number(input.current_page_no)

    if (!Number.isInteger(pageNo) || pageNo < 1) {
      throw new Error('current_page_no는 1 이상의 정수여야 합니다.')
    }

    patch.current_page_no = pageNo
  }

  if (input.opening_slides !== undefined) {
    patch.opening_slides = validateOpeningSlides(input.opening_slides)
  }

  if (input.waiting_message !== undefined) {
    const waitingMessage = String(input.waiting_message || '').trim()

    if (waitingMessage.length > 120) {
      throw new Error('waiting_message는 120자 이하로 입력해 주세요.')
    }

    patch.waiting_message = waitingMessage || '발표를 대기 중입니다.'
  }

  if (input.timer_state !== undefined) {
    if (!['reset', 'playing', 'paused'].includes(String(input.timer_state))) {
      throw new Error('timer_state 값이 올바르지 않습니다.')
    }

    patch.timer_state = input.timer_state
  }

  if (input.timer_remain_secs !== undefined) {
    const remainSecs = Number(input.timer_remain_secs)

    if (!Number.isInteger(remainSecs) || remainSecs < 0) {
      throw new Error('timer_remain_secs는 0 이상의 정수여야 합니다.')
    }

    patch.timer_remain_secs = remainSecs
  }

  if (input.timer_last_action_at !== undefined) {
    const time = new Date(String(input.timer_last_action_at))

    if (Number.isNaN(time.getTime())) {
      throw new Error('timer_last_action_at 값이 올바르지 않습니다.')
    }

    patch.timer_last_action_at = time.toISOString()
  }

  return patch
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const routePath = getRoutePath(req)

  try {
    if (req.method === 'POST' && routePath === '/auth') {
      const body = await req.json()
      const scope = String(body?.scope || '')
      const pin = String(body?.pin || '').trim()
      const rememberMinutes = normalizeRememberMinutes(body?.rememberMinutes)

      const expectedPin = scope === 'input'
        ? getSecret('PRESENTATION_INPUT_PIN')
        : scope === 'control'
          ? getSecret('PRESENTATION_CONTROL_PIN')
          : ''

      if (!expectedPin) {
        return jsonResponse(400, { error: '지원하지 않는 관리 범위입니다.' })
      }

      if (!pin || pin !== expectedPin) {
        return jsonResponse(401, { error: 'PIN이 일치하지 않습니다.' })
      }

      return jsonResponse(200, await issueToken(scope, rememberMinutes))
    }

    if (req.method === 'GET' && routePath === '/pages') {
      await verifyToken(req, ['input', 'control'])
      const teamId = validateTeamId(new URL(req.url).searchParams.get('teamId'))
      const { data, error } = await supabaseAdmin
        .from(TABLES.pages)
        .select('*')
        .eq('team_id', teamId)
        .order('page_no', { ascending: true })

      if (error) {
        throw error
      }

      return jsonResponse(200, { pages: data || [] })
    }

    if (req.method === 'POST' && routePath === '/pages') {
      await verifyToken(req, ['input'])
      const body = await req.json()
      const teamId = validateTeamId(body?.teamId)
      const rows = validatePages(body?.pages).map((page) =>
        Object.assign(page, { team_id: teamId })
      )

      const { error: upsertError } = await supabaseAdmin
        .from(TABLES.pages)
        .upsert(rows, { onConflict: 'team_id,page_no' })

      if (upsertError) {
        throw upsertError
      }

      const { error: deleteError } = await supabaseAdmin
        .from(TABLES.pages)
        .delete()
        .eq('team_id', teamId)
        .gt('page_no', rows.length)

      if (deleteError) {
        throw deleteError
      }

      return jsonResponse(200, { ok: true })
    }

    if (req.method === 'DELETE' && routePath === '/pages') {
      await verifyToken(req, ['control'])
      const teamIdParam = new URL(req.url).searchParams.get('teamId')
      const deleteQuery = supabaseAdmin.from(TABLES.pages).delete()

      if (teamIdParam) {
        const teamId = validateTeamId(teamIdParam)
        const { error } = await deleteQuery.eq('team_id', teamId)

        if (error) {
          throw error
        }

        return jsonResponse(200, { ok: true, mode: 'team', teamId })
      }

      const { error } = await deleteQuery.neq('id', 0)

      if (error) {
        throw error
      }

      const state = await resetStateToWaiting()
      const publicDisplay = await fetchPublicDisplayRow()

      return jsonResponse(200, {
        ok: true,
        mode: 'all',
        state,
        publicDisplay,
      })
    }

    if (req.method === 'GET' && routePath === '/state') {
      await verifyToken(req, ['control'])
      return jsonResponse(200, { state: await fetchStateRow() })
    }

    if (req.method === 'POST' && routePath === '/state') {
      await verifyToken(req, ['control'])
      const body = await req.json()
      const currentState = await fetchStateRow()
      const patch = sanitizeStatePatch((body?.state || {}) as Record<string, unknown>)
      const nextState = Object.assign({}, currentState, patch, {
        id: 1,
        updated_at: new Date().toISOString(),
      })

      const { data, error } = await supabaseAdmin
        .from(TABLES.state)
        .update(nextState)
        .eq('id', 1)
        .select('*')
        .maybeSingle()

      if (error) {
        throw error
      }

      const state = data || nextState
      const publicDisplay = await fetchPublicDisplayRow()

      return jsonResponse(200, { state, publicDisplay })
    }

    return jsonResponse(404, { error: '지원하지 않는 경로입니다.' })
  } catch (error) {
    if (error instanceof Response) {
      return error
    }

    return jsonResponse(500, {
      error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
    })
  }
})
