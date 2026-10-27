import { ref } from 'vue'
import { addXp, state } from './store'
import { sfx } from './audio'
import { reducedMotion } from './fx'

// Orchestre une mission : requete a l'API et animation jouees en parallele,
// puis attribution de l'XP et ouverture de la fenetre de victoire.
export function useMission() {
  const busy = ref(false)
  const error = ref('')

  async function run({ kind, title, color, request, animate, xp, reset }) {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    try {
      const [result] = await Promise.all([request(), animate()])
      const reward = addXp(xp(result))
      state.result = {
        ...result,
        kind,
        title,
        color,
        xp: reward.gained,
        level: reward.level,
        levelUp: reward.levelUp,
      }
      return result
    } catch (e) {
      error.value = (e && e.message) || 'Une erreur est survenue.'
      sfx.error()
      if (reset) reset()
      return null
    } finally {
      busy.value = false
    }
  }

  return { busy, error, run }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Joue une animation Web Animations et attend sa fin (ou son annulation).
export function play(el, keyframes, options, tracker) {
  const opts = reducedMotion() ? { ...options, duration: 1, delay: 0 } : options
  const animation = el.animate(keyframes, opts)
  if (tracker) tracker.push(animation)
  return animation.finished.catch(() => {})
}
