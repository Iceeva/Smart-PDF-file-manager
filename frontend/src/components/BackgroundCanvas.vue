<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { reducedMotion } from '../lib/fx'

const props = defineProps({ accent: { type: String, default: '#ff9f1c' } })
const canvas = ref(null)

let raf = 0
let w = 0
let h = 0
let stars = []
let color = [255, 159, 28]
let target = [255, 159, 28]
const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
let still = false

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function resize() {
  const c = canvas.value
  if (!c) return
  // Resolution plafonnee : sur un ecran 4K le fond reste fluide.
  const ratio = Math.min(window.devicePixelRatio || 1, 2, 3200 / window.innerWidth)
  w = Math.round(window.innerWidth * ratio)
  h = Math.round(window.innerHeight * ratio)
  c.width = w
  c.height = h
  const count = Math.min(320, Math.round((w * h) / 9000))
  stars = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random() * 0.62,
    z: 0.2 + Math.random() * 0.8,
    tw: Math.random() * 6,
  }))
  if (still) draw(0)
}

function draw(ts) {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  const [r, g, b] = color
  mouse.x += (mouse.tx - mouse.x) * 0.05
  mouse.y += (mouse.ty - mouse.y) * 0.05

  const horizon = h * (0.58 + (mouse.y - 0.5) * 0.04)
  const vx = w / 2 + (mouse.x - 0.5) * w * 0.1

  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#02030c')
  sky.addColorStop(horizon / h, '#0a1038')
  sky.addColorStop(1, '#060818')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  const halo = ctx.createRadialGradient(vx, horizon, 0, vx, horizon, h * 0.55)
  halo.addColorStop(0, `rgba(${r},${g},${b},0.34)`)
  halo.addColorStop(0.4, `rgba(${r},${g},${b},0.08)`)
  halo.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, w, h)

  const unit = Math.max(1, w / 1920)
  for (const s of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(ts * 0.002 + s.tw)
    ctx.globalAlpha = s.z * twinkle
    ctx.fillStyle = '#cfd6ff'
    const x = s.x * w + (mouse.x - 0.5) * s.z * 40 * unit
    ctx.fillRect(x, s.y * h, 1.4 * s.z * unit, 1.4 * s.z * unit)
  }
  ctx.globalAlpha = 1

  // Sol quadrille en perspective
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, horizon, w, h - horizon)
  ctx.clip()
  ctx.lineCap = 'round'
  const spacing = w / 11
  for (let i = -22; i <= 22; i++) {
    const fade = 1 - Math.min(1, Math.abs(i) / 24)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.1 + fade * 0.28})`
    ctx.lineWidth = unit * 1.2
    ctx.beginPath()
    ctx.moveTo(vx, horizon)
    ctx.lineTo(vx + i * spacing * 2.2, h)
    ctx.stroke()
  }
  const rows = 16
  const offset = (ts * 0.00035) % 1
  for (let k = 0; k < rows; k++) {
    const z = (k + offset) / rows
    const y = horizon + (h - horizon) * Math.pow(z, 2.6)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.06 + z * 0.36})`
    ctx.lineWidth = unit * (0.6 + z * 2)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.restore()

  // Ligne d'horizon lumineuse
  const line = ctx.createLinearGradient(0, 0, w, 0)
  line.addColorStop(0, 'rgba(0,0,0,0)')
  line.addColorStop(0.5, `rgba(${r},${g},${b},0.9)`)
  line.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = line
  ctx.fillRect(0, horizon - unit, w, unit * 2)
}

function loop(ts) {
  for (let i = 0; i < 3; i++) color[i] += (target[i] - color[i]) * 0.06
  draw(ts)
  raf = requestAnimationFrame(loop)
}

function onMove(e) {
  mouse.tx = e.clientX / window.innerWidth
  mouse.ty = e.clientY / window.innerHeight
}

function onVisibility() {
  if (still) return
  cancelAnimationFrame(raf)
  if (!document.hidden) raf = requestAnimationFrame(loop)
}

watch(
  () => props.accent,
  (value) => {
    target = hexToRgb(value)
    if (still) {
      color = [...target]
      draw(0)
    }
  },
)

onMounted(() => {
  still = reducedMotion()
  color = hexToRgb(props.accent)
  target = [...color]
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  if (still) draw(0)
  else raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onMove)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <canvas ref="canvas" class="bg" aria-hidden="true" />
</template>

<style scoped>
.bg {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
}
</style>
