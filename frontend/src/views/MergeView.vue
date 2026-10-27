<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import DropZone from '../components/DropZone.vue'
import PageCard from '../components/PageCard.vue'
import { openPdf } from '../lib/pdfjs'
import * as api from '../lib/api'
import { sfx } from '../lib/audio'
import { burst, center, ring, shake } from '../lib/fx'
import { formatSize, plural, state } from '../lib/store'
import { play, useMission } from '../lib/mission'
import { tilt, untilt } from '../lib/tilt'

const COLOR = '#ff9f1c'
const PALETTE = ['#ff9f1c', '#22e4ff', '#ff2e63', '#9b8cff', '#4dffb0', '#ffd23f']

const items = ref([])
const loading = ref(0)
const charging = ref(false)
const fused = ref(false)
const absorbed = ref(false)
const localError = ref('')
const dz = ref(null)
const chain = ref(null)
const reactor = ref(null)
const { busy, error, run } = useMission()
const anims = []
let uid = 0
let lastResult = null

const totalPages = computed(() => items.value.reduce((sum, it) => sum + it.pages, 0))
const totalBytes = computed(() => items.value.reduce((sum, it) => sum + it.file.size, 0))
const limitBytes = computed(() => state.maxUploadMb * 1024 * 1024)
const overLimit = computed(() => totalBytes.value > limitBytes.value)
const canFuse = computed(() => items.value.length >= 2 && !overLimit.value && !busy.value && !fused.value)
const ghosts = computed(() => Math.max(0, 2 - items.value.length))

function fanPages(item) {
  const n = Math.min(3, item.pages)
  return Array.from({ length: n }, (_, j) => n - j) // du fond (3) vers le devant (1)
}

async function addFiles(files) {
  localError.value = ''
  error.value = ''
  if (items.value.length + files.length > state.maxFiles) {
    localError.value = `Vous pouvez fusionner ${state.maxFiles} fichiers au maximum.`
    files = files.slice(0, Math.max(0, state.maxFiles - items.value.length))
  }
  loading.value += files.length
  const opened = await Promise.allSettled(files.map((f) => openPdf(f)))
  loading.value -= files.length
  const fresh = []
  opened.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      fresh.push({
        id: ++uid,
        file: files[i],
        doc: res.value,
        pages: res.value.numPages,
        color: PALETTE[(uid - 1) % PALETTE.length],
        batch: fresh.length,
      })
    } else {
      localError.value = res.reason.message
    }
  })
  if (fresh.length) items.value.push(...fresh)
}

function onReject(count) {
  localError.value = `${plural(count, 'fichier ignoré', 'fichiers ignorés')} : seuls les PDF sont acceptés.`
}

function remove(index) {
  sfx.unlock()
  items.value.splice(index, 1)
}

function move(index, dir) {
  const to = index + dir
  if (to < 0 || to >= items.value.length) return
  sfx.swap()
  const [it] = items.value.splice(index, 1)
  items.value.splice(to, 0, it)
}

