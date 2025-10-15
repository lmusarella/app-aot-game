import { GAME_STATE, rebuildUnitIndex, scheduleSave, DB } from './data.js'
import { missionStatsRecordEvent } from './missions.js'
import { log } from './log.js';
import { giantsPhaseMove, pickRandomTeam, spawnGiant } from './entity.js';
import { renderBenches, renderGrid, grid } from './grid.js';
import { applyHpBar, COLOR_VAR, shuffle, countAlive, totalByRole } from './utils.js';
import { playSfx } from './audio.js';
import { addLongPress, showTooltip, getUnitTooltipHTML, alliesPickerHTML, ensureModal, openAccordionForRole, hideTooltip, cardSheetHTML } from './ui.js';

const fabs = Array.from(document.querySelectorAll('.fab'));

function flash(el) {
    const old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 3px rgba(255,255,255,.25) inset, 0 0 18px rgba(255,0,0,.45)';
    setTimeout(() => el.style.boxShadow = old, 260);
}

export function closeAllFabs() { fabs.forEach(f => { f.classList.remove('open'); f.setAttribute('aria-expanded', 'false'); }); }
fabs.forEach(fab => {
    const mainBtn = fab.querySelector('.fab-main');
    mainBtn.addEventListener('click', (e) => {
        hideTooltip();
        e.stopPropagation();
        const willOpen = !fab.classList.contains('open');
        closeAllFabs();
        fab.classList.toggle('open', willOpen);
        fab.setAttribute('aria-expanded', String(willOpen));
    });
});

document.addEventListener('click', (e) => { if (!e.target.closest('.fab')) closeAllFabs(); });
document.querySelectorAll('#fab-arruola .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const role = btn.dataset.role; // 'recruit' | 'commander' | 'random-team'

        if (role === 'random-team') {
            pickRandomTeam({ commanders: 1, recruits: 3 });
            closeAllFabs();
            return;
        }

        // flusso standard: picker manuale
        await openAlliesPicker(role);
        closeAllFabs();
    });
});


document.querySelectorAll('#fab-spawn .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const type = btn.dataset.type; // "Casuale" | "Puro" | "Anomalo" | "Mutaforma"
        if (type !== 'Movimento') {
            let ok = false;
            if (type === 'Casuale') ok = await spawnGiant();
            else ok = await spawnGiant(type);
            if (!ok) {
                const anchor = document.querySelector('#fab-spawn .fab-main');
                flash(anchor);
            }
        } else {
            giantsPhaseMove();
            renderGrid(grid, DB.SETTINGS.gridSettings.rows, DB.SETTINGS.gridSettings.cols, GAME_STATE.spawns);
        }

        closeAllFabs();
    });
});
function reshuffleDiscardsOf(type /* 'event' | 'consumable' */) {
    const d = GAME_STATE.decks[type];
    if (!d) return 0;

    let moved = [];

    // scarti
    if (Array.isArray(d.discard) && d.discard.length > 0) {
        moved.push(...d.discard.splice(0));
    }

    // rimossi
    if (Array.isArray(d.removed) && d.removed.length > 0) {
        moved.push(...d.removed.splice(0));
    }

    if (moved.length === 0) return 0;

    d.draw.push(...moved);     // rientrano nel mazzo
    shuffle(d.draw);           // rimescola
    scheduleSave();
    return moved.length;
}

