# AOT Companion — README

Benvenuto! Questo documento descrive il progetto “AOT Companion” sia dal punto di vista **funzionale** (regole e flussi di gioco) sia **tecnico** (architettura, moduli, API interne). È pensato per chi vuole giocare, moddare o sviluppare nuove feature.

---

## 1) Cos’è, in breve

Un *companion app* per skirmish su **griglia esagonale**, ispirato all’universo AoT:

- **Umani** (recruit/commander) vs **Giganti** (enemy).
- Gestione **roster/pool**, **muri**, **morale/xp**, **eventi**.
- **Overlay** dinamici: *Versus*, *Lancio Dadi 3D*, *Riepilogo Attacco*.
- Sistema di **ingaggio 1:1** e **IA** base dei giganti (priorità bersaglio/obiettivi).
- **Abilità** dei giganti con cooldown e **modificatori** globali/di unità con **cap**.

---

## 2) Regole di gioco (funzionale)

### 2.1 Stat principali

- **Umani**:  
  - `ATK` (danno di base), `TEC` (per colpire), `AGI` (per schivare).
- **Giganti**:  
  - `ATK` (danno base), `CD` (Classe Difficoltà difensiva), `MOV`, `RNG`, `ability` (cd/bonus/dice…).

HP e barre vita sono visualizzati su card/tooltip. Alcune card mostrano le stat come **chip** accanto agli HP.

### 2.2 Modificatori & cap

- Esistono modificatori **globali** (UI “Modificatori Globali”) e **per unità**.
- Il **cap massimo cumulato positivo** è **+5** (per evitare snowball).
- In UI le reclute mostrano il **delta** effettivo (es. base ATK 3 +4 cap → +2 mostrato/eﬀettivo).

> Implementato con utility tipo `capModSum(baseMod, globalMod)` e clamp lato calcolo/mostra.

### 2.3 Iniziativa & fasi (turno)

1. **Fase umano** (selezioni, spostamenti, attacchi).
2. **Fase giganti**:
   - Ogni gigante esegue `mov` **step** tramite `giantsPhaseMove()` → `stepGiant()`.
   - IA dei giganti:
     1) Se **ingaggiato**: muove/entra verso il proprio umano ingaggiato.  
     2) Altrimenti, cerca **umani entro 2** esagoni → punta **HP più bassi** (tie-break distanza → random).  
     3) Se non vede umani, **avanza verso le MURA**.
3. **Fine round**:
   - `advanceAllCooldowns()` → scala i cooldown delle abilità.
   - `tickUnitModsOnNewRound()` → scala modificatori a durata.
   - `resetMissionEffectsAllUnits()` se necessario (effetti missione).

### 2.4 Ingaggio (1:1)

- `GIANT_ENGAGEMENT: Map<giantId → humanId>`.
- **Validazione** a ogni uso:
  - Se una delle due unità muore o **non è più adiacente/stessa cella**, l’ingaggio viene **rimosso**.
- Un **gigante** attacca **solo** l’umano con cui è **ingaggiato**.
- Side helpers:
  - `getEngagedHuman(giantId)` → humanId | null (pulisce binding sporchi).
  - `getEngagingGiant(humanId)` → giantId | null (rispetta la regola “uno alla volta”).

### 2.5 Combattimento

**Un solo tiro d20 dell’utente** decide:

- **Per colpire (umano)**: `d20 + TEC(+cap) >= CD del gigante`
- **Per schivare (umano)**: `d20 + AGI(+cap) >= CD (attacco/abilità del gigante)`
- Se l’umano **colpisce** ed è **a contatto** (stessa/adiacente), infligge:
  - `d4 + ATK(+cap)` (min 1)
- Il **gigante** nella stessa azione:
  - Se **ability pronta**: prova a colpire (schivabile se `dodgeable !== false`).
  - Altrimenti **attacco base** (schivato se check AGI ha successo).
