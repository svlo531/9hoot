'use client'

import { useRef, useCallback, useEffect } from 'react'

/**
 * Web Audio API sound engine for 9Hoot!
 * All sounds are procedurally generated — no audio files needed.
 */

type SoundType =
  | 'lobbyMusic'
  | 'gameStart'
  | 'countdownTick'
  | 'countdownUrgent'
  | 'timesUp'
  | 'answerSubmit'
  | 'correct'
  | 'incorrect'
  | 'leaderboardReveal'
  | 'podiumCelebration'
  | 'getReady'

export function useGameAudio() {
  const ctxRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(false)
  const lobbyIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const activeNodesRef = useRef<Set<AudioNode>>(new Set())

  function getCtx() {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume()
    }
    return ctxRef.current
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLobbyMusic()
      activeNodesRef.current.forEach((node) => {
        try { node.disconnect() } catch {}
      })
      if (ctxRef.current && ctxRef.current.state !== 'closed') {
        ctxRef.current.close()
      }
    }
  }, [])

  const play = useCallback((sound: SoundType) => {
    if (mutedRef.current) return

    const ctx = getCtx()
    const now = ctx.currentTime

    switch (sound) {
      case 'countdownTick': {
        // Short percussive tick
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, now)
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.08)
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.1)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'countdownUrgent': {
        // Faster, higher tick for last 5 seconds
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(1200, now)
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1)
        gain.gain.setValueAtTime(0.12, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.15)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'gameStart': {
        // Rising fanfare: three quick ascending tones
        const notes = [523.25, 659.25, 783.99] // C5, E5, G5
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(freq, now + i * 0.15)
          gain.gain.setValueAtTime(0, now + i * 0.15)
          gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now + i * 0.15)
          osc.stop(now + i * 0.15 + 0.5)
          activeNodesRef.current.add(gain)
          osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        })
        break
      }

      case 'timesUp': {
        // Descending buzzer
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(600, now)
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.6)
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.linearRampToValueAtTime(0.15, now + 0.4)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.9)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'answerSubmit': {
        // Quick pop/click
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(600, now)
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.12)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'correct': {
        // Happy ascending ding-ding
        const notes = [523.25, 783.99, 1046.5] // C5, G5, C6
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, now + i * 0.1)
          gain.gain.setValueAtTime(0, now + i * 0.1)
          gain.gain.linearRampToValueAtTime(0.18, now + i * 0.1 + 0.03)
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now + i * 0.1)
          osc.stop(now + i * 0.1 + 0.4)
          activeNodesRef.current.add(gain)
          osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        })
        break
      }

      case 'incorrect': {
        // Sad descending buzz
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(400, now)
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.3)
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.45)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'getReady': {
        // Building suspense — low drum-like pulse
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(150 + i * 50, now + i * 0.8)
          gain.gain.setValueAtTime(0, now + i * 0.8)
          gain.gain.linearRampToValueAtTime(0.2, now + i * 0.8 + 0.05)
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.8 + 0.6)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now + i * 0.8)
          osc.stop(now + i * 0.8 + 0.7)
          activeNodesRef.current.add(gain)
          osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        }
        break
      }

      case 'leaderboardReveal': {
        // Dramatic reveal — ascending sweep
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(200, now)
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.6)
        gain.gain.setValueAtTime(0.1, now)
        gain.gain.linearRampToValueAtTime(0.15, now + 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
        osc.connect(gain).connect(ctx.destination)
        osc.start(now)
        osc.stop(now + 0.9)
        activeNodesRef.current.add(gain)
        osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        break
      }

      case 'podiumCelebration': {
        // Victory fanfare — ascending chord with shimmer
        const chord = [523.25, 659.25, 783.99, 1046.5] // C major spread
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = i % 2 === 0 ? 'triangle' : 'sine'
          osc.frequency.setValueAtTime(freq, now + i * 0.12)
          gain.gain.setValueAtTime(0, now + i * 0.12)
          gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.05)
          gain.gain.linearRampToValueAtTime(0.12, now + i * 0.12 + 1)
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 2)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now + i * 0.12)
          osc.stop(now + i * 0.12 + 2.2)
          activeNodesRef.current.add(gain)
          osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }
        })
        break
      }

      case 'lobbyMusic': {
        // Start lobby music loop — chill repeating pattern
        startLobbyMusic()
        break
      }
    }
  }, [])

  function startLobbyMusic() {
    stopLobbyMusic() // Clear any existing
    const ctx = getCtx()

    // Simple repeating melodic pattern
    const pattern = [
      { freq: 329.63, dur: 0.3 }, // E4
      { freq: 392.00, dur: 0.3 }, // G4
      { freq: 440.00, dur: 0.3 }, // A4
      { freq: 392.00, dur: 0.3 }, // G4
      { freq: 329.63, dur: 0.3 }, // E4
      { freq: 293.66, dur: 0.3 }, // D4
      { freq: 329.63, dur: 0.6 }, // E4 (hold)
    ]

    let noteIndex = 0
    const playNote = () => {
      if (mutedRef.current) return
      const ctx = getCtx()
      const { freq, dur } = pattern[noteIndex % pattern.length]
      const now = ctx.currentTime

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.06, now + 0.03)
      gain.gain.linearRampToValueAtTime(0.05, now + dur * 0.7)
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(now + dur + 0.05)
      activeNodesRef.current.add(gain)
      osc.onended = () => { gain.disconnect(); activeNodesRef.current.delete(gain) }

      noteIndex++
    }

    playNote()
    lobbyIntervalRef.current = setInterval(playNote, 350)
  }

  const stopLobbyMusic = useCallback(() => {
    if (lobbyIntervalRef.current) {
      clearInterval(lobbyIntervalRef.current)
      lobbyIntervalRef.current = null
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted
    if (muted) {
      stopLobbyMusic()
    }
  }, [stopLobbyMusic])

  return { play, stopLobbyMusic, setMuted }
}
