// Inclinaison 3D d'un element en fonction du pointeur (variables CSS --rx et --ry).
export function tilt(event, max = 8) {
  const el = event.currentTarget
  const r = el.getBoundingClientRect()
  const px = (event.clientX - r.left) / r.width - 0.5
  const py = (event.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--ry', `${(px * max * 2).toFixed(2)}deg`)
  el.style.setProperty('--rx', `${(-py * max * 2).toFixed(2)}deg`)
}

export function untilt(event) {
  const el = event.currentTarget
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}
