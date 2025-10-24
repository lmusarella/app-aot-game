import { GAME_STATE, scheduleSave, resetGame } from './data.js';
import { confirmDialog, openDialog } from './ui.js';
import { clearGrid } from './grid.js';
import { completeMission, setMissionByIndex, renderMissionUI } from './missions.js';
import { fmtClock, clamp } from './utils.js';
import { playSfx } from './audio.js';
import showWarningC from './effects/warningOverlayC.js';

const missionCardHead = document.getElementById('mission-head');
const btnReset = document.getElementById('btn-reset-game');

const elPlay = document.getElementById('t-play');
const elReset = document.getElementById('t-reset');
const elTime = document.getElementById('t-time');

const elDec = document.getElementById('m-dec');
const elInc = document.getElementById('m-inc');

export function renderHeader() {
    renderMissionUI();
    renderTimerUI();
}

// Render UI timer
export function renderTimerUI() {
    if (elTime) elTime.textContent = fmtClock(GAME_STATE.missionState.remainingSec);
    if (elPlay) elPlay.textContent = GAME_STATE.missionState.ticking ? '⏸' : '▶';
}

// Timer controls
export function startTimer() {
    if (GAME_STATE.missionState.ticking) return;
    GAME_STATE.missionState.ticking = true;
    renderTimerUI();

    GAME_STATE.missionState.intervalId = setInterval(async () => {
        GAME_STATE.missionState.remainingSec = clamp(GAME_STATE.missionState.remainingSec - 1, 0, GAME_STATE.missionState.timerTotalSec);
        renderTimerUI();

        if (GAME_STATE.missionState.remainingSec <= 0) {
            stopTimer();
            showWarningC({
                text: `TEMPO SCADUTO`,
                subtext: `Ad ogni fine turno verrà pescata una carta evento`,
                theme: 'red',
                ringAmp: 1.0,
                autoDismissMs: 3000
            });
            await playCornoGuerra();
        }
    }, 1000);
}

export async function playCornoGuerra() {
    await playSfx('./assets/sounds/corno_guerra.mp3');
}

export function stopTimer() {
    GAME_STATE.missionState.ticking = false;
    if (GAME_STATE.missionState.intervalId) {
        clearInterval(GAME_STATE.missionState.intervalId);
        GAME_STATE.missionState.intervalId = null;
    }
    renderTimerUI();
    scheduleSave();
}

export function resetTimer() {
    GAME_STATE.missionState.remainingSec = GAME_STATE.missionState.timerTotalSec || 1200;
    stopTimer();
    renderTimerUI();
    scheduleSave();
}

export function initHeaderListeners() {
    document.addEventListener('resetGame', resetGame);
    btnReset.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Reset Partita',
            message: 'Sei sicuro di voler resettare la partita?',
            confirmText: 'Resetta',
            cancelText: 'Annulla',
            danger: true
        });
        if (ok) resetGame();
    });

    /* =======================
       Mission card click (placeholder azione)
       ======================= */
    missionCardHead.addEventListener('click', async () => {
        const res = await openDialog({
            title: `Completare la Missione #${GAME_STATE.missionState.curIndex + 1}?`,
            message: `
     
      <p>Confermi il completamento della missione corrente?</p>
    `,
            confirmText: 'Missione Completata',
            cancelText: 'Ritirata Generale',
            danger: true,         // metti true se vuoi il bottone rosso
            cancellable: true,
            detailed: true
        });

        if (res.reason === 'close-x' || res.reason === 'backdrop') return;
        await completeMission(res.reason);       // tua funzione esistente
    });


    missionCardHead.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); missionCardHead.click(); }
    });

    // Play/Pausa
    elPlay?.addEventListener('click', () => {
        GAME_STATE.missionState.ticking ? stopTimer() : startTimer();
    });

    // Reset
    elReset?.addEventListener('click', resetTimer);

    // Cambia missione
    elDec?.addEventListener('click', async () => {

        const ok = await confirmDialog({
            title: 'Missione Precedente',
            message: `Confermando perderai i dati della missione corrente, vuoi procedere lo stesso”?`,
            confirmText: 'Conferma',
            cancelText: 'Annulla',
            danger: true
        });
        if (!ok) return false;

        setMissionByIndex(GAME_STATE.missionState.curIndex - 1);
        GAME_STATE.turnEngine.setPhase('idle');
        GAME_STATE.turnEngine.round = 0;
        GAME_STATE.missionState.kills = {
            Puro: 0,
            Anomalo: 0,
            Mutaforma: 0
        };
        GAME_STATE.missionStats[GAME_STATE.missionState.curIndex] = {
            attempts: 0,
            kills: 0,
            losses: 0,
            round: 0,
            events: [] // {id,name,summary,sign(+1/-1/0),startRound,durationRounds}
        };
        await clearGrid();
    });
    elInc?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Missione Successiva',
            message: `Confermando perderai i dati della missione corrente, vuoi procedere lo stesso”?`,
            confirmText: 'Conferma',
            cancelText: 'Annulla',
            danger: true
        });
        if (!ok) return false;
        setMissionByIndex(GAME_STATE.missionState.curIndex + 1);
        GAME_STATE.turnEngine.setPhase('idle');
        GAME_STATE.turnEngine.round = 0;
        GAME_STATE.missionState.kills = {
            Puro: 0,
            Anomalo: 0,
            Mutaforma: 0
        };
        GAME_STATE.missionStats[GAME_STATE.missionState.curIndex] = {
            attempts: 0,
            kills: 0,
            losses: 0,
            round: 0,
            events: [] // {id,name,summary,sign(+1/-1/0),startRound,durationRounds}
        };
        await clearGrid();
    });

}

