"use client";
/**
 * Tiny Web-Audio sound kit — tones generated at runtime, no audio files to host
 * or CSP to fight. Plus haptics on supporting devices. Respects a mute flag in
 * localStorage ("efi:muted").
 */

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function muted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("efi:muted") === "1";
}
export function setMuted(m: boolean) {
  if (typeof window !== "undefined") localStorage.setItem("efi:muted", m ? "1" : "0");
}
export function isMuted(): boolean {
  return muted();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.08) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* noop */ }
  }
}

/** Pleasant ascending arpeggio — transaction confirmed. */
export function playSuccess() {
  if (muted()) return haptic([15, 40, 15]);
  tone(523.25, 0, 0.18, "sine");     // C5
  tone(659.25, 0.09, 0.18, "sine");  // E5
  tone(783.99, 0.18, 0.28, "sine");  // G5
  haptic([15, 40, 15]);
}

/** Low descending — error / rejection. */
export function playError() {
  if (muted()) return haptic([40, 30, 40]);
  tone(311.13, 0, 0.16, "sawtooth", 0.05);
  tone(233.08, 0.12, 0.26, "sawtooth", 0.05);
  haptic([40, 30, 40]);
}

/** Soft click — keypad / tap. */
export function playTap() {
  if (muted()) return;
  tone(880, 0, 0.04, "triangle", 0.03);
}

/** Rising blip — action submitted / pending. */
export function playSubmit() {
  if (muted()) return haptic(10);
  tone(587.33, 0, 0.1, "sine", 0.06);
  tone(880, 0.07, 0.14, "sine", 0.06);
  haptic(10);
}
