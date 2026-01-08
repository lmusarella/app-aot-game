// auth/auth-ui.js
import { supabase } from '../supabase/supabaseClient.js'
import { APP_STATE, registerGameAPI } from '../core/app-state.js'
import {
  showScreen,
  validateEmail,
  clearMsg,
  setError,
  setSuccess,
  setLoading
} from '../core/ui-helpers.js'
import { enterRoomScreen } from '../lobby/room-ui.js'   // lo creiamo dopo
import { initGameForRoom } from '../game/game-sync.js'

// DOM auth
const tabLogin = document.getElementById('tab-login')
const tabRegister = document.getElementById('tab-register')
const formLogin = document.getElementById('form-login')
const emailInput = document.getElementById('login-email')
const passwordInput = document.getElementById('login-password')
const btnLogin = document.getElementById('btn-login')

const formRegister = document.getElementById('form-register')
const regEmail = document.getElementById('reg-email')
const regPassword = document.getElementById('reg-password')
const regPassword2 = document.getElementById('reg-password2')
const btnRegister = document.getElementById('btn-register')
const regNickname = document.getElementById('reg-nickname')

const rememberCheckbox = document.getElementById('login-remember')
const playerNameLbl = document.getElementById('player-name')
const currentRoom = document.getElementById('current-room')

// LocalStorage keys
const LS_REMEMBER_EMAIL = 'aot_remember_email'
const LS_REMEMBER_FLAG = 'aot_remember_flag'

// Lobby tab DOM (solo per switch tab iniziale)
const lobbyTabCreate = document.getElementById('lobby-tab-create')
const lobbyTabJoin = document.getElementById('lobby-tab-join')
const lobbyCreateSection = document.getElementById('lobby-create-section')
const lobbyJoinSection = document.getElementById('lobby-join-section')

const hdrUserName = document.getElementById('hdr-user-name')
const hdrLogout = document.getElementById('hdr-logout')

function switchAuthTab(target) {
  clearMsg()

  if (target === 'login') {
    tabLogin.classList.add('auth-tab--active')
    tabRegister.classList.remove('auth-tab--active')
    formLogin.classList.remove('hidden')
    formRegister.classList.add('hidden')
  } else {
    tabRegister.classList.add('auth-tab--active')
    tabLogin.classList.remove('auth-tab--active')
    formRegister.classList.remove('hidden')
    formLogin.classList.add('hidden')
  }
}

function switchLobbyTab(target) {
  const createRoomMsg = document.getElementById('create-room-msg')
  const joinRoomMsg = document.getElementById('join-room-msg')

  createRoomMsg.textContent = ''
  joinRoomMsg.textContent = ''

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

// ====== INIT PRINCIPALE ======
export async function initAuthUI(gameApiFromOutside) {
  // registra dipendenze verso il motore di gioco
  registerGameAPI(gameApiFromOutside)

  // Tabs
  tabLogin.addEventListener('click', () => switchAuthTab('login'))
  tabRegister.addEventListener('click', () => switchAuthTab('register'))

  // Submit
  formLogin.addEventListener('submit', e => {
    e.preventDefault()
    onLogin()
  })
  formRegister.addEventListener('submit', e => {
    e.preventDefault()
    onRegister()
  })

  // Input validation immediata
  emailInput.addEventListener('input', updateLoginButtonState)
  passwordInput.addEventListener('input', updateLoginButtonState)
  regNickname.addEventListener('input', updateRegisterButtonState)
  regEmail.addEventListener('input', updateRegisterButtonState)
  regPassword.addEventListener('input', updateRegisterButtonState)
  regPassword2.addEventListener('input', updateRegisterButtonState)

  // Ricordami
  const rememberFlag = localStorage.getItem(LS_REMEMBER_FLAG) === '1'
  const rememberedEmail = localStorage.getItem(LS_REMEMBER_EMAIL) || ''

  if (rememberFlag && rememberedEmail) {
    rememberCheckbox.checked = true
    emailInput.value = rememberedEmail
    updateLoginButtonState()
  }

  // Session esistente
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    APP_STATE.user = session.user
    onUserLoggedIn(session.user)
    await restoreLocation(session.user)
  } else {
    showScreen('login')
  }

  if (hdrLogout) {
    hdrLogout.addEventListener('click', onLogout)
  }
  // Listener auth
  supabase.auth.onAuthStateChange(async (_event, session2) => {
    if (session2?.user) {
      APP_STATE.user = session2.user
      await restoreLocation(session2.user)
    } else {
      APP_STATE.user = null
      onUserLoggedOut()
    }
  })
}

// ==== funzioni di supporto ====

function updateLoginButtonState() {
  const email = (emailInput.value || '').trim()
  const pw = passwordInput.value || ''
  const isValid = validateEmail(email) && pw.length >= 6
  btnLogin.disabled = !isValid
}

