function clampAudio(v, a, b) { return Math.max(a, Math.min(b, v)); }

export const GAME_SOUND_TRACK = { background: null };
// ====== AUDIO BOOTSTRAP (mobile friendly) ======
let AUDIO_UNLOCKED = false;
let PENDING_BG = null; // { url, opts }

export function initAudio() {
    if (AUDIO_UNLOCKED) return;
    AUDIO_UNLOCKED = true;

    // 1) WebAudio: crea/risveglia il context se c’è
    try { MIXER.ensureCtx?.(); MIXER._ctx?.resume?.(); } catch { }

    // 2) HTMLAudio: “kick” silenzioso per iOS/Android
    try {
        const a = new Audio();
        a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // brevissimo silenzio
        a.muted = true;
        a.play().then(() => { a.pause(); a.remove(); }).catch(() => { });
    } catch { }

    // 3) se avevamo chiesto una musica prima dello sblocco, avviala ora
    if (PENDING_BG) {
        const { url, opts } = PENDING_BG;
        PENDING_BG = null;
        playBg(url, opts);
    }
}
function waitForUserGestureOnce(cb) {
    const h = () => {
        try { cb(); } catch { }
        window.removeEventListener('pointerup', h);
        window.removeEventListener('touchend', h);
        document.removeEventListener('keydown', h);
    };
    window.addEventListener('pointerup', h, { once: true, passive: true });
    window.addEventListener('touchend', h, { once: true, passive: true });
    document.addEventListener('keydown', h, { once: true });
}

export function unlockAudioOnFirstTap(ctxGetter) {
    if (AUDIO_UNLOCKED) return;
    waitForUserGestureOnce(async () => {
        try {
            // 1) sblocca WebAudio (se presente)
            const ctx = ctxGetter?.();
            if (ctx && ctx.state !== 'running') { try { await ctx.resume(); } catch { } }

            // 2) “kick” per HTML5 audio
            const a = new Audio();
            a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // brevissimo silenzio
            a.muted = true;
            await a.play().catch(() => { });
            a.pause();

            AUDIO_UNLOCKED = true;

            // riprova la musica di background se pronta
            try { GAME_SOUND_TRACK.background?.play(); } catch { }
        } catch { }
    });
}

