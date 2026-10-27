import { state } from './store'

let ctx = null
let master = null

function ensure() {
  if (!state.sound) return null
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function unlockAudio() {
  ensure()
}

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

function noise({ dur = 0.25, vol = 0.2, from = 6000, to = 300, delay = 0 }) {
  const c = ensure()
  if (!c) return
  const t = c.currentTime + delay
  const length = Math.max(1, Math.floor(c.sampleRate * dur))
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + dur)
  const gain = c.createGain()
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(gain).connect(master)
  src.start(t)
}

export const sfx = {
  hover() {
    tone({ freq: 920, dur: 0.035, vol: 0.03, type: 'triangle' })
  },
  click() {
    tone({ freq: 640, to: 960, dur: 0.07, vol: 0.07, type: 'triangle' })
  },
  boot() {
    tone({ freq: 110, to: 440, dur: 0.6, vol: 0.12, type: 'sawtooth' })
    tone({ freq: 660, to: 1320, dur: 0.4, vol: 0.06, type: 'sine', delay: 0.3 })
  },
  warp() {
    noise({ dur: 0.35, vol: 0.12, from: 400, to: 5000 })
    tone({ freq: 200, to: 600, dur: 0.3, vol: 0.06, type: 'sawtooth' })
  },
  dock() {
    tone({ freq: 220, to: 70, dur: 0.22, vol: 0.32, type: 'sine' })
    noise({ dur: 0.1, vol: 0.12, from: 3000, to: 800 })
  },
  lock() {
    tone({ freq: 1400, dur: 0.05, vol: 0.08, type: 'square' })
    tone({ freq: 1900, dur: 0.08, vol: 0.08, type: 'square', delay: 0.07 })
  },
  unlock() {
    tone({ freq: 900, dur: 0.06, vol: 0.05, type: 'square' })
  },
  cut() {
    noise({ dur: 0.28, vol: 0.22, from: 9000, to: 500 })
    tone({ freq: 2200, to: 180, dur: 0.22, vol: 0.12, type: 'sawtooth' })
  },
  swap() {
    tone({ freq: 480, to: 720, dur: 0.09, vol: 0.09, type: 'triangle' })
  },
  grab() {
    tone({ freq: 300, to: 520, dur: 0.08, vol: 0.1, type: 'square' })
  },
  drop() {
    tone({ freq: 520, to: 200, dur: 0.14, vol: 0.2, type: 'sine' })
  },
  charge(seconds = 1.2) {
    tone({ freq: 70, to: 900, dur: seconds, vol: 0.14, type: 'sawtooth' })
    noise({ dur: seconds, vol: 0.05, from: 300, to: 7000 })
  },
  boom() {
    tone({ freq: 140, to: 30, dur: 0.6, vol: 0.45, type: 'sine' })
    noise({ dur: 0.5, vol: 0.25, from: 4000, to: 120 })
  },
  win() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, vol: 0.12, type: 'triangle', delay: i * 0.08 }),
    )
    tone({ freq: 262, dur: 0.7, vol: 0.1, type: 'sine', delay: 0.05 })
  },
  levelUp() {
    ;[392, 523, 659, 784, 1047, 1568].forEach((f, i) =>
      tone({ freq: f, dur: 0.18, vol: 0.12, type: 'square', delay: i * 0.07 }),
    )
  },
  error() {
    tone({ freq: 240, to: 90, dur: 0.35, vol: 0.2, type: 'sawtooth' })
  },
}
