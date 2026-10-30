import { TING_SOUND_URI, POP_SOUND_URI } from './soundData';

// Pool of preloaded Audio elements for instant, gapless, zero-network sound playback
const POOL_SIZE = 4;
let tingPool: HTMLAudioElement[] = [];
let popPool: HTMLAudioElement[] = [];
let tingIndex = 0;
let popIndex = 0;
let sharedAudioCtx: AudioContext | null = null;

function initPools() {
  if (typeof window === 'undefined') return;
  try {
    if (tingPool.length === 0) {
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio(TING_SOUND_URI);
        a.volume = 1.0;
        a.preload = 'auto';
        tingPool.push(a);
      }
    }
    if (popPool.length === 0) {
      for (let i = 0; i < POOL_SIZE; i++) {
        const a = new Audio(POP_SOUND_URI);
        a.volume = 1.0;
        a.preload = 'auto';
        popPool.push(a);
      }
    }
  } catch (err) {
    console.warn('Audio pool initialization error:', err);
  }
}

function getSharedAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

// Unlock audio on initial user interaction (click / keydown / touch)
export function unlockAudio() {
  initPools();
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  initPools();
  const handleFirstInteraction = () => {
    unlockAudio();
    window.removeEventListener('click', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
  };
  window.addEventListener('click', handleFirstInteraction, { passive: true });
  window.addEventListener('keydown', handleFirstInteraction, { passive: true });
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
}

export function isSoundEnabled(): boolean {
  try {
    const val = localStorage.getItem('zen_sound_enabled');
    return val !== 'false'; // Default to true
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('zen_sound_enabled', enabled ? 'true' : 'false');
  } catch {}
}

/**
 * Web Audio API synthesizer fallback
 */
function playWebAudioTing() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    const play = () => {
      const now = ctx.currentTime;
      // Ting 1 (1046.5 Hz - C6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.9, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.22);

      // Ting 2 (1318.5 Hz - E6), distinctly 0.24s later
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.51, now + 0.24);
      gain2.gain.setValueAtTime(0.001, now + 0.24);
      gain2.gain.linearRampToValueAtTime(1.0, now + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.24);
      osc2.stop(now + 0.85);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (err) {
    console.warn('Web Audio synthesis error:', err);
  }
}

let lastMessageSoundTime = 0;

/**
 * Play Ting-Ting chime
 */
export function playMessageSound(force: boolean = false): void {
  if (!force && !isSoundEnabled()) return;

  const now = Date.now();
  if (!force && now - lastMessageSoundTime < 150) return;
  lastMessageSoundTime = now;

  try {
    initPools();
    if (tingPool.length > 0) {
      const audio = tingPool[tingIndex];
      tingIndex = (tingIndex + 1) % tingPool.length;
      audio.currentTime = 0;
      audio.volume = 1.0;
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch((err) => {
          console.warn('Audio play prevented, triggering Web Audio fallback:', err);
          playWebAudioTing();
        });
      }
    } else {
      playWebAudioTing();
    }
  } catch {
    playWebAudioTing();
  }
}

/**
 * Play Pop chime for comments
 */
export function playCommentSound(force: boolean = false): void {
  if (!force && !isSoundEnabled()) return;

  try {
    initPools();
    if (popPool.length > 0) {
      const audio = popPool[popIndex];
      popIndex = (popIndex + 1) % popPool.length;
      audio.currentTime = 0;
      audio.volume = 1.0;
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch(() => {
          playWebAudioTing();
        });
      }
    } else {
      playWebAudioTing();
    }
  } catch {
    playWebAudioTing();
  }
}

export function playNotificationSound(): void {
  playMessageSound(false);
}

/**
 * Test sound trigger - always plays with force = true
 */
export function testTingTingSound(): void {
  unlockAudio();
  playMessageSound(true);
}