export const MIXER = (() => {
    const RAW_WA = !!(window.AudioContext || window.webkitAudioContext);
    const IS_MOBILE = /iP(ad|hone|od)|Android/i.test(navigator.userAgent);
    let useWA = RAW_WA && !IS_MOBILE;

    let ctx = null, master = null;
    const bus = { music: null, sfx: null };

    const state = {
        cfg: {
            master: 1.0,
            music: 0.25,
            sfx: 1.0,
            ducking: { duckTo: 0.18, attack: 0.06, release: 0.25, holdMs: 350 } // iOS-friendly
        },
        musicEl: null,
        _activeSfx: 0,
        // fallback path (no WebAudio)
        _duckLevel: 1,
        _fadeRAF: null,
        _holdT: null
    };

    function setMusicVolume(v) {
        v = clampAudio(parseFloat(v) || 0, 0, 1);
        state.cfg.music = v;

        if (useWA && ensureCtx()) {
            // interrompe eventuali automazioni in corso e imposta subito il valore
            const now = ctx.currentTime;
            bus.music.gain.cancelScheduledValues(now);
            bus.music.gain.setValueAtTime(v, now);
        } else {
            // fallback: ricalcola il volume del tag
            _applyMusicVolumeFallback(true);
        }
    }

    function setSfxVolume(v) {
        v = clampAudio(parseFloat(v) || 0, 0, 1);
        state.cfg.sfx = v;

        if (useWA && ensureCtx()) {
            const now = ctx.currentTime;
            bus.sfx.gain.cancelScheduledValues(now);
            bus.sfx.gain.setValueAtTime(v, now);
        } else {
            // non possiamo riparametrare SFX già in riproduzione;
            // i prossimi SFX useranno il nuovo livello (via trackSfx).
        }
    }


    function ensureCtx() {
        if (!useWA) return null;
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = state.cfg.master; master.connect(ctx.destination);
        bus.music = ctx.createGain(); bus.music.gain.value = state.cfg.music; bus.music.connect(master);
        bus.sfx = ctx.createGain(); bus.sfx.gain.value = state.cfg.sfx; bus.sfx.connect(master);
        return ctx;
    }

    function _wireWA(el, group, elVol = 1) {
        ensureCtx();
        if (!el._wiredWA) {
            const src = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();
            gain.gain.value = clampAudio(elVol, 0, 1);
            src.connect(gain);
            gain.connect(group === 'music' ? bus.music : bus.sfx);
            el._waSrc = src;
            el._waGain = gain;
            el._wiredWA = true;
            el.volume = 1; // il mix lo fa il GainNode
        } else if (el._waGain) {
            el._waGain.gain.value = clampAudio(elVol, 0, 1);
        }
    }

    function _duckOnceWA() {
        ensureCtx();
        const { duckTo, attack, release, holdMs } = state.cfg.ducking;
        const now = ctx.currentTime;
        bus.music.gain.cancelScheduledValues(now);
        const targetDown = clampAudio(state.cfg.music * duckTo, 0, 1);

        // attack
        bus.music.gain.setTargetAtTime(targetDown, now, Math.max(0.01, attack));

        // release after hold
        setTimeout(() => {
            const t = ctx.currentTime;
            bus.music.gain.cancelScheduledValues(t);
            bus.music.gain.setTargetAtTime(state.cfg.music, t, Math.max(0.01, release));
        }, holdMs);
    }

    // ===== Fallback ducking (senza WebAudio): usa el.volume e una curva con RAF =====
    function _applyMusicVolumeFallback(force = false) {
        if (!state.musicEl) return;
        const base = (typeof state.musicEl._baseVol === 'number') ? state.musicEl._baseVol : (state.musicEl.volume ?? 1);
        const v = clampAudio(base * state.cfg.master * state.cfg.music * state._duckLevel, 0, 1);
        if (force || Math.abs((state.musicEl.volume ?? 0) - v) > 0.001) state.musicEl.volume = v;
    }
    function _duckToFallback(target) {
        clearTimeout(state._holdT);
        if (!state.musicEl) return;
        const start = state._duckLevel;
        const end = clampAudio(target, 0, 1);
        if (Math.abs(start - end) < 0.001) return;
        const dur = Math.max(30, 160);
        const t0 = performance.now();
        if (state._fadeRAF) cancelAnimationFrame(state._fadeRAF);
        const step = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
            state._duckLevel = start + (end - start) * e;
            _applyMusicVolumeFallback();
            if (k < 1) state._fadeRAF = requestAnimationFrame(step);
        };
        state._fadeRAF = requestAnimationFrame(step);
    }

    function _sfxStart() {
        state._activeSfx++;
        if (state._activeSfx === 1) {
            if (useWA) _duckOnceWA();
            else _duckToFallback(state.cfg.ducking.duckTo);
        }
    }
    function _sfxEnd() {
        state._activeSfx = Math.max(0, state._activeSfx - 1);
        if (state._activeSfx === 0) {
            if (useWA) {
                // WA già programma il release nel _duckOnceWA; qui non serve altro
            } else {
                clearTimeout(state._holdT);
                state._holdT = setTimeout(() => _duckToFallback(1), state.cfg.ducking.holdMs);
            }
        }
    }

    function setConfig(partial) {
        if (partial.ducking) {
            state.cfg.ducking = { ...state.cfg.ducking, ...partial.ducking };
            delete partial.ducking;
        }
        Object.assign(state.cfg, partial);

        if (useWA && ensureCtx()) {
            master.gain.value = state.cfg.master;
            bus.music.gain.value = state.cfg.music;
            bus.sfx.gain.value = state.cfg.sfx;
        } else {
            _applyMusicVolumeFallback(true);
        }
    }

    function setMusicEl(el) {
        state.musicEl = el;
        if (useWA && ensureCtx()) {
            _wireWA(el, 'music', 1); // il livello della musica lo controlla bus.music.gain
            // con WA il volume HTML rimane a 1
        } else {
            el._baseVol = (typeof el._baseVol === 'number') ? el._baseVol : (el.volume ?? 1);
            _applyMusicVolumeFallback(true);
        }
    }

    function trackSfx(el, baseVol = 1) {
        if (useWA && ensureCtx()) {
            _wireWA(el, 'sfx', clampAudio(baseVol, 0, 1));
        } else {
            // fallback: gestiamo volume del tag direttamente (no duck sugli sfx)
            el.volume = clampAudio(baseVol * state.cfg.master * state.cfg.sfx, 0, 1);
        }

        const onStart = () => _sfxStart();
        const onEnd = () => {
            el.removeEventListener('ended', onEnd);
            el.removeEventListener('pause', onEnd);
            el.removeEventListener('error', onEnd);
            _sfxEnd();
        };

        if (!el.paused) onStart(); else el.addEventListener('play', onStart, { once: true });
        el.addEventListener('ended', onEnd);
        el.addEventListener('pause', onEnd);
        el.addEventListener('error', onEnd);
    }

    return { setConfig, setMusicEl, trackSfx, ensureCtx, _state: state, _bus: bus, _supportsWA: useWA, get _ctx() { return ctx; }, setMusicVolume, setSfxVolume };
})();
window.MIXER = MIXER;
export const setMixerConfig = (p) => MIXER.setConfig(p);