function reshuffleAllDiscards() {
    const e = reshuffleDiscardsOf('event');
    const c = reshuffleDiscardsOf('consumable');

    if (e === 0 && c === 0) {
        log('Nessuna carta negli scarti.', 'info');
    } else {
        const parts = [];
        if (e) parts.push(`Eventi: ${e}`);
        if (c) parts.push(`Consumabili: ${c}`);
        log(`Rimescolati gli scarti → ${parts.join(' • ')}.`, 'info');
    }

    updateFabDeckCounters();
}
export function drawCard(type /* 'event' | 'consumable' */) {
    const d = GAME_STATE.decks[type];
    if (!d) return null;

    if (d.draw.length === 0) {
        if (d.discard.length === 0) return null;        // mazzo vuoto
        // rimescola gli scarti nel draw
        d.draw = shuffle(d.discard.splice(0));
    }
    const pop = d.draw.pop();
    scheduleSave();
    updateFabDeckCounters();
    return pop; // pesca dal top
}
document.querySelectorAll('#fab-event .fab-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const t = btn.dataset.ev; // "evento" | "consumabile"

        if (t === 'reshuffle') {
            // RIMESCOLA SCARTI (tutti i mazzi) dal FAB “Carte”          
            reshuffleAllDiscards();
            closeAllFabs();
            return;
        }

        if (t === 'showhand') {
            openHandOverlay();
            closeAllFabs();
            return;
        }

        const type = (t === 'evento') ? 'event' : 'consumable';
        const card = drawCard(type);

        if (!card) {
            log('Il mazzo è vuoto. Rimescola gli scarti o ricarica le carte.', 'warning');
            closeAllFabs();
            return;
        }
        log(`Pescata carta ${t}: "${card.name}".`);
        if (type === 'event') await playSfx('assets/sounds/carte/carta_evento.mp3', { volume: 0.3, loop: false });
        if (type === 'consumable') await playSfx('assets/sounds/carte/carta_consumabile.mp3');
        showDrawnCard(type, card);
        closeAllFabs();
    });
});


export function updateFabDeckCounters() {
    const evDraw = GAME_STATE.decks.event?.draw?.length || 0;
    const consDraw = GAME_STATE.decks.consumable?.draw?.length || 0;
    const handDraw = GAME_STATE.hand?.length || 0;

    const evBadge = document.querySelector('[data-deck-badge="event"]');
    const consBadge = document.querySelector('[data-deck-badge="consumable"]');
    const handBadge = document.querySelector('[data-deck-badge="showhand"]');
    if (evBadge) evBadge.textContent = evDraw;
    if (consBadge) consBadge.textContent = consDraw;
    if (handBadge) handBadge.textContent = handDraw;
}

export function showDrawnCard(deckType, card) {
    const root = document.getElementById('hand-overlay');
    const strip = document.getElementById('hand-strip');
    const stage = root?.querySelector('.hand-stage');
    if (!root || !strip || !stage) return;
    stage.classList.add('hand-stage--single');
    strip.classList.remove('hand-strip')
    strip.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'hand-card';

    const actionCard = [
        { key: 'discard', label: 'Scarta', kind: 'primary' },
        { key: 'shuffle', label: 'Rimescola', kind: 'danger' }
    ];

    wrap.innerHTML = cardSheetHTML(deckType, card, actionCard);

    wrap.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.card-btn'); if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'discard') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Scartata "${card.name}".`, 'info');
        }
        if (act === 'shuffle') {
            GAME_STATE.decks[deckType]?.draw.push(card);
            log(`Rimescolata ${card.name} nel mazzo "${deckType}".`, 'info');
        }
        updateFabDeckCounters();
        closeOverlay();
    }, { passive: true });

    strip.appendChild(wrap);

    function closeOverlay() {
        root.setAttribute('hidden', '');
        root.querySelector('.hand-backdrop').onclick = null;
        root.querySelector('.hand-close').onclick = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

    root.querySelector('.hand-backdrop').onclick = () => {
        closeOverlay();
        if (deckType === 'consumable') {
            GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
            log(`Aggiunta in mano: "${card.name}".`, 'success');
            updateFabDeckCounters();
        }
        if (deckType === 'event') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
            updateFabDeckCounters();

            missionStatsRecordEvent(card, {                       // opzionale, se non lo passi usa ms.round
                durationRounds: card.duration || Infinity, // 1, N oppure Infinity             
                sign: card.sign || 0                // +1 / -1 / 0 (colore chip)
            });
        }
    };
    root.querySelector('.hand-close').onclick = () => {
        closeOverlay();
        if (deckType === 'consumable') {
            GAME_STATE.hand.push({ deck: deckType, card: structuredClone(card) });
            log(`Aggiunta in mano: "${card.name}".`, 'success');
            updateFabDeckCounters();
        }
        if (deckType === 'event') {
            GAME_STATE.decks[deckType]?.discard.push(card);
            log(`Carta Evento "${card.name}" è stata attivata!.`, 'warning');
            updateFabDeckCounters();
            missionStatsRecordEvent(card, {
                durationRounds: card.duration || Infinity, // 1, N oppure Infinity                     // testo breve (facoltativo)
                sign: card.sign || 0                // +1 / -1 / 0 (colore chip)
            });
        }
    };
    document.addEventListener('keydown', onKey);

    root.removeAttribute('hidden');
}

