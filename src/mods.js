import { GAME_STATE, scheduleSave, DB, unitById } from "./data.js";
import { levelFromXP, fmtSigned, signClass} from "./utils.js";
import { log } from "./log.js";

const UM_STAT_LABELS = { atk: 'ATK', tec: 'TEC', agi: 'AGI', cd: 'CD', mov: 'MOV', rng: 'RNG' };
const isEnemy = u => u?.role === 'enemy';
const boxMods = document.getElementById('mods-section');

function unitListForPicker() {
    const ids = new Set();
    const out = [];

    // 1) Unità sulla griglia
    for (const s of (GAME_STATE?.spawns || [])) {
        const arr = Array.isArray(s.unitIds) ? s.unitIds : (s.unitId ? [s.unitId] : []);
        for (const id of arr) {
            const u = unitById?.get ? unitById.get(id) : null;
            if (u && u.role !== 'wall' && !ids.has(u.id)) { ids.add(u.id); out.push(u); }
        }
    }

    // 2) Roster in missione (alleati + giganti)
    for (const u of [...(GAME_STATE?.alliesRoster || []), ...(GAME_STATE?.giantsRoster || [])]) {
        if (!u || !u.id || u.role === 'wall' || ids.has(u.id)) continue;
        ids.add(u.id);
        out.push(unitById?.get ? (unitById.get(u.id) || u) : u);
    }

    // 3) Fallback: tutto ciò che c’è in unitById (no template)
    if (!out.length && unitById?.size) {
        for (const u of unitById.values()) {
            if (u && ['recruit', 'commander', 'enemy'].includes(u.role) && u.template !== true && !ids.has(u.id)) {
                ids.add(u.id); out.push(u);
            }
        }
    }

    return out;
}



