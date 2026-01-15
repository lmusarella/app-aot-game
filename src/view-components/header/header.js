import { DB, GAME_STATE, resetGame, snapshot } from '../../core/data.js';
import { confirmDialog, openDialog } from '../../ui-components/ui-helpers.js';
import { clearGrid } from '../grid/grid.js';
import { completeMission, setMissionByIndex, renderMissionUI } from '../leftbar/missions.js';
import { fmtClock, clamp } from '../../game-business-logic/utils.js';
import { playSfx } from '../audio/audio.js';
import showWarningC from '../../game-business-logic/effects/warningOverlayC.js';
import { APP_STATE } from '../../core/app-state.js';
import { supabase } from '../../core/supabase/supabaseClient.js';
import { showScreen } from '../../ui-components/ui-helpers.js';
import { stopRoomPresence } from '../pages/room/room-ui.js';
import { handleAllyDeath } from '../../game-business-logic/entity/deaths.js';
import { initGameForSinglePlayer } from '../../game-business-logic/game-sync.js';

let missionCardHead = null;
let btnReset = null;

let elPlay = null;
let elReset = null;
let elTime = null;
let elTimer = null;

let elDec = null;
let elInc = null;
let btnLeaveRoom = null;
let elGameMode = null;
let elTutorial = null;
let elAudio = null;
let elMissionCtrl = null;
let elTurnTracker = null;
let elTopbar = null;
let elLogoBox = null;
let elBrand = null;
let elCenterBox = null;
let elHeaderUser = null;
let elHeaderUserName = null;
let elHeaderUserAvatar = null;
let elHeaderUserAvatarImg = null;
let elHeaderUserMenuToggle = null;
let elHeaderUserMenu = null;

function cacheHeaderElements() {
    missionCardHead = document.getElementById('mission-head');
    btnReset = document.getElementById('btn-reset-game');

    elPlay = document.getElementById('t-play');
    elReset = document.getElementById('t-reset');
    elTime = document.getElementById('t-time');
    elTimer = document.getElementById('mission-timer-sticky');

    elDec = document.getElementById('m-dec');
    elInc = document.getElementById('m-inc');
    btnLeaveRoom = document.getElementById('btn-leave-room');
    elGameMode = document.getElementById('hdr-game-mode');
    elTutorial = document.getElementById('btn-tutorial');
    elAudio = document.getElementById('btn-audio');
    elMissionCtrl = document.querySelector('.mission-ctrl');
    elTurnTracker = document.getElementById('turn-tracker');
    elTopbar = document.querySelector('.topbar');
    elLogoBox = document.querySelector('.logo-box');
    elBrand = document.querySelector('.brand');
    elCenterBox = document.querySelector('.center-box');
    elHeaderUser = document.querySelector('.header-user');
    elHeaderUserName = document.getElementById('hdr-user-name');
    elHeaderUserAvatar = document.querySelector('.header-user-avatar');
    elHeaderUserAvatarImg = document.getElementById('hdr-user-avatar');
    elHeaderUserMenuToggle = document.getElementById('hdr-user-menu-toggle');
    elHeaderUserMenu = document.getElementById('hdr-user-menu');

    return {
        missionCardHead,
        btnReset,
        elPlay,
        elReset,
        elTime,
        elTimer,
        elDec,
        elInc,
        btnLeaveRoom,
        elGameMode,
        elTutorial,
        elAudio,
        elMissionCtrl,
        elTurnTracker,
        elTopbar,
        elLogoBox,
        elBrand,
        elCenterBox,
        elHeaderUser,
        elHeaderUserName,
        elHeaderUserAvatar,
        elHeaderUserAvatarImg,
        elHeaderUserMenuToggle,
        elHeaderUserMenu
    };
}

export function renderHeader() {
    cacheHeaderElements();
    applyHeaderModeVisibility();
    renderHeaderUserInfo();
    renderMissionUI();
    renderTimerUI();
    renderGameModeBadge();
}

export function refreshHeaderUI() {
    cacheHeaderElements();
    applyHeaderModeVisibility();
    renderHeaderUserInfo();
    renderTimerUI();
}

