// /js/lobby/lobby-ui.js
import { supabase } from '../supabase/supabaseClient.js'
import { APP_STATE } from '../core/app-state.js'
import { showScreen } from '../core/ui-helpers.js'
import { enterRoomScreen, stopRoomPresence } from './room-ui.js'
import { initGameForSinglePlayer, initGameForRoom } from '../game/game-sync.js'

// =========================
// DOM REFERENCES LOBBY
// =========================

const playerNameLbl    = document.getElementById('player-name')
const roomNameInput    = document.getElementById('room-name')
const btnCreateRoom    = document.getElementById('btn-create-room')
const createRoomMsg    = document.getElementById('create-room-msg')

const joinRoomMsg      = document.getElementById('join-room-msg')
const btnRefreshRooms  = document.getElementById('btn-refresh-rooms')
const roomList         = document.getElementById('room-list')
const myRoomList       = document.getElementById('my-room-list')
const myRoomsMsg       = document.getElementById('my-rooms-msg')

const btnSinglePlayer  = document.getElementById('btn-singleplayer')
const btnLogout        = document.getElementById('btn-logout')
const currentRoom      = document.getElementById('current-room')

// Lobby tabs
const lobbyTabCreate      = document.getElementById('lobby-tab-create')
const lobbyTabJoin        = document.getElementById('lobby-tab-join')
const lobbyCreateSection  = document.getElementById('lobby-create-section')
const lobbyJoinSection    = document.getElementById('lobby-join-section')

// =========================
// INIT LOBBY
// =========================

export function initLobbyUI() {
  // Tab create / join
  lobbyTabCreate.addEventListener('click', () => switchLobbyTab('create'))
  lobbyTabJoin.addEventListener('click', () => {
    switchLobbyTab('join')
    loadAvailableRooms()
  })

  // Bottoni
  btnCreateRoom.addEventListener('click', onCreateRoom)
  if (btnRefreshRooms) {
    btnRefreshRooms.addEventListener('click', loadAvailableRooms)
  }
  btnSinglePlayer?.addEventListener('click', onStartSinglePlayer)
  btnLogout.addEventListener('click', onLogout)
}

// =========================
// FUNZIONI LOBBY
// =========================

export function switchLobbyTab(target) {
  createRoomMsg.textContent = ''
  if (joinRoomMsg) joinRoomMsg.textContent = ''

  if (target === 'create') {
    lobbyTabCreate.classList.add('lobby-tab--active')
    lobbyTabJoin.classList.remove('lobby-tab--active')
    lobbyCreateSection.classList.remove('hidden')
    lobbyJoinSection.classList.add('hidden')
  } else {
    lobbyTabJoin.classList.add('lobby-tab--active')
    lobbyTabCreate.classList.remove('lobby-tab--active')
    lobbyJoinSection.classList.remove('hidden')
    lobbyCreateSection.classList.add('hidden')
  }
}

async function onCreateRoom() {
  if (!APP_STATE.user) {
    createRoomMsg.textContent = 'Non sei loggato.'
    return
  }

  const roomName = (roomNameInput.value || '').trim() || 'Stanza senza nome'
  createRoomMsg.textContent = 'Creo stanza...'

  const { data: room, error: errRoom } = await supabase
    .from('rooms')
    .insert({
      name: roomName,
      created_by: APP_STATE.user.id
    })
    .select()
    .single()

  if (errRoom) {
    createRoomMsg.textContent = 'Errore creazione stanza: ' + errRoom.message
    return
  }

  const nickname = APP_STATE.user.user_metadata?.nickname || APP_STATE.user.email

  const { error: errPlayer } = await supabase
    .from('room_players')
    .insert({
      room_id: room.id,
      user_id: APP_STATE.user.id,
      role: 'commander',
      is_ready: false,
      nickname
    })

  if (errPlayer) {
    createRoomMsg.textContent =
      'Stanza creata ma errore aggiungendo il comandante: ' + errPlayer.message
    return
  }

  APP_STATE.roomId = room.id
  APP_STATE.role = null
  APP_STATE.gameMode = 'multiplayer'

  createRoomMsg.textContent = 'Stanza creata!'
  currentRoom.textContent = `Stanza: ${room.name} (ID: ${room.id})`

  enterRoomScreen(room.id)
}

