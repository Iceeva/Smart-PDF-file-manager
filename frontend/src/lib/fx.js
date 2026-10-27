// Moteur d'effets de particules dessine sur un canevas plein ecran (voir FxLayer.vue).

const particles = []
const rings = []
let layer = null

export function registerLayer(instance) {
  layer = instance
}

export function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function wake() {
  if (layer) layer.wake()
}

export function burst(x, y, opts = {}) {
  const { color = '#ffffff', count = 24, power = 6, gravity = 0.12, life = 42, size = 3 } = opts
  const total = reducedMotion() ? Math.min(count, 5) : count
  for (let i = 0; i < total; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = power * (0.35 + Math.random() * 0.9)
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity,
      life,
      max: life * (0.6 + Math.random() * 0.6),
      size: size * (0.6 + Math.random() * 0.9),
      color,
      kind: 'spark',
    })
  }
  wake()
}

export function ring(x, y, opts = {}) {
  const { color = '#ffffff', radius = 120, life = 34, width = 3 } = opts
  rings.push({ x, y, color, radius, life, max: life, width })
  wake()
}

export function confetti(x, y, colors = ['#ff9f1c', '#ff2e63', '#22e4ff', '#9b8cff', '#ffffff']) {
  const total = reducedMotion() ? 10 : 110
  for (let i = 0; i < total; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
    const speed = 7 + Math.random() * 12
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.28,
      life: 110,
      max: 70 + Math.random() * 60,
      size: 4 + Math.random() * 5,
      color: colors[i % colors.length],
      kind: 'bit',
      spin: (Math.random() - 0.5) * 0.4,
      rot: Math.random() * Math.PI,
    })
  }
  wake()
}

export function center(el) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function shake(el, strength = 10, duration = 380) {
  if (!el || reducedMotion()) return
  const frames = []
  for (let i = 0; i < 8; i++) {
    const k = (1 - i / 8) * strength
    frames.push({ transform: `translate(${(Math.random() - 0.5) * k}px, ${(Math.random() - 0.5) * k}px)` })
  }
  frames.push({ transform: 'translate(0, 0)' })
  el.animate(frames, { duration, easing: 'ease-out' })
}

// Avance la simulation et dessine. Renvoie true tant qu'il reste quelque chose a animer.
export function step(ctx) {
  ctx.globalCompositeOperation = 'lighter'

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.life -= 1
    if (p.life <= 0) {
      particles.splice(i, 1)
      continue
    }
    p.vx *= 0.985
    p.vy = p.vy * 0.985 + p.gravity
    p.x += p.vx
    p.y += p.vy
    const alpha = Math.max(0, Math.min(1, p.life / p.max))
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    if (p.kind === 'bit') {
      p.rot += p.spin
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    } else {
      ctx.shadowColor = p.color
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * alpha + 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    r.life -= 1
    if (r.life <= 0) {
      rings.splice(i, 1)
      continue
    }
    const t = 1 - r.life / r.max
    ctx.globalAlpha = (1 - t) * 0.9
    ctx.strokeStyle = r.color
    ctx.lineWidth = r.width * (1 - t) + 0.5
    ctx.shadowColor = r.color
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.radius * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2)
    ctx.stroke()
    ctx.shadowBlur = 0
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  return particles.length > 0 || rings.length > 0
}
