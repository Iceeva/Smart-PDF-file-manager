// Lecture et ecriture des plages de pages : « 1-3, 5, 8- ».

const TOKEN = /^(\d*)\s*(-)?\s*(\d*)$/

// Renvoie { pages: [1, 2, 3, 5] } (tri croissant, sans doublon) ou { error: "jeton fautif" }.
export function parseSpec(text, total) {
  const found = new Set()
  for (const raw of String(text || '').split(/[,;]/)) {
    const token = raw.trim()
    if (!token) continue
    const match = TOKEN.exec(token)
    if (!match || (!match[1] && !match[3])) return { error: token }
    let start
    let end
    if (!match[2]) {
      start = end = Number(match[1])
    } else {
      start = match[1] ? Number(match[1]) : 1
      end = match[3] ? Number(match[3]) : total
    }
    if (start < 1 || end > total || start > end) return { error: token }
    for (let p = start; p <= end; p++) found.add(p)
  }
  return { pages: [...found].sort((a, b) => a - b) }
}

// [1, 2, 3, 5, 7, 8] devient « 1-3, 5, 7-8 ».
export function formatSpec(pages) {
  const sorted = [...pages].sort((a, b) => a - b)
  const out = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : `${sorted[i]}`)
    i = j + 1
  }
  return out.join(', ')
}
