<script setup>
import { computed, ref } from 'vue'
import DropZone from '../components/DropZone.vue'
import PageCard from '../components/PageCard.vue'
import { openPdf } from '../lib/pdfjs'
import * as api from '../lib/api'
import { sfx } from '../lib/audio'
import { burst, center, ring, shake } from '../lib/fx'
import { formatSize, plural, state } from '../lib/store'
import { play, sleep, useMission } from '../lib/mission'

const COLOR = '#ff2e63'
const MAX_PARTS = 200

const file = ref(null)
const doc = ref(null)
const pages = ref(0)
const cuts = ref([]) // numero de la page apres laquelle on coupe
const every = ref(2)
const localError = ref('')
const strip = ref(null)
const { busy, error, run } = useMission()
const anims = []

const cutSet = computed(() => new Set(cuts.value))
const sorted = computed(() => [...cuts.value].sort((a, b) => a - b))

const parts = computed(() => {
  const list = []
  let start = 1
  for (const c of sorted.value) {
    list.push({ from: start, to: c })
    start = c + 1
  }
  if (pages.value) list.push({ from: start, to: pages.value })
  return list
})

const partOf = computed(() => {
  const map = new Array(pages.value + 1).fill(0)
  parts.value.forEach((part, index) => {
    for (let p = part.from; p <= part.to; p++) map[p] = index
  })
  return map
})

const tooMany = computed(() => parts.value.length > MAX_PARTS)
const canRun = computed(() => parts.value.length > 1 && !tooMany.value && !busy.value)

function partColor(index) {
  return `hsl(${(index * 47 + 345) % 360} 92% 62%)`
}

function label(part) {
  return part.from === part.to ? `page ${part.from}` : `pages ${part.from} à ${part.to}`
}

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
    cuts.value = []
    every.value = Math.min(2, Math.max(1, d.numPages - 1))
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
  cuts.value = []
}

function sparks(el) {
  const r = el.getBoundingClientRect()
  for (let k = 0; k <= 5; k++) {
    setTimeout(() => burst(r.left + r.width / 2, r.top + (r.height * k) / 5, { color: '#ffffff', count: 7, power: 4.5, life: 26, size: 2.4 }), k * 45)
  }
}

function toggle(page, event) {
  if (busy.value) return
  const slot = event.currentTarget
  if (cutSet.value.has(page)) {
    cuts.value = cuts.value.filter((c) => c !== page)
    sfx.unlock()
  } else {
    cuts.value = [...cuts.value, page]
    sfx.cut()
    sparks(slot)
    const c = center(slot)
    ring(c.x, c.y, { color: COLOR, radius: 90, life: 26, width: 2 })
  }
}

function cutAll() {
  cuts.value = Array.from({ length: pages.value - 1 }, (_, i) => i + 1)
  sfx.cut()
}

function cutEvery() {
  const k = Math.max(1, Math.floor(Number(every.value) || 1))
  cuts.value = []
  for (let p = k; p < pages.value; p += k) cuts.value.push(p)
  sfx.cut()
}

function clearCuts() {
  cuts.value = []
  sfx.unlock()
}

// --- Animation de decoupe : les lasers s'allument, puis chaque tranche se detache
function cancelAnims() {
  anims.splice(0).forEach((a) => a.cancel())
}

