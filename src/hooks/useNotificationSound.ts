import { useCallback } from "react";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Plays a soft two-tone chime using Web Audio API.
 * Short, gentle, and non-annoying even when heard frequently.
 */
function playChime() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Master gain (keep it gentle)
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.12, now);
  master.connect(ctx.destination);

  // First tone — soft bell-like
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now); // A5
  gain1.gain.setValueAtTime(0.4, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc1.connect(gain1);
  gain1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.4);

  // Second tone — slightly higher, delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(1174.66, now + 0.1); // D6
  gain2.gain.setValueAtTime(0.001, now);
  gain2.gain.setValueAtTime(0.3, now + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc2.connect(gain2);
  gain2.connect(master);
  osc2.start(now + 0.1);
  osc2.stop(now + 0.6);

  // Cleanup
  setTimeout(() => {
    master.disconnect();
  }, 700);
}

export function useNotificationSound() {
  return useCallback(() => {
    playChime();
  }, []);
}