- **Overlay**:
  1) *Versus* (top, non blocca input)  
  2) *Dadi 3D* (sotto il Versus) → l’utente lancia il d20  
  3) *Riepilogo Attacco* (sotto i dadi): badge **Successo/Fallito/Pareggio**, dettagli **Per colpire** / **Per schivare** e righe “narrative”.

### 2.6 Morte e conseguenze

- **Umani** a 0 HP → `handleAllyDeath()`:
  - Rimozione da campo/roster, ritorno al pool come “dead”.
  - Aggiorna **morale**/**xp**.
- **Giganti** a 0 HP → `handleGiantDeath()`:
  - Rimozione da roster, incrementa kill, morale/xp, **niente ritorno al pool** (consumato).
- **Mura** a 0 HP → `handleWallDeath()`:
  - Marca `destroyed`, rimuove row/segmenti, aggiorna UI e morale.

---

## 3) UI & UX

### 3.1 Griglia e stack

- Ogni cella esagonale contiene uno **stack** di unità (limitato da `gridSettings.maxUnitHexagon`).
- Utility principali:
  - `getStack(r,c)`, `setStack(r,c,stack)`, `moveOneUnitBetweenStacks(from,to,id)`.
  - `findUnitCell(id)` per reperire rapidamente cella di un’unità.

### 3.2 Overlay

- **Versus overlay** (`#vs-overlay`)
  - Mostra *attaccante* e *difensore* (avatar, HP bar, **chip** stat).
  - Throttle anti-spam, chiusura auto/manuale.
- **Dice overlay** (`#dice-overlay`)
  - Dadi 3D (Three.js/Cannon) con input preimpostato `1d20`.
  - API `openDiceOverlay({sides, keepOpen})` → `{ waitForRoll: Promise<number>, close() }`.
- **Attack Summary overlay** (`#atk-under`)
  - Si posiziona **sotto** i dadi.
  - Layout in **due righe**: “Per colpire” e “Per schivare”, icone, formula compatta e **esito**.
  - Badge tondo sinistro: **Successo / Fallito / Pareggio**.
  - Lista “narrazione” in fondo.
  - Responsive (si adatta su schermi stretti).

> Alla chiusura del dice overlay viene chiuso anche il Versus (e nascosto il riepilogo).

### 3.3 Pannelli laterali

- **Dashboard missione**, **Modificatori globali**, **Modificatori unità**, **Log**, **Benches** (alleati, giganti, mura).
- **FAB Dock** per azioni rapide (Spawn Giganti, Eventi, Arruola, ecc.).

### 3.4 Audio

- `playSfx` per effetti (attacchi, abilità, morte, muro distrutto).
- `playBg` per musica/loop per tipologie di giganti/missioni.

---

## 4) Flussi operativi

### 4.1 Selezione & attacco manuale

1. L’utente seleziona **attaccante** e **bersaglio** (tooltip, highlight).
2. `resolveAttack(attackerId, targetId)`:
   - Mostra **Versus** e apre **Dice overlay**.
   - Attende `await dice.waitForRoll`.
   - Calcola *per colpire* / *per schivare* usando **lo stesso d20**.
   - Applica danni, abilità, cooldown, engagement e log.
   - Mostra **Riepilogo Attacco** sotto i dadi.
   - Chiude overlay quando l’utente finisce.

### 4.2 Movimento dei giganti (IA)

- `giantsPhaseMove()`:
  - Per ogni gigante: esegue `mov` step (interrompe se `stepGiant` restituisce `false`).
  - `stepGiant`:
    - Se **umano ingaggiato valido**: avvicinati/entra.
    - Altrimenti: scegli umano **entro 2** con **HP più bassi** (tie-break distanza→random) e muovi verso.
    - Altrimenti: muovi verso **mura**.
  - Evita di entrare in una cella con **umani** a meno che sia l’**obiettivo** (adiacenza/ingresso per attacco).

### 4.3 Spawn & mission loop

- `spawnGiant(type?)` sceglie dal pool per **tipo** (Puro/Anomalo/Mutaforma/Casuale) secondo le regole della missione.
- Posizionamento casuale entro tentativi, rispettando `maxUnitHexagon`.

---

## 5) Architettura & moduli

- **`entity.js`**  
  Motore di combat e turni: `resolveAttack`, `setUnitHp`, `handle*Death`, `giantsPhaseMove/stepGiant`, cooldown & effects tick, engagement (`getEngagedHuman`, `getEngagingGiant`).

- **`grid.js`**  
  Griglia/stack, pathing e distanze (`sameOrAdjCells`, `nextStepTowards`, `hexDistance`, `nearestWallCell`, ecc.).

- **`utils.js`**  
  Utility (`unitAlive`, `isHuman`, `pickRandom`, `getStat`, `d()`, `rollDiceSpec`, ecc.).

- **`data.js`**  
  Stato/persistenza: `unitById (Map)`, `GAME_STATE`, `GIANT_ENGAGEMENT`, `DB`, `scheduleSave`, `rebuildUnitIndex`.

- **`ui.js`**  
  Rendering UI, tooltip, focus, **Versus**, **Attack Summary**, log, accordion, bench.

- **`audio.js`**  
  `playSfx`, `playBg`.

- **Dice roller** (`src/dice-roller/…`)  
  Three.js + Cannon. Iniettato con `main.init()` quando l’overlay viene creato.

> L’**index.html** contiene layout, overlay placeholders e registra il Service Worker (`sw.js`) per PWA.

---

## 6) Integrazione Overlay

```js
// Versus (non auto-hide con duration=0)
const vs = showVersusOverlay(attacker, defender, { mode: 'attack', duration: 0 });

// Dadi 3D
const dice = openDiceOverlay({ sides: 20, keepOpen: true });
const d20 = await dice.waitForRoll;

// Riepilogo sotto ai dadi
showAttackOverlayUnderDice({
  badge: 'Successo',           // o 'Fallito' | 'Pareggio'
  badgeClass: 'atk-win',       // o 'atk-lose' | 'atk-tie'
  hit:   { d20, modLabel:'TEC', modValue, total, target: cdGiant, success: boolean },
  dodge: { d20, modLabel:'AGI', modValue, total, target: cdAbiOrAtk, success: boolean },
  lines: [ 'X infligge Y danni', 'Z schiva l’abilità …' ]
});
```

---

## 7) Persistenza

- Mutazioni → `scheduleSave()`.
- `GAME_STATE` contiene: missione, spawns, pool/roster, xp/morale, settaggi griglia/mura, ecc.

---

## 8) Estensioni

- **Abilità**: definisci `ability` (dice, bonus, addAtk, dodgeable, coolDown) e usa `computeAbilityDamage`, `getReadyGiantAbility`, `consumeGiantAbilityCooldown`.
- **Nuovi giganti**: aggiungi al pool (`type`, stats, audio BG).
- **Nuovi modificatori**: aggiungi chip/rows in UI e rispetta **cap ±5** in calcolo e display.

---

## 9) Dev: Build & Run

1. Servi il progetto come **app statica** (qualsiasi http dev server).
2. `index.html` importa `script.js` (module) e i file del **dice roller**.
3. Verifica che `libs/three.min.js`, `libs/cannon.min.js`, `src/dice-roller/dice.js`, `src/dice-roller/main.js`, `src/dice-roller/styles.css` siano accessibili.
4. SW (`sw.js`) è registrato per modalità PWA.

---

## 10) Troubleshooting

- **Overlay coprono la griglia** → rivedi `z-index` e `pointer-events`. Mantieni `hidden` sui layer non usati.
- **Errore “Canvas 0×0” nei dadi** → inizializza `main.init()` **solo dopo** aver montato il markup e quando l’overlay è **visibile**.
- **Engagement non coerente** → gli helper di engagement ripuliscono legami non validi.
- **Cap modificatori** → usa gli helper dedicati nel calcolo (evita di superare ±5).

---

## 11) Licenza & Crediti

- Codice: come da licenza del repo.
- Asset: assicurati dei diritti/attribuzioni.
- Dice roller 3D: Sarah Rosanna Busch (Three.js/Cannon).

---

### Buon divertimento! 🎲
