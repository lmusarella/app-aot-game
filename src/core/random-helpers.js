// core/random-helpers.js
import { GAME_STATE } from './app-state.js'



function getCommanderPool() {
    return GAME_STATE.alliesPool
      .filter(unit => unit.role === 'commander')
      .map(unit => unit.id);
  }
function getRecruitPool() {
  return GAME_STATE.alliesPool
    .filter(unit => unit.role === 'recruit')
    .map(unit => unit.id)
}

function getUnitData() {
  return GAME_STATE.alliesPool.map(unit => ({
    id: unit.id,
    name: unit.name,
    avatar: unit.img,
    type: unit.role
  }))
}

function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickOne(arr) {
  const a = arr || []
  if (!a.length) return null
  const idx = Math.floor(Math.random() * a.length)
  return a[idx]
}

function pickManyUnique(arr, count) {
  const shuffled = shuffle(arr || [])
  return shuffled.slice(0, count)
}

export {
  getCommanderPool,
  getRecruitPool,
  getUnitData,
  shuffle,
  pickOne,
  pickManyUnique
}
