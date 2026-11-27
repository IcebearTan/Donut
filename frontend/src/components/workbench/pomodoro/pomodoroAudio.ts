/** Zero-dependency Web Audio chime, notification helper, and Screen Wake Lock wrapper. */

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function playPomodoroChime(kind: 'focus_done' | 'break_done'): void {
  if (typeof window === 'undefined') return
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return
  try {
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    // Warm pentatonic chime for harvest; soft two-note nudge for break end.
    const notes = kind === 'focus_done' ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 523.25]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = now + idx * 0.14
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.72)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.75)
    })
    window.setTimeout(() => {
      void ctx.close().catch(() => {})
    }, 1800)
  } catch {
    // Autoplay policy or audio hardware unavailable — fail silently.
  }
}

export function vibrateSoft(pattern: number[] = [120, 80, 160]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}

export function requestNotificationPermissionQuietly(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {})
  }
}

export function sendPomodoroNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, silent: false })
  } catch {
    // ignore on restricted PWA environments
  }
}

export interface WakeLockSentinelLike {
  released?: boolean
  release: () => Promise<void>
}

export function isWakeLockSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  return 'wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function'
}

export async function acquireWakeLock(): Promise<WakeLockSentinelLike | null> {
  if (!isWakeLockSupported()) return null
  try {
    return await navigator.wakeLock.request('screen')
  } catch {
    return null
  }
}