function updateRegisterButtonState() {
  const nick = (regNickname.value || '').trim()
  const email = (regEmail.value || '').trim()
  const pw1 = regPassword.value || ''
  const pw2 = regPassword2.value || ''

  const isValid =
    nick.length >= 2 &&
    validateEmail(email) &&
    pw1.length >= 6 &&
    pw1 === pw2

  btnRegister.disabled = !isValid
}

async function onLogin() {
  clearMsg()
  const email = (emailInput.value || '').trim()
  const password = passwordInput.value || ''

  if (!validateEmail(email) || password.length < 6) {
    setError('Controlla email e password (min 6 caratteri).')
    return
  }

  setLoading(btnLogin, true, 'Accedi')

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    setError('Accesso negato: ' + error.message)
    setLoading(btnLogin, false, 'Accedi')
  } else {
    if (rememberCheckbox.checked) {
      localStorage.setItem(LS_REMEMBER_EMAIL, email)
      localStorage.setItem(LS_REMEMBER_FLAG, '1')
    } else {
      localStorage.removeItem(LS_REMEMBER_EMAIL)
      localStorage.setItem(LS_REMEMBER_FLAG, '0')
    }
    setSuccess('Accesso riuscito!')
    // onAuthStateChange farà il resto
  }
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
  currentRoom.textContent = ''

  // Torna allo screen login
  showScreen('login')
}

async function onRegister() {
  clearMsg()
  const nickname = (regNickname.value || '').trim()
  const email = (regEmail.value || '').trim()
  const pw1 = regPassword.value || ''
  const pw2 = regPassword2.value || ''

  if (nickname.length < 2) {
    setError('Il NickName deve avere almeno 2 caratteri.')
    return
  }
  if (!validateEmail(email)) {
    setError('Email non valida.')
    return
  }
  if (pw1.length < 6) {
    setError('La password deve avere almeno 6 caratteri.')
    return
  }
  if (pw1 !== pw2) {
    setError('Le password non coincidono.')
    return
  }

  setLoading(btnRegister, true, 'Crea account')

  const { error } = await supabase.auth.signUp({
    email,
    password: pw1,
    options: { data: { nickname } }
  })

  if (error) {
    setError('Errore registrazione: ' + error.message)
    setLoading(btnRegister, false, 'Crea account')
  } else {
    setSuccess('Account creato! Ora puoi accedere.')
    setLoading(btnRegister, false, 'Crea account')
    switchAuthTab('login')
    emailInput.value = email
    passwordInput.value = ''
    updateLoginButtonState()
  }
}

function onUserLoggedIn(user) {
  const nickname = user.user_metadata?.nickname
  const displayName = nickname || user.email || '(senza nome)'

  playerNameLbl.textContent = displayName;

  if (hdrUserName) {
    hdrUserName.textContent = displayName
  }

  clearMsg()
  showScreen('lobby')
  switchLobbyTab('create')
}

function onUserLoggedOut() {
  APP_STATE.roomId = null
  APP_STATE.role = null
  currentRoom.textContent = ''
  // stopRoomPresence lo chiameremo dal modulo room-ui se serve
  if (hdrUserName) {
    hdrUserName.textContent = '—'
  }

  setError('Sei disconnesso.')
  showScreen('login')
}

async function restoreLocation(user) {
  const { data: rp, error } = await supabase
    .from('room_players')
    .select('room_id, is_commander')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error || !rp) {
    onUserLoggedIn(user)
    return
  }

  const roomId = rp.room_id
  APP_STATE.roomId = roomId
  APP_STATE.role = rp.is_commander ? 'commander' : 'recruit';
  // mi serve tutta la stanza, non solo status
  const { data: room, error: errRoom } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()

  if (errRoom || !room) {
    onUserLoggedIn(user)
    return
  }

  if (room.status === 'in_game') {
    // recupero tutti i giocatori
    const { data: players, error: errPlayers } = await supabase
      .from('room_players')
      .select(
        'user_id, last_seen, ready_to_field, unit_code, ready_unit, is_commander, nickname, commander_code, recruit_codes'
      )
      .eq('room_id', roomId)

    if (errPlayers || !players || players.length === 0) {
      // fallback: torno in lobby
      onUserLoggedIn(user)
      return
    }

    const meRow = players.find(p => p.user_id === user.id)

    // se per qualche motivo non ho ancora unità assegnata → torno alla room
    if (!meRow || !meRow.unit_code || !meRow.ready_unit) {
      enterRoomScreen(roomId)
      return
    }

    showScreen('game')
    initGameForRoom(roomId, meRow, players, room)
  } else {
    // lobby / roles_select / units_selection
    enterRoomScreen(roomId)
  }
}
