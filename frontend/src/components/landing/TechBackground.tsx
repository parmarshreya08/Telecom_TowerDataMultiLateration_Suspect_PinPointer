/**
 * TechBackground — Three.js full-canvas atmospheric background for E-RAKSHAK hero.
 *
 * Visual layers:
 *   1. Ambient particle field — 120 drifting points, smoothly interpolating between themes
 *   2. Network graph — 16 small geometric nodes connected by proximity lines
 *   3. Flowing light trails — 6 light trails sweeping smoothly across the scene
 *   4. Radar pulses — 3 expanding rings that fade as they expand
 *
 * Theme Transitions:
 *   - Continuous WebGL animation without canvas recreation or scene disposal
 *   - Frame-by-frame smooth color and opacity interpolation (THREE.Color.lerp)
 *   - Zero white/black flashes, zero particle jumps or resets
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export interface TechBackgroundProps {
  className?: string
  isDark?: boolean
}

// ── Theme Palettes ─────────────────────────────────────────────────────────
interface ThemePalette {
  particleColor: THREE.Color
  particleOpacity: number
  particleSize: number
  nodeColor: THREE.Color
  nodeOpacity: number
  lineColor: THREE.Color
  lineOpacity: number
  pulseColor: THREE.Color
  pulseMaxOpacity: number
  trailColor: THREE.Color
  trailMaxOpacity: number
}

const PAL_DARK: ThemePalette = {
  particleColor: new THREE.Color(0x93c5fd),   // Soft electric blue
  particleOpacity: 0.55,
  particleSize: 0.065,
  nodeColor: new THREE.Color(0x60a5fa),       // Vibrant blue node
  nodeOpacity: 0.85,
  lineColor: new THREE.Color(0x3b82f6),       // Blue connection lines
  lineOpacity: 0.26,                          // More visible network connections
  pulseColor: new THREE.Color(0x38bdf8),      // Cyan radar pulse
  pulseMaxOpacity: 0.16,
  trailColor: new THREE.Color(0x38bdf8),      // Cyan light trails
  trailMaxOpacity: 0.65,
}

const PAL_LIGHT: ThemePalette = {
  particleColor: new THREE.Color(0x1e3a8a),   // Deep navy blue dots (crisp against light canvas)
  particleOpacity: 0.60,
  particleSize: 0.075,
  nodeColor: new THREE.Color(0x1d4ed8),       // Royal blue nodes
  nodeOpacity: 0.85,
  lineColor: new THREE.Color(0x2563eb),       // Crisp blue connection lines
  lineOpacity: 0.32,                          // Clearly visible on white/light background
  pulseColor: new THREE.Color(0x2563eb),      // Deep blue radar rings
  pulseMaxOpacity: 0.22,
  trailColor: new THREE.Color(0x0284c7),      // Deep cyan-blue trails
  trailMaxOpacity: 0.65,
}

// ── Scene geometry constants ─────────────────────────────────────────────────
const PARTICLE_COUNT = 120
const NODE_COUNT     = 16
const TRAIL_COUNT    = 6
const PULSE_COUNT    = 3
const SW = 20   // scene width (world units)
const SH = 12   // scene height
const SD = 5    // scene depth
const LINE_DIST = 5.8   // max distance for node→node connection

export function TechBackground({ className = '', isDark = true }: TechBackgroundProps) {
  const containerRef     = useRef<HTMLDivElement>(null)
  const frameRef         = useRef<number>(0)
  const mouseRef         = useRef({ x: 0, y: 0 })
  const reducedMotionRef = useRef(false)
  const hiddenRef        = useRef(false)
  const targetPaletteRef = useRef<ThemePalette>(isDark ? PAL_DARK : PAL_LIGHT)

  // Update target palette when isDark prop changes — animation loop will smoothly lerp
  useEffect(() => {
    targetPaletteRef.current = isDark ? PAL_DARK : PAL_LIGHT
  }, [isDark])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // ── Immediate DOM-level theme change detection ─────────────────────────
    const observer = new MutationObserver(() => {
      const isDocDark = document.documentElement.classList.contains('dark')
      targetPaletteRef.current = isDocDark ? PAL_DARK : PAL_LIGHT
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // ── prefers-reduced-motion ─────────────────────────────────────────────
    const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionMQ.matches
    const onMotionChange = (e: MediaQueryListEvent) => { reducedMotionRef.current = e.matches }
    motionMQ.addEventListener('change', onMotionChange)

    // ── Visibility API ─────────────────────────────────────────────────────
    const onVis = () => { hiddenRef.current = document.hidden }
    document.addEventListener('visibilitychange', onVis)

    // ── Scene setup ────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    const W = el.clientWidth || 1280
    const H = el.clientHeight || 700
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200)
    camera.position.set(0, 0, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = false
    el.appendChild(renderer.domElement)

    // Resource tracking for safe cleanup
    const trackedGeos: THREE.BufferGeometry[] = []
    const trackedMats: THREE.Material[]       = []
    const tG = <T extends THREE.BufferGeometry>(g: T): T => { trackedGeos.push(g); return g }
    const tM = <T extends THREE.Material>(m: T): T        => { trackedMats.push(m); return m }

    const initial = targetPaletteRef.current

    // Active interpolated values
    const currParticleColor = initial.particleColor.clone()
    const currNodeColor     = initial.nodeColor.clone()
    const currLineColor     = initial.lineColor.clone()
    const currPulseColor    = initial.pulseColor.clone()
    const currTrailColor    = initial.trailColor.clone()

    let currParticleOpacity = initial.particleOpacity
    let currParticleSize    = initial.particleSize
    let currNodeOpacity     = initial.nodeOpacity
    let currLineOpacity     = initial.lineOpacity
    let currPulseMaxOpacity = initial.pulseMaxOpacity
    let currTrailMaxOpacity = initial.trailMaxOpacity

    // ═══════════════════════════════════════════════════════════════════════
    // 1. PARTICLE FIELD
    // ═══════════════════════════════════════════════════════════════════════
    const pPos = new Float32Array(PARTICLE_COUNT * 3)
    const pVel = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pPos[i * 3]     = (Math.random() - 0.5) * SW
      pPos[i * 3 + 1] = (Math.random() - 0.5) * SH
      pPos[i * 3 + 2] = (Math.random() - 0.5) * SD
      pVel[i * 3]     = (Math.random() - 0.5) * 0.0042
      pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.0030
      pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.0015
    }

    const particleGeo = tG(new THREE.BufferGeometry())
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const particleMat = tM(new THREE.PointsMaterial({
      color: currParticleColor,
      size: currParticleSize,
      transparent: true,
      opacity: currParticleOpacity,
      sizeAttenuation: true,
    }))
    scene.add(new THREE.Points(particleGeo, particleMat))

    // ═══════════════════════════════════════════════════════════════════════
    // 2. NETWORK GRAPH
    // ═══════════════════════════════════════════════════════════════════════
    interface NodeDef { mesh: THREE.Mesh; vx: number; vy: number; phase: number }
    const nodes: NodeDef[] = []

    const nodeGeo = tG(new THREE.OctahedronGeometry(0.076, 0))
    const nodeMat = tM(new THREE.MeshBasicMaterial({
      color: currNodeColor,
      transparent: true,
      opacity: currNodeOpacity,
    }))

    for (let i = 0; i < NODE_COUNT; i++) {
      const m = new THREE.Mesh(nodeGeo, nodeMat)
      m.position.set(
        (Math.random() - 0.5) * SW * 0.88,
        (Math.random() - 0.5) * SH * 0.88,
        (Math.random() - 0.5) * 2,
      )
      scene.add(m)
      nodes.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 0.0055,
        vy: (Math.random() - 0.5) * 0.0042,
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Shared material for connection lines
    const lineMat = tM(new THREE.LineBasicMaterial({
      color: currLineColor,
      transparent: true,
      opacity: currLineOpacity,
    }))

    const lineGroup = new THREE.Group()
    scene.add(lineGroup)
    let lineFrame = 0

    function rebuildLines() {
      for (const child of lineGroup.children) {
        (child as THREE.Line).geometry.dispose()
      }
      lineGroup.clear()

      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          if (nodes[a].mesh.position.distanceTo(nodes[b].mesh.position) < LINE_DIST) {
            lineGroup.add(new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                nodes[a].mesh.position.clone(),
                nodes[b].mesh.position.clone(),
              ]),
              lineMat,
            ))
          }
        }
      }
    }
    rebuildLines()

    // ═══════════════════════════════════════════════════════════════════════
    // 3. FLOWING LIGHT TRAILS
    // ═══════════════════════════════════════════════════════════════════════
    interface TrailDef {
      obj:  THREE.Line
      geo:  THREE.BufferGeometry
      mat:  THREE.LineBasicMaterial
      hx: number; hy: number; hz: number
      dx: number; dy: number
      len: number
      spd: number
      life: number
      dir: 1 | -1
    }

    function createTrail(staggerX = 0): TrailDef {
      const fromLeft = Math.random() < 0.5
      const hx = (fromLeft ? -SW * 0.5 - 1 : SW * 0.5 + 1) + staggerX
      const hy = (Math.random() - 0.5) * SH
      const hz = (Math.random() - 0.5) * 2
      const spread = (Math.random() - 0.5) * 0.45
      const dx = (fromLeft ? 1 : -1) * Math.cos(spread)
      const dy = Math.sin(spread) * 0.55

      const geo = new THREE.BufferGeometry()
      const mat = new THREE.LineBasicMaterial({
        color: currTrailColor,
        transparent: true,
        opacity: 0,
      })
      const obj = new THREE.Line(geo, mat)
      scene.add(obj)

      return {
        obj, geo, mat,
        hx, hy, hz, dx, dy,
        len: 1.8 + Math.random() * 2.4,
        spd: 0.020 + Math.random() * 0.015,
        life: 0,
        dir: 1,
      }
    }

    function resetTrail(t: TrailDef): void {
      scene.remove(t.obj)
      t.geo.dispose()
      t.mat.dispose()

      const fresh = createTrail()
      t.obj  = fresh.obj
      t.geo  = fresh.geo
      t.mat  = fresh.mat
      t.hx   = fresh.hx;  t.hy  = fresh.hy;  t.hz  = fresh.hz
      t.dx   = fresh.dx;  t.dy  = fresh.dy
      t.len  = fresh.len; t.spd = fresh.spd
      t.life = 0;         t.dir = 1
    }

    const trails: TrailDef[] = []
    for (let i = 0; i < TRAIL_COUNT; i++) {
      const tr = createTrail((Math.random() - 0.5) * SW * 0.6)
      tr.life = Math.random()
      tr.dir  = Math.random() < 0.5 ? 1 : -1
      trails.push(tr)
    }

    function updateTrail(t: TrailDef) {
      t.hx  += t.dx * t.spd
      t.hy  += t.dy * t.spd
      t.life += t.dir * 0.012

      if (t.life >= 1) t.dir = -1
      if (t.life <= 0 && t.dir === -1) { resetTrail(t); return }

      const fade = Math.sin(t.life * Math.PI)
      t.mat.opacity = fade * currTrailMaxOpacity

      t.geo.setFromPoints([
        new THREE.Vector3(t.hx - t.dx * t.len, t.hy - t.dy * t.len, t.hz),
        new THREE.Vector3(t.hx, t.hy, t.hz),
      ])
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. RADAR PULSES
    // ═══════════════════════════════════════════════════════════════════════
    interface PulseDef {
      mesh: THREE.Mesh
      mat:  THREE.MeshBasicMaterial
      r:    number
      maxR: number
      spd:  number
    }

    const pulses: PulseDef[] = []
    for (let i = 0; i < PULSE_COUNT; i++) {
      const geo = tG(new THREE.RingGeometry(0.9, 1.0, 72))
      const mat = tM(new THREE.MeshBasicMaterial({
        color: currPulseColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      }))
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        (Math.random() - 0.5) * SW * 0.65,
        (Math.random() - 0.5) * SH * 0.65,
        (Math.random() - 0.5) * 1.5,
      )
      scene.add(mesh)
      const maxR = 2.2 + Math.random() * 2.2
      const r = maxR * (i / PULSE_COUNT)
      pulses.push({ mesh, mat, r, maxR, spd: 0.018 + Math.random() * 0.012 })
    }

    function updatePulse(p: PulseDef) {
      p.r += p.spd
      if (p.r > p.maxR) {
        p.r = 0.01
        p.mesh.position.set(
          (Math.random() - 0.5) * SW * 0.65,
          (Math.random() - 0.5) * SH * 0.65,
          (Math.random() - 0.5) * 1.5,
        )
        p.maxR = 2.2 + Math.random() * 2.2
        p.spd  = 0.018 + Math.random() * 0.012
      }
      p.mesh.scale.set(p.r, p.r, 1)
      p.mat.opacity = Math.sin((p.r / p.maxR) * Math.PI) * currPulseMaxOpacity
    }

    // ── Mouse parallax ─────────────────────────────────────────────────────
    let camTX = 0, camTY = 0
    function onMouseMove(e: MouseEvent) {
      mouseRef.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true })

    // ── Resize ─────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth, ch = el.clientHeight
      if (!cw || !ch) return
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
      renderer.setSize(cw, ch)
    })
    ro.observe(el)

    // ── Animation loop with smooth continuous color interpolation ───────────
    let clock = 0
    const LERP_FACTOR = 0.08   // smoothly interpolates over ~300ms

    function animate() {
      frameRef.current = requestAnimationFrame(animate)
      if (hiddenRef.current) return

      if (!reducedMotionRef.current) {
        clock += 0.009

        // ── Smoothly lerp colors and opacities towards target palette ────────
        const target = targetPaletteRef.current

        currParticleColor.lerp(target.particleColor, LERP_FACTOR)
        currNodeColor.lerp(target.nodeColor, LERP_FACTOR)
        currLineColor.lerp(target.lineColor, LERP_FACTOR)
        currPulseColor.lerp(target.pulseColor, LERP_FACTOR)
        currTrailColor.lerp(target.trailColor, LERP_FACTOR)

        currParticleOpacity = THREE.MathUtils.lerp(currParticleOpacity, target.particleOpacity, LERP_FACTOR)
        currNodeOpacity     = THREE.MathUtils.lerp(currNodeOpacity, target.nodeOpacity, LERP_FACTOR)
        currLineOpacity     = THREE.MathUtils.lerp(currLineOpacity, target.lineOpacity, LERP_FACTOR)
        currPulseMaxOpacity = THREE.MathUtils.lerp(currPulseMaxOpacity, target.pulseMaxOpacity, LERP_FACTOR)
        currTrailMaxOpacity = THREE.MathUtils.lerp(currTrailMaxOpacity, target.trailMaxOpacity, LERP_FACTOR)
        currParticleSize    = THREE.MathUtils.lerp(currParticleSize, target.particleSize, LERP_FACTOR)

        // Apply updated colors/opacities to materials
        particleMat.color.copy(currParticleColor)
        particleMat.opacity = currParticleOpacity
        particleMat.size    = currParticleSize

        nodeMat.color.copy(currNodeColor)
        nodeMat.opacity = currNodeOpacity

        lineMat.color.copy(currLineColor)
        lineMat.opacity = currLineOpacity

        for (const p of pulses) {
          p.mat.color.copy(currPulseColor)
        }

        for (const t of trails) {
          t.mat.color.copy(currTrailColor)
        }

        // Camera gentle parallax
        camTX = THREE.MathUtils.lerp(camTX, mouseRef.current.x * 0.28, 0.018)
        camTY = THREE.MathUtils.lerp(camTY, -mouseRef.current.y * 0.18, 0.018)
        camera.position.x = camTX
        camera.position.y = camTY

        // Drift particles (wrap at scene edges)
        const attr = particleGeo.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          attr.array[i * 3]     += pVel[i * 3]
          attr.array[i * 3 + 1] += pVel[i * 3 + 1]
          attr.array[i * 3 + 2] += pVel[i * 3 + 2]
          if (attr.array[i * 3]     >  SW / 2) attr.array[i * 3]     = -SW / 2
          if (attr.array[i * 3]     < -SW / 2) attr.array[i * 3]     =  SW / 2
          if (attr.array[i * 3 + 1] >  SH / 2) attr.array[i * 3 + 1] = -SH / 2
          if (attr.array[i * 3 + 1] < -SH / 2) attr.array[i * 3 + 1] =  SH / 2
        }
        attr.needsUpdate = true

        // Move network nodes + bounce
        for (const nd of nodes) {
          nd.mesh.position.x += nd.vx
          nd.mesh.position.y += nd.vy
          if (Math.abs(nd.mesh.position.x) > SW * 0.44) nd.vx *= -1
          if (Math.abs(nd.mesh.position.y) > SH * 0.44) nd.vy *= -1
          nd.mesh.scale.setScalar(0.85 + Math.sin(clock * 1.2 + nd.phase) * 0.18)
        }

        // Rebuild connection lines every 6 frames
        if (++lineFrame % 6 === 0) rebuildLines()

        // Trails and pulses
        for (const tr of trails) updateTrail(tr)
        for (const p  of pulses)  updatePulse(p)
      }

      renderer.render(scene, camera)
    }

    animate()

    // ── Cleanup on unmount ─────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      observer.disconnect()
      window.removeEventListener('mousemove', onMouseMove)
      motionMQ.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVis)

      for (const child of lineGroup.children) {
        (child as THREE.Line).geometry.dispose()
      }

      for (const tr of trails) {
        tr.geo.dispose()
        tr.mat.dispose()
        scene.remove(tr.obj)
      }

      trackedGeos.forEach((g) => g.dispose())
      trackedMats.forEach((m) => m.dispose())

      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden="true"
      role="presentation"
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

export default TechBackground
