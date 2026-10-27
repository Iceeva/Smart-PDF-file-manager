<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BackgroundCanvas from './components/BackgroundCanvas.vue'
import FxLayer from './components/FxLayer.vue'
import ResultModal from './components/ResultModal.vue'
import Splash from './components/Splash.vue'
import MergeView from './views/MergeView.vue'
import SplitView from './views/SplitView.vue'
import ExtractView from './views/ExtractView.vue'
import ReorderView from './views/ReorderView.vue'
import { health } from './lib/api'
import { sfx, unlockAudio } from './lib/audio'
import { MISSIONS, levelInfo, missionById, state } from './lib/store'

const views = { merge: MergeView, split: SplitView, extract: ExtractView, reorder: ReorderView }
const entered = ref(false)
const fullscreen = ref(false)

const mission = computed(() => missionById(state.mission))
const level = computed(() => levelInfo(state.xp))

function applyAccent() {
  document.documentElement.style.setProperty('--accent', mission.value.color)
}
watch(mission, applyAccent, { immediate: true })

function go(id) {
  if (id === state.mission) return
  sfx.warp()
  state.mission = id
}

function enter(wantFullscreen) {
  unlockAudio()
  sfx.boot()
  entered.value = true
  if (wantFullscreen) toggleFullscreen()
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
}

function toggleSound() {
  state.sound = !state.sound
  if (state.sound) {
    unlockAudio()
    sfx.click()
  }
}