// --- Vol d'un document depuis le portail jusqu'a son emplacement dans la chaine
function onEnter(el, done) {
  if (!el.dataset.fresh) return done()
  const from = dz.value ? center(dz.value.el) : { x: window.innerWidth / 2, y: 0 }
  const r = el.getBoundingClientRect()
  const dx = from.x - (r.left + r.width / 2)
  const dy = from.y - (r.top + r.height / 2)
  const delay = Number(el.dataset.batch || 0) * 160
  const flight = el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.2) rotate(-28deg)`, opacity: 0, filter: 'brightness(3) blur(5px)' },
      { opacity: 1, offset: 0.2 },
      { transform: 'translate(0, 0) scale(1.1) rotate(2deg)', filter: 'brightness(1.5)', offset: 0.82 },
      { transform: 'translate(0, 0) scale(1) rotate(0)', filter: 'brightness(1)' },
    ],
    { duration: 950, delay, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)', fill: 'backwards' },
  )
  flight.finished.then(done, done)
}

function onLanded(el) {
  if (!el.dataset.fresh) return
  const c = center(el)
  const color = el.dataset.color || COLOR
  burst(c.x, c.y, { color, count: 26, power: 6 })
  ring(c.x, c.y, { color, radius: 110, life: 30 })
  sfx.dock()
  shake(el, 6, 260)
}

function pinLeaving(el) {
  el.style.left = `${el.offsetLeft}px`
  el.style.top = `${el.offsetTop}px`
  el.style.width = `${el.offsetWidth}px`
}

// --- Fusion : chaque document est aspire par le noyau
function cancelAnims() {
  anims.splice(0).forEach((a) => a.cancel())
}

async function absorb() {
  sfx.charge(1.5)
  charging.value = true
  await nextTick()
  const target = center(reactor.value)
  const els = Array.from(chain.value.querySelectorAll('.seg'))
  await Promise.all(
    els.map((el, i) => {
      const r = el.getBoundingClientRect()
      const dx = target.x - (r.left + r.width / 2)
      const dy = target.y - (r.top + r.height / 2)
      const color = el.dataset.color || COLOR
      return play(
        el,
        [
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
          { transform: `translate(${dx * 0.18}px, ${dy * 0.18 - 36}px) scale(1.08) rotate(-4deg)`, opacity: 1, filter: 'brightness(1.5)', offset: 0.28 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(${i % 2 ? 540 : -540}deg)`, opacity: 0, filter: 'brightness(3)' },
        ],
        { duration: 950, delay: i * 190, easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)', fill: 'forwards' },
        anims,
      ).then(() => {
        burst(target.x, target.y, { color, count: 18, power: 5 })
        ring(target.x, target.y, { color, radius: 90, life: 24, width: 2 })
        sfx.lock()
      })
    }),
  )
  sfx.boom()
  burst(target.x, target.y, { color: '#ffffff', count: 60, power: 11, life: 55 })
  ring(target.x, target.y, { color: COLOR, radius: 320, life: 46, width: 6 })
  shake(document.body, 10, 420)
  absorbed.value = true
  fused.value = true
  charging.value = false
  cancelAnims()
}

async function fuse() {
  if (!canFuse.value) return
  cancelAnims()
  const count = items.value.length
  const result = await run({
    kind: 'merge',
    title: 'Fusion',
    color: COLOR,
    request: () => api.merge(items.value.map((it) => it.file)),
    animate: absorb,
    xp: () => 40 + count * 10,
    reset: () => {
      cancelAnims()
      charging.value = false
      fused.value = false
      absorbed.value = false
    },
  })
  if (result) lastResult = { ...state.result, xp: 0, levelUp: false }
}

function download() {
  if (lastResult) state.result = lastResult
}

function restart() {
  items.value = []
}

// Toute modification de la chaine ramene les documents a l'ecran.
watch(
  () => items.value.map((it) => it.id).join(','),
  () => {
    if (fused.value) {
      fused.value = false
      absorbed.value = false
      lastResult = null
    }
  },
)
</script>

