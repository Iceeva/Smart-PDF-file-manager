<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { confetti, ring } from '../lib/fx'
import { sfx } from '../lib/audio'
import { formatSize, plural, state } from '../lib/store'

const downloaded = ref(false)
const button = ref(null)
const shownXp = ref(0)
let previousFocus = null
let counter = 0

const summary = computed(() => {
  const r = state.result
  if (!r) return ''
  if (r.kind === 'split') return `${plural(r.parts || 0, 'fichier', 'fichiers')} dans une archive ZIP`
  if (r.kind === 'merge') return `${plural(r.pages || 0, 'page', 'pages')} réunies dans un seul PDF`
  if (r.kind === 'extract') return `${plural(r.pages || 0, 'page extraite', 'pages extraites')}`
  return `${plural(r.pages || 0, 'page', 'pages')} dans le nouvel ordre`
})

function countUp(target) {
  cancelAnimationFrame(counter)
  const start = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 900)
    shownXp.value = Math.round(target * (1 - Math.pow(1 - t, 3)))
    if (t < 1) counter = requestAnimationFrame(tick)
  }
  counter = requestAnimationFrame(tick)
}

watch(
  () => state.result,
  async (result) => {
    if (!result) return
    downloaded.value = false
    shownXp.value = 0
    previousFocus = document.activeElement
    sfx.win()
    if (result.levelUp) setTimeout(() => sfx.levelUp(), 600)
    await nextTick()
    if (button.value) button.value.focus()
    confetti(window.innerWidth / 2, window.innerHeight * 0.42, [result.color, '#ffffff', '#22e4ff', '#ff2e63', '#9b8cff'])
    ring(window.innerWidth / 2, window.innerHeight * 0.42, { color: result.color, radius: 260, life: 50, width: 5 })
    setTimeout(() => countUp(result.xp), 450)
  },
)

function download() {
  const r = state.result
  if (!r) return
  const url = URL.createObjectURL(r.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = r.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  downloaded.value = true
  sfx.click()
}

function close() {
  state.result = null
  if (previousFocus && previousFocus.focus) previousFocus.focus()
}

function onKey(event) {
  if (event.key === 'Escape') close()
}
</script>

<template>
  <Transition name="victory">
    <div v-if="state.result" class="backdrop" role="dialog" aria-modal="true" aria-labelledby="victory-title" @keydown="onKey" @click.self="close">
      <div class="modal panel" :style="{ '--accent': state.result.color }">
        <h2 id="victory-title">Mission accomplie</h2>
        <p class="summary">{{ summary }}</p>

        <dl class="stats">
          <div>
            <dt>Fichier</dt>
            <dd>{{ state.result.filename }}</dd>
          </div>
          <div>
            <dt>Taille</dt>
            <dd>{{ formatSize(state.result.size) }}</dd>
          </div>
          <div v-if="state.result.xp" class="xp">
            <dt>Expérience</dt>
            <dd>+{{ shownXp }} XP</dd>
          </div>
        </dl>

        <p v-if="state.result.levelUp" class="levelup">Niveau {{ state.result.level }} atteint !</p>

        <div class="actions">
          <button ref="button" type="button" class="btn btn-primary" @click="download">
            {{ downloaded ? 'Télécharger à nouveau' : 'Télécharger le fichier' }}
          </button>
          <button type="button" class="btn btn-ghost" @click="close">Continuer</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgba(3, 4, 16, 0.72);
  backdrop-filter: blur(8px);
  perspective: 1400px;
}
.modal {
  width: min(100%, 34rem);
  padding: 2.2rem 2.2rem 1.8rem;
  filter: drop-shadow(0 0 2.4rem var(--glow));
}
h2 {
  font-size: clamp(2rem, 3vw, 2.8rem);
  text-shadow: 0 0 1.6rem var(--glow);
}
.summary {
  margin-top: 0.5rem;
  font-size: 1.15rem;
  color: var(--dim);
}
.stats {
  display: grid;
  gap: 0.7rem;
  margin: 1.6rem 0 1.2rem;
}
.stats div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
dt {
  color: var(--dim);
}
dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}
.xp dd {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--accent);
}
.levelup {
  margin-bottom: 1rem;
  padding: 0.6rem 0.9rem;
  background: var(--soft);
  border-left: 3px solid var(--accent);
  font-family: var(--font-display);
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.4rem;
}

.victory-enter-active,
.victory-leave-active {
  transition: opacity 0.3s;
}
.victory-enter-active .modal {
  animation: arrive 0.6s cubic-bezier(0.2, 1.3, 0.3, 1);
}
.victory-enter-from,
.victory-leave-to {
  opacity: 0;
}
@keyframes arrive {
  from {
    transform: rotateX(40deg) translateY(4rem) scale(0.8);
    opacity: 0;
  }
}
</style>