function onKey(event) {
  if (!entered.value || event.ctrlKey || event.metaKey || event.altKey) return
  const tag = (event.target && event.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  const target = MISSIONS.find((m) => m.key === event.key)
  if (target) go(target.id)
}

function onFullscreenChange() {
  fullscreen.value = !!document.fullscreenElement
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  try {
    const info = await health()
    state.online = true
    if (info.maxUploadMb) state.maxUploadMb = info.maxUploadMb
    if (info.maxFiles) state.maxFiles = info.maxFiles
  } catch {
    state.online = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<template>
  <BackgroundCanvas :accent="mission.color" />
  <FxLayer />

  <div class="shell" :inert="!entered">
    <header class="hud">
      <div class="brand">
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path d="M16 12h22l10 10v28a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" fill="#141c58" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" />
          <path d="M38 12v10h10" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" />
          <path d="M20 34h24M20 43h15" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" />
        </svg>
        <span>FileFlow</span>
      </div>

      <p class="link" :class="{ off: state.online === false }" role="status">
        <i />
        {{ state.online === false ? 'API hors ligne' : state.online ? 'API connectée' : 'Connexion…' }}
      </p>

      <div class="pilot">
        <div class="rank">
          <strong>Niveau {{ level.level }}</strong>
          <span>{{ level.rank }}</span>
        </div>
        <div
          class="xp"
          role="progressbar"
          :aria-valuenow="level.into"
          :aria-valuemin="0"
          :aria-valuemax="level.need"
          :aria-label="`Expérience : ${level.into} sur ${level.need}`"
        >
          <b :style="{ width: level.ratio * 100 + '%' }" />
          <em>{{ level.into }} / {{ level.need }} XP</em>
        </div>
        <button type="button" class="icon" :aria-pressed="state.sound" :aria-label="state.sound ? 'Couper le son' : 'Activer le son'" @click="toggleSound">
          <svg v-if="state.sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>
        </button>
        <button type="button" class="icon" :aria-pressed="fullscreen" :aria-label="fullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'" @click="toggleFullscreen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path v-if="!fullscreen" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            <path v-else d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          </svg>
        </button>
      </div>
    </header>

    <main id="main" class="stage">
      <Transition name="warp" mode="out-in">
        <KeepAlive>
          <component :is="views[state.mission]" :key="state.mission" />
        </KeepAlive>
      </Transition>
    </main>

    <nav class="dock" aria-label="Missions">
      <button
        v-for="m in MISSIONS"
        :key="m.id"
        type="button"
        class="slot"
        :class="{ active: state.mission === m.id }"
        :style="{ '--m': m.color }"
        :aria-current="state.mission === m.id ? 'page' : undefined"
        :title="m.title"
        @click="go(m.id)"
        @pointerenter="sfx.hover()"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <template v-if="m.id === 'merge'"><path d="M4 5h5l3 4v9" /><path d="M20 5h-5l-3 4" /><path d="M9 16l3 3 3-3" /></template>
          <template v-else-if="m.id === 'split'"><path d="M12 3v8" /><path d="M12 11l-6 7" /><path d="M12 11l6 7" /><path d="M4 21h4M16 21h4" /></template>
          <template v-else-if="m.id === 'extract'"><circle cx="12" cy="12" r="6" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /><circle cx="12" cy="12" r="1" /></template>
          <template v-else><path d="M7 4v16" /><path d="M4 17l3 3 3-3" /><path d="M17 20V4" /><path d="M14 7l3-3 3 3" /></template>
        </svg>
        <span class="label">{{ m.name }}</span>
        <kbd>{{ m.key }}</kbd>
      </button>
    </nav>
  </div>

  <ResultModal />

  <Transition name="splash">
    <Splash v-if="!entered" @enter="enter" />
  </Transition>
</template>

<style scoped>
.shell {
  position: relative;
  z-index: 1;
}

/* ---------- Barre superieure ---------- */

.hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  height: var(--hud-h);
  padding: 0 clamp(1rem, 3vw, 3rem);
  background: linear-gradient(180deg, rgba(4, 6, 22, 0.92), rgba(4, 6, 22, 0.55));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--edge));
  backdrop-filter: blur(12px);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.5rem;
}
.brand svg {
  width: 2.2rem;
  filter: drop-shadow(0 0 0.6rem var(--glow));
}
.link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.92rem;
  color: var(--dim);
}
.link i {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0.6rem var(--ok);
}
.link.off i {
  background: var(--danger);
  box-shadow: 0 0 0.6rem var(--danger);
}
.pilot {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.rank {
  display: grid;
  text-align: right;
  line-height: 1.15;
}
.rank strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.rank span {
  color: var(--dim);
  font-size: 0.85rem;
}
.xp {
  position: relative;
  width: clamp(8rem, 14vw, 14rem);
  height: 1.3rem;
  background: rgba(255, 255, 255, 0.07);
  box-shadow: inset 0 0 0 1px var(--edge);
  clip-path: polygon(0.4rem 0, 100% 0, calc(100% - 0.4rem) 100%, 0 100%);
}
.xp b {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, #000), var(--accent));
  box-shadow: 0 0 1rem var(--glow);
  transition: width 0.9s cubic-bezier(0.2, 1, 0.3, 1);
}
.xp em {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 0.74rem;
  font-weight: 600;
  text-shadow: 0 0 0.3rem #000;
}
.icon {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  padding: 0;
  border: 0;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px var(--edge);
  cursor: pointer;
  transition: background 0.2s;
}
.icon:hover {
  background: var(--soft);
}
.icon svg {
  width: 1.3rem;
}

/* ---------- Scene ---------- */

.stage {
  min-height: 100vh;
  padding: calc(var(--hud-h) + 2rem) clamp(1rem, 4vw, 5rem) calc(var(--dock-h) + 3rem);
}

/* ---------- Barre de missions ---------- */

.dock {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  z-index: 50;
  display: flex;
  gap: 0.6rem;
  padding: 0.5rem;
  transform: translateX(-50%);
  background: rgba(6, 9, 30, 0.82);
  backdrop-filter: blur(14px);
  box-shadow: inset 0 0 0 1px var(--edge), 0 0 2.4rem rgba(0, 0, 0, 0.6);
  clip-path: polygon(0.8rem 0, calc(100% - 0.8rem) 0, 100% 0.8rem, 100% 100%, 0 100%, 0 0.8rem);
}
.slot {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  width: clamp(5.6rem, 9vw, 8.4rem);
  padding: 0.6rem 0.4rem 0.5rem;
  border: 0;
  background: rgba(255, 255, 255, 0.04);
  color: var(--dim);
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1), background 0.25s, color 0.25s, box-shadow 0.25s;
}
.slot svg {
  width: 1.7rem;
  color: var(--m);
}
.label {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text);
}
.slot kbd {
  position: absolute;
  top: 0.25rem;
  right: 0.35rem;
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--dim);
}
.slot:hover {
  transform: translateY(-0.25rem);
  background: color-mix(in srgb, var(--m) 14%, transparent);
}
.slot.active {
  transform: translateY(-0.45rem);
  background: color-mix(in srgb, var(--m) 22%, rgba(6, 9, 30, 0.9));
  box-shadow: inset 0 -3px 0 var(--m), 0 0 1.6rem color-mix(in srgb, var(--m) 45%, transparent);
}
.slot.active svg {
  filter: drop-shadow(0 0 0.5rem var(--m));
}

@media (max-width: 700px) {
  .link,
  .rank {
    display: none;
  }
  .dock {
    width: calc(100% - 1rem);
    justify-content: space-between;
  }
  .slot {
    width: auto;
    flex: 1;
  }
  .slot kbd {
    display: none;
  }
}
</style>

<style>
.splash-leave-active {
  transition: opacity 0.7s ease, transform 0.7s ease, filter 0.7s ease;
}
.splash-leave-to {
  opacity: 0;
  transform: scale(1.35);
  filter: blur(14px) brightness(2);
}
</style>
