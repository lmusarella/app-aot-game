// lobby/room-ui.js
import { supabase } from '../supabase/supabaseClient.js'
import { APP_STATE } from '../core/app-state.js'
import { showScreen, setError } from '../core/ui-helpers.js'
import {
  getCommanderPool,
  getRecruitPool,
  getUnitData,
  shuffle,
  pickOne,
  pickManyUnique
} from '../core/random-helpers.js'
import { initGameForRoom } from '../game/game-sync.js'

// =========================
// DOM SPECIFICI ROOM
// =========================

const roomIdLabel       = document.getElementById('room-id-label')
const roomPlayersList   = document.getElementById('room-players-list')
const roomPlayersMsg    = document.getElementById('room-players-msg')
const roomPhaseLabel    = document.getElementById('room-phase')

const roomUnitBox       = document.getElementById('room-unit-box')
const roomUnitLabel     = document.getElementById('room-unit-label')
const roomUnitGrid      = document.getElementById('room-unit-grid')
const roomUnitSelect    = document.getElementById('room-unit-select')

const btnRoomEnterField = document.getElementById('btn-room-enter-field')
const btnRoomAssign     = document.getElementById('btn-room-assign')
const btnRoomReadyUnit  = document.getElementById('btn-room-ready-unit')
const btnRoomToGame     = document.getElementById('btn-room-to-game')
const btnRoomBackLobby  = document.getElementById('btn-room-back-lobby')



 // Room buttons
  btnRoomEnterField.addEventListener('click', onEnterField)
  btnRoomAssign.addEventListener('click', onAssignRolesAndUnits)
  btnRoomReadyUnit.addEventListener('click', onReadyUnit)
  btnRoomBackLobby.addEventListener('click', onRoomBackToLobby)
  btnRoomToGame.addEventListener('click', onRoomGoToGame)

// questo è lo stesso elemento usato in lobby
const currentRoom       = document.getElementById('current-room')

// =========================
// STATO ROOM LOCALE
// =========================

let roomHeartbeat = null
let roomStatePoll = null
let myRoomRow = null

// =========================
// FUNZIONI DI SUPPORTO
// =========================

function setPhase(text, loading = false) {
  roomPhaseLabel.textContent = text
  roomPhaseLabel.classList.toggle('phase-loading', loading)
}

async function ensurePlayerUnitPool() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !APP_STATE.roomId) return

  const { data: rp, error } = await supabase
    .from('room_players')
    .select('commander_code, recruit_codes')
    .eq('room_id', APP_STATE.roomId)
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Errore caricando room_player:', error)
    return
  }

  const hasCommander = !!rp.commander_code
  const hasThreeRecruits = Array.isArray(rp.recruit_codes) && rp.recruit_codes.length === 3

  if (hasCommander && hasThreeRecruits) return


  const commander = pickOne(getCommanderPool());
  const recruits  = pickManyUnique(getRecruitPool(), 3)

  await supabase
    .from('room_players')
    .update({
      commander_code: commander,
      recruit_codes: recruits
    })
    .eq('room_id', APP_STATE.roomId)
    .eq('user_id', user.id)
}

function startRoomLoops() {
  stopRoomLoops()
  if (!APP_STATE.roomId) return

  roomHeartbeat = setInterval(updateLastSeen, 3000)
  roomStatePoll = setInterval(refreshRoomState, 3000)

  updateLastSeen()
}

function stopRoomLoops() {
  if (roomHeartbeat) {
    clearInterval(roomHeartbeat)
    roomHeartbeat = null
  }
  if (roomStatePoll) {
    clearInterval(roomStatePoll)
    roomStatePoll = null
  }
}

export function stopRoomPresence() {
  // alias semantico
  stopRoomLoops()
}

// =========================
// ENTER ROOM SCREEN
// =========================

export async function enterRoomScreen(roomId) {
  roomIdLabel.textContent = roomId
  roomPlayersList.innerHTML = ''
  roomPlayersMsg.textContent = 'Carico giocatori...'

  setPhase('In attesa che tutti entrino in campo.', true)
  roomUnitBox.classList.add('hidden')
  btnRoomToGame.classList.add('hidden')
  btnRoomAssign.classList.add('hidden')
  btnRoomEnterField.disabled = false

  showScreen('room')

  await ensurePlayerUnitPool()
  startRoomLoops()
  refreshRoomState()
}

// =========================
// PRESENCE & STATE
// =========================

async function updateLastSeen() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !APP_STATE.roomId) return

  await supabase
    .from('room_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_id', APP_STATE.roomId)
    .eq('user_id', user.id)
}