// ======= API DI RIPRODUZIONE (stesse tue firme) =======

async function play(url, opts = {}) {
    const { loop = false, volume = 1 } = opts;
    MIXER.ensureCtx(); // crea l’audio context se disponibile

    const audio = new Audio();
    audio.src = url;
    audio.preload = 'auto';
    audio.loop = loop;
    audio.playsInline = true; // innocuo su desktop, utile su iOS
    // Con WebAudio lasciamo volume tag a 1; nel fallback usiamo quello passato
    audio.volume = MIXER._supportsWA ? 1 : clampAudio(volume, 0, 1);
    // audio.crossOrigin = 'anonymous'; // se i file sono same-origin puoi anche NON metterlo

    // Se non è sbloccato, non forzare subito .play(): lasciamo che initAudio gestisca
    if (!AUDIO_UNLOCKED) {
        // Non tentare play qui: iOS lo bloccherebbe.
        return audio;
    }

    try { await audio.play(); }
    catch (e) { console.warn('Autoplay blocked:', e); }
    return audio;
}

// --- MUSICA di fondo (registrata nel mixer)
export async function playBg(url, { volume = 0.18, loop = true } = {}) {
    // se non sbloccato, metti in coda e basta
    if (!AUDIO_UNLOCKED) {
        PENDING_BG = { url, opts: { volume, loop } };
        return null;
    }

    try { if (loop) GAME_SOUND_TRACK.background?.pause(); } catch { }

    const music = await play(url, { loop, volume });

    GAME_SOUND_TRACK.background = music;
    music.playsInline = true;
    MIXER.setMusicEl(music);

    // nel fallback (no WebAudio) usare volume base per calcolo
    if (!MIXER._supportsWA) music._baseVol = volume;

    // prova a partire (se non è già partita in play(), o se play() è stato “soft”)
    try { await music.play(); } catch (e) { console.warn('BG play error:', e); }

    return music;
}


export async function playSfx(url, { volume = 1, loop = false } = {}) {
    const sfx = await play(url, { loop, volume });
    MIXER.trackSfx(sfx, volume);
    try { await sfx.play();      
     } catch { }
    return sfx;
}

