export type AlertSound = 'chime' | 'bell' | 'beep' | 'off';

// [frequency Hz, start offset s, duration s, waveform]
const PATTERNS: Record<Exclude<AlertSound, 'off'>, [number, number, number, OscillatorType][]> = {
  chime: [[880, 0, 0.5, 'sine'], [1318.5, 0.18, 0.7, 'sine']],
  bell: [[1046.5, 0, 1.2, 'triangle'], [2093, 0, 0.8, 'sine']],
  beep: [[740, 0, 0.15, 'square'], [740, 0.25, 0.15, 'square']],
};

/** Plays a short synthesized sound (no audio files). Silently does nothing if audio is unavailable. */
export function playAlertSound(kind: AlertSound): void {
  if (kind === 'off' || typeof AudioContext === 'undefined') return;
  try {
    const ctx = new AudioContext();
    let end = 0;
    for (const [freq, at, dur, type] of PATTERNS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      end = Math.max(end, at + dur + 0.1);
    }
    setTimeout(() => void ctx.close(), end * 1000 + 200);
  } catch {
    /* audio blocked or unavailable */
  }
}
