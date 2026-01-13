// ui/ui-helpers.js

// Screen
let screenLogin = null
let screenLobby = null
let screenRoom = null


// Messaggi login
let loginMsg = null

function cacheScreens() {
  screenLogin = document.getElementById('screen-login')
  screenLobby = document.getElementById('screen-lobby')
  screenRoom = document.getElementById('screen-room')
  return { screenLogin, screenLobby, screenRoom }
}

function getLoginMsg() {
  loginMsg = document.getElementById('login-msg')
  return loginMsg
}

function showScreen(name) {
  const screens = cacheScreens()
  if (!screens.screenLogin || !screens.screenLobby || !screens.screenRoom) {
    throw new Error('Screen containers not found. Verify view HTML is loaded before calling showScreen.')
  }

  screens.screenLogin.classList.add('hidden')
  screens.screenLobby.classList.add('hidden')
  screens.screenRoom.classList.add('hidden')

  if (name === 'login') screens.screenLogin.classList.remove('hidden')
  if (name === 'lobby') screens.screenLobby.classList.remove('hidden')
  if (name === 'room') screens.screenRoom.classList.remove('hidden')
}

function validateEmail(email) {
  return /\S+@\S+\.\S+/.test(email)
}

function clearMsg() {
  const msg = getLoginMsg()
  if (!msg) return
  msg.textContent = ''
  msg.classList.remove('msg--error', 'msg--success')
}

function setError(msg) {
  const msgEl = getLoginMsg()
  if (!msgEl) return
  msgEl.textContent = msg
  msgEl.classList.remove('msg--success')
  msgEl.classList.add('msg--error')
}

function setSuccess(msg) {
  const msgEl = getLoginMsg()
  if (!msgEl) return
  msgEl.textContent = msg
  msgEl.classList.remove('msg--error')
  msgEl.classList.add('msg--success')
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
};

export { tooltipEl, initTooltipListeners, getUnitTooltipHTML, showTooltip, hideTooltip, renderPickTooltip } from './tooltip.js';
export { addLongPress } from './gestures.js';
export { setupLeftAccordions, setupRightAccordions, openAccordionForRole, setupAccordions } from './accordions.js';
export { setupLeftCollapse, initSidebarsListeners } from './sidebars.js';
export { showSnackBar } from './snackbar.js';
export { ensureModal, openDialog, confirmDialog } from './dialog.js';
export { cardSheetHTML, showCardDetail, alliesPickerHTML } from './cards.js';
export { showVersusOverlay, hideVersusOverlay } from '../view-components/overlays/overlays/versus.js';
export { openDiceOverlay, closeDiceOverlay } from '../view-components/overlays/overlays/dice.js';
export { showAttackOverlayUnderDice, hideAttackOverlayUnderDice } from '../view-components/overlays/overlays/attack.js';
export { showTutorialPopupViaDialog } from '../view-components/overlays/tutorial.js';
