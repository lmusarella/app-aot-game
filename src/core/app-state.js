// core/app-state.js
import { GAME_STATE, resetInMemoryGameState, restore, snapshot } from './data.js'

const APP_STATE = {
  user: null,
  roomId: null,
  role: null,
  roomPlayers: [],
  isGameDriver: false,
  gameMode: null,
  gameChannel: null,
  presenceChannel: null,
  presenceTimerId: null
}

let gameAPI = {
  resetGameState: () => {
    resetInMemoryGameState();
  },
  applyLoadedState: (state) => {
    console.info('[gameAPI] applyLoadedState restore: ', state)
    restore(state);
  },
  renderGameFromState: () => {}
    
}

// da chiamare dal main quando hai il motore di gioco
function registerGameAPI(api) {
  if (api && typeof api === 'object') {
    gameAPI = { ...gameAPI, ...api }
  }
}

export { APP_STATE, GAME_STATE, gameAPI, registerGameAPI, snapshot }