async function refreshRoomState() {
  if (!APP_STATE.roomId) return
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const myId = user.id

  const { data: room, error: errRoom } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', APP_STATE.roomId)
    .single()

  if (errRoom || !room) {
    roomPlayersMsg.textContent = 'Stanza non trovata.'
    return
  }

  const isLeader = room.leader_id === myId || room.created_by === myId

  const { data: players, error: errPlayers } = await supabase
    .from('room_players')
    .select('user_id, last_seen, ready_to_field, unit_code, ready_unit, is_commander, nickname, commander_code, recruit_codes')
    .eq('room_id', APP_STATE.roomId)
    .order('user_id', { ascending: true })

  if (errPlayers) {
    roomPlayersMsg.textContent = 'Errore caricando giocatori.'
    console.error(errPlayers)
    return
  }

  myRoomRow = players.find(p => p.user_id === myId)

  renderRoomPlayersList(players, myId, room.status)
  renderMyUnitBox(room, myRoomRow)

  const playersCount   = players.length
  const enoughPlayers  = playersCount >= 2
  const allFieldReady  = playersCount > 0 && players.every(p => p.ready_to_field)
  const allUnitsReady  = playersCount > 0 && players.every(p => p.unit_code && p.ready_unit)

  // Stato: lobby
  if (room.status === 'lobby') {
    if (allFieldReady && isLeader && enoughPlayers) {
      await supabase
        .from('rooms')
        .update({ status: 'roles_select' })
        .eq('id', room.id)
      room.status = 'roles_select'
    }
  }

  if (room.status === 'lobby') {
    setPhase('Clicca "Entra in campo" e attendi gli altri.', true)
    btnRoomEnterField.classList.remove('hidden')
    btnRoomAssign.classList.add('hidden')
    roomUnitBox.classList.add('hidden')
    btnRoomToGame.classList.add('hidden')
    return
  }

  // Stato: roles_select
  if (room.status === 'roles_select') {
    btnRoomEnterField.classList.add('hidden')
    roomUnitBox.classList.add('hidden')
    btnRoomToGame.classList.add('hidden')

    if (!enoughPlayers) {
      btnRoomEnterField.disabled = true
      btnRoomEnterField.classList.remove('hidden')
      setPhase('In attesa di altri giocatori (minimo 2 per iniziare).', true)
    } else {
      if (isLeader) {
        setPhase('Tutti sono entrati in campo. Estrai il comandante e le reclute.', true)
        btnRoomAssign.classList.remove('hidden')
      } else {
        setPhase('Tutti sono entrati in campo. In attesa che vengano scelti comandante e reclute.', true)
        btnRoomAssign.classList.add('hidden')
      }
    }
    return
  }

  // Stato: units_selection
  if (room.status === 'units_selection') {
    btnRoomEnterField.classList.add('hidden')
    btnRoomAssign.classList.add('hidden')
    btnRoomToGame.classList.add('hidden')

    const me = players.find(p => p.user_id === myId)
    if (me && me.unit_code) {
      roomUnitBox.classList.remove('hidden')
      const isCommanderUnit = me.unit_code.startsWith('cmd_')
      roomUnitLabel.textContent = isCommanderUnit
        ? `Ti è stato assegnato un COMANDANTE: ${me.unit_code}`
        : `Ti è stata assegnata una RECLUTA: ${me.unit_code}`

      btnRoomReadyUnit.disabled = !!me.ready_unit
      if (me.ready_unit) {
        setPhase('Sei pronto. In attesa degli altri giocatori.', true)
      } else {
        setPhase('Controlla la tua unità e clicca "Sono pronto".', true)
      }
    } else {
      setPhase('In attesa che vengano assegnate le unità.', true)
    }

    if (allUnitsReady && isLeader) {
      await supabase
        .from('rooms')
        .update({ status: 'in_game' })
        .eq('id', room.id)
    }
    return
  }

  // Stato: in_game
  if (room.status === 'in_game') {
    const me = players.find(p => p.user_id === myId)
    if (me && me.unit_code && me.ready_unit) {
      stopRoomLoops()
      showScreen('game')
      initGameForRoom(room.id, me, players, room)
    }

    setPhase('Partita in corso.', false)
    btnRoomEnterField.classList.add('hidden')
    btnRoomAssign.classList.add('hidden')
    roomUnitBox.classList.add('hidden')
    btnRoomToGame.classList.add('hidden')
  }
}

// =========================
// RENDER LISTA GIOCATORI / UNIT BOX
// =========================