function onStartSinglePlayer() {
  stopRoomPresence();
  APP_STATE.roomId = null;
  APP_STATE.role = 'commander';
  APP_STATE.isGameDriver = true;
  APP_STATE.roomPlayers = [];
  APP_STATE.gameMode = 'single';
  currentRoom.textContent = 'Modalità singolo giocatore';
  showScreen('game');
  initGameForSinglePlayer();
}

// =========================
// LISTA PARTITE DISPONIBILI
// =========================

async function loadAvailableRooms() {
  if (!APP_STATE.user) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Non sei loggato.'
    return
  }

  if (!roomList || !myRoomList) return

  roomList.innerHTML = ''
  myRoomList.innerHTML = ''
  if (joinRoomMsg) joinRoomMsg.textContent = 'Carico le partite...'
  if (myRoomsMsg) myRoomsMsg.textContent = 'Carico le tue partite...'

  // 1) prendo le stanze attive (escludo in_game se vuoi solo quelle in attesa)
  const { data: rooms, error: errRooms } = await supabase
    .from('rooms')
    .select('id, name, status, created_at')
    .in('status', ['lobby', 'roles_select', 'units_selection'])
    .order('created_at', { ascending: false })
    .limit(30)

  if (errRooms) {
    console.error('Errore caricando le stanze:', errRooms)
    if (joinRoomMsg) joinRoomMsg.textContent = 'Errore caricando le partite.'
    return
  }

  const { data: myRoomRows, error: errMyRooms } = await supabase
    .from('room_players')
    .select('room_id')
    .eq('user_id', APP_STATE.user.id)

  if (errMyRooms) {
    console.error('Errore caricando le tue partite:', errMyRooms)
  }

  const myRoomIds = Array.isArray(myRoomRows)
    ? [...new Set(myRoomRows.map(row => row.room_id).filter(Boolean))]
    : []

  let myRooms = []
  if (myRoomIds.length > 0) {
    const { data: myRoomsData, error: errMyRoomsData } = await supabase
      .from('rooms')
      .select('id, name, status, created_at')
      .in('id', myRoomIds)
      .order('created_at', { ascending: false })

    if (errMyRoomsData) {
      console.error('Errore caricando le stanze personali:', errMyRoomsData)
    } else {
      myRooms = myRoomsData || []
    }
  }

  if (!rooms || rooms.length === 0) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Nessuna partita disponibile al momento.'
  }

  // 2) prendo tutti i giocatori per queste stanze e conto per room_id
  const roomIds = [...rooms.map(r => r.id), ...myRooms.map(r => r.id)]
  const countByRoom = {}

  if (roomIds.length > 0) {
    const { data: players, error: errPlayers } = await supabase
      .from('room_players')
      .select('room_id')
      .in('room_id', roomIds)

    if (!errPlayers && players) {
      players.forEach(p => {
        countByRoom[p.room_id] = (countByRoom[p.room_id] || 0) + 1
      })
    }
  }

  // 3) render lista
  roomList.innerHTML = ''
  myRoomList.innerHTML = ''
  if (joinRoomMsg) joinRoomMsg.textContent = ''
  if (myRoomsMsg) myRoomsMsg.textContent = ''

  if (myRooms.length === 0) {
    if (myRoomsMsg) myRoomsMsg.textContent = 'Non hai partite attive.'
  } else {
    renderRoomList(myRoomList, myRooms, countByRoom, room => {
      const label = room.status === 'in_game' ? 'Rientra' : 'Apri'
      return { label, onClick: () => resumeRoom(room) }
    })
  }

  const availableRooms = rooms.filter(room => !myRoomIds.includes(room.id))
  if (!availableRooms || availableRooms.length === 0) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Nessuna partita disponibile al momento.'
    return
  }

  renderRoomList(roomList, availableRooms, countByRoom, room => ({
    label: 'Entra',
    onClick: () => joinExistingRoom(room.id)
  }))
}