<template>
  <section class="view merge">
    <header class="view-head">
      <h1>Fusion</h1>
      <p>
        Déposez vos PDF : chaque document s'envole jusqu'à la chaîne et s'ajoute à la suite des autres. L'ordre de la
        chaîne est l'ordre du fichier final.
      </p>
    </header>

    <p v-if="localError || error" class="alert" role="alert">{{ localError || error }}</p>

    <div class="arena">
      <div class="bay panel">
        <DropZone ref="dz" multiple :disabled="busy || fused" title="Déposez vos PDF" hint="ou cliquez pour parcourir" @files="addFiles" @reject="onReject" />
        <p v-if="loading" class="loading">Analyse de {{ plural(loading, 'document', 'documents') }}…</p>
      </div>

      <div ref="chain" class="chain">
        <TransitionGroup name="seg" tag="ol" class="segments" @enter="onEnter" @after-enter="onLanded" @before-leave="pinLeaving">
          <li
            v-for="(it, i) in items"
            :key="it.id"
            class="seg"
            :class="{ absorbed }"
            :style="{ '--c': it.color }"
            :data-fresh="it.batch !== undefined ? 1 : null"
            :data-batch="it.batch"
            :data-color="it.color"
          >
            <div class="seg-body" @pointermove="tilt($event, 7)" @pointerleave="untilt">
              <span class="order">{{ i + 1 }}</span>
              <div class="fan">
                <div v-for="(p, j) in fanPages(it)" :key="p" class="sheet" :style="{ '--k': fanPages(it).length - 1 - j }">
                  <PageCard :doc="it.doc" :page="p" :width="160" />
                </div>
              </div>
              <div class="meta">
                <strong :title="it.file.name">{{ it.file.name }}</strong>
                <span>{{ plural(it.pages, 'page', 'pages') }}, {{ formatSize(it.file.size) }}</span>
              </div>
              <div class="seg-actions">
                <button type="button" :disabled="busy || i === 0" aria-label="Avancer ce document" @click="move(i, -1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <button type="button" :disabled="busy || i === items.length - 1" aria-label="Reculer ce document" @click="move(i, 1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </button>
                <button type="button" :disabled="busy" aria-label="Retirer ce document" @click="remove(i)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>
          </li>
        </TransitionGroup>

        <div v-for="g in ghosts" :key="'ghost' + g" class="seg ghost" aria-hidden="true">
          <span>{{ items.length + g }}</span>
        </div>
      </div>

      <aside class="core-bay panel">
        <div ref="reactor" class="reactor" :class="{ charging, fused, armed: canFuse }">
          <i class="r r1" />
          <i class="r r2" />
          <i class="r r3" />
          <div class="readout">
            <template v-if="fused">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span>{{ plural(totalPages, 'page', 'pages') }}</span>
            </template>
            <template v-else>
              <strong>{{ totalPages }}</strong>
              <span>{{ totalPages > 1 ? 'pages' : 'page' }}</span>
            </template>
          </div>
        </div>

        <p class="weight" :class="{ over: overLimit }">
          {{ formatSize(totalBytes) }} sur {{ state.maxUploadMb.toString().replace('.', ',') }} Mo
        </p>
        <p v-if="overLimit" class="alert small" role="alert">Le poids total dépasse la limite du serveur. Retirez un document.</p>

        <div class="cta">
          <button v-if="!fused" type="button" class="btn btn-primary" :disabled="!canFuse" @click="fuse">
            {{ busy ? 'Fusion en cours…' : items.length >= 2 ? `Fusionner ${items.length} fichiers` : 'Ajoutez 2 fichiers' }}
          </button>
          <template v-else>
            <button type="button" class="btn btn-primary" @click="download">Télécharger le PDF</button>
            <button type="button" class="btn btn-ghost" @click="restart">Nouvelle fusion</button>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.arena {
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) 1fr minmax(15rem, 18rem);
  gap: 1.6rem;
  align-items: start;
  perspective: 1600px;
}
.bay {
  padding: 0.4rem;
}
.loading {
  padding: 0 1rem 1rem;
  text-align: center;
  color: var(--accent);
}

/* ---------- Chaine de documents ---------- */

.chain {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 1.8rem 2.2rem;
  min-height: 21rem;
  padding: 0.4rem 0.2rem;
}
.segments {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}
.seg {
  position: relative;
  width: 11.5rem;
  list-style: none;
}
.seg:not(.ghost)::after {
  /* joint lumineux entre deux documents */
  content: '+';
  position: absolute;
  right: -1.7rem;
  top: 38%;
  display: grid;
  place-items: center;
  width: 1.3rem;
  height: 1.3rem;
  border-radius: 50%;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.9rem;
  line-height: 1;
  color: #05071a;
  background: var(--c);
  box-shadow: 0 0 0.9rem var(--c);
}
.seg:last-of-type::after {
  display: none;
}
.seg.absorbed {
  visibility: hidden;
}
.seg-body {
  --rx: 0deg;
  --ry: 0deg;
  position: relative;
  padding: 0.9rem 0.8rem 0.7rem;
  background: linear-gradient(170deg, rgba(24, 34, 92, 0.9), rgba(9, 13, 42, 0.92));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 55%, transparent), 0 0 1.4rem color-mix(in srgb, var(--c) 28%, transparent);
  transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry));
  transition: transform 0.15s ease-out;
  transform-style: preserve-3d;
}
.order {
  position: absolute;
  top: -0.7rem;
  left: -0.7rem;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  font-family: var(--font-display);
  font-weight: 700;
  color: #05071a;
  background: var(--c);
  clip-path: polygon(20% 0, 100% 0, 80% 100%, 0 100%);
}
.fan {
  position: relative;
  height: 9.4rem;
  margin-bottom: 0.6rem;
}
.sheet {
  position: absolute;
  left: 50%;
  top: 0;
  width: 6.7rem;
  margin-left: -3.35rem;
  z-index: calc(3 - var(--k));
  transform: translate(calc(var(--k) * 0.75rem), calc(var(--k) * -0.45rem)) rotate(calc(var(--k) * 4deg));
  filter: brightness(calc(1 - var(--k) * 0.18));
}
.meta {
  display: grid;
  gap: 0.1rem;
  font-size: 0.88rem;
  color: var(--dim);
}
.meta strong {
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.seg-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
}
.seg-actions button {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.2s;
}
.seg-actions button:not(:disabled):hover {
  background: var(--soft);
}
.seg-actions button:disabled {
  opacity: 0.3;
  cursor: default;
}
.seg-actions svg {
  width: 1.1rem;
}

