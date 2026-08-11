/** Local-only feedback for the rest timer: a short beep and a vibration. */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/**
 * iOS only allows audio to start from a user gesture, so this is called when a
 * set is saved — long before the timer actually needs to make a sound.
 */
export function primeAudio(): void {
  const context = getAudioContext();
  if (context && context.state === 'suspended') void context.resume();
}

export function playBeep(): void {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') void context.resume();

  const startAt = context.currentTime;
  // Three rising blips: audible over gym music without being obnoxious.
  [0, 0.18, 0.36].forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660 + index * 220;
    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, startAt + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.15);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + 0.18);
  });
}

export function vibrate(pattern: number | number[] = [120, 80, 120]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
