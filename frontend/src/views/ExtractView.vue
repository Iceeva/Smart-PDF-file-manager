<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DropZone from '../components/DropZone.vue'
import PageCard from '../components/PageCard.vue'
import { openPdf } from '../lib/pdfjs'
import * as api from '../lib/api'
import { sfx } from '../lib/audio'
import { burst, center, ring, shake } from '../lib/fx'
import { formatSpec, parseSpec } from '../lib/ranges'
import { formatSize, plural, state } from '../lib/store'
import { play, useMission } from '../lib/mission'

const COLOR = '#22e4ff'

const file = ref(null)
const doc = ref(null)
const pages = ref(0)
const selected = ref([])
const spec = ref('')
const specError = ref('')
const loaded = ref(0)
const localError = ref('')
const grid = ref(null)
const hold = ref(null)
const { busy, error, run } = useMission()
const anims = []

let painting = false
let paintOn = true
let handled = false

const selSet = computed(() => new Set(selected.value))
const count = computed(() => selected.value.length)
const canRun = computed(() => count.value > 0 && !busy.value && !specError.value)

function setSelection(list, { keepSpec = false } = {}) {
  selected.value = [...new Set(list)].sort((a, b) => a - b)
  if (!keepSpec) spec.value = formatSpec(selected.value)
  specError.value = ''
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
    setSelection([])
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
  setSelection([])
}

function apply(page, on) {
  const has = selSet.value.has(page)
  if (on === has) return
  setSelection(on ? [...selected.value, page] : selected.value.filter((p) => p !== page))
  if (on) {
    sfx.lock()
    const el = grid.value && grid.value.querySelector(`[data-page="${page}"]`)
    if (el) {
      const c = center(el)
      burst(c.x, c.y, { color: COLOR, count: 12, power: 4, life: 28, size: 2.4 })
    }
  } else {
    sfx.unlock()
  }
}

function onPointerDown(event, page) {
  if (busy.value || event.pointerType !== 'mouse' || event.button !== 0) return
  event.preventDefault()
  painting = true
  handled = true
  paintOn = !selSet.value.has(page)
  apply(page, paintOn)
}

function onPointerEnter(page) {
  if (painting && !busy.value) apply(page, paintOn)
}

function onClick(page) {
  if (handled) {
    handled = false
    return
  }
  if (!busy.value) apply(page, !selSet.value.has(page))
}

function stopPainting() {
  painting = false
  setTimeout(() => {
    handled = false
  }, 0)
}

onMounted(() => window.addEventListener('pointerup', stopPainting))
onBeforeUnmount(() => window.removeEventListener('pointerup', stopPainting))

function onSpec() {
  const parsed = parseSpec(spec.value, pages.value)
  if (parsed.error) {
    specError.value = `Plage non reconnue : « ${parsed.error} » (le document compte ${plural(pages.value, 'page', 'pages')}).`
    return
  }
  setSelection(parsed.pages, { keepSpec: true })
}

const all = () => setSelection(Array.from({ length: pages.value }, (_, i) => i + 1))
const none = () => setSelection([])
const odd = () => setSelection(Array.from({ length: pages.value }, (_, i) => i + 1).filter((p) => p % 2 === 1))
const even = () => setSelection(Array.from({ length: pages.value }, (_, i) => i + 1).filter((p) => p % 2 === 0))
const invert = () => setSelection(Array.from({ length: pages.value }, (_, i) => i + 1).filter((p) => !selSet.value.has(p)))

watch(selected, () => {
  loaded.value = 0
})

// --- Animation : les pages verrouillees quittent le document pour la soute
function cancelAnims() {
  anims.splice(0).forEach((a) => a.cancel())
}

