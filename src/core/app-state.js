// core/app-state.js
import { GAME_STATE, restore,snapshot } from '../data.js'
import { initRenderApp } from '../services.js'

const APP_STATE = {
  user: null,
  roomId: null,
  role: null,
  roomPlayers: [],
  isGameDriver: false,
  gameChannel: null,
  presenceChannel: null,
  presenceTimerId: null
}

let gameAPI = {
  resetGameState: () =>
    console.warn('[gameAPI] resetGameState non fornita'),
  applyLoadedState: (state) => {
    console.info('[gameAPI] applyLoadedState restore: ', state)
    restore(state);
  },
  renderGameFromState: () => {
    initRenderApp(true);
  }
    
}

// da chiamare dal main quando hai il motore di gioco
function registerGameAPI(api) {
  if (api && typeof api === 'object') {
    gameAPI = { ...gameAPI, ...api }
  }
}

export { APP_STATE, GAME_STATE, gameAPI, registerGameAPI,snapshot }