export function mountUnitModsUI() {
    const root = document.querySelector('#mods-unit-panel .accordion-inner');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';

    // se nel markup fosse rimasto un vecchio scope “statico”, rimuovilo
    root.querySelectorAll('.um > .um-scope').forEach(n => n.remove());

    // riferimenti header già presenti in HTML
    const btnPicker = root.querySelector('#um-picker');
    const menu = root.querySelector('#um-menu');
    const imgAva = root.querySelector('#um-ava');
    const nameEl = root.querySelector('#um-name');
    const roleEl = root.querySelector('#um-role');
    const btnReset = root.querySelector('#um-reset');

    const rowsBox = root.querySelector('#um-rows');

    // stato locale
    let units = unitListForPicker();
    let current = units[0] || null;

    // ============ render picker menu ============
    function renderMenu() {
        units = unitListForPicker(); // ✅ ricalcola qui
        if (!units.length) {
            menu.innerHTML = `<div class="um-opt" style="opacity:.8;cursor:default">Nessuna unità disponibile</div>`;
            return;
        }
        menu.innerHTML = units.map(u => `
    <div class="um-opt" data-id="${u.id}">
      <span class="ava"><img src="${u.img || u.avatar || 'assets/img/logo.jpg'}" alt=""></span>
      <span class="name">${u.name || '(sconosciuto)'}</span>
      <span class="sub">${u.role === 'enemy' ? 'Gigante' : (u.role === 'commander' ? 'Comandante' : 'Recluta')}</span>
    </div>
  `).join('');
    }

    function setPicker(u) {
        current = u || null;
        if (!current) {
            imgAva.src = 'assets/img/logo.jpg';
            nameEl.textContent = 'Seleziona unità';
            roleEl.textContent = '—';
            rowsBox.innerHTML = `<div style="opacity:.8">Nessuna unità selezionata.</div>`;
            return;
        }
        imgAva.src = current.img || current.avatar || 'assets/img/logo.jpg';
        nameEl.textContent = current.name || '(sconosciuto)';
        roleEl.textContent = (current.role === 'enemy' ? 'Gigante' : (current.role === 'commander' ? 'Comandante' : 'Recluta'));
        renderRows();
    }

    function renderRows() {
        if (!current) { rowsBox.innerHTML = ''; return; }
        const stats = isEnemy(current) ? ['atk', 'cd', 'mov', 'rng'] : ['atk', 'tec', 'agi'];

        rowsBox.innerHTML = `
  <div class="um-card">

    <!-- riga stat + valore -->
    <div class="um-line um-editor-row">

    <span id="um-label" class="rm-chip">Modificatore</span>

      <select id="um-stat" class="um-select">
        ${stats.map(s => `<option value="${s}">${UM_STAT_LABELS[s]}</option>`).join('')}
      </select>

      <div class="um-step">
        <button class="um-btn" data-act="vminus" title="- valore">−</button>
        <input id="um-value" type="number" value="1" hidden>
        <span id="um-value-chip" class="rm-chip">+1</span>
        <button class="um-btn" data-act="vplus" title="+ valore">+</button>
      </div>
    </div>

    <!-- riga durata (dentro la card) -->
    <div class="um-line um-dur">
         <span id="um-label" class="rm-chip">Durata</span>
      <select id="um-scope" class="um-select um-sel-sm">
  <option value="mission">Missione</option>
  <option value="round">N° Round</option>
</select>


      <div class="um-step">
        <button class="um-btn" data-act="rminus" title="- round">−</button>
        <input id="um-rounds" type="number" min="1" value="1" hidden>
        <span id="um-rounds-chip" class="rm-chip">1</span>
        <button class="um-btn" data-act="rplus" title="+ round">+</button>
      </div>
    </div>

    <!-- CTA in basso a dx -->
    <div class="um-actions um-dur">
      <button id="um-add" class="um-addfab" type="button">Aggiungi Modificatore</button>
    </div>
  </div>

  <div id="um-totals" class="um-totals" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;"></div>
<hr class="um-sep">
  <div id="um-list" class="um-list" style="display:flex;flex-direction:column;gap:8px;"></div>
`;

        // === refs
        const scopeSel = rowsBox.querySelector('#um-scope');

        const roundsInput = rowsBox.querySelector('#um-rounds');
        const roundsChip = rowsBox.querySelector('#um-rounds-chip');
        const valInput = rowsBox.querySelector('#um-value');
        const valChip = rowsBox.querySelector('#um-value-chip');
        const editorRow = rowsBox.querySelector('.um-editor-row');
        const addBtn = rowsBox.querySelector('#um-add');

        // init chips
        valChip.textContent = fmtSigned(parseInt(valInput.value || 0, 10));
        if (editorRow) editorRow.dataset.sign = signClass(parseInt(valInput.value || 0, 10));
        roundsChip.textContent = String(parseInt(roundsInput.value || 1, 10));

        // abilita/disabilita durata in base a Missione/Round
        const setRoundsEnabled = () => {
            const scope = scopeSel.value;
            const disabled = (scope === 'mission');
            roundsInput.disabled = disabled;
            rowsBox.querySelector('[data-act="rminus"]').disabled = disabled;
            rowsBox.querySelector('[data-act="rplus"]').disabled = disabled;
            roundsChip.style.opacity = disabled ? .6 : 1;
        };
        scopeSel.addEventListener('change', setRoundsEnabled);
        setRoundsEnabled();

        // (ri)aggancia ogni volta, usando riferimenti freschi
        if (rowsBox._handler) rowsBox.removeEventListener('click', rowsBox._handler);

        rowsBox._handler = (e) => {
            const b = e.target.closest('[data-act]');
            if (!b) return;
            const act = b.dataset.act;

            // prendi i riferimenti dal DOM *attuale*
            const valInput = rowsBox.querySelector('#um-value');
            const valChip = rowsBox.querySelector('#um-value-chip');
            const roundsInput = rowsBox.querySelector('#um-rounds');
            const roundsChip = rowsBox.querySelector('#um-rounds-chip');
            const editorRow = rowsBox.querySelector('.um-editor-row');

            if (!valInput || !valChip || !roundsInput || !roundsChip) return;

            if (act === 'vminus' || act === 'vplus') {
                const step = (act === 'vminus') ? -1 : 1;
                const next = (parseInt(valInput.value || 0, 10) || 0) + step;
                valInput.value = next;
                valChip.textContent = fmtSigned(next);
                if (editorRow) editorRow.dataset.sign = signClass(next);
            }

            if ((act === 'rminus' || act === 'rplus') && !roundsInput.disabled) {
                const step = (act === 'rminus') ? -1 : 1;
                const next = Math.max(1, (parseInt(roundsInput.value || 1, 10) || 1) + step);
                roundsInput.value = next;
                roundsChip.textContent = String(next);
            }
        };

        rowsBox.addEventListener('click', rowsBox._handler);

        // aggiungi effetto
        addBtn.addEventListener('click', () => {
            const stat = rowsBox.querySelector('#um-stat').value;
            const delta = parseInt(valInput.value, 10) || 0;
            if (!delta) return;

            const scope = scopeSel.value;
            const rounds = (scope === 'mission') ? Infinity : Math.max(1, parseInt(roundsInput.value, 10) || 1);

            const effs = ensureModsStore(current);
            effs.push({ id: 'e' + Math.random().toString(36).slice(2), stat, delta, rounds, type: scope });
            renderList();
            renderTotals();
            scheduleSave?.();
        });

        renderList();
        renderTotals();
    }
    function renderTotals() {
        const box = rowsBox.querySelector('#um-totals');
        if (!box || !current) return;

        const stats = isEnemy(current) ? ['atk', 'cd', 'mov', 'rng'] : ['atk', 'tec', 'agi'];
        const effs = ensureModsStore(current);
        const sums = {};
        stats.forEach(s => sums[s] = 0);
        effs.forEach(e => { if (sums.hasOwnProperty(e.stat)) sums[e.stat] += (e.delta | 0); });

        box.innerHTML = stats.map(s => {
            const v = sums[s] || 0;
            const sig = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
            const color =
                sig === 'pos' ? 'color:#b7ffcf;border-color:#245f3c;background:#0f1713;' :
                    sig === 'neg' ? 'color:#ffd0d0;border-color:#5a2a2a;background:#191214;' :
                        'color:#e5e5e5;border-color:#2a2a2a;background:#10121a;';
            return `<span class="tot-chip" data-sign="${sig}"
             style="padding:4px 8px;border:1px solid;border-radius:999px;${color}">
             ${UM_STAT_LABELS[s]} <strong style="margin-left:4px;">${fmtSigned(v)}</strong>
            </span>`;
        }).join('');
    }

    function renderList() {
        const list = rowsBox.querySelector('#um-list');
        const effs = ensureModsStore(current);

        // ordina per durata: prima quelle che scadono prima, poi ∞
        effs.sort((a, b) => {
            const da = a.rounds === Infinity ? Number.POSITIVE_INFINITY : a.rounds;
            const db = b.rounds === Infinity ? Number.POSITIVE_INFINITY : b.rounds;
            return da - db;
        });

        if (!effs.length) {
            list.innerHTML = `<div style="opacity:.7;font-size:12px;">Nessun modificatore.</div>`;
            return;
        }

        list.innerHTML = effs.map(e => {
            const sign = signClass(e.delta);
            const durTxt = (e.rounds === Infinity || !e.rounds) ? 'Per tutta la Missione' : `Per ${e.rounds} round`;
            return `
        <div class="um-pill" data-id="${e.id}" data-sign="${sign}"
             style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--b,#2a2a2a);border-radius:10px;background:#0f1118;">
          <span class="um-label" style="opacity:.9, font-weight: 700;">${UM_STAT_LABELS[e.stat] || e.stat}</span>
          <span class="um-val" style="font-weight:700;">${fmtSigned(e.delta)}</span>
          <span style="margin-left:auto;opacity:.8;">${durTxt}</span>
          <button class="btn-icon um-del" title="Rimuovi">×</button>
        </div>
      `;
        }).join('');

        // colori
        list.querySelectorAll('.um-pill').forEach(p => {
            const s = p.dataset.sign;
            if (s === 'pos') { p.style.setProperty('--b', '#245f3c'); p.style.color = '#b7ffcf'; }
            else if (s === 'neg') { p.style.setProperty('--b', '#5a2a2a'); p.style.color = '#ffd0d0'; }
            else { p.style.setProperty('--b', '#2a2a2a'); p.style.color = '#e5e5e5'; }
        });

        // remove handler
        list.querySelectorAll('.um-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('.um-pill')?.dataset.id;
                const effs = ensureModsStore(current);
                const i = effs.findIndex(x => x.id === id);
                if (i >= 0) effs.splice(i, 1);
                renderList();
                renderTotals();
                scheduleSave?.();
            });
        });
    }

    // ============ picker interactions ============
    const closeMenu = (ev) => {
        if (!menu.hidden && !menu.contains(ev.target) && !btnPicker.contains(ev.target)) {
            menu.hidden = true;
        }
    };

    document.addEventListener('click', closeMenu);

    btnPicker.addEventListener('click', () => {
        if (menu.hidden) { renderMenu(); menu.hidden = false; }
        else menu.hidden = true;
    });
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.um-opt');
        if (!item) return;
        const u = units.find(x => x.id === item.dataset.id);
        menu.hidden = true;
        setPicker(u);
    });

    btnReset.addEventListener('click', () => {
        if (!current) return;
        current._effects = [];
        renderRows();
        scheduleSave?.();
    });

    // prima selezione
    setPicker(current);
}