async function slice() {
  const root = strip.value
  const lasers = Array.from(root.querySelectorAll('.laser'))
  sfx.charge(0.9)
  await Promise.all(
    lasers.map((el, i) =>
      play(
        el,
        [
          { filter: 'brightness(1)', width: '3px' },
          { filter: 'brightness(3.5)', width: '10px', offset: 0.4 },
          { filter: 'brightness(1)', width: '3px' },
        ],
        { duration: 520, delay: i * Math.min(220, 1400 / lasers.length), easing: 'ease-out' },
        anims,
      ).then(() => {
        sparks(el)
        sfx.cut()
      }),
    ),
  )
  await sleep(120)
  sfx.boom()
  const cells = Array.from(root.querySelectorAll('.cell'))
  const done = cells.map((el) => {
    const pi = Number(el.dataset.part)
    const pos = Number(el.dataset.pos)
    return play(
      el,
      [
        { transform: 'translateY(0) rotate(0deg) scale(1)', filter: 'brightness(1)' },
        { transform: `translateY(-1.1rem) rotate(${pi % 2 ? 2 : -2}deg) scale(1.05)`, filter: 'brightness(1.6)', offset: 0.4 },
        { transform: 'translateY(0) rotate(0deg) scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 650, delay: Math.min(pi, 12) * 120 + Math.min(pos, 6) * 30, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)' },
      anims,
    )
  })
  parts.value.slice(0, 12).forEach((part, pi) => {
    const first = root.querySelector(`.cell[data-page="${part.from}"]`)
    if (!first) return
    setTimeout(() => {
      const c = center(first)
      burst(c.x, c.y, { color: partColor(pi), count: 22, power: 6 })
      ring(c.x, c.y, { color: partColor(pi), radius: 100, life: 28 })
    }, pi * 120 + 200)
  })
  shake(document.body, 9, 380)
  await Promise.all(done)
  cancelAnims()
}

async function run_() {
  if (!canRun.value) return
  cancelAnims()
  const ranges = parts.value.map((p) => `${p.from}-${p.to}`).join(',')
  const count = parts.value.length
  await run({
    kind: 'split',
    title: 'Découpe',
    color: COLOR,
    request: () => api.split(file.value, ranges),
    animate: slice,
    xp: () => Math.min(150, 40 + count * 10),
    reset: cancelAnims,
  })
}
</script>

<template>
  <section class="view split">
    <header class="view-head">
      <h1>Découpe</h1>
      <p>
        Passez le sabre laser entre deux pages pour trancher le document. Chaque tranche devient un fichier PDF, livré
        dans une archive ZIP.
      </p>
    </header>

    <p v-if="localError || error" class="alert" role="alert">{{ localError || error }}</p>

    <div v-if="!doc" class="intro panel">
      <DropZone title="Déposez le PDF à trancher" hint="ou cliquez pour parcourir" @files="load" @reject="onReject" />
    </div>

    <div v-else class="board">
      <div class="main">
        <div class="filebar panel">
          <div>
            <strong :title="file.name">{{ file.name }}</strong>
            <span>{{ plural(pages, 'page', 'pages') }}, {{ formatSize(file.size) }}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="reset">Changer de fichier</button>
        </div>

        <div v-if="pages > 1" class="toolbar">
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="cutAll">Une page par fichier</button>
          <label class="field">
            <span>Tous les</span>
            <input v-model.number="every" type="number" min="1" :max="pages - 1" :disabled="busy" class="num-input" aria-label="Nombre de pages par fichier" />
            <span>pages</span>
          </label>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="cutEvery">Appliquer</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy || !cuts.length" @click="clearCuts">Effacer les coupes</button>
        </div>
        <p v-else class="alert">Ce PDF ne contient qu'une seule page : il n'y a rien à trancher.</p>

        <div ref="strip" class="strip" role="group" aria-label="Pages du document">
          <div
            v-for="p in pages"
            :key="p"
            class="cell"
            :class="{ cut: cutSet.has(p) }"
            :style="{ '--c': partColor(partOf[p]) }"
            :data-page="p"
            :data-part="partOf[p]"
            :data-pos="p - parts[partOf[p]].from"
          >
            <div class="card">
              <PageCard :doc="doc" :page="p" :width="170" />
              <span class="num">{{ p }}</span>
            </div>
            <button
              v-if="p < pages"
              type="button"
              class="slot"
              :aria-pressed="cutSet.has(p)"
              :aria-label="`Couper après la page ${p}`"
              :disabled="busy"
              @click="toggle(p, $event)"
            >
              <i v-if="cutSet.has(p)" class="laser" />
            </button>
          </div>
        </div>
      </div>

      <aside class="side panel">
        <h2>Tranches</h2>
        <ol class="parts">
          <li v-for="(part, i) in parts.slice(0, 30)" :key="i" :style="{ '--c': partColor(i) }">
            <i />
            <span>Fichier {{ i + 1 }}</span>
            <em>{{ label(part) }}</em>
          </li>
          <li v-if="parts.length > 30" class="more">et {{ parts.length - 30 }} autres fichiers</li>
        </ol>
        <p v-if="tooMany" class="alert small" role="alert">Maximum {{ MAX_PARTS }} fichiers par découpe.</p>
        <button type="button" class="btn btn-primary" :disabled="!canRun" @click="run_">
          {{ busy ? 'Découpe en cours…' : parts.length > 1 ? `Trancher en ${parts.length} fichiers` : 'Placez une coupe' }}
        </button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.intro {
  max-width: 34rem;
  padding: 0.6rem;
}
.board {
  display: grid;
  grid-template-columns: 1fr minmax(15rem, 19rem);
  gap: 1.6rem;
  align-items: start;
}
.filebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1.1rem;
  margin-bottom: 1rem;
}
.filebar div {
  display: grid;
  min-width: 0;
}
.filebar strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filebar span {
  color: var(--dim);
  font-size: 0.92rem;
}
.toolbar {
  margin-bottom: 1.6rem;
}
.num-input {
  width: 4.2rem;
}