function applyHeaderModeVisibility() {
    const isMultiplayer = APP_STATE.gameMode === 'multiplayer';
    const toggle = (el, visible) => {
        if (!el) return;
        el.classList.toggle('is-hidden', !visible);
    };

    toggle(elTutorial, !isMultiplayer);
    toggle(elAudio, !isMultiplayer);
    toggle(elMissionCtrl, !isMultiplayer);
    toggle(elGameMode, !isMultiplayer);
    toggle(btnReset, !isMultiplayer);
    toggle(elTurnTracker, isMultiplayer);
    toggle(btnLeaveRoom, !isMultiplayer);
    toggle(elHeaderUserMenuToggle, isMultiplayer);
    toggle(elHeaderUserMenu, isMultiplayer);
    toggle(elHeaderUser, true);
    toggle(elLogoBox, true);
    toggle(elBrand, true);
    toggle(elCenterBox, true);
    if (elTopbar) {
        elTopbar.classList.toggle('topbar--multiplayer', isMultiplayer);
    }

    const modsSection = document.getElementById('mods-section');
    const unitModsSection = document.getElementById('unit-mods-section');
    toggle(modsSection, !isMultiplayer);
    toggle(unitModsSection, !isMultiplayer);
}

function renderHeaderUserInfo() {
    if (!elHeaderUserName || !elHeaderUserAvatarImg || !elHeaderUserAvatar) return;
    const userId = APP_STATE.user?.id;
    let displayName = APP_STATE.user?.user_metadata?.nickname || APP_STATE.user?.email || '—';
    const players = Array.isArray(APP_STATE.roomPlayers) ? APP_STATE.roomPlayers : [];
    const mePlayer = players.find(p => p.user_id === userId);
    if (mePlayer?.nickname) {
        displayName = mePlayer.nickname;
    }
    elHeaderUserName.textContent = displayName;

    const rosterUnit = GAME_STATE.alliesRoster?.find(u => u.owner_id === userId);
    const unitFromDb = !rosterUnit && mePlayer?.unit_code
        ? DB?.ALLIES?.find(u => u.id === mePlayer.unit_code)
        : null;
    const unit = rosterUnit || unitFromDb;
    const avatarSrc = unit?.img || unit?.avatar || 'assets/img/logo.jpg';
    const role = mePlayer?.is_commander || unit?.role === 'commander' ? 'commander' : 'recruit';

    elHeaderUserAvatar.dataset.role = role;
    elHeaderUserAvatarImg.src = avatarSrc;
    elHeaderUserAvatarImg.alt = displayName ? `Avatar ${displayName}` : 'Avatar giocatore';
}

function renderGameModeBadge() {
    if (!elGameMode) return;
    if (APP_STATE.gameMode === 'single') {
        elGameMode.textContent = 'Singolo';
    } else if (APP_STATE.gameMode === 'multiplayer') {
        elGameMode.textContent = 'Multiplayer';
    } else {
        elGameMode.textContent = '—';
    }
}

export function renderPhaseLabel() {
    const phaseLabel = document.getElementById('phase-label');
    if (!phaseLabel) return;
    const phase = GAME_STATE.turnEngine?.phase || 'idle';
    const labelMap = {
        idle: 'Attesa',
        setup: 'Setup',
        event_mission: 'Evento missione',
        event_card: 'Pesca evento',
        round_start: 'Inizio round',
        move_phase: 'Movimento',
        attack_phase: 'Combattimento',
        end_round: 'Fine round'
    };
    const label = labelMap[phase] ?? phase;
    phaseLabel.textContent = `Fase: ${label}`;
}

// Render UI timer
export function renderTimerUI() {
    cacheHeaderElements();
    if (elTime) elTime.textContent = fmtClock(GAME_STATE.missionState.remainingSec);
    if (elPlay) elPlay.textContent = GAME_STATE.missionState.ticking ? '⏸' : '▶';
    if (elTimer) {
        const urgentThresholdSec = 60;
        elTimer.classList.toggle('mission-timer--urgent', GAME_STATE.missionState.remainingSec <= urgentThresholdSec);
    }
}

export async function notifyTimerExpired() {
    if (GAME_STATE.missionState.timerExpiredNotified) return;
    GAME_STATE.missionState.timerExpiredNotified = true;
    showWarningC({
        text: `TEMPO SCADUTO`,
        subtext: `Ad ogni fine turno verrà pescata una carta evento`,
        theme: 'red',
        ringAmp: 1.0,
        autoDismissMs: 3000
    });
    await playCornoGuerra();
}

