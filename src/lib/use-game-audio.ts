'use client'

import { useRef, useCallback, useEffect } from 'react'

/**
 * Web Audio API sound engine for 9Hoot!
 * SFX are procedurally generated. BGM uses /audio/lobby-music.mp3.
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
  const bgmRef = useRef<HTMLAudioElement | null>(null)
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
    if (mutedRef.current && sound !== 'lobbyMusic') return

    const ctx = getCtx()
    const now = ctx.currentTime

    switch (sound) {
      case 'countdownTick': {
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
        const notes = [523.25, 659.25, 783.99]
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
        const notes = [523.25, 783.99, 1046.5]
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
        const chord = [523.25, 659.25, 783.99, 1046.5]
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
        startLobbyMusic()
        break
      }
    }
  }, [])

  function startLobbyMusic() {
    // Don't restart if already playing
    if (bgmRef.current && !bgmRef.current.paused) return

    const audio = new Audio('/audio/lobby-music.mp3')
    audio.loop = true
    audio.volume = 0.5
    audio.muted = mutedRef.current

    audio.play().catch(() => {
      // Browser may block autoplay — will retry on next user interaction
    })

    bgmRef.current = audio
  }

  const stopLobbyMusic = useCallback(() => {
    if (bgmRef.current) {
      bgmRef.current.pause()
      bgmRef.current.currentTime = 0
      bgmRef.current = null
    }
  }, [])

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted
    // Sync mute state to BGM element
    if (bgmRef.current) {
      bgmRef.current.muted = muted
    }
  }, [])

  return { play, stopLobbyMusic, setMuted }
}