/* ---------- Bande de pages ---------- */

.strip {
  display: flex;
  flex-wrap: wrap;
  gap: 1.8rem 0.9rem;
  padding: 0.6rem 0.4rem 1rem;
}
.cell {
  position: relative;
  width: 9.4rem;
  margin-right: 0;
  transition: margin-right 0.4s cubic-bezier(0.3, 1.3, 0.5, 1);
}
.cell.cut {
  margin-right: 1.6rem;
}
.card {
  position: relative;
  padding-bottom: 0.4rem;
  border-bottom: 3px solid var(--c);
  box-shadow: 0 0.5rem 1.2rem -0.6rem var(--c);
}
.num {
  position: absolute;
  left: 0.4rem;
  bottom: 0.9rem;
  min-width: 1.6rem;
  padding: 0 0.35rem;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.85rem;
  color: #05071a;
  background: var(--c);
}

.slot {
  position: absolute;
  top: -0.5rem;
  bottom: -0.5rem;
  left: calc(100% - 0.45rem);
  z-index: 4;
  width: 1.8rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: crosshair;
}
.slot::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 2px dashed transparent;
  transform: translateX(-50%);
  transition: border-color 0.2s;
}
.slot::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.7rem;
  height: 0.7rem;
  background: var(--accent);
  transform: translate(-50%, -50%) rotate(45deg) scale(0);
  transition: transform 0.2s;
  box-shadow: 0 0 0.8rem var(--glow);
}
.slot:not(:disabled):hover::before,
.slot:focus-visible::before {
  border-color: var(--accent);
}
.slot:not(:disabled):hover::after,
.slot:focus-visible::after {
  transform: translate(-50%, -50%) rotate(45deg) scale(1);
}
.slot[aria-pressed='true']::before,
.slot[aria-pressed='true']::after {
  display: none;
}
.laser {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 3px;
  margin-left: -1.5px;
  background: linear-gradient(#fff, var(--accent) 28%, #fff 50%, var(--accent) 72%, #fff);
  box-shadow: 0 0 0.5rem #fff, 0 0 1.3rem var(--accent), 0 0 2.8rem var(--accent);
  transform-origin: top;
  animation: slash 0.45s cubic-bezier(0.2, 0.9, 0.3, 1) both;
}
@keyframes slash {
  from {
    transform: scaleY(0);
    filter: brightness(4);
  }
  to {
    transform: scaleY(1);
    filter: brightness(1);
  }
}

/* ---------- Tranches ---------- */

.side {
  position: sticky;
  top: calc(var(--hud-h) + 1rem);
  display: grid;
  gap: 1rem;
  padding: 1.4rem 1.2rem;
}
.side h2 {
  font-size: 1.4rem;
}
.parts {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
  list-style: none;
}
.parts li {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.7rem;
  align-items: center;
  padding: 0.35rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid var(--c);
}
.parts i {
  grid-row: span 2;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 0.7rem var(--c);
}
.parts em {
  font-style: normal;
  color: var(--dim);
  font-size: 0.9rem;
}
.parts .more {
  display: block;
  color: var(--dim);
  border-left-color: transparent;
}
.alert.small {
  margin: 0;
  font-size: 0.9rem;
}

@media (max-width: 1000px) {
  .board {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
  }
}
</style>
