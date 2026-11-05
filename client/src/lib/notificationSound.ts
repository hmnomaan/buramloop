// client/src/lib/notificationSound.ts
// Synthesized Web Audio notification chime (no external audio assets required)
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export type ChimeTone = 'info' | 'warning' | 'critical';

/**
 * Plays a discrete industrial notification chime using the Web Audio API.
 * Safe to call repeatedly; gracefully falls back to silent if the browser blocks audio.
 */
export function playNotificationChime(tone: ChimeTone = 'info'): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = tone === 'critical' ? 'sawtooth' : 'sine';

    if (tone === 'critical') {
      // Urgent double tone: 880 Hz -> 440 Hz
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (tone === 'warning') {
      // Two-step amber alert: 587 Hz (D5) -> 740 Hz (F#5)
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(739.99, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } else {
      // Pleasant high chime: 880 Hz (A5) -> 1320 Hz (E6)
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.18);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    }
  } catch {
    // Non-blocking fallback for autoplay-restricted contexts
  }
}

/**
 * Requests native browser desktop Push Notification permission if supported.
 */
export async function requestDesktopNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission !== 'denied') {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

/**
 * Dispatches a native browser desktop notification if permission is granted.
 */
export function showDesktopNotification(title: string, options?: NotificationOptions): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
    // Auto-close desktop notification after 5 seconds
    setTimeout(() => {
      try {
        notification.close();
      } catch {
        // Ignored
      }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}

