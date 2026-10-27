import { reactive, watch } from 'vue'

const KEY = 'fileflow.profile.v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

const saved = load()

export const state = reactive({
  xp: Number(saved.xp) || 0,
  missions: Number(saved.missions) || 0,
  sound: saved.sound !== false,
  mission: 'merge',
  result: null, // resultat affiche dans la fenetre de victoire
  online: null, // null = inconnu, true ou false apres le test de l'API
  maxUploadMb: 4,
  maxFiles: 20,
})

watch(
  () => [state.xp, state.missions, state.sound],
  () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ xp: state.xp, missions: state.missions, sound: state.sound }),
      )
    } catch {
      /* stockage indisponible : on ignore */
    }
  },
)

export const MISSIONS = [
  { id: 'merge', name: 'Fusion', title: 'Réunir des PDF en un seul', color: '#ff9f1c', key: '1' },
  { id: 'split', name: 'Découpe', title: 'Trancher un PDF en plusieurs fichiers', color: '#ff2e63', key: '2' },
  { id: 'extract', name: 'Extraction', title: 'Prélever les pages utiles', color: '#22e4ff', key: '3' },
  { id: 'reorder', name: 'Réorganisation', title: "Remettre les pages dans l'ordre", color: '#9b8cff', key: '4' },
]

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0]
}

const RANKS = [
  'Stagiaire',
  'Archiviste',
  'Pilote de dossiers',
  'Capitaine des PDF',
  'Commandant',
  'Légende',
]

export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1
  const base = 100 * (level - 1) ** 2
  const need = 100 * (2 * level - 1)
  return {
    level,
    into: xp - base,
    need,
    ratio: Math.min(1, (xp - base) / need),
    rank: RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 2))],
  }
}

export function addXp(amount) {
  const before = levelInfo(state.xp).level
  state.xp += amount
  state.missions += 1
  const after = levelInfo(state.xp).level
  return { gained: amount, level: after, levelUp: after > before }
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`
}