async function load_() {
  sfx.charge(1.3)
  const target = center(hold.value)
  const tiles = selected.value
    .map((p) => grid.value.querySelector(`[data-page="${p}"]`))
    .filter((el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight
    })
    .slice(0, 36)
  const step = Math.min(110, 1300 / Math.max(1, tiles.length))
  let arrived = 0
  await Promise.all(
    tiles.map((el, i) => {
      const r = el.getBoundingClientRect()
      const dx = target.x - (r.left + r.width / 2)
      const dy = target.y - (r.top + r.height / 2)
      return play(
        el,
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'brightness(1)' },
          { transform: 'translate(0, -1.4rem) scale(1.1) rotate(-3deg)', filter: 'brightness(1.6)', offset: 0.25 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(18deg)`, opacity: 0.2, filter: 'brightness(2.5)' },
        ],
        { duration: 800, delay: i * step, easing: 'cubic-bezier(0.5, 0, 0.8, 0.5)', fill: 'forwards' },
        anims,
      ).then(() => {
        arrived += 1
        loaded.value = Math.min(count.value, Math.round((arrived / tiles.length) * count.value))
        burst(target.x, target.y, { color: COLOR, count: 8, power: 3.5, life: 22, size: 2 })
        sfx.drop()
      })
    }),
  )
  loaded.value = count.value
  sfx.boom()
  ring(target.x, target.y, { color: COLOR, radius: 220, life: 40, width: 5 })
  burst(target.x, target.y, { color: '#ffffff', count: 40, power: 9, life: 46 })
  shake(document.body, 8, 360)
  tiles.forEach((el) => {
    el.getAnimations().forEach((a) => a.cancel())
    el.animate([{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' })
  })
  anims.length = 0
}

async function extract() {
  if (!canRun.value) return
  cancelAnims()
  const total = count.value
  const wanted = formatSpec(selected.value).replace(/\s/g, '')
  await run({
    kind: 'extract',
    title: 'Extraction',
    color: COLOR,
    request: () => api.extract(file.value, wanted),
    animate: load_,
    xp: () => Math.min(120, 30 + total * 3),
    reset: () => {
      cancelAnims()
      loaded.value = 0
    },
  })
}
</script>

<template>
  <section class="view extract">
    <header class="view-head">
      <h1>Extraction</h1>
      <p>
        Verrouillez les pages utiles : cliquez, ou glissez la souris pour en cibler plusieurs d'un coup. Elles partent
        ensuite dans la soute pour former un nouveau PDF.
      </p>
    </header>

    <p v-if="localError || error" class="alert" role="alert">{{ localError || error }}</p>

    <div v-if="!doc" class="intro panel">
      <DropZone title="Déposez le PDF à explorer" hint="ou cliquez pour parcourir" @files="load" @reject="onReject" />
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

        <div class="toolbar">
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="all">Tout</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="none">Aucune</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="odd">Impaires</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="even">Paires</button>
          <button type="button" class="btn btn-ghost btn-small" :disabled="busy" @click="invert">Inverser</button>
        </div>

        <label class="field range">
          <span>Pages</span>
          <input v-model="spec" type="text" inputmode="numeric" placeholder="Exemple : 1-3, 5, 8-" :disabled="busy" @input="onSpec" />
        </label>
        <p v-if="specError" class="hint err" role="alert">{{ specError }}</p>

        <div ref="grid" class="grid" :class="{ focus: count > 0 }" role="group" aria-label="Pages du document">
          <button
            v-for="p in pages"
            :key="p"
            type="button"
            class="tile"
            :class="{ on: selSet.has(p) }"
            :aria-pressed="selSet.has(p)"
            :aria-label="`Page ${p}`"
            :data-page="p"
            @pointerdown="onPointerDown($event, p)"
            @pointerenter="onPointerEnter(p)"
            @click="onClick(p)"
          >
            <PageCard :doc="doc" :page="p" :width="170" />
            <span class="num">{{ p }}</span>
            <span class="reticle" aria-hidden="true"><i /><i /><i /><i /></span>
            <span class="scan" aria-hidden="true" />
          </button>
        </div>
      </div>

      <aside class="side panel">
        <h2>Soute</h2>
        <div ref="hold" class="hold" :class="{ full: loaded > 0 && loaded === count }">
          <span class="sheet s1" />
          <span class="sheet s2" />
          <span class="sheet s3" />
          <div class="read">
            <strong>{{ busy || loaded ? loaded : count }}</strong>
            <span>{{ (busy || loaded ? loaded : count) > 1 ? 'pages' : 'page' }}</span>
          </div>
        </div>
        <p class="spec-view">{{ count ? formatSpec(selected) : 'Aucune page verrouillée.' }}</p>
        <button type="button" class="btn btn-primary" :disabled="!canRun" @click="extract">
          {{ busy ? 'Extraction en cours…' : count ? `Extraire ${plural(count, 'page', 'pages')}` : 'Verrouillez une page' }}
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
  grid-template-columns: 1fr minmax(15rem, 18rem);
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
  margin-bottom: 0.9rem;
}
.range {
  display: flex;
  max-width: 28rem;
  margin-bottom: 0.4rem;
}
.hint {
  margin-bottom: 0.6rem;
  font-size: 0.92rem;
}
.hint.err {
  color: #ffb3bf;
}

/* ---------- Grille de pages ---------- */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 1.3rem;
  padding: 1rem 0.2rem 1rem;
  user-select: none;
}
.tile {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: crosshair;
  transition: transform 0.25s cubic-bezier(0.3, 1.4, 0.5, 1), filter 0.25s, opacity 0.25s;
}
.grid.focus .tile:not(.on) {
  opacity: 0.5;
  filter: saturate(0.5);
}
.tile:hover {
  transform: translateY(-0.25rem);
}
.tile.on {
  transform: translateY(-0.35rem) scale(1.03);
  filter: drop-shadow(0 0 1rem var(--glow));
}
.tile:focus-visible {
  outline-offset: 6px;
}
.num {
  position: absolute;
  left: 0.4rem;
  bottom: 0.4rem;
  min-width: 1.6rem;
  padding: 0 0.35rem;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text);
  background: rgba(5, 7, 26, 0.85);
}
.tile.on .num {
  color: #05071a;
  background: var(--accent);
}

/* Reticule de verrouillage : 4 coins qui se resserrent */
.reticle i {
  position: absolute;
  width: 1.1rem;
  height: 1.1rem;
  border: 0 solid var(--accent);
  opacity: 0;
  transition: inset 0.3s cubic-bezier(0.2, 1.5, 0.4, 1), opacity 0.2s;
  filter: drop-shadow(0 0 0.3rem var(--accent));
}
.reticle i:nth-child(1) {
  top: -1.2rem;
  left: -1.2rem;
  border-width: 3px 0 0 3px;
}
.reticle i:nth-child(2) {
  top: -1.2rem;
  right: -1.2rem;
  border-width: 3px 3px 0 0;
}
.reticle i:nth-child(3) {
  bottom: -1.2rem;
  left: -1.2rem;
  border-width: 0 0 3px 3px;
}
.reticle i:nth-child(4) {
  bottom: -1.2rem;
  right: -1.2rem;
  border-width: 0 3px 3px 0;
}
.tile.on .reticle i {
  opacity: 1;
}
.tile.on .reticle i:nth-child(1) {
  top: -0.35rem;
  left: -0.35rem;
}
.tile.on .reticle i:nth-child(2) {
  top: -0.35rem;
  right: -0.35rem;
}
.tile.on .reticle i:nth-child(3) {
  bottom: -0.35rem;
  left: -0.35rem;
}
.tile.on .reticle i:nth-child(4) {
  bottom: -0.35rem;
  right: -0.35rem;
}
.scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  opacity: 0;
  background: linear-gradient(90deg, transparent, var(--accent), #fff, var(--accent), transparent);
  box-shadow: 0 0 0.9rem var(--accent);
  pointer-events: none;
}
.tile.on .scan {
  animation: scan 0.7s ease-out;
}
@keyframes scan {
  0% {
    top: 0;
    opacity: 1;
  }
  100% {
    top: 100%;
    opacity: 0;
  }
}

/* ---------- Soute ---------- */

.side {
  position: sticky;
  top: calc(var(--hud-h) + 1rem);
  display: grid;
  justify-items: center;
  gap: 1rem;
  padding: 1.4rem 1.2rem;
  text-align: center;
}
.side h2 {
  justify-self: start;
  font-size: 1.4rem;
}
.hold {
  position: relative;
  display: grid;
  place-items: center;
  width: 9rem;
  height: 11rem;
  transition: filter 0.3s;
}
.hold .sheet {
  position: absolute;
  inset: 0.4rem 0.9rem;
  background: linear-gradient(160deg, #eef3ff, #c9d6ff);
  box-shadow: 0 0.4rem 1rem rgba(0, 0, 0, 0.5);
}
.hold .s1 {
  transform: rotate(-7deg) translate(-0.5rem, 0.2rem);
  opacity: 0.55;
}
.hold .s2 {
  transform: rotate(5deg) translate(0.5rem, 0);
  opacity: 0.75;
}
.hold .s3 {
  outline: 2px solid var(--accent);
  box-shadow: 0 0 1.4rem var(--glow);
}
.hold.full {
  filter: drop-shadow(0 0 1.4rem var(--glow));
}
.read {
  position: relative;
  display: grid;
  justify-items: center;
  line-height: 1;
  font-family: var(--font-display);
  color: #05071a;
}
.read strong {
  font-size: 2.8rem;
}
.read span {
  margin-top: 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.spec-view {
  min-height: 2.8rem;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--dim);
  font-size: 0.95rem;
}
.side .btn {
  width: 100%;
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