function mountVolumeCard() {
    // aspetta che il MIXER esponga i setter
    if (!window.MIXER || typeof MIXER.setMusicVolume !== 'function') {
        setTimeout(mountVolumeCard, 40);
        return;
    }
    const musicEl = document.getElementById('vol-music');
    const sfxEl = document.getElementById('vol-sfx');
    const outM = document.getElementById('vol-music-val');
    const outS = document.getElementById('vol-sfx-val');

    // leggi config corrente dal mixer
    const cfg = MIXER._state?.cfg || { music: 0.22, sfx: 0.8 };
    const mVal = Math.round((cfg.music ?? 0.22) * 100);
    const sVal = Math.round((cfg.sfx ?? 0.80) * 100);

    musicEl.value = mVal;
    sfxEl.value = sVal;
    outM.textContent = `${mVal}%`;
    outS.textContent = `${sVal}%`;

    // applica riempimento grafico
    updateSliderFill(musicEl);
    updateSliderFill(sfxEl);

    const onInput = (ev) => {
        const el = ev.currentTarget;
        const val = parseInt(el.value, 10) || 0;
        const pct = Math.max(0, Math.min(100, val));
        if (el === musicEl) {
            MIXER.setMusicVolume(pct / 100);
            outM.textContent = `${pct}%`;
            localStorage.setItem('vol.music', String(pct));
        } else {
            MIXER.setSfxVolume(pct / 100);
            outS.textContent = `${pct}%`;
            localStorage.setItem('vol.sfx', String(pct));
        }
        updateSliderFill(el);
    };

    musicEl.addEventListener('input', onInput);
    sfxEl.addEventListener('input', onInput);

    // se avevi salvato preferenze, ricaricale
    const savedM = parseInt(localStorage.getItem('vol.music') || '', 10);
    const savedS = parseInt(localStorage.getItem('vol.sfx') || '', 10);
    if (!Number.isNaN(savedM)) { musicEl.value = savedM; outM.textContent = `${savedM}%`; MIXER.setMusicVolume(savedM / 100); updateSliderFill(musicEl); }
    if (!Number.isNaN(savedS)) { sfxEl.value = savedS; outS.textContent = `${savedS}%`; MIXER.setSfxVolume(savedS / 100); updateSliderFill(sfxEl); }
}

// colora la track fino alla percentuale
function updateSliderFill(inputEl) {
    const pct = (parseInt(inputEl.value, 10) || 0);
    const styles = getComputedStyle(inputEl);
    const fill = styles.getPropertyValue('--fill').trim() || '#3b82f6';
    const track = styles.getPropertyValue('--track').trim() || '#1a2031';
    inputEl.style.background = `linear-gradient(to right, ${fill} 0% ${pct}%, ${track} ${pct}% 100%)`;
}

export function wireAudioPopup() {
    const btn = document.getElementById('btn-audio');
    const dlg = document.getElementById('audio-modal');
    const bd = document.getElementById('audio-backdrop');
    const closeBtn = dlg?.querySelector('[data-close]');
    let inited = false;

    function openAudio() {
        bd.classList.add('show');
        dlg.classList.add('show');
        if (!inited) {
            mountVolumeCard(); // inizializza gli slider SOLO ora
            inited = true;
        }
    }
    function closeAudio() {
        bd.classList.remove('show');
        dlg.classList.remove('show');
    }

    btn?.addEventListener('click', openAudio);
    closeBtn?.addEventListener('click', closeAudio);
    bd?.addEventListener('click', closeAudio);
    // Esc per chiudere
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dlg.classList.contains('show')) closeAudio();
    });
};

export function initAudioListeners() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            try { GAME_SOUND_TRACK.background?.play(); } catch { }
        }
    });
    
    initAudioSettings();
}

function initAudioSettings() {
    const once = { once: true, passive: true };
    document.addEventListener('pointerdown', () => initAudio(), once);
    document.addEventListener('touchstart', () => initAudio(), once);
    setMixerConfig({
        master: 0.8,
        music: 0.22,
        sfx: 0.8,
        ducking: {
            duckTo: 0.6,
            fadeMs: 180,   // entra dolcemente
            holdMs: 120,   // resta abbassata per poco
            releaseMs: 180, // risale morbida }
        }
    })
    wireAudioPopup();
    unlockAudioOnFirstTap(() => MIXER?._ctx);
    window.MIXER = MIXER;
}
