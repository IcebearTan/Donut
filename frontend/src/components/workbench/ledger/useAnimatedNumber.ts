import { useEffect, useRef, useState } from 'react'
import { money } from './ledgerMeta'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DEFAULT_DURATION_MS = 340
/** Manual refresh starts slightly below the figure and eases back up to it. */
const REPLAY_FROM = 0.86
/** Differences below one cent are not worth a frame loop. */
const EPSILON = 0.005

export interface AnimatedNumberOptions {
  durationMs?: number
  /** Snap straight to the target (used while amounts are masked). */
  disabled?: boolean
  /** Bump it to replay the roll even when the target itself did not change. */
  replayKey?: number
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * Eases from the previous value to `target` with requestAnimationFrame (easeOutCubic, 340ms).
 * Returns `target` immediately when `disabled`, under reduced motion, or on first render.
 * A new `replayKey` with an unchanged figure rolls it in from 86% of `target` as a soft bounce.
 */
export function useAnimatedNumber(target: number, options: AnimatedNumberOptions = {}): number {
  const { durationMs = DEFAULT_DURATION_MS, disabled = false, replayKey = 0 } = options
  const [value, setValue] = useState(target)
  /** Where the next change starts interpolating from (the figure currently on screen). */
  const fromRef = useRef(target)
  /** The `(target, replayKey)` pair the effect last handled. */
  const handledRef = useRef({ target, replayKey })
  const frameRef = useRef(0)

  // Decided during render so a masked (or reduced-motion) figure never paints one stale frame.
  const instant = disabled || !Number.isFinite(target) || prefersReducedMotion()

  useEffect(() => {
    cancelAnimationFrame(frameRef.current)
    const from = fromRef.current
    const to = target
    const replay = replayKey !== handledRef.current.replayKey && Math.abs(to - from) < EPSILON
    handledRef.current = { target, replayKey }
    if (instant || !Number.isFinite(from) || (Math.abs(to - from) < EPSILON && !replay)) {
      fromRef.current = to
      setValue(to)
      return
    }
    const start = replay ? to * REPLAY_FROM : from
    // Committed up front, so a re-run of this effect (StrictMode) resumes from the same point.
    fromRef.current = start
    const startedAt = performance.now()
    const tick = (now: number) => {
      const t = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs)
      fromRef.current = start + (to - start) * easeOutCubic(t)
      setValue(fromRef.current)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, durationMs, disabled, replayKey, instant])

  return instant ? target : value
}

/** `useAnimatedNumber` bundled with the privacy-aware Ledger money format. */
export function useAnimatedMoney(amount: number, masked: boolean, replayKey: number): string {
  return money(useAnimatedNumber(amount, { disabled: masked, replayKey }), masked)
}
