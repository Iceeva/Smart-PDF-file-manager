import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { markRaw } from 'vue'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Ouvre un PDF cote navigateur pour en afficher les miniatures.
// markRaw : pdf.js utilise des champs prives que le proxy reactif de Vue casserait.
export async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  try {
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
    return markRaw(doc)
  } catch (error) {
    if (error && error.name === 'PasswordException') {
      throw new Error(`« ${file.name} » est protégé par un mot de passe.`)
    }
    throw new Error(`« ${file.name} » est illisible ou n'est pas un PDF valide.`)
  }
}

// File d'attente : 3 rendus en parallele au maximum pour garder l'interface fluide.
const MAX_PARALLEL = 3
let running = 0
const waiting = []

function schedule(job) {
  return new Promise((resolve, reject) => {
    const run = () => {
      running += 1
      job()
        .then(resolve, reject)
        .finally(() => {
          running -= 1
          const next = waiting.shift()
          if (next) next()
        })
    }
    if (running < MAX_PARALLEL) run()
    else waiting.push(run)
  })
}

export function renderPage(doc, number, canvas, cssWidth, isCancelled = () => false) {
  return schedule(async () => {
    if (isCancelled()) return
    const page = await doc.getPage(number)
    const base = page.getViewport({ scale: 1 })
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5)
    const viewport = page.getViewport({ scale: (cssWidth * ratio) / base.width })
    if (isCancelled()) return
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    page.cleanup()
  })
}