// storage semplice: attacco la lista effetti all’oggetto unità
function ensureModsStore(u) {
    if (!u._effects) u._effects = []; // {id, stat, delta, rounds, type:'mission'|'round'}
    return u._effects;
}

// === MALUS da Morale (allineato DB.SETTINGS.malusTable) ===
function malusFromMorale(moralePctRaw) {
    const moralePct = Math.max(0, Math.min(100, Number(moralePctRaw) || 0));
    // Trova la riga di tabella che copre il range del morale corrente (inclusivo)
    const row = DB.SETTINGS.malusTable.find(r =>
        moralePct >= r.range.min && moralePct <= r.range.max
    );

    if (!row) return [];

    const hasEffect =
        row && row.bonus && (row.bonus.agi || 0) !== 0 ||
        (row.bonus && (row.bonus.tec || 0) !== 0) ||
        (row.bonus && (row.bonus.atk || 0) !== 0) ||
        (row.text && row.text.trim().length > 0);

    // Se non c'è nessun testo e i bonus sono tutti 0, non renderiamo pillole
    if (!hasEffect) return [];

    return [{
        type: 'malus',
        text: row.text || '',           // Puoi popolarlo nella tabella
        bonus: row.bonus || { agi: 0, tec: 0, atk: 0, all: 0 }
    }];
}
// === Utility merge/somma di tutti i bonus/malus ===
function mergeBonuses(pills) {
    const totals = { agi: 0, tec: 0, atk: 0, all: 0 };
    for (const p of pills) {
        if (!p || !p.bonus) continue;
        totals.agi += p.bonus.agi || 0;
        totals.tec += p.bonus.tec || 0;
        totals.atk += p.bonus.atk || 0;
        totals.all += p.bonus.all || 0;
    }
    return totals;
}

