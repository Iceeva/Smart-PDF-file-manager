<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import DropZone from '../components/DropZone.vue'
import PageCard from '../components/PageCard.vue'
import { openPdf } from '../lib/pdfjs'
import * as api from '../lib/api'
import { sfx } from '../lib/audio'
import { burst, center, ring, shake } from '../lib/fx'
import { formatSize, plural, state } from '../lib/store'
import { play, sleep, useMission } from '../lib/mission'

const COLOR = '#9b8cff'

const file = ref(null)
const doc = ref(null)
const pages = ref(0)
const order = ref([])
const drag = ref(null)
const shuffling = ref(false)
const localError = ref('')
const gridComp = ref(null)
// TransitionGroup expose une instance de composant : on en tire l'element DOM.
const grid = computed(() => (gridComp.value ? gridComp.value.$el : null))
const { busy, error, run } = useMission()
const anims = []

let pending = null
let snapshot = null
let lastSwap = 0
let pointer = { x: 0, y: 0 }
let raf = 0
let lastResult = null
let lastKey = ''

const changed = computed(() => order.value.some((p, i) => p !== i + 1))
const movedCount = computed(() => order.value.filter((p, i) => p !== i + 1).length)
const orderKey = computed(() => order.value.join(','))
const canRun = computed(() => changed.value && !busy.value && !drag.value && !shuffling.value)
const canReplay = computed(() => lastResult && lastKey === orderKey.value && !busy.value)

async function load(files) {
  localError.value = ''
  error.value = ''
  const f = files[0]
  if (f.size > state.maxUploadMb * 1024 * 1024) {
    localError.value = `« ${f.name} » dépasse la limite de ${state.maxUploadMb.toString().replace('.', ',')} Mo du serveur.`
    return
  }
  try {
    const d = await openPdf(f)
    file.value = f
    doc.value = d
    pages.value = d.numPages
    order.value = Array.from({ length: d.numPages }, (_, i) => i + 1)
    lastResult = null
  } catch (e) {
    localError.value = e.message
  }
}

function onReject() {
  localError.value = 'Seuls les fichiers PDF sont acceptés.'
}

function reset() {
  file.value = null
  doc.value = null
  pages.value = 0
  order.value = []
  lastResult = null
}

// --- Outils rapides
function reverse() {
  order.value = [...order.value].reverse()
  sfx.swap()
}

function restore() {
  order.value = Array.from({ length: pages.value }, (_, i) => i + 1)
  sfx.unlock()
}

async function shuffle() {
  if (pages.value < 2) return
  shuffling.value = true
  const steps = Math.min(10, pages.value + 2)
  for (let s = 0; s < steps; s++) {
    const next = [...order.value]
    for (let k = next.length - 1; k > 0; k--) {
      if (Math.random() < 0.5) continue
      const j = Math.floor(Math.random() * (k + 1))
      ;[next[k], next[j]] = [next[j], next[k]]
    }
    order.value = next
    sfx.swap()
    await sleep(240)
  }
  shuffling.value = false
}

// --- Deplacement par boutons (tactile et clavier)
async function step(index, delta) {
  const to = index + delta
  if (to < 0 || to >= order.value.length || busy.value) return
  const page = order.value[index]
  const next = [...order.value]
  next.splice(index, 1)
  next.splice(to, 0, page)
  order.value = next
  sfx.swap()
  await nextTick()
  const btn = grid.value && grid.value.querySelector(`.tile[data-page="${page}"] .${delta < 0 ? 'mv-left' : 'mv-right'}`)
  if (btn && !btn.disabled) btn.focus({ preventScroll: true })
}

// --- Glisser-deposer avec reorganisation en direct
function onPointerDown(event, page) {
  if (busy.value || event.pointerType === 'touch' || event.button !== 0) return
  if (event.target.closest('button')) return
  pending = { page, x: event.clientX, y: event.clientY, el: event.currentTarget }
  pointer = { x: event.clientX, y: event.clientY }
}

function onMove(event) {
  pointer = { x: event.clientX, y: event.clientY }
  if (pending && !drag.value && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 6) startDrag()
  const d = drag.value
  if (d && !d.settle) {
    d.rot = Math.max(-10, Math.min(10, (event.clientX - d.x) * 0.6))
    d.x = event.clientX
    d.y = event.clientY
  }
}

function startDrag() {
  const r = pending.el.getBoundingClientRect()
  snapshot = [...order.value]
  drag.value = {
    page: pending.page,
    x: pointer.x,
    y: pointer.y,
    offX: pending.x - r.left,
    offY: pending.y - r.top,
    w: r.width,
    h: r.height,
    rot: 0,
    settle: false,
  }
  pending = null
  document.body.style.cursor = 'grabbing'
  sfx.grab()
  raf = requestAnimationFrame(tick)
}