// Timer controls
export function startTimer() {
    if (GAME_STATE.missionState.ticking) return;
    if (GAME_STATE.missionState.remainingSec > 0) {
        GAME_STATE.missionState.timerExpiredNotified = false;
    }
    GAME_STATE.missionState.ticking = true;
    renderTimerUI();

    GAME_STATE.missionState.intervalId = setInterval(async () => {
        GAME_STATE.missionState.remainingSec = clamp(GAME_STATE.missionState.remainingSec - 1, 0, GAME_STATE.missionState.timerTotalSec);
        renderTimerUI();

        if (GAME_STATE.missionState.remainingSec <= 0) {
            stopTimer();
            await notifyTimerExpired();
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
    //scheduleSave();
}

export function resetTimer() {
    GAME_STATE.missionState.remainingSec = GAME_STATE.missionState.timerTotalSec || 1200;
    GAME_STATE.missionState.timerExpiredNotified = false;
    stopTimer();
    renderTimerUI();
    //scheduleSave();
}

export function initHeaderListeners() {
    const elements = cacheHeaderElements();
    if (!elements.btnReset) {
        throw new Error('Header reset button not found. Verify header.html is loaded before initHeaderListeners.');
    }
    if (!elements.missionCardHead) {
        throw new Error('Mission card header not found. Verify leftbar.html is loaded before initHeaderListeners.');
    }
    document.addEventListener('resetGame', resetGame);
    btnReset.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Reset Partita',
            message: 'Sei sicuro di voler resettare la partita?',
            confirmText: 'Resetta',
            cancelText: 'Annulla',
            danger: true
        });
        if (!ok) return;
        if (APP_STATE.gameMode === 'single') {
            initGameForSinglePlayer({ forceReset: true });
            return;
        }
        resetGame();
    });

    btnLeaveRoom?.addEventListener('click', async () => {
        const ok = await confirmDialog({
            title: 'Esci dalla partita',
            message: 'Vuoi uscire dalla partita? Il tuo personaggio verrà eliminato dalla missione.',
            confirmText: 'Esci',
            cancelText: 'Annulla',
            danger: true
        });
        if (!ok) return;

        if (APP_STATE.gameMode === 'single') {
            initGameForSinglePlayer({ forceReset: true, render: false });
            APP_STATE.roomId = null;
            APP_STATE.role = null;
            APP_STATE.roomPlayers = [];
            APP_STATE.isGameDriver = false;
            APP_STATE.gameMode = null;
            showScreen('lobby');
            return;
        }

        const roomId = APP_STATE.roomId;
        const userId = APP_STATE.user?.id;

        if (roomId && userId) {
            const unit = GAME_STATE.alliesRoster.find(u => u.owner_id === userId);
            if (unit && (unit.currHp ?? unit.hp) > 0) {
                await handleAllyDeath(unit);
                await supabase
                    .from('room_game_state')
                    .update({
                        state_json: snapshot(),
                        updated_at: new Date().toISOString(),
                        updated_by: userId
                    })
                    .eq('room_id', roomId);
            }
            await supabase
                .from('room_players')
                .delete()
                .eq('room_id', roomId)
                .eq('user_id', userId);
        }

        APP_STATE.roomId = null;
        APP_STATE.role = null;
        APP_STATE.roomPlayers = [];
        APP_STATE.isGameDriver = false;
        APP_STATE.gameMode = null;
        stopRoomPresence();
        showScreen('lobby');
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

    initHeaderUserMenu();
}

function initHeaderUserMenu() {
    if (!elHeaderUserMenu || !elHeaderUserMenuToggle || elHeaderUserMenuToggle.dataset.bound) return;
    elHeaderUserMenuToggle.dataset.bound = '1';

    elHeaderUserMenu.hidden = true;
    elHeaderUserMenuToggle.setAttribute('aria-expanded', 'false');

    const closeMenu = () => {
        if (elHeaderUserMenu.hidden) return;
        elHeaderUserMenu.hidden = true;
        elHeaderUserMenuToggle.setAttribute('aria-expanded', 'false');
    };

    const toggleMenu = () => {
        const shouldOpen = elHeaderUserMenu.hidden;
        elHeaderUserMenu.hidden = !shouldOpen;
        elHeaderUserMenuToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    };

    elHeaderUserMenuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    elHeaderUserMenu.addEventListener('click', () => {
        closeMenu();
    });

    document.addEventListener('click', (e) => {
        if (!elHeaderUserMenu.hidden && !e.target.closest('.header-user')) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMenu();
        }
    });
}
