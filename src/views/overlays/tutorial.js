import { initAudio, playBg } from '../audio/audio.js';
import { GAME_STATE } from '../../core/data.js';
import { openDialog } from '../../ui/dialog.js';

const TUTORIAL_DONE_KEY = 'AOT_TUTORIAL_DONE_V1';

function getTutorialSlides1() {
  return [
    {
      title: 'Benvenuto!',
      html: `
        <p class="tut-lead">In questa guida impari in 1 minuto come funziona AOT Companion.</p>
        <ul class="tut-ul">
          <li>Plancia esagonale: trascina reclute/commander, clic per dettagli.</li>
          <li>In alto: <b>Missione</b> + <b>Timer</b>; in basso <b>Morale</b> e <b>XP</b>.</li>
          <li>Nel dock: <em>Giganti</em>, <em>Carte</em>, <em>Squadra</em>.</li>
        </ul>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
    {
      title: 'Flusso del round',
      html: `
        <p>Un round tipico segue queste fasi:</p>
        <ol class="tut-ol">
          <li><b>Allies:</b> muovi e agisci con Reclute/Comandanti.</li>
          <li><b>Giants Move:</b> ogni gigante avanza (priorità: ingaggio → bersaglio con meno HP → mura).</li>
          <li><b>Combat:</b> risolvi gli attacchi. Umano e gigante usano un <b>unico tiro</b> d20:
            <br><small>TEC vs CD per colpire • AGI vs CD per schivare abilità/attacco.</small>
          </li>
          <li><b>End:</b> tick effetti, scala cooldown abilità.</li>
        </ol>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
    {
      title: 'Ingaggi & movimento giganti',
      html: `
        <p>I giganti possono ingaggiarsi con <b>un solo umano</b> alla volta.</p>
        <ul class="tut-ul">
          <li>Se esiste un ingaggio valido, il gigante si muove verso quel bersaglio (anche fuori vista).</li>
          <li>Altrimenti cerca umani entro 2 esagoni e sceglie quello con <b>meno HP</b> (in parità, più vicino).</li>
          <li>Se non vede umani, avanza verso le <b>Mura</b>.</li>
        </ul>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
    {
      title: 'VS overlay + Dadi',
      html: `
        <p>Quando parte uno scontro, compare il <b>Versus Overlay</b> e sotto il <b>popup dadi 3D</b>.</p>
        <ul class="tut-ul">
          <li>Tira il d20 nel popup: il risultato guida <b>to-hit (TEC)</b> e <b>dodge (AGI)</b>.</li>
          <li>Il riepilogo sotto i dadi mostra badge (Successo/Fallito/Pareggio), formule e outcome.</li>
          <li>Chiudi i dadi: si chiude anche il VS.</li>
        </ul>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
    {
      title: 'Modificatori & cap',
      html: `
        <p>I modificatori globali/unità sono <b>cap a +5</b> per evitare sbilanciamenti.</p>
        <ul class="tut-ul">
          <li>Nel pannello a sinistra gestisci i <b>Modificatori Globali</b> e i <b>Mod Unità</b>.</li>
          <li>Tooltip e chip mostrano i delta rispetto alla statistica base.</li>
        </ul>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
    {
      title: 'Morte e progressione',
      html: `
        <ul class="tut-ul">
          <li>Alla morte: rimozione dal campo e aggiornamento roster/pool.</li>
          <li>Morale/XP si aggiornano automaticamente (log in tempo reale).</li>
          <li>Le abilità dei giganti vanno in cooldown, poi tornano pronte.</li>
        </ul>
        <p class="tut-lead">Buona caccia, soldato!</p>
      `,
      img: 'assets/img/comandanti/erwin_popup_benvenuto.jpg',
    },
  ];
}

async function preloadImg(src) {
  return new Promise(res => {
    if (!src) return res(null);
    const im = new Image();
    im.onload = () => res(src);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export async function showTutorialPopupViaDialog({ startIndex = 0, force = false } = {}) {
  try {
    if (!force && localStorage.getItem(TUTORIAL_DONE_KEY) === '1') return;

    const slides = getTutorialSlides1();
    if (!slides.length) return;

    let i = Math.min(Math.max(0, startIndex), slides.length - 1);

    while (i >= 0 && i < slides.length) {
      const s = slides[i];
      const okSrc = await preloadImg(s.img);
      const mediaHTML = okSrc
        ? `<img src="${okSrc}" alt="${s.title}" style="width:100%;height:auto;border-radius:8px;">`
        : `<div style="aspect-ratio:16/9;background:#1e2333;border-radius:8px;display:grid;place-items:center;color:#9aa4c7;">(Nessuna immagine)</div>`;

      const html = `
        <div class="welcome">
          <div class="welcome__media" style="margin-bottom:10px">${mediaHTML}</div>
          <div class="welcome__txt">
            <h3 style="margin:6px 0 8px;font-weight:800">${s.title}</h3>
            <div>${s.html}</div>
            <div style="margin-top:12px;opacity:.75;font-size:12px">Slide ${i + 1} di ${slides.length}</div>
          </div>
        </div>
      `;

      const isFirst = i === 0;
      const isLast = i === slides.length - 1;

      const cancelText = isFirst ? 'Chiudi' : 'Indietro';
      const confirmText = isLast ? 'Fine' : 'Avanti';

      const res = await openDialog({
        title: 'Tutorial',
        message: html,
        confirmText,
        cancelText,
        cancellable: true,
        danger: true
      });

      if (res) {
        if (isLast) {
          try { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { }
          break;
        } else {
          i++;
        }
      } else {
        if (isFirst) {
          break;
        } else {
          i--;
        }
      }
    }

    initAudio();
    GAME_STATE.turnEngine.phase === 'idle' ? await playBg('./assets/sounds/risorsa_audio_avvio_app.mp3') : await GAME_STATE.turnEngine.setPhaseMusic();
  } catch (err) {
    console.error('[tutorial] error', err);
  }
}