function tick() {
  const d = drag.value
  if (!d || d.settle) return
  d.rot *= 0.88
  const edge = 100
  if (pointer.y < edge) window.scrollBy(0, -Math.ceil((edge - pointer.y) / 6))
  else if (pointer.y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((pointer.y - (window.innerHeight - edge)) / 6))
  detect()
  raf = requestAnimationFrame(tick)
}

function detect() {
  const now = performance.now()
  if (now - lastSwap < 150 || !grid.value) return
  for (const el of grid.value.querySelectorAll('.tile')) {
    const page = Number(el.dataset.page)
    if (page === drag.value.page) continue
    const r = el.getBoundingClientRect()
    const mx = r.width * 0.2
    const my = r.height * 0.2
    if (pointer.x > r.left + mx && pointer.x < r.right - mx && pointer.y > r.top + my && pointer.y < r.bottom - my) {
      const next = [...order.value]
      next.splice(next.indexOf(drag.value.page), 1)
      next.splice(next.indexOf(page), 0, drag.value.page)
      order.value = next
      lastSwap = now
      sfx.swap()
      break
    }
  }
}

function endDrag() {
  cancelAnimationFrame(raf)
  drag.value = null
  document.body.style.cursor = ''
}

function onUp() {
  pending = null
  const d = drag.value
  if (!d || d.settle) return
  cancelAnimationFrame(raf)
  const el = grid.value && grid.value.querySelector(`.tile[data-page="${d.page}"]`)
  if (!el) return endDrag()
  const r = el.getBoundingClientRect()
  d.settle = true
  d.x = r.left + d.offX
  d.y = r.top + d.offY
  d.rot = 0
  sfx.drop()
  setTimeout(() => {
    const c = center(el)
    burst(c.x, c.y, { color: COLOR, count: 14, power: 4.5, life: 30 })
    ring(c.x, c.y, { color: COLOR, radius: 80, life: 24, width: 2 })
    endDrag()
  }, 210)
}

function onKey(event) {
  if (event.key === 'Escape' && drag.value && snapshot) {
    order.value = snapshot
    endDrag()
  }
}

onMounted(() => {
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('keydown', onKey)
  endDrag()
})

// --- Application : une vague retourne chaque page dans sa nouvelle position
function cancelAnims() {
  anims.splice(0).forEach((a) => a.cancel())
}

async function wave() {
  sfx.charge(1.1)
  const tiles = Array.from(grid.value.querySelectorAll('.tile'))
  const gap = Math.min(55, 1100 / Math.max(1, tiles.length))
  await Promise.all(
    tiles.map((el, i) =>
      play(
        el,
        [
          { transform: 'perspective(800px) rotateY(0deg) scale(1)', filter: 'brightness(1)' },
          { transform: 'perspective(800px) rotateY(180deg) scale(1.08)', filter: 'brightness(2)', offset: 0.5 },
          { transform: 'perspective(800px) rotateY(360deg) scale(1)', filter: 'brightness(1)' },
        ],
        { duration: 650, delay: i * gap, easing: 'ease-in-out' },
        anims,
      ).then(() => {
        if (i < 40) {
          const c = center(el)
          burst(c.x, c.y, { color: COLOR, count: 6, power: 3, life: 20, size: 2 })
        }
        if (i % 3 === 0) sfx.lock()
      }),
    ),
  )
  sfx.boom()
  shake(document.body, 8, 360)
  anims.length = 0
}

async function apply() {
  if (!canRun.value) return
  cancelAnims()
  const sent = orderKey.value
  const moved = movedCount.value
  const result = await run({
    kind: 'reorder',
    title: 'Réorganisation',
    color: COLOR,
    request: () => api.reorder(file.value, sent),
    animate: wave,
    xp: () => Math.min(120, 35 + moved * 2),
    reset: cancelAnims,
  })
  if (result) {
    lastResult = { ...state.result, xp: 0, levelUp: false }
    lastKey = sent
  }
}

function replay() {
  if (lastResult) state.result = lastResult
}
</script>

