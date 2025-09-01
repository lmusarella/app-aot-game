document.addEventListener('DOMContentLoaded', () => {
    // --- DATA & STATE MANAGEMENT ---
    let db = {};                       // conterrà i dati di aot_db.json
    let xpTable = [];                  // da db.xpTable
    let missionData = {};              // da db.missions
    let titanSpawnTable = {};          // da db.titanSpawnTable
    let defaultMissionTimerSeconds = 20 * 60; // sovrascrivibile da db.settings.missionTimerSeconds

    let gameState = {};
    let missionTimerInterval;
    let pendingHpChanges = {};
    let hpChangeTimers = {};
    let wallHpChangeTimers = {}; // Aggiunto per i danni alle mura
    let allEventCards = [];
    let currentEventCard = null;

    const titanTypes = ['Puro', 'Anomalo', 'Mutaforma'];


    const elements = {
        moraleSlider: document.getElementById('morale'),
        xpSlider: document.getElementById('xp'),
        livingRecruitsSpan: document.getElementById('living-recruits'),
        livingCommandersSpan: document.getElementById('living-commanders'),
        openRecruitsPopupBtn: document.getElementById('open-recruits-popup'),
        recruitsPopup: document.getElementById('recruits-popup'),
        closeRecruitsPopupBtn: document.getElementById('close-recruits-popup'),
        recruitsList: document.getElementById('recruits-list'),
        openCommandersPopupBtn: document.getElementById('open-commanders-popup'),
        commandersPopup: document.getElementById('commanders-popup'),
        closeCommandersPopupBtn: document.getElementById('close-commanders-popup'),
        commandersList: document.getElementById('commanders-list'),
        missionCount: document.getElementById('mission-count'),
        missionTimer: document.getElementById('mission-timer'),
        missionObjectiveText: document.getElementById('mission-objective-text'),
        missionRewardText: document.getElementById('mission-reward-text'),
        missionEventText: document.getElementById('mission-event-text'),
        missionUnitsGrid: document.getElementById('mission-units-grid'),
        decreaseMissionBtn: document.getElementById('decrease-mission'),
        increaseMissionBtn: document.getElementById('increase-mission'),
        addTitanBtn: document.getElementById('add-titan-btn'),
        titanGrid: document.getElementById('titan-grid'),
        completeMissionBtn: document.getElementById('complete-mission-btn'),
        restartMissionBtn: document.getElementById('restart-mission-btn'),
        resetGameBtn: document.getElementById('reset-game-btn'),
        resetConfirmModal: document.getElementById('reset-confirm-modal'),
        confirmResetBtn: document.getElementById('confirm-reset-btn'),
        cancelResetBtn: document.getElementById('cancel-reset-btn'),
        diceRollerPanel: document.getElementById('dice-roller-panel'),
        diceResultArea: document.getElementById('dice-result-area'),
        wallHpSection: document.getElementById('wall-hp-section'),
        logEntries: document.getElementById('log-entries'),
        moraleDescription: document.getElementById('morale-description'),
        xpBonuses: document.getElementById('xp-bonuses'),
        bonusRecapText: document.getElementById('bonus-recap-text'),
        drawEventBtn: document.getElementById('draw-event-btn'),
        eventDeckCount: document.getElementById('event-deck-count'),
        eventCardPopup: document.getElementById('event-card-popup'),
        eventCardTitle: document.getElementById('event-card-title'),
        eventCardDescription: document.getElementById('event-card-description'),
        eventCardType: document.getElementById('event-card-type'),
        eventReshuffleBtn: document.getElementById('event-reshuffle-btn'),
        eventDiscardBtn: document.getElementById('event-discard-btn'),
        eventRemoveBtn: document.getElementById('event-remove-btn'),
    };

    async function loadDB() {
        // se aot_db.json è nella root accanto a index.html:
        const res = await fetch('./aot_db.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error('Impossibile caricare aot_db.json');

        db = await res.json();

        // mappa tabelle/setting
        xpTable = Array.isArray(db.xpTable) ? db.xpTable : [];
        missionData = db.missions || {};
        titanSpawnTable = db.titanSpawnTable || {};
        allEventCards = db.eventCards || [];

        if (db.settings?.missionTimerSeconds) {
            defaultMissionTimerSeconds = db.settings.missionTimerSeconds;
        }
    }

    const initializeEventDeck = () => {
        if (allEventCards && allEventCards.length > 0) {
            if (!gameState.eventDeck || gameState.eventDeck.length === 0) {
                gameState.eventDeck = [...allEventCards];
                updateDeckCount();
                saveGameState();
            }
        }
    };

    const addLogEntry = (message, type = 'info') => {
        if (!gameState.logData) gameState.logData = [];
        const timestamp = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        gameState.logData.unshift({ time: timestamp, message, type });
        if (gameState.logData.length > 100) {
            gameState.logData.pop();
        }
        renderLog();
        saveGameState();
    };

    const renderLog = () => {
        elements.logEntries.innerHTML = gameState.logData.map(entry =>
            `<p class="log-${entry.type}"><strong>[${entry.time}]</strong> ${entry.message}</p>`
        ).join('');
    };

    const updateSlider = (slider) => {
        const container = slider.closest('.slider-value-container');
        if (!container) return;
        const valueSpan = container.querySelector('span');
        if (valueSpan) {
            if (slider.id === 'xp') {
                const xp = parseInt(slider.value, 10);
                const currentLevel = xpTable.filter(l => xp >= l.xpRequired).pop() || xpTable[0];
                valueSpan.textContent = `Livello ${currentLevel.level} (XP: ${xp})`;
            } else {
                valueSpan.textContent = slider.value;
            }
        }

        const percentage = (slider.value / slider.max) * 100;
        let colorVar = 'var(--status-low)';
        if (percentage > 60) colorVar = 'var(--status-high)';
        else if (percentage > 30) colorVar = 'var(--status-medium)';

        slider.style.setProperty('--slider-color', colorVar);
        slider.style.setProperty('--range-progress', `${percentage}%`);
    };

    const getHpStatusClass = (hp, initialHp) => {
        if (hp <= 0) return 'hp-dead';
        const percentage = (hp / initialHp) * 100;
        if (percentage > 60) return 'hp-high';
        if (percentage > 30) return 'hp-medium';
        return 'hp-low';
    };

    const updateMorale = () => {
        updateSlider(elements.moraleSlider);
        const morale = elements.moraleSlider.value;
        if (morale == 0) elements.moraleDescription.textContent = "AVETE PERSO";
        else if (morale <= 5) elements.moraleDescription.textContent = "Malus: -2 AGI, -1 STR, -1TEC";
        else if (morale <= 9) elements.moraleDescription.textContent = "Malus: -1 AGI, -1 STR";
        else if (morale <= 12) elements.moraleDescription.textContent = "Malus: -1 AGI";
        else elements.moraleDescription.textContent = "Nessun malus";
        updateBonusRecap();
    };

    const updateXP = () => {
        updateSlider(elements.xpSlider);
        const xp = parseInt(elements.xpSlider.value, 10);
        const currentLevel = xpTable.filter(l => xp >= l.xpRequired).pop() || xpTable[0];
        elements.xpBonuses.textContent = `Bonus: ${currentLevel.bonus}`;
        updateBonusRecap();
    };

    const updateBonusRecap = () => {
        const totalBonuses = { AGI: 0, STR: 0, TEC: 0 };
        const morale = parseInt(elements.moraleSlider.value, 10);
        if (morale <= 5) {
            totalBonuses.AGI -= 2; totalBonuses.STR -= 1; totalBonuses.TEC -= 1;
        } else if (morale <= 9) {
            totalBonuses.AGI -= 1; totalBonuses.STR -= 1;
        } else if (morale <= 12) {
            totalBonuses.AGI -= 1;
        }

        const xp = parseInt(elements.xpSlider.value, 10);
        const currentLevel = xpTable.filter(l => xp >= l.xpRequired).pop() || xpTable[0];
        if (currentLevel && currentLevel.bonus !== "-") {
            const parts = currentLevel.bonus.split(',').map(s => s.trim());
            parts.forEach(part => {
                const match = part.match(/([+-]\d+)\s(AGI|STR|TEC)/);
                if (match) {
                    totalBonuses[match[2]] += parseInt(match[1], 10);
                }
            });
        }

        let bonusString = Object.entries(totalBonuses)
            .filter(([, value]) => value !== 0)
            .map(([stat, value]) => `${value > 0 ? '+' : ''}${value} ${stat}`)
            .join(', ');

        elements.bonusRecapText.textContent = bonusString || "Nessun bonus/malus";
    };

    const updateUnitCounts = () => {
        const livingRecruits = gameState.recruitsData.filter(r => r.hp > 0).length;
        const totalRecruits = gameState.recruitsData.length;
        elements.livingRecruitsSpan.textContent = `${livingRecruits}/${totalRecruits}`;

        const livingCommanders = gameState.commandersData.filter(c => c.hp > 0).length;
        const totalCommanders = gameState.commandersData.length;
        elements.livingCommandersSpan.textContent = `${livingCommanders}/${totalCommanders}`;
    };

    const renderUnitListInPopup = (listElement, data, type) => {
        listElement.innerHTML = '';
        const living = data.filter(u => u.hp > 0).sort((a, b) => a.name.localeCompare(b.name));
        const dead = data.filter(u => u.hp <= 0).sort((a, b) => a.name.localeCompare(b.name));

        const createLi = (unit) => {
            const li = document.createElement('li');
            const hpClass = getHpStatusClass(unit.hp, unit.initialHp);
            li.innerHTML = `
                <div class="unit-info-popup">
                    <img src="${unit.imageUrl}" alt="${unit.name}" class="unit-image-popup" onerror="this.onerror=null;this.src='https://placehold.co/60x60/cccccc/000000?text=IMG';">
                    <span class="${hpClass}">${unit.name} (HP: ${unit.hp > 0 ? unit.hp : 'Morto'})</span>
                </div>
                <div class="hp-controls">
                    <button class="hp-change btn" data-id="${unit.id}" data-type="${type}" data-amount="-1" ${unit.hp <= 0 ? 'disabled' : ''}>-</button>
                    <button class="hp-change btn" data-id="${unit.id}" data-type="${type}" data-amount="1">+</button>
                    <button class="mission-button btn ${unit.onMission ? 'on-mission' : ''}" data-id="${unit.id}" data-type="${type}" ${unit.hp <= 0 ? 'disabled' : ''}>
                        ${unit.onMission ? 'Rimuovi' : 'Invia'}
                    </button>
                </div>`;
            return li;
        };

        living.forEach(unit => listElement.appendChild(createLi(unit)));
        if (dead.length > 0 && living.length > 0) {
            const separator = document.createElement('li');
            separator.innerHTML = `<hr style="width:100%; border-color: var(--background-lighter); margin: 0.5rem 0;">`;
            listElement.appendChild(separator);
        }
        dead.forEach(unit => listElement.appendChild(createLi(unit)));
    };

    const updateMissionView = () => {
        elements.missionCount.textContent = `Missione #${gameState.currentMissionNumber}`;
        const currentMission = missionData[gameState.currentMissionNumber] || { objective: "N/D", reward: "N/D", event: "N/D" };
        elements.missionObjectiveText.textContent = currentMission.objective;
        elements.missionRewardText.textContent = currentMission.reward;
        elements.missionEventText.textContent = currentMission.event;

        elements.missionUnitsGrid.innerHTML = '';
        const onMissionUnits = [...gameState.recruitsData, ...gameState.commandersData].filter(u => u.onMission && u.hp > 0);

        if (onMissionUnits.length === 0) {
            elements.missionUnitsGrid.innerHTML = `<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1; margin: auto;">Nessuna unità in missione.</p>`;
            return;
        }

        onMissionUnits.forEach(unit => {
            const card = document.createElement('div');
            const hpClass = getHpStatusClass(unit.hp, unit.initialHp);
            card.className = `unit-card ${unit.type === 'commander' ? 'commander' : ''}`;
            card.innerHTML = `
                <button class="remove-from-mission-btn" data-id="${unit.id}" data-type="${unit.type}">&times;</button>
                <img src="${unit.imageUrl}" alt="${unit.name}" class="unit-image" onerror="this.onerror=null;this.src='https://placehold.co/60x60/cccccc/000000?text=IMG';">
                <div class="name">${unit.name}</div>
                <div class="stat-row">
                    <div class="controls">
                        <button class="hp-change btn" data-id="${unit.id}" data-type="${type}" data-amount="-1">-</button>
                        <span class="label hp ${hpClass}">${unit.hp}</span>
                        <button class="hp-change btn" data-id="${unit.id}" data-type="${type}" data-amount="1">+</button>
                    </div>
                </div>`;
            elements.missionUnitsGrid.appendChild(card);
        });
    };

    const renderTitanSpawnLegend = () => {
        const header = document.querySelector('.titans-header');
        if (!header) return;

        let legend = header.querySelector('.titan-spawn-legend');
        if (!legend) {
            legend = document.createElement('div');
            legend.className = 'titan-spawn-legend';
            legend.style.cssText = 'display:flex; gap: 0.75rem; font-size: 1.5rem; align-items:center;';
            header.appendChild(legend);
        }

        const currentSpawnData = titanSpawnTable[gameState.currentMissionNumber] || titanSpawnTable[1];
        legend.innerHTML = `
            <div style="display:flex; align-items:center; gap: 0.25rem;"><div style="width:1rem; height:1rem; border-radius:50%; background-color:#a0aec0;"></div><span>${currentSpawnData['Puro']}</span></div>
            <div style="display:flex; align-items:center; gap: 0.25rem;"><div style="width:1rem; height:1rem; border-radius:50%; background-color:#ecc94b;"></div><span>${currentSpawnData['Anomalo']}</span></div>
            <div style="display:flex; align-items:center; gap: 0.25rem;"><div style="width:1rem; height:1rem; border-radius:50%; background-color:#f56565;"></div><span>${currentSpawnData['Mutaforma']}</span></div>
        `;
    };

    const renderTitans = () => {
        elements.titanGrid.innerHTML = '';
        const allTitans = [...gameState.titansData];

        if (allTitans.length === 0) {
            elements.titanGrid.innerHTML = `<p style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1; margin: auto;">Nessun gigante in campo.</p>`;
            return;
        }

        allTitans.forEach(titan => {
            const card = document.createElement('div');
            const isDead = titan.hp <= 0;
            const hpClass = getHpStatusClass(titan.hp, titan.initialHp);
            card.className = `unit-card ${isDead ? 'titan-dead' : `titan-${titan.type.toLowerCase()}`}`;

            card.innerHTML = `
                <button class="remove-titan-btn" data-id="${titan.id}">&times;</button>
                <div class="name">${isDead ? 'Sconfitto' : titan.name}</div>
                <button class="titan-type-switcher" data-id="${titan.id}" ${isDead ? 'disabled' : ''}>${titan.type}</button>
                <div class="stat-row">
                    <div class="controls">
                        <button class="hp-change btn" data-id="${titan.id}" data-type="titan" data-amount="-1" ${isDead ? 'disabled' : ''}>-</button>
                        <span class="label hp ${hpClass}">${titan.hp}</span>
                        <button class="hp-change btn" data-id="${titan.id}" data-type="titan" data-amount="1" ${isDead ? 'disabled' : ''}>+</button>
                    </div>
                </div>
                 <div class="stat-row">
                    <div class="controls">
                        <button class="cooldown-change btn" data-id="${titan.id}" data-amount="-1">-</button>
                        <span class="label">R:${titan.cooldown}</span>
                        <button class="cooldown-change btn" data-id="${titan.id}" data-amount="1">+</button>
                    </div>
                </div>`;
            elements.titanGrid.appendChild(card);
        });
    };

    const handleHpChange = (e) => {
        const target = e.target.closest('.hp-change');
        if (!target) return;
        const { id, type, amount } = target.dataset;
        const key = `${type}-${id}`;

        clearTimeout(hpChangeTimers[key]);

        if (!pendingHpChanges[key]) {
            let data, unit;
            if (type === 'titan') data = gameState.titansData;
            else if (type === 'recruit') data = gameState.recruitsData;
            else data = gameState.commandersData;
            unit = data.find(u => u.id == id);
            if (!unit) return;
            pendingHpChanges[key] = { amount: 0, unit };
        }

        pendingHpChanges[key].amount += parseInt(amount, 10);

        hpChangeTimers[key] = setTimeout(() => {
            if (pendingHpChanges[key]) {
                processHpChange(pendingHpChanges[key].unit, pendingHpChanges[key].amount);
                delete pendingHpChanges[key];
                delete hpChangeTimers[key];
            }
        }, 1000);
    };

    const processHpChange = (unit, totalAmount) => {
        if (!unit || totalAmount === 0) return;

        const oldHp = unit.hp;
        const wasAlive = oldHp > 0;

        unit.hp = Math.max(0, unit.hp + totalAmount);
        const isNowDead = unit.hp <= 0;

        if (wasAlive && !isNowDead) {
            if (totalAmount < 0) {
                addLogEntry(`${unit.name} ha subito ${-totalAmount} danni.`, 'damage');
            } else {
                addLogEntry(`${unit.name} è stato curato di ${totalAmount} HP.`, 'info');
            }
        }

        if (wasAlive && isNowDead) {
            handleUnitDeath(unit);
        } else if (!wasAlive && unit.hp > 0) {
            handleUnitResurrection(unit);
        }

        updateAllUIElements();
        saveGameState();
    };

    const handleUnitDeath = (unit) => {
        let moraleChange = 0;
        let xpChange = 0;

        if (titanTypes.includes(unit.type)) {
            const rewards = { 'Puro': { m: 1, xp: 1 }, 'Anomalo': { m: 2, xp: 2 }, 'Mutaforma': { m: 5, xp: 3 } };
            const reward = rewards[unit.type];
            if (reward) {
                moraleChange = reward.m;
                xpChange = reward.xp;
                unit.isDefeated = true;
                addLogEntry(`${unit.name} è stato sconfitto! (Morale +${reward.m}, XP +${reward.xp})`, 'mission');
            }
        } else {
            addLogEntry(`${unit.name} è stato sconfitto!`, 'death');
            if (unit.type === 'recruit') moraleChange = -3;
            else if (unit.type === 'commander') moraleChange = -5;
        }
        applyStatChanges(moraleChange, xpChange);
    };

    const handleUnitResurrection = (unit) => {
        addLogEntry(`${unit.name} è tornato in vita!`, 'info');
        let moraleChange = 0;
        let xpChange = 0;
        if (unit.type === 'recruit') moraleChange = 3;
        else if (unit.type === 'commander') moraleChange = 5;
        else if (titanTypes.includes(unit.type) && unit.isDefeated) {
            const rewards = { 'Puro': { m: 1, xp: 1 }, 'Anomalo': { m: 2, xp: 2 }, 'Mutaforma': { m: 5, xp: 3 } };
            const reward = rewards[unit.type];
            if (reward) {
                moraleChange = -reward.m;
                xpChange = -reward.xp;
                unit.isDefeated = false;
            }
        }
        applyStatChanges(moraleChange, xpChange);
    };

    const applyStatChanges = (moraleChange, xpChange) => {
        if (moraleChange !== 0) {
            const newMorale = Math.max(0, Math.min(15, parseInt(elements.moraleSlider.value, 10) + moraleChange));
            elements.moraleSlider.value = newMorale;
            gameState.morale = newMorale;
            updateMorale();
        }
        if (xpChange !== 0) {
            const newXP = Math.max(0, Math.min(70, parseInt(elements.xpSlider.value, 10) + xpChange));
            elements.xpSlider.value = newXP;
            gameState.xp = newXP;
            updateXP();
        }
    };

    const updateAllUIElements = () => {
        updateMorale();
        updateXP();
        renderUnitListInPopup(elements.recruitsList, gameState.recruitsData, 'recruit');
        renderUnitListInPopup(elements.commandersList, gameState.commandersData, 'commander');
        updateUnitCounts();
        updateMissionView();
        renderTitans();
        renderLog();
        updateDeckCount();
    };

    // --- FIX: Aggiunto updateAllUIElements() per aggiornare la vista ---
    const handleMissionToggle = (e) => {
        const target = e.target.closest('.mission-button, .remove-from-mission-btn');
        if (!target) return;
        const { id, type } = target.dataset;
        const data = type === 'recruit' ? gameState.recruitsData : gameState.commandersData;
        const unit = data.find(u => u.id == id);
        if (unit) {
            unit.onMission = !unit.onMission;
            updateAllUIElements(); // <-- BUG FIX
            saveGameState();
        }
    };

    const handleTitanActions = (e) => {
        const target = e.target;

        if (target.closest('.hp-change')) {
            handleHpChange(e);
            return;
        }

        const id = target.dataset.id;
        if (!id) return;
        const titan = gameState.titansData.find(t => t.id == id);
        if (!titan) return;

        if (target.matches('.remove-titan-btn')) {
            gameState.titansData = gameState.titansData.filter(t => t.id != id);
        } else if (target.matches('.cooldown-change')) {
            titan.cooldown = Math.max(0, titan.cooldown + parseInt(target.dataset.amount, 10));
        } else if (target.matches('.titan-type-switcher')) {
            const currentIndex = titanTypes.indexOf(titan.type);
            titan.type = titanTypes[(currentIndex + 1) % titanTypes.length];
        }
        renderTitans();
        saveGameState();
    };

    const addTitan = () => {
        const newId = (gameState.titanIdCounter || 0) + 1;
        gameState.titanIdCounter = newId;
        const newTitan = {
            id: newId, name: `Gigante #${newId}`,
            hp: 12, initialHp: 12, cooldown: 0, type: 'Puro',
            isDefeated: false, createdAt: Date.now()
        };
        gameState.titansData.push(newTitan);
        addLogEntry(`${newTitan.name} è apparso.`, 'info');
        renderTitans();
        saveGameState();
    };

    const changeMission = (amount) => {
        let newMissionNumber = gameState.currentMissionNumber + amount;
        const missionKeys = Object.keys(missionData);
        if (newMissionNumber < 1) newMissionNumber = 1;
        if (newMissionNumber > missionKeys.length) newMissionNumber = missionKeys.length;

        if (gameState.currentMissionNumber !== newMissionNumber) {
            gameState.currentMissionNumber = newMissionNumber;
            addLogEntry(`Passato alla Missione #${gameState.currentMissionNumber}.`, 'mission');
        }
        updateMissionView();
        renderTitanSpawnLegend();
        saveGameState();
    };

    const completeMission = () => {
        const currentMission = missionData[gameState.currentMissionNumber];
        if (!currentMission) return;

        const rewardString = currentMission.reward;
        const xpMatch = rewardString.match(/\+(\d+)\s*XP/);
        if (xpMatch) applyStatChanges(0, parseInt(xpMatch[1], 10));
        const moraleMatch = rewardString.match(/\+(\d+)\s*Morale/);
        if (moraleMatch) applyStatChanges(parseInt(moraleMatch[1], 10), 0);

        gameState.recruitsData.forEach(u => u.onMission = false);
        gameState.commandersData.forEach(u => u.onMission = false);
        addLogEntry("Tutte le unità sono state richiamate.", "info");

        if (gameState.titansData.length > 0) {
            gameState.titansData = [];
            addLogEntry("Tutti i giganti sono stati rimossi.", "info");
        }

        addLogEntry(`Missione #${gameState.currentMissionNumber} completata!`, 'mission');

        changeMission(1);
        updateAllUIElements();
    };

    const startMissionTimer = () => {
        clearInterval(missionTimerInterval);
        let time = Number.isFinite(defaultMissionTimerSeconds) ? defaultMissionTimerSeconds : 20 * 60;
        missionTimerInterval = setInterval(() => {
            const minutes = Math.floor(time / 60);
            let seconds = time % 60;
            elements.missionTimer.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            if (--time < 0) {
                clearInterval(missionTimerInterval);
                elements.missionTimer.textContent = "SCADUTO";
            }
        }, 1000);
    };

    const restartMissionTimer = () => {
        startMissionTimer();
        addLogEntry("Timer della missione riavviato.", "mission");
    };

    const saveGameState = () => {
        gameState.morale = parseInt(elements.moraleSlider.value, 10);
        gameState.xp = parseInt(elements.xpSlider.value, 10);
        localStorage.setItem('aotGameState', JSON.stringify(gameState));
    };

    const loadGameState = () => {
        const savedState = localStorage.getItem('aotGameState');
        gameState = savedState ? JSON.parse(savedState) : initializeDefaultState();
        if (!gameState.eventDeck || !gameState.eventDiscardPile || !gameState.removedEventCards) {
            gameState.eventDeck = [];
            gameState.eventDiscardPile = [];
            gameState.removedEventCards = [];
        }
        // Aggiunto per compatibilità con salvataggi vecchi
        if (!gameState.wallHp) {
            gameState.wallHp = { maria: 15, rose: 5, sina: 3 };
        }
    };

    function clampInt(n, min, max) { return Math.max(min, Math.min(max, parseInt(n, 10))); }
    // --- helpers usati sopra (aggiungili se non già presenti) ---
    function clampInt(n, min, max) { return Math.max(min, Math.min(max, parseInt(n, 10))); }
    function safeString(v, fallback = '') { return (typeof v === 'string' && v.length ? v : fallback); }
    function defaultInitialHpFor(type) { return type === 'commander' ? 18 : 10; }

    function normalizeUnit(u, fixedType) {
        const id = Number.isFinite(u.id) ? parseInt(u.id, 10) : genUnitId(fixedType);
        const initialHp = Number.isFinite(u.initialHp) ? parseInt(u.initialHp, 10) : defaultInitialHpFor(fixedType);
        const hp = clampInt(Number.isFinite(u.hp) ? parseInt(u.hp, 10) : initialHp, 0, initialHp);
        return {
            id,
            name: safeString(u.name, fixedType === 'recruit' ? 'Recluta' : 'Comandante'),
            hp,
            initialHp,
            onMission: Boolean(u.onMission),
            type: fixedType,
            imageUrl: safeString(u.imageUrl, 'https://placehold.co/60x60/cccccc/000000?text=IMG')
        };
    }

    function normalizeTitan(t) {
        const legal = ['Puro', 'Anomalo', 'Mutaforma'];
        const type = legal.includes(t.type) ? t.type : 'Puro';
        const initialHp = Number.isFinite(t.initialHp) ? parseInt(t.initialHp, 10) : 12;
        const hp = clampInt(Number.isFinite(t.hp) ? parseInt(t.hp, 10) : initialHp, 0, initialHp);
        return {
            id: Number.isFinite(t.id) ? parseInt(t.id, 10) : genTitanId(),
            name: safeString(t.name, 'Gigante'),
            hp,
            initialHp,
            cooldown: Math.max(0, Number.isFinite(t.cooldown) ? parseInt(t.cooldown, 10) : 0),
            type,
            isDefeated: Boolean(t.isDefeated),
            createdAt: Number.isFinite(t.createdAt) ? Number(t.createdAt) : Date.now()
        };
    }

    function genUnitId(type) {
        const arr = type === 'commander' ? (gameState.commandersData || []) : (gameState.recruitsData || []);
        const maxId = arr.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
        return maxId + 1;
    }
    function genTitanId() {
        gameState.titanIdCounter = (gameState.titanIdCounter || 0) + 1;
        return gameState.titanIdCounter;
    }

    const initializeDefaultState = () => {
        const moraleMin = db.settings?.moraleMin ?? 0;
        const moraleMax = db.settings?.moraleMax ?? 15;
        const xpMin = db.settings?.xpMin ?? 0;
        const xpMax = db.settings?.xpMax ?? 70;
        const wallDefaultHp = db.settings?.wallDefaultHp;

        const moraleDefault = clampInt(db.settings?.moraleDefault ?? 15, moraleMin, moraleMax);
        const xpDefault = clampInt(db.settings?.xpDefault ?? 0, xpMin, xpMax);

        // Se il DB fornisce le unità, usale; altrimenti fallback agli array esistenti
        const recruitsFromDb = Array.isArray(db.units?.recruits) ? db.units.recruits : [];
        const commandersFromDb = Array.isArray(db.units?.commanders) ? db.units.commanders : [];
        const titansFromDb = Array.isArray(db.units?.titans) ? db.units.titans : [];
        const titanIdCounter = Number.isFinite(db.units?.titanIdCounterStart)
            ? db.units.titanIdCounterStart
            : 0;

        const titans = titansFromDb.length ? titansFromDb : [];

        return {
            currentMissionNumber: 1,
            recruitsData: recruitsFromDb.map(u => normalizeUnit(u, 'recruit')),
            commandersData: commandersFromDb.map(u => normalizeUnit(u, 'commander')),
            titansData: titans.map(normalizeTitan),
            titanIdCounter,
            logData: [],
            morale: moraleDefault,
            xp: xpDefault,
            wallHp: { maria: wallDefaultHp.maria, rose: wallDefaultHp.rose, sina: wallDefaultHp.sina },
            eventDeck: [],
            eventDiscardPile: [],
            removedEventCards: []
        };
    };

    const resetGame = () => {
        clearInterval(missionTimerInterval);
        gameState = initializeDefaultState();
        if (allEventCards && allEventCards.length > 0) {
            gameState.eventDeck = [...allEventCards];
        }
        addLogEntry("Partita resettata.", "info");
        fullRender();
        startMissionTimer();
        saveGameState();
    };

    const fullRender = () => {
        elements.moraleSlider.value = gameState.morale;
        elements.xpSlider.value = gameState.xp;
        updateAllUIElements();
        renderTitanSpawnLegend();
        renderWallHP();
    };

    // --- NUOVA LOGICA PER DANNI ALLE MURA ---
    const processWallHpChange = (wallName, finalHp) => {
        const oldHp = gameState.wallHp[wallName];
        const damage = oldHp - finalHp;

        if (damage > 0) {
            const label = { maria: 'Maria', rose: 'Rose', sina: 'Sina' }[wallName];
            addLogEntry(`Wall ${label} ha subito ${damage} danni.`, 'damage');
        }

        gameState.wallHp[wallName] = finalHp;
        saveGameState();
    };

    const handleWallHpChange = (e) => {
        const slider = e.target;
        const wallName = slider.dataset.wallName;
        const newHp = parseInt(slider.value, 10);

        updateSlider(slider);

        clearTimeout(wallHpChangeTimers[wallName]);

        wallHpChangeTimers[wallName] = setTimeout(() => {
            processWallHpChange(wallName, newHp);
        }, 1000);
    };

    const renderWallHP = () => {
        elements.wallHpSection.innerHTML = '<h3 class="stats-title">Mura</h3>';
        ['maria', 'rose', 'sina'].forEach(wall => {
            const maxHp = { maria: 15, rose: 5, sina: 3 }[wall];
            const label = { maria: 'Wall Maria', rose: 'Wall Rose', sina: 'Wall Sina' }[wall];
            const currentHp = gameState.wallHp ? gameState.wallHp[wall] : maxHp;

            const statDiv = document.createElement('div');
            statDiv.className = 'stat';
            statDiv.innerHTML = `
                <label for="wall-${wall}-hp">${label}:</label>
                <div class="slider-value-container">
                    <input type="range" id="wall-${wall}-hp" data-wall-name="${wall}" min="0" max="${maxHp}" value="${currentHp}">
                    <span>${currentHp}</span>
                </div>`;
            elements.wallHpSection.appendChild(statDiv);
            const slider = statDiv.querySelector('input');
            slider.addEventListener('input', handleWallHpChange);
            updateSlider(slider);
        });
    };

    const updateDeckCount = () => {
        if (elements.eventDeckCount) {
            elements.eventDeckCount.textContent = gameState.eventDeck ? gameState.eventDeck.length : 0;
        }
    };

    const drawEventCard = () => {
        if (!gameState.eventDeck || gameState.eventDeck.length === 0) {
            if (!gameState.eventDiscardPile || gameState.eventDiscardPile.length === 0) {
                if (!allEventCards || allEventCards.length === 0) {
                    addLogEntry("Carte evento non caricate.", "info");
                    return;
                }
                gameState.eventDeck = [...allEventCards];
            } else {
                gameState.eventDeck = [...gameState.eventDiscardPile];
                gameState.eventDiscardPile = [];
                addLogEntry("Mazzo degli eventi rimescolato.", "info");
            }
        }

        const randomIndex = Math.floor(Math.random() * gameState.eventDeck.length);
        currentEventCard = gameState.eventDeck.splice(randomIndex, 1)[0];

        elements.eventCardTitle.textContent = currentEventCard.titolo;
        elements.eventCardDescription.textContent = currentEventCard.descrizione;
        elements.eventCardType.textContent = currentEventCard.tipo;

        elements.eventCardPopup.classList.add('show');
        addLogEntry(`Carta evento pescata: ${currentEventCard.titolo}`, 'mission');
        updateDeckCount();
        saveGameState();
    };

    const handleEventCardAction = (action) => {
        if (!currentEventCard) return;

        switch (action) {
            case 'reshuffle':
                gameState.eventDeck.push(currentEventCard);
                addLogEntry(`"${currentEventCard.titolo}" rimescolata.`, 'info');
                break;
            case 'discard':
                gameState.eventDiscardPile.push(currentEventCard);
                addLogEntry(`"${currentEventCard.titolo}" scartata.`, 'info');
                break;
            case 'remove':
                gameState.removedEventCards.push(currentEventCard);
                addLogEntry(`"${currentEventCard.titolo}" rimossa.`, 'info');
                break;
        }
        currentEventCard = null;
        elements.eventCardPopup.classList.remove('show');
        updateDeckCount();
        saveGameState();
    };

    async function main() {

        await loadDB();

        loadGameState();
        initializeEventDeck();
        fullRender();
        startMissionTimer();

        const setupPopup = (openBtn, closeBtn, popupEl) => {
            if (openBtn) openBtn.addEventListener('click', () => popupEl.classList.add('show'));
            if (closeBtn) closeBtn.addEventListener('click', () => popupEl.classList.remove('show'));
        };
        setupPopup(elements.openRecruitsPopupBtn, elements.closeRecruitsPopupBtn, elements.recruitsPopup);
        setupPopup(elements.openCommandersPopupBtn, elements.closeCommandersPopupBtn, elements.commandersPopup);
        setupPopup(elements.logPanelTrigger, elements.closeLogPanel, elements.logPanel);

        elements.moraleSlider.addEventListener('input', () => { updateMorale(); saveGameState(); });
        elements.xpSlider.addEventListener('input', () => { updateXP(); saveGameState(); });
        elements.completeMissionBtn.addEventListener('click', completeMission);
        if (elements.restartMissionBtn) elements.restartMissionBtn.addEventListener('click', restartMissionTimer);
        elements.decreaseMissionBtn.addEventListener('click', () => changeMission(-1));
        elements.increaseMissionBtn.addEventListener('click', () => changeMission(1));

        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.hp-change')) handleHpChange(e);
            if (e.target.closest('.mission-button') || e.target.closest('.remove-from-mission-btn')) handleMissionToggle(e);
            if (e.target.matches('.roll-dice-btn')) {
                const sides = parseInt(e.target.dataset.sides);
                const count = parseInt(e.target.dataset.count);
                let rolls = []; let sum = 0;
                for (let i = 0; i < count; i++) { const roll = Math.floor(Math.random() * sides) + 1; rolls.push(roll); sum += roll; }
                elements.diceResultArea.innerHTML = `<p><strong>Tiri:</strong> ${rolls.join(', ')}</p><p><strong>Totale:</strong> ${sum}</p>`;
                addLogEntry(`Lanciati ${count}D${sides}. Risultati: ${rolls.join(', ')}. Totale: ${sum}.`, 'dice');
            }
        });

        elements.addTitanBtn.addEventListener('click', addTitan);
        elements.titanGrid.addEventListener('click', handleTitanActions);

        elements.resetGameBtn.addEventListener('click', () => elements.resetConfirmModal.classList.add('show'));
        elements.cancelResetBtn.addEventListener('click', () => elements.resetConfirmModal.classList.remove('show'));
        elements.confirmResetBtn.addEventListener('click', () => {
            elements.resetConfirmModal.classList.remove('show');
            resetGame();
        });

        if (elements.drawEventBtn) elements.drawEventBtn.addEventListener('click', drawEventCard);
        if (elements.eventReshuffleBtn) elements.eventReshuffleBtn.addEventListener('click', () => handleEventCardAction('reshuffle'));
        if (elements.eventDiscardBtn) elements.eventDiscardBtn.addEventListener('click', () => handleEventCardAction('discard'));
        if (elements.eventRemoveBtn) elements.eventRemoveBtn.addEventListener('click', () => handleEventCardAction('remove'));
    }

    main();
});