<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['enter'])
const start = ref(null)

function onKey(event) {
  if (event.key === 'Enter') emit('enter', false)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (start.value) start.value.focus({ preventScroll: true })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="splash" role="dialog" aria-modal="true" aria-label="Bienvenue dans FileFlow">
    <div class="core">
      <svg class="emblem" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle class="orbit" cx="60" cy="60" r="54" stroke="#22e4ff" stroke-width="1.5" stroke-dasharray="6 10" />
        <g class="sheets" stroke-width="2.4" stroke-linejoin="round">
          <path class="s3" d="M38 30h30l14 14v40a5 5 0 0 1-5 5H38a5 5 0 0 1-5-5V35a5 5 0 0 1 5-5z" fill="#1a2260" stroke="#9b8cff" />
          <path class="s2" d="M44 24h30l14 14v40a5 5 0 0 1-5 5H44a5 5 0 0 1-5-5V29a5 5 0 0 1 5-5z" fill="#1d2a78" stroke="#ff2e63" />
          <path class="s1" d="M50 18h30l14 14v40a5 5 0 0 1-5 5H50a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5z" fill="#0f1844" stroke="#ff9f1c" />
        </g>
        <path d="M56 50h26M56 60h26M56 70h16" stroke="#ff9f1c" stroke-width="3.4" stroke-linecap="round" />
      </svg>

      <h1 class="logo">FileFlow</h1>
      <p class="tag">Fusionnez, tranchez, extrayez et réorganisez vos PDF dans une arène en 4K.</p>

      <ul class="boot">
        <li style="--i: 0">Noyau PDF prêt</li>
        <li style="--i: 1">Moteur de particules prêt</li>
        <li style="--i: 2">Sons synthétisés prêts</li>
      </ul>

      <div class="actions">
        <button ref="start" type="button" class="btn btn-primary" @click="emit('enter', false)">Entrer</button>
        <button type="button" class="btn btn-ghost" @click="emit('enter', true)">Entrer en plein écran</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
  background: radial-gradient(ellipse at 50% 40%, rgba(10, 16, 56, 0.55), rgba(3, 4, 14, 0.94) 70%);
  backdrop-filter: blur(6px);
}
.core {
  display: grid;
  justify-items: center;
  gap: 1rem;
  max-width: 42rem;
}
.emblem {
  width: clamp(7rem, 12vw, 11rem);
  filter: drop-shadow(0 0 1.6rem rgba(34, 228, 255, 0.45));
  animation: float 5s ease-in-out infinite;
}
.orbit {
  transform-origin: 60px 60px;
  animation: spin 22s linear infinite;
}
.sheets .s1 {
  animation: sheet 4s ease-in-out infinite;
}
.sheets .s2 {
  animation: sheet 4s ease-in-out -1.3s infinite;
}
.sheets .s3 {
  animation: sheet 4s ease-in-out -2.6s infinite;
}
.logo {
  font-size: clamp(3.6rem, 9vw, 8rem);
  letter-spacing: 0.01em;
  background: linear-gradient(100deg, #ff9f1c 0%, #ff2e63 30%, #9b8cff 55%, #22e4ff 80%, #ff9f1c 100%);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: sweep 6s linear infinite;
  filter: drop-shadow(0 0 1.6rem rgba(155, 140, 255, 0.35));
}
.tag {
  max-width: 34ch;
  font-size: 1.2rem;
  color: var(--dim);
}
.boot {
  list-style: none;
  margin: 0.4rem 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
  color: #6ee7b7;
  font-size: 0.98rem;
}
.boot li {
  overflow: hidden;
  white-space: nowrap;
  width: 0;
  margin: 0 auto;
  animation: type 0.7s steps(26, end) forwards;
  animation-delay: calc(0.5s + var(--i) * 0.45s);
}
.boot li::before {
  content: '+ ';
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.9rem;
  margin-top: 0.8rem;
}
@keyframes type {
  to {
    width: 22em;
    max-width: 100%;
  }
}
@keyframes sweep {
  to {
    background-position: -250% 0;
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes float {
  50% {
    transform: translateY(-0.6rem);
  }
}
@keyframes sheet {
  50% {
    transform: translate(-3px, -5px);
  }
}
</style>
