<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { registerLayer, step } from '../lib/fx'

const canvas = ref(null)
let raf = 0
let running = false

function resize() {
  const c = canvas.value
  if (!c) return
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.round(window.innerWidth * ratio)
  c.height = Math.round(window.innerHeight * ratio)
  c.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0)
}

function loop() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  if (step(ctx)) {
    raf = requestAnimationFrame(loop)
  } else {
    running = false
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
}

function wake() {
  if (running) return
  running = true
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  registerLayer({ wake })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
  registerLayer(null)
})
</script>

<template>
  <canvas ref="canvas" class="fx" aria-hidden="true" />
</template>

<style scoped>
.fx {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 120;
}
</style>
