<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { renderPage } from '../lib/pdfjs'

const props = defineProps({
  doc: { type: Object, required: true },
  page: { type: Number, required: true },
  width: { type: Number, default: 220 },
})

const root = ref(null)
const canvas = ref(null)
const ready = ref(false)
let observer = null
let cancelled = false
let started = false

async function draw() {
  if (started || !canvas.value) return
  started = true
  try {
    const cssWidth = (root.value && root.value.clientWidth) || props.width
    await renderPage(props.doc, props.page, canvas.value, cssWidth * 1.25, () => cancelled)
    if (!cancelled) ready.value = true
  } catch {
    started = false
  }
}

onMounted(() => {
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          draw()
          observer.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    observer.observe(root.value)
  } else {
    draw()
  }
})

onBeforeUnmount(() => {
  cancelled = true
  if (observer) observer.disconnect()
})

defineExpose({ el: root })
</script>

<template>
  <div ref="root" class="page-card">
    <div class="paper">
      <canvas ref="canvas" :class="{ ready }" />
      <span v-if="!ready" class="skeleton" aria-hidden="true" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.page-card {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1.414;
}
.paper {
  position: absolute;
  inset: 0;
  background: #fff;
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 0.6rem 1.6rem rgba(0, 0, 0, 0.5);
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 0.35s;
}
canvas.ready {
  opacity: 1;
}
.skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, #e9ecf7 30%, #ffffff 50%, #e9ecf7 70%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
</style>
