<script setup>
import { ref } from 'vue'
import { sfx } from '../lib/audio'

const props = defineProps({
  multiple: { type: Boolean, default: false },
  title: { type: String, default: 'Déposez vos PDF' },
  hint: { type: String, default: 'ou cliquez pour parcourir' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['files', 'reject'])

const root = ref(null)
const input = ref(null)
const over = ref(false)
let depth = 0

function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function take(list) {
  const all = Array.from(list || [])
  const valid = all.filter(isPdf)
  if (valid.length < all.length) emit('reject', all.length - valid.length)
  if (!valid.length) return
  emit('files', props.multiple ? valid : valid.slice(0, 1))
}

function onDrop(event) {
  event.preventDefault()
  depth = 0
  over.value = false
  if (props.disabled) return
  take(event.dataTransfer && event.dataTransfer.files)
}

function onEnter(event) {
  event.preventDefault()
  depth += 1
  if (!over.value && !props.disabled) {
    over.value = true
    sfx.hover()
  }
}

function onLeave() {
  depth = Math.max(0, depth - 1)
  if (depth === 0) over.value = false
}

function onPick(event) {
  take(event.target.files)
  event.target.value = ''
}

defineExpose({ el: root })
</script>

<template>
  <div
    ref="root"
    class="dz"
    :class="{ over, disabled }"
    @dragenter="onEnter"
    @dragover.prevent
    @dragleave="onLeave"
    @drop="onDrop"
  >
    <button type="button" class="dz-btn" :disabled="disabled" @click="input.click()">
      <span class="portal" aria-hidden="true">
        <i class="ring r1" />
        <i class="ring r2" />
        <i class="ring r3" />
        <svg class="core" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M24 34V12" />
          <path d="M15 21l9-9 9 9" />
          <path d="M10 38h28" />
        </svg>
      </span>
      <span class="dz-title">{{ title }}</span>
      <span class="dz-hint">{{ hint }}</span>
    </button>
    <input ref="input" type="file" accept="application/pdf,.pdf" :multiple="multiple" class="sr-only" tabindex="-1" @change="onPick" />
  </div>
</template>

<style scoped>
.dz {
  width: 100%;
}
.dz-btn {
  width: 100%;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 1.6rem 1rem 1.3rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--text);
}
.dz-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.portal {
  position: relative;
  display: grid;
  place-items: center;
  width: 8.5rem;
  aspect-ratio: 1;
  margin-bottom: 0.6rem;
  transition: transform 0.35s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--accent);
  border-bottom-color: color-mix(in srgb, var(--accent) 35%, transparent);
  filter: drop-shadow(0 0 0.4rem var(--glow));
  animation: spin 7s linear infinite;
}
.r1 {
  inset: 0;
}
.r2 {
  inset: 0.9rem;
  animation-duration: 4.4s;
  animation-direction: reverse;
  border-style: dashed;
}
.r3 {
  inset: 1.8rem;
  animation-duration: 2.8s;
}
.core {
  width: 2.6rem;
  color: var(--accent);
  filter: drop-shadow(0 0 0.5rem var(--glow));
  transition: transform 0.35s;
}
.dz-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.15rem;
}
.dz-hint {
  color: var(--dim);
  font-size: 0.95rem;
}
.dz-btn:not(:disabled):hover .portal,
.dz.over .portal {
  transform: scale(1.1);
}
.dz.over .ring {
  animation-duration: 1.2s;
}
.dz.over .core {
  transform: translateY(-0.35rem) scale(1.15);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