function bonusesFromLevel(level) {
    return DB.SETTINGS.bonusTable
        .filter(b => level >= b.lvl)
        .map(b => ({ type: 'bonus', text: b.text, bonus: b.bonus }));
}

// Render unico
export function renderBonusMalus() {

    const level = levelFromXP(GAME_STATE.xpMoraleState.xp);
    const morale = Number(GAME_STATE.xpMoraleState.moralePct) || 0;
    // 1) raccogli pillole: bonus (cumulativi per soglia) + malus (unico per range)
    const pills = [
        { type: 'modsRoll', text: '', bonus: GAME_STATE.modRolls },
        ...bonusesFromLevel(level),
        ...malusFromMorale(morale),
    ];

    // 2) calcola la somma effettiva
    const totals = mergeBonuses(pills);
    // opzionale: salviamo nello state se vuoi riusarlo altrove
    GAME_STATE.xpMoraleState.effectiveBonus = totals;

    refreshRollModsUI();
}


export const renderRollMods = () => {
    const m = GAME_STATE.xpMoraleState.effectiveBonus;
    const fmt = (v) => (v >= 0 ? '+' + v : '' + v);
    ['atk', 'tec', 'agi', 'all'].forEach(k => {
        const v = m[k] || 0;
        const el = document.getElementById('rm-' + k);
        if (el) el.textContent = fmt(v);

        // 👉 imposta il segno sulla riga per attivare il CSS
        const row = boxMods.querySelector(`.rm-row[data-kind="${k}"]`);
        if (row) row.dataset.sign = (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
    });
};

export function initModsListeners() {
    boxMods.addEventListener('click', (e) => {
        const btn = e.target.closest('.rm-btn');

        if (!btn) return;
        const row = btn.closest('.rm-row');
        const kind = row?.dataset?.kind;
        const d = Number(btn.dataset.delta || 0);
        if (!kind || !d) return;
        const m = ensureRollMods();

        m[kind] = (m[kind] || 0) + d;

        renderBonusMalus();
        refreshRollModsUI();
        scheduleSave();
    });
}

function ensureRollMods() {
    if (!GAME_STATE.modRolls) {
        GAME_STATE.modRolls = { atk: 0, tec: 0, agi: 0, all: 0 };
    }
    return GAME_STATE.modRolls;
}

export function refreshRollModsUI() {
    renderRollMods();
}
export function initModsDiceUI() {
    const dieSel = document.getElementById('rm-die');
    const btn = document.getElementById('rm-roll');
    const out = document.getElementById('rm-roll-out');

    if (!dieSel || !btn || !out) return;

    const signed = (n) => (n >= 0 ? `+ ${n}` : `${n}`);
    const getTot = () => {
        const el = document.getElementById('rm-all');
        if (!el) return 0;
        const n = parseInt((el.textContent || '').replace(/[^\-0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
    };
    const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;

    btn.addEventListener('click', () => {
        const sides = parseInt(dieSel.value, 10) || 20;
        const r = rollDie(sides);
        const totMod = getTot();
        const total = r + totMod;

        out.textContent = `d${sides}: ${r} ${totMod ? `(${signed(totMod)}) = ${total}` : ''}`;
        out.classList.remove('roll'); // retrigger anim
        void out.offsetWidth;
        out.classList.add('roll');

        // opzionale: log e sfx se li usi già
        try { log(`Tiro d${sides}: ${r}${totMod ? ` ${signed(totMod)} => ${total}` : ''}`, 'info'); } catch { }
    });
}