function renderMyUnitBox(room, me) {
  if (!me || room.status !== 'units_selection') {
    roomUnitBox.classList.add('hidden')
    return
  }

  roomUnitBox.classList.remove('hidden')
  roomUnitGrid.innerHTML = ''
  roomUnitSelect.innerHTML = ''

  const isCommander   = !!me.is_commander
  const commanderCode = me.commander_code
  const recruits      = Array.isArray(me.recruit_codes) ? me.recruit_codes : []

  let codesToShow = []

  if (isCommander) {
    codesToShow = [commanderCode]
    roomUnitLabel.textContent = 'Sei il COMANDANTE. Userai il tuo comandante personale.'
  } else {
    codesToShow = recruits
    roomUnitLabel.textContent = 'Scegli una delle tue RECLUTE per la missione.'
  }

  codesToShow.forEach(code => {
    if (!code) return

    const opt = document.createElement('option')
    opt.value = code
    opt.textContent = code
    roomUnitSelect.appendChild(opt)

    const data = getUnitData().find(unit => unit.id === code) || {
      name: code,
      avatar: 'assets/units/default.png',
      type: isCommander ? 'commander' : 'recruit'
    }

    const card = document.createElement('div')
    card.className = 'unit-card'
    card.dataset.code = code

    const avatarWrap = document.createElement('div')
    avatarWrap.className = 'unit-avatar'
    const img = document.createElement('img')
    img.src = data.avatar || 'assets/units/default.png'
    img.alt = data.name
    avatarWrap.appendChild(img)

    const infoBox = document.createElement('div')
    const titleEl = document.createElement('div')
    titleEl.className = 'unit-info-title'
    titleEl.textContent = data.name

    const tagEl = document.createElement('div')
    tagEl.className = 'unit-info-tag'
    tagEl.textContent = data.type === 'commander' ? 'Comandante' : 'Recluta'

    infoBox.appendChild(titleEl)
    infoBox.appendChild(tagEl)

    card.appendChild(avatarWrap)
    card.appendChild(infoBox)

    card.addEventListener('click', () => {
      if (me.ready_unit) return
      roomUnitSelect.value = code
      updateUnitCardSelection()
    })

    roomUnitGrid.appendChild(card)
  })

  if (me.unit_code && codesToShow.includes(me.unit_code)) {
    roomUnitSelect.value = me.unit_code
  } else if (codesToShow.length) {
    roomUnitSelect.value = codesToShow[0]
  }
  updateUnitCardSelection()

  btnRoomReadyUnit.disabled = !!me.ready_unit
  if (me.ready_unit) {
    setPhase('Sei pronto. In attesa degli altri giocatori.', true)
  }
}

function updateUnitCardSelection() {
  const selected = roomUnitSelect.value
  roomUnitGrid.querySelectorAll('.unit-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.code === selected)
  })
}

function renderRoomPlayersList(players, myId, roomStatus) {
  const now = Date.now()
  roomPlayersList.innerHTML = ''

  if (!players || players.length === 0) {
    roomPlayersMsg.textContent = 'Nessun giocatore in stanza.'
    return
  }

  roomPlayersMsg.textContent = ''

  players.forEach(p => {
    const li = document.createElement('li')
    li.className = 'room-player-item'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'room-player-name'

    const displayName = p.nickname || p.user_id.slice(0, 8)

    if (p.user_id === myId) {
      nameSpan.textContent = displayName
      const meSpan = document.createElement('span')
      meSpan.className = 'room-player-me'
      meSpan.textContent = '(Tu)'
      nameSpan.appendChild(meSpan)
    } else {
      nameSpan.textContent = displayName
    }

    const meta = document.createElement('div')
    meta.className = 'room-player-meta'

    const statusSpan = document.createElement('span')
    statusSpan.className = 'room-player-status'
    const last = p.last_seen ? new Date(p.last_seen).getTime() : 0
    const online = last && now - last < 20000

    if (online) {
      statusSpan.textContent = 'Online'
      statusSpan.classList.add('room-player-status--online')
    } else {
      statusSpan.textContent = 'Offline'
      statusSpan.classList.add('room-player-status--offline')
    }

    const roleChip = document.createElement('span')
    roleChip.className = 'room-player-chip'

    if (roomStatus === 'units_selection' || roomStatus === 'in_game') {
      if (p.is_commander) {
        roleChip.textContent = 'Comandante'
        roleChip.classList.add('room-player-chip--ready')
      } else {
        roleChip.textContent = 'Recluta'
        roleChip.classList.add('room-player-chip--notready')
      }
    } else {
      roleChip.textContent = 'Ruolo da assegnare'
      roleChip.classList.add('room-player-chip--notready')
    }

    const readyChip = document.createElement('span')
    readyChip.className = 'room-player-chip'
    let isReady = false

    if (roomStatus === 'lobby') {
      isReady = !!p.ready_to_field
      readyChip.textContent = isReady ? 'Pronto a entrare' : 'Non pronto'
    } else if (roomStatus === 'units_selection') {
      isReady = !!p.ready_unit
      readyChip.textContent = isReady ? 'Unità pronta' : 'Scegli unità'
    } else if (roomStatus === 'in_game') {
      isReady = true
      readyChip.textContent = 'In gioco'
    } else {
      readyChip.textContent = 'In attesa'
    }

    readyChip.classList.add(
      isReady ? 'room-player-chip--ready' : 'room-player-chip--notready'
    )

    meta.appendChild(statusSpan)
    meta.appendChild(roleChip)
    meta.appendChild(readyChip)

    li.appendChild(nameSpan)
    li.appendChild(meta)
    roomPlayersList.appendChild(li)
  })
}