function openHandOverlay() {
    const root = document.getElementById('hand-overlay');
    const strip = document.getElementById('hand-strip');
    const stage = root?.querySelector('.hand-stage');
    if (!root || !strip || !stage) return;
    stage.classList.remove('hand-stage--single');
    strip.classList.add('hand-strip')
    if (!GAME_STATE.hand.length) { log('La mano è vuota.', 'info'); return; }

    // render
    strip.innerHTML = '';
    GAME_STATE.hand.forEach((entry, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'hand-card';
        wrap.innerHTML = cardSheetHTML(entry.deck, entry.card, [
            { key: 'discard-one', label: 'Scarta', kind: 'primary' },
            { key: 'use-one', label: 'Usa', kind: 'danger' }
        ]);
        // delega click pulsanti di questa carta
        wrap.addEventListener('click', (ev) => {
            const btn = ev.target.closest('.card-btn'); if (!btn) return;
            const act = btn.dataset.act;

            if (act === 'discard-one') {
                const it = GAME_STATE.hand.splice(i, 1)[0];
                if (it) {
                    GAME_STATE.decks[it.deck]?.discard.push(it.card);
                    log(`Scartata "${it.card.name}".`, 'info');
                    updateFabDeckCounters();
                }
            }
            if (act === 'use-one') {
                const it = GAME_STATE.hand.splice(i, 1)[0];
                if (it) {
                    let handled = false;
                    try { handled = !!window.onUseCard?.(it.deck, it.card); } catch { }
                    if (!handled) {
                        if (it.deck === 'consumable') GAME_STATE.decks[it.deck]?.discard.push(it.card);
                        else GAME_STATE.decks[it.deck]?.discard.push(it.card);
                    }
                    log(`Usata "${it.card.name}".`, 'success');
                    updateFabDeckCounters();

                    missionStatsRecordEvent(it.card, {
                        durationRounds: it.card.duration || Infinity, // 1, N oppure Infinity              
                        sign: it.card.sign || 0                // +1 / -1 / 0 (colore chip)
                    });
                }
            }

            // refresh/chiudi
            if (!GAME_STATE.hand.length) { closeOverlay(); return; }
            openHandOverlay(); // rerender semplice
        }, { passive: true });

        strip.appendChild(wrap);
    });

    function closeOverlay() {
        root.setAttribute('hidden', '');
        root.querySelector('.hand-backdrop').onclick = null;
        root.querySelector('.hand-close').onclick = null;
        document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') closeOverlay(); }

    root.querySelector('.hand-backdrop').onclick = closeOverlay;
    root.querySelector('.hand-close').onclick = closeOverlay;

    document.addEventListener('keydown', onKey);

    root.removeAttribute('hidden');
}

// Arruola dal picker (clona tutti i selezionati) + feedback
export async function openAlliesPicker(role) {
    const baseIds = await pickAlliesDialog(role);
    if (!baseIds || baseIds.length === 0) return;

    const moved = [];
    for (const id of baseIds) {
        const ix = GAME_STATE.alliesPool.findIndex(a => a.id === id && a.role === role);
        if (ix === -1) continue;
        const unit = GAME_STATE.alliesPool.splice(ix, 1)[0]; // rimuovi dal pool
        unit.template = false;                    // ora è “attivo”
        GAME_STATE.alliesRoster.push(unit);                  // metti in panchina
        moved.push(unit);
    }

    rebuildUnitIndex();
    renderBenches();

    const bench = document.getElementById('bench-allies');
    bench.style.boxShadow = '0 0 0 2px rgba(39,183,168,.55)';
    setTimeout(() => bench.style.boxShadow = '', 350);

    log(moved.length === 1 ? `Aggiunto in panchina ${moved[0].name}` : `Aggiunte ${moved.length} unità in panchina.`);
    openAccordionForRole(moved[0].role);
    scheduleSave();
}

function pickAlliesDialog(role) {
    const { backdrop, modal, title, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
    const roleLabel = role === 'recruit' ? 'Reclute' : 'Comandanti';
    title.textContent = `Seleziona ${roleLabel}`;
    msg.innerHTML = alliesPickerHTML(role);
    btnConfirm.textContent = 'Arruola';

    btnCancel.textContent = 'Annulla';
    btnCancel.style.display = '';
    btnClose.style.display = '';
    const grid = msg.querySelector('#ally-grid');
    const search = msg.querySelector('#ally-search');
    const tools = msg.querySelector('.picker__tools');
    const countEl = msg.querySelector('#picker-count');

    // Popola barra HP per ogni card (dal POOL)
    const paintPicker = () => {
        msg.querySelectorAll('.pick-card').forEach(card => {
            const id = card.dataset.id;
            const base = GAME_STATE.alliesPool.find(a => a.id === id);
            if (!base) return;

            // Stato visivo + accessibilità
            card.classList.toggle('is-dead', !!base.dead);
            card.setAttribute('aria-disabled', String(!!base.dead));
            card.setAttribute('tabindex', base.dead ? '-1' : '0');
            const colVar = COLOR_VAR[base.color] || '#444';
            card.style.setProperty('--ring', colVar);
            card.style.setProperty('--sel', colVar);
            // Badge / Bottone
            const actions = card.querySelector('.unit-actions');
            if (base.dead) {
                // aggiungi badge se non c'è
                if (!card.querySelector('.pick-dead-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'pick-dead-badge';
                    badge.title = 'Morto/a';
                    card.prepend(badge);
                }
                // aggiungi pulsante se non c'è
                if (!actions.querySelector('.btn-resurrect')) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'btn-resurrect';
                    btn.dataset.id = id;
                    btn.title = 'Resuscita';
                    btn.textContent = 'Resuscita';
                    actions.appendChild(btn);
                }
            } else {
                // rimuovi elementi di morte se presenti
                card.querySelector('.pick-dead-badge')?.remove();
                actions.querySelector('.btn-resurrect')?.remove();
            }

            // HP bar + testo (cuore/teschio)
            const fill = card.querySelector('.hpbar-fill');
            const txt = card.querySelector('.hp-inline-right');
            if (fill) applyHpBar(fill, base);
            if (txt) {
                const icon = base.dead ? '☠️' : '❤️';
                const cur = base.currHp ?? base.hp;
                txt.textContent = `${icon} ${cur}/${base.hp}`;
            }

            addLongPress(card, {
                onLongPress: () => {
                    const html = getUnitTooltipHTML(base);
                    showTooltip(html);
                }
            });
        });

        // Contatore vivi
        const liveEl = msg.querySelector('#picker-live');
        if (liveEl) {
            const role = msg.querySelector('.picker').dataset.role;
            liveEl.textContent = `Vivi: ${countAlive(role)} / ${totalByRole(role)}`;
        }
    };
    paintPicker();
    const selected = new Set();
    const updateCount = () => { countEl.textContent = `Selezionate: ${selected.size}`; };
    const updateAria = (card) => {
        card.setAttribute('aria-pressed', String(card.classList.contains('is-selected')));
    };
    const toggleCard = (card) => {
        if (!card || !card.dataset.id) return;
        const id = card.dataset.id;
        if (card.classList.contains('is-selected')) {
            card.classList.remove('is-selected'); selected.delete(id);
        } else {
            card.classList.add('is-selected'); selected.add(id);
        }
        updateAria(card); updateCount();
    };
    const setCardSelected = (card, yes) => {
        if (!card) return;
        card.classList.toggle('is-selected', !!yes);
        if (yes) selected.add(card.dataset.id); else selected.delete(card.dataset.id);
        updateAria(card); updateCount();
    };
    const applyFilter = () => {
        const q = (search.value || '').toLowerCase().trim();
        grid.querySelectorAll('.pick-card').forEach(card => {
            const ok = !q || card.dataset.name.includes(q);
            card.style.display = ok ? '' : 'none';
        });
    };
    search.addEventListener('input', applyFilter);
    tools.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const act = b.dataset.act;
        const visible = Array.from(grid.querySelectorAll('.pick-card')).filter(c => c.style.display !== 'none');
        if (act === 'all') visible.forEach(c => setCardSelected(c, true));
        else if (act === 'none') visible.forEach(c => setCardSelected(c, false));
    });


    // Click card: seleziona SOLO se non morta
    grid.addEventListener('click', (e) => {
        const resBtn = e.target.closest('.btn-resurrect');
        if (resBtn) {
            const id = resBtn.dataset.id;
            if (resurrectInPool(id)) {
                const card = resBtn.closest('.pick-card');
                const base = GAME_STATE.alliesPool.find(a => a.id === id);

                // 1) stato "vivo"
                card.classList.remove('is-dead');
                card.setAttribute('aria-disabled', 'false');
                card.setAttribute('tabindex', '0');

                // 2) rimuovi elementi "morte"
                card.querySelector('.btn-resurrect')?.remove();
                card.querySelector('.pick-dead-badge')?.remove();

                // 3) icona HP + barra
                const txt = card.querySelector('.hp-inline-right');
                const fill = card.querySelector('.hpbar-fill');
                if (txt) txt.textContent = `❤️ ${(base.currHp ?? base.hp)}/${base.hp}`;
                if (fill) applyHpBar(fill, base);

                // 4) (opzionale) auto-seleziona
                card.classList.add('is-selected');
                selected.add(id);
                updateAria(card); updateCount();

                // 5) aggiorna contatore vivi
                paintPicker(); // (vedi patch 2 sotto)
            }
            return;
        }

        // --- click su card viva: toggle selezione
        const card = e.target.closest('.pick-card');
        if (!card || !grid.contains(card)) return;
        if (card.classList.contains('is-dead')) return; // morte: non selezionabile

        const id = card.dataset.id;
        if (card.classList.contains('is-selected')) {
            card.classList.remove('is-selected'); selected.delete(id);
        } else {
            card.classList.add('is-selected'); selected.add(id);
        }
        updateAria(card); updateCount();
    });

    // Tastiera: evita selezione se morta
    grid.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const card = e.target.closest('.pick-card'); if (!card) return;
        if (card.classList.contains('is-dead')) return;
        e.preventDefault(); toggleCard(card);
    });

    updateCount();
    return new Promise((resolve) => {
        const close = (payload) => {
            backdrop.classList.remove('show'); modal.classList.remove('show');
            document.removeEventListener('keydown', onKey);
            btnCancel.onclick = btnConfirm.onclick = null;
            setTimeout(() => resolve(payload), 100);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter' && e.target === document.body) btnConfirm.click();
        };
        document.addEventListener('keydown', onKey);
        btnClose.onclick = () => close(null);
        btnCancel.onclick = () => close(null);
        btnConfirm.onclick = () => close(Array.from(selected));

        requestAnimationFrame(() => {
            backdrop.classList.add('show'); modal.classList.add('show');
            search?.focus();
        });
    });
}

function resurrectInPool(id) {
    const u = GAME_STATE.alliesPool.find(a => a.id === id);
    if (!u) return false;
    u.dead = false;
    u.currHp = u.hp; // full heal; se preferisci metà vita, metti Math.ceil(u.hp/2)
    scheduleSave();
    return true;
}

export function resetDeckFromPool(type) {
    const pool = (type === 'event') ? DB.EVENTS : DB.CONSUMABLE;
    const d = GAME_STATE.decks[type];
    d.draw = shuffle(pool.slice()); // copia + shuffle
    d.discard = [];
    d.removed = [];
    scheduleSave();
    updateFabDeckCounters();
}