function renderRoomList(targetList, rooms, countByRoom, actionBuilder) {
  rooms.forEach(room => {
    const li = document.createElement('li')
    li.className = 'room-list-item'

    const info = document.createElement('div')
    info.className = 'room-list-info'

    const nameEl = document.createElement('div')
    nameEl.className = 'room-list-name'
    nameEl.textContent = room.name || 'Stanza senza nome'

    const metaEl = document.createElement('div')
    metaEl.className = 'room-list-meta'
    const playerCount = countByRoom[room.id] || 0
    metaEl.textContent = `Giocatori: ${playerCount} • Stato: ${humanRoomStatus(room.status)}`

    info.appendChild(nameEl)
    info.appendChild(metaEl)

    const { label, onClick } = actionBuilder(room)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn-primary room-list-join'
    btn.textContent = label
    btn.addEventListener('click', onClick)

    li.append(info, btn)
    targetList.appendChild(li)
  })
}

function humanRoomStatus(status) {
  switch (status) {
    case 'lobby':
      return 'In attesa'
    case 'roles_select':
      return 'Selezione ruoli'
    case 'units_selection':
      return 'Scelta unità'
    case 'in_game':
      return 'In gioco'
    default:
      return status || 'Sconosciuto'
  }
}

async function joinExistingRoom(roomId) {
  if (!APP_STATE.user) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Non sei loggato.'
    return
  }

  if (joinRoomMsg) joinRoomMsg.textContent = 'Entro nella stanza...'

  try {
    const { data: room, error: errRoom } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (errRoom || !room) {
      if (joinRoomMsg) joinRoomMsg.textContent = 'Stanza non trovata.'
      return
    }

    const nickname = APP_STATE.user.user_metadata?.nickname || APP_STATE.user.email

    const { error: errPlayer } = await supabase
      .from('room_players')
      .upsert({
        room_id: roomId,
        user_id: APP_STATE.user.id,
        role: null,
        is_ready: false,
        nickname
      })

    if (errPlayer) {
      if (joinRoomMsg) joinRoomMsg.textContent = 'Errore ingresso stanza: ' + errPlayer.message
      return
    }

    APP_STATE.roomId = roomId
    APP_STATE.role = null
    APP_STATE.gameMode = 'multiplayer'

    if (joinRoomMsg) joinRoomMsg.textContent = 'Sei entrato nella stanza!'
    currentRoom.textContent = `Stanza: ${room.name} (ID: ${room.id})`

    enterRoomScreen(roomId)
  } catch (e) {
    console.error('Eccezione in joinExistingRoom:', e)
    if (joinRoomMsg) joinRoomMsg.textContent = 'Errore inatteso entrando nella stanza.'
  }
}

async function resumeRoom(room) {
  if (!APP_STATE.user) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Non sei loggato.'
    return
  }

  APP_STATE.roomId = room.id
  APP_STATE.role = null
  APP_STATE.gameMode = 'multiplayer'
  currentRoom.textContent = `Stanza: ${room.name} (ID: ${room.id})`

  if (room.status !== 'in_game') {
    enterRoomScreen(room.id)
    return
  }

  const { data: players, error: errPlayers } = await supabase
    .from('room_players')
    .select('user_id, last_seen, ready_to_field, unit_code, ready_unit, is_commander, nickname, commander_code, recruit_codes')
    .eq('room_id', room.id)

  if (errPlayers || !players || players.length === 0) {
    if (joinRoomMsg) joinRoomMsg.textContent = 'Errore caricando i giocatori.'
    return
  }

  const meRow = players.find(p => p.user_id === APP_STATE.user.id)
  if (!meRow || !meRow.unit_code || !meRow.ready_unit) {
    enterRoomScreen(room.id)
    return
  }

  showScreen('game')
  initGameForRoom(room.id, meRow, players, room)
}

// =========================
// LOGOUT
// =========================

async function onLogout() {
  // stop loop presenza stanza
  stopRoomPresence()

  await supabase.auth.signOut()

  APP_STATE.roomId = null
  APP_STATE.role = null
  APP_STATE.gameMode = null
  currentRoom.textContent = ''

  // Torna allo screen login
  showScreen('login')
}
