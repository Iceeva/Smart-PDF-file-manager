const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function request(path, options) {
  let response
  try {
    response = await fetch(`${BASE}/api${path}`, options)
  } catch {
    throw new Error("Serveur injoignable. Vérifiez votre connexion ou le lancement de l'API.")
  }
  if (!response.ok) {
    let message
    if (response.status === 413) {
      message = 'Les fichiers sont trop volumineux pour le serveur.'
    } else {
      try {
        const body = await response.json()
        message = typeof body.detail === 'string' ? body.detail : 'Requête refusée par le serveur.'
      } catch {
        message = `Erreur du serveur (${response.status}).`
      }
    }
    throw new Error(message)
  }
  return response
}

function filenameOf(response, fallback) {
  const header = response.headers.get('Content-Disposition') || ''
  const match = /filename="?([^";]+)"?/i.exec(header)
  return match ? match[1] : fallback
}

async function toResult(response, fallback) {
  const blob = await response.blob()
  return {
    blob,
    size: blob.size,
    filename: filenameOf(response, fallback),
    pages: Number(response.headers.get('X-Pages')) || null,
    parts: Number(response.headers.get('X-Parts')) || null,
  }
}

export async function health() {
  const response = await request('/health')
  return response.json()
}

export async function merge(files) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file, file.name))
  return toResult(await request('/merge', { method: 'POST', body: form }), 'fileflow-fusion.pdf')
}

export async function extract(file, pages) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('pages', pages)
  return toResult(await request('/extract', { method: 'POST', body: form }), 'fileflow-extrait.pdf')
}

export async function reorder(file, order) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('order', order)
  return toResult(await request('/reorder', { method: 'POST', body: form }), 'fileflow-reordonne.pdf')
}

export async function split(file, ranges) {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('ranges', ranges)
  return toResult(await request('/split', { method: 'POST', body: form }), 'fileflow-decoupe.zip')
}