<template>
  <section class="view reorder">
    <header class="view-head">
      <h1>Réorganisation</h1>
      <p>
        Attrapez une page et déposez-la ailleurs : les autres s'écartent pour lui faire de la place. Sur écran tactile,
        utilisez les flèches de chaque page.
      </p>
    </header>

    <p v-if="localError || error" class="alert" role="alert">{{ localError || error }}</p>

    <div v-if="!doc" class="intro panel">
      <DropZone title="Déposez le PDF à réorganiser" hint="ou cliquez pour parcourir" @files="load" @reject="onReject" />
    </div>

    <div v-else>
      <div class="bar panel">
        <div class="info">
          <strong :title="file.name">{{ file.name }}</strong>
          <span>
            {{ plural(pages, 'page', 'pages') }}, {{ formatSize(file.size) }}.
            {{ changed ? `${plural(movedCount, 'page déplacée', 'pages déplacées')}` : 'Ordre d’origine' }}
          </span>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy || shuffling || pages < 2" @click="reverse">Inverser</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy || shuffling || pages < 2" @click="shuffle">Mélanger</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy || shuffling || !changed" @click="restore">Ordre d’origine</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="reset">Changer de fichier</button>
          <button v-if="canReplay" type="button" class="btn btn-ghost btn-small" @click="replay">Télécharger à nouveau</button>
          <button type="button" class="btn btn-primary" :disabled="!canRun" @click="apply">
            {{ busy ? 'Réorganisation…' : changed ? 'Appliquer le nouvel ordre' : 'Déplacez une page' }}
          </button>
        </div>
      </div>

      <TransitionGroup ref="gridComp" name="flip" tag="div" class="grid" role="list" :class="{ dragging: !!drag }">
        <div
          v-for="(p, i) in order"
          :key="p"
          class="tile"
          :class="{ moved: p !== i + 1, lifted: drag && drag.page === p }"
          :data-page="p"
          role="listitem"
          :aria-label="`Page d'origine ${p}, position ${i + 1}`"
          @pointerdown="onPointerDown($event, p)"
        >
          <PageCard :doc="doc" :page="p" :width="170" />
          <span class="pos">{{ i + 1 }}</span>
          <span v-if="p !== i + 1" class="from">était p. {{ p }}</span>
          <div class="mv">
            <button type="button" class="mv-left" :disabled="busy || i === 0" :aria-label="`Avancer la position ${i + 1}`" @click.stop="step(i, -1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" class="mv-right" :disabled="busy || i === order.length - 1" :aria-label="`Reculer la position ${i + 1}`" @click.stop="step(i, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <Teleport to="body">
      <div
        v-if="drag"
        class="ghost"
        :class="{ settle: drag.settle }"
        :style="{
          width: drag.w + 'px',
          height: drag.h + 'px',
          transform: `translate3d(${drag.x - drag.offX}px, ${drag.y - drag.offY}px, 0) rotate(${drag.rot}deg) scale(${drag.settle ? 1 : 1.07})`,
        }"
      >
        <PageCard :doc="doc" :page="drag.page" :width="170" />
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.intro {
  max-width: 34rem;
  padding: 0.6rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.2rem;
  margin-bottom: 1.4rem;
}
.info {
  display: grid;
  min-width: 0;
}
.info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info span {
  color: var(--dim);
  font-size: 0.92rem;
}

/* ---------- Grille ---------- */

.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.4rem, 1fr));
  gap: 1.5rem 1.3rem;
  padding: 0.6rem 0.2rem 1.4rem;
  perspective: 1600px;
}
.tile {
  position: relative;
  cursor: grab;
  user-select: none;
  outline-offset: 6px;
  transition: filter 0.25s;
}
.tile:hover {
  filter: brightness(1.12);
}
.tile.moved {
  filter: drop-shadow(0 0 0.9rem var(--glow));
}
.tile.lifted {
  opacity: 0.3;
  outline: 2px dashed var(--accent);
}
.grid.dragging .tile {
  cursor: grabbing;
}
.flip-move {
  transition: transform 0.5s cubic-bezier(0.3, 1.25, 0.4, 1);
}
.pos {
  position: absolute;
  right: -0.5rem;
  bottom: -0.6rem;
  display: grid;
  place-items: center;
  min-width: 2.2rem;
  height: 2.2rem;
  padding: 0 0.5rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--text);
  background: #121a52;
  box-shadow: inset 0 0 0 1px var(--edge);
  clip-path: polygon(20% 0, 100% 0, 80% 100%, 0 100%);
}
.tile.moved .pos {
  color: #05071a;
  background: var(--accent);
  box-shadow: none;
}
.from {
  position: absolute;
  left: 0.35rem;
  top: 0.35rem;
  padding: 0.05rem 0.4rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #05071a;
  background: rgba(155, 140, 255, 0.92);
}
.mv {
  position: absolute;
  left: 50%;
  bottom: 0.5rem;
  display: flex;
  gap: 0.3rem;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.2s;
}
.tile:hover .mv,
.tile:focus-within .mv {
  opacity: 1;
}
@media (hover: none) {
  .mv {
    opacity: 1;
  }
}
.mv button {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  color: var(--text);
  background: rgba(5, 7, 26, 0.88);
  box-shadow: inset 0 0 0 1px var(--edge);
  cursor: pointer;
}
.mv button:not(:disabled):hover {
  background: var(--accent);
  color: #05071a;
}
.mv button:disabled {
  opacity: 0.3;
  cursor: default;
}
.mv svg {
  width: 1.05rem;
}

/* ---------- Page soulevee ---------- */

.ghost {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 125;
  pointer-events: none;
  will-change: transform;
  filter: drop-shadow(0 1.4rem 1.6rem rgba(0, 0, 0, 0.6)) drop-shadow(0 0 1.4rem var(--glow));
}
.ghost.settle {
  transition: transform 0.2s cubic-bezier(0.3, 1.4, 0.5, 1);
}
</style>