// =========================
// ACTIONS
// =========================

export async function onEnterField() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !APP_STATE.roomId) return

  btnRoomEnterField.disabled = true
  roomPhaseLabel.textContent = 'In attesa degli altri giocatori...'

  await supabase
    .from('room_players')
    .update({ ready_to_field: true })
    .eq('room_id', APP_STATE.roomId)
    .eq('user_id', user.id)

  refreshRoomState()
}

export async function onAssignRolesAndUnits() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !APP_STATE.roomId) return

  const { data: room, error: errRoom } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', APP_STATE.roomId)
    .single()

  if (errRoom || !room) {
    setError('Stanza non trovata.')
    return
  }

  const isLeader = room.leader_id === user.id || room.created_by === user.id
  if (!isLeader) {
    setError('Solo il creatore stanza può estrarre il comandante.')
    return
  }

  const { data: players, error: errPlayers } = await supabase
    .from('room_players')
    .select('user_id, ready_to_field, commander_code, recruit_codes')
    .eq('room_id', APP_STATE.roomId)

  if (errPlayers || !players || players.length === 0) {
    setError('Nessun giocatore in stanza.')
    return
  }

  const allFieldReady = players.every(p => p.ready_to_field)
  if (!allFieldReady) {
    setError('Non tutti i giocatori hanno cliccato "Entra in campo".')
    return
  }

  const shuffledPlayers = shuffle(players)
  const commanderPlayer = shuffledPlayers[0]
  const commanderUserId = commanderPlayer.user_id

  const updates = players.map(p => ({
    room_id: APP_STATE.roomId,
    user_id: p.user_id,
    is_commander: p.user_id === commanderUserId,
    unit_code: null,
    ready_unit: false
  }))

  const { error: errUpdate } = await supabase
    .from('room_players')
    .upsert(updates, { onConflict: 'room_id,user_id' })

 

  if (errUpdate) {
    setError('Errore assegnando il comandante.')
    console.error(errUpdate)
    return
  }

  await supabase
    .from('rooms')
    .update({ status: 'units_selection' })
    .eq('id', APP_STATE.roomId)

  setPhase('Comandante estratto. Ogni giocatore deve scegliere la propria unità.', true)
  refreshRoomState()
}

export async function onReadyUnit() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !APP_STATE.roomId || !myRoomRow) return

  const isCommander      = !!myRoomRow.is_commander
  const commanderCode    = myRoomRow.commander_code
  const selectedFromSelect = roomUnitSelect.value

  const unitToUse = isCommander ? commanderCode : selectedFromSelect

  btnRoomReadyUnit.disabled = true
  setPhase('Sei pronto. In attesa degli altri...', true)

  await supabase
    .from('room_players')
    .update({
      unit_code: unitToUse,
      ready_unit: true
    })
    .eq('room_id', APP_STATE.roomId)
    .eq('user_id', user.id)

  const { data: players, error } = await supabase
    .from('room_players')
    .select('unit_code, ready_unit')
    .eq('room_id', APP_STATE.roomId)

  if (!error && players && players.length > 0) {
    const allReady = players.every(p => p.unit_code && p.ready_unit)

    if (allReady) {
      await supabase
        .from('rooms')
        .update({ status: 'in_game' })
        .eq('id', APP_STATE.roomId)
    }
  }

  refreshRoomState()
}

export function onRoomGoToGame() {
  stopRoomLoops()
  showScreen('game')
}

// =========================
// BACK TO LOBBY
// =========================

export async function onRoomBackToLobby() {
  stopRoomLoops()

  const { data: { user } } = await supabase.auth.getUser()
  const roomId = APP_STATE.roomId

  if (user && roomId) {
    await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id)

    const { data: remaining, error } = await supabase
      .from('room_players')
      .select('user_id')
      .eq('room_id', roomId)

    if (!error && (!remaining || remaining.length === 0)) {
      await supabase
        .from('rooms')
        .delete()
        .eq('id', roomId)
    }
  }

  APP_STATE.roomId = null
  APP_STATE.role   = null
  APP_STATE.gameMode = null
  currentRoom.textContent = ''
  roomIdLabel.textContent = ''
  roomPlayersList.innerHTML = ''
  roomPlayersMsg.textContent = ''
  roomPhaseLabel.textContent = ''

  showScreen('lobby')
}
