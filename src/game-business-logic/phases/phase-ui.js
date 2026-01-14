const PHASE_UI = {
    // cosa si vede in ciascuna fase (modifica liberamente i selettori!)
    idle: {
        show: [],
        hide: []
    },
    setup: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_mission: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    event_card: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    round_start: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    },
    move_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    attack_phase: {
        show: [],
        hide: ['.fab.spawn', '.fab.arruola', '.fab.event']
    },
    end_round: {
        show: ['.fab.spawn', '.fab.event'],
        hide: ['.fab.arruola']
    }
};

// Applica visibilità dai mapping sopra
export function applyPhaseUI(phase) {
    const allSelectors = new Set();
    for (const p of Object.values(PHASE_UI)) {
        (p.show || []).forEach(s => allSelectors.add(s));
        (p.hide || []).forEach(s => allSelectors.add(s));
    }

    // reset: tutto visibile
    allSelectors.forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );

    // applica per la fase corrente
    const conf = PHASE_UI[phase] || {};
    (conf.hide || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.add('is-hidden'))
    );
    (conf.show || []).forEach(sel =>
        document.querySelectorAll(sel).forEach(el => el.classList.remove('is-hidden'))
    );
}

export function renderStartButton(button, { phase, round, isMultiplayer = false, isMyTurn = true, phaseReady = false, isCommander = false, currentPlayerName = '' }) {
    if (!button) return;
    if (phase === 'idle') {
        if (isMultiplayer && !isCommander) {
            button.hidden = true;
        } else {
            button.hidden = false;
            button.dataset.mode = 'start';
            button.textContent = 'INIZIA MISSIONE';
        }
    } else if (phase === 'setup') {
        if (isMultiplayer && phaseReady) {
            if (isCommander) {
                button.hidden = false;
                button.dataset.mode = 'start';
                button.textContent = 'INIZIA MOVIMENTO';
            } else {
                button.hidden = true;
            }
        } else {
            button.hidden = false;
            button.dataset.mode = 'end';
            button.textContent = 'TERMINA SETUP';
        }
    } else if (phase === 'event_mission') {
        button.hidden = false;
        button.dataset.mode = 'start';
        button.textContent = 'EVENTO MISSIONE';
    } else if (phase === 'event_card') {
        button.hidden = false;
        button.dataset.mode = 'start';
        button.textContent = 'PESCA EVENTO';
    } else if (phase === 'round_start') {
        button.hidden = false;
        button.dataset.mode = 'start';
        button.textContent = `INIZIA ${round + 1}° ROUND`;
    } else if (phase === 'move_phase') {
        if (isMultiplayer && phaseReady) {
            if (isCommander) {
                button.hidden = false;
                button.dataset.mode = 'end';
                button.textContent = 'FASE MOVIMENTO COMPLETATA';
            } else {
                button.hidden = true;
            }
        } else {
            button.hidden = false;
            button.dataset.mode = 'end';
            button.textContent = 'TERMINA FASE MOVIMENTO';
        }
    } else if (phase === 'attack_phase') {
        button.hidden = false;
        button.dataset.mode = 'end';
        button.textContent = 'TERMINA FASE ATTACCO';
    } else if (phase === 'end_round') {
        button.hidden = false;
        button.dataset.mode = 'end';
        button.textContent = 'TERMINA ROUND';
    }
    else {
        button.hidden = true; // nelle altre fasi non serve
    }

    if (isMultiplayer && !isMyTurn && !button.hidden) {
        button.disabled = true;
    } else {
        button.disabled = false;
    }

    if (!button.hidden && isMultiplayer) {
        if (isMyTurn) {
            button.title = 'È il tuo turno.';
        } else if (currentPlayerName) {
            button.title = `È il turno di ${currentPlayerName}.`;
        } else {
            button.title = 'È il turno di un altro giocatore.';
        }
    }
}
