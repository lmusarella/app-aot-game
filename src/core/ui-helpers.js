// core/ui-helpers.js

// Screen
const screenLogin = document.getElementById('screen-login')
const screenLobby = document.getElementById('screen-lobby')
const screenRoom  = document.getElementById('screen-room')


// Messaggi login
const loginMsg = document.getElementById('login-msg')

function showScreen(name) {
  screenLogin.classList.add('hidden')
  screenLobby.classList.add('hidden')
  screenRoom.classList.add('hidden')

  if (name === 'login') screenLogin.classList.remove('hidden')
  if (name === 'lobby') screenLobby.classList.remove('hidden')
  if (name === 'room')  screenRoom.classList.remove('hidden')
}

function validateEmail(email) {
  return /\S+@\S+\.\S+/.test(email)
}

function clearMsg() {
  loginMsg.textContent = ''
  loginMsg.classList.remove('msg--error', 'msg--success')
}

function setError(msg) {
  loginMsg.textContent = msg
  loginMsg.classList.remove('msg--success')
  loginMsg.classList.add('msg--error')
}

function setSuccess(msg) {
  loginMsg.textContent = msg
  loginMsg.classList.remove('msg--error')
  loginMsg.classList.add('msg--success')
}

function setLoading(button, isLoading, originalText) {
  if (isLoading) {
    button.dataset.originalText = originalText || button.textContent
    button.textContent = 'Attendere...'
    button.disabled = true
  } else {
    button.textContent = button.dataset.originalText || originalText || button.textContent
    button.disabled = false
  }
}

export {
  showScreen,
  validateEmail,
  clearMsg,
  setError,
  setSuccess,
  setLoading,
  loginMsg, // se ti serve altrove
}