.ghost {
  display: grid;
  place-items: center;
  height: 17rem;
  border: 2px dashed color-mix(in srgb, var(--accent) 40%, transparent);
  color: color-mix(in srgb, var(--accent) 55%, transparent);
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 700;
  animation: breathe 2.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    border-color: var(--accent);
    box-shadow: 0 0 1.4rem var(--soft);
  }
}

/* Entrees et sorties dans la chaine */
.seg-move {
  transition: transform 0.55s cubic-bezier(0.3, 1.2, 0.4, 1);
}
.seg-leave-active {
  position: absolute;
  transition: opacity 0.3s, transform 0.3s;
}
.seg-leave-to {
  opacity: 0;
  transform: scale(0.6) translateY(-1rem);
}

/* ---------- Noyau de fusion ---------- */

.core-bay {
  display: grid;
  justify-items: center;
  gap: 0.9rem;
  padding: 1.6rem 1.2rem 1.4rem;
  text-align: center;
}
.reactor {
  position: relative;
  display: grid;
  place-items: center;
  width: 11rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 68%);
  transition: transform 0.4s, filter 0.4s;
}
.r {
  position: absolute;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--accent);
  border-left-color: color-mix(in srgb, var(--accent) 40%, transparent);
  animation: spin 9s linear infinite;
  filter: drop-shadow(0 0 0.5rem var(--glow));
  opacity: 0.55;
  transition: opacity 0.4s;
}
.r1 {
  inset: 0;
}
.r2 {
  inset: 0.9rem;
  animation-duration: 5s;
  animation-direction: reverse;
  border-style: dashed;
}
.r3 {
  inset: 1.9rem;
  animation-duration: 3s;
}
.reactor.armed .r {
  opacity: 1;
}
.reactor.armed {
  animation: armed 1.6s ease-in-out infinite;
}
.reactor.charging {
  animation: none;
  transform: scale(1.14);
  filter: brightness(1.5) drop-shadow(0 0 2rem var(--glow));
}
.reactor.charging .r {
  animation-duration: 0.7s;
  opacity: 1;
}
.reactor.fused {
  filter: drop-shadow(0 0 1.6rem var(--glow));
}
.readout {
  position: relative;
  display: grid;
  justify-items: center;
  line-height: 1;
  font-family: var(--font-display);
}
.readout strong {
  font-size: 3rem;
}
.readout span {
  margin-top: 0.3rem;
  color: var(--dim);
  font-size: 1rem;
}
.readout svg {
  width: 2.6rem;
  color: var(--ok);
  filter: drop-shadow(0 0 0.5rem rgba(77, 255, 176, 0.6));
}
.weight {
  color: var(--dim);
  font-size: 0.95rem;
}
.weight.over {
  color: var(--danger);
}
.alert.small {
  margin: 0;
  font-size: 0.9rem;
  text-align: left;
}
.cta {
  display: grid;
  gap: 0.6rem;
  width: 100%;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes armed {
  50% {
    transform: scale(1.04);
  }
}

@media (max-width: 1100px) {
  .arena {
    grid-template-columns: 1fr;
  }
  .core-bay {
    order: 3;
  }
}
</style>
