/**
 * TechBackground — Three.js full-canvas atmospheric background for E-RAKSHAK hero.
 *
 * Visual layers (no shield, no large 3D object):
 *   1. Ambient particle field — 110 slow-drifting points, one draw call
 *   2. Network graph — 14 small nodes connected by proximity lines
 *   3. Flowing light trails — 6 short line segments sweeping across the scene
 *   4. Radar pulses — 3 expanding rings that fade as they grow
 *
 * The canvas is transparent (alpha: true) — the dark CSS gradient behind it
 * provides the base colour. The animation is purely decorative background.
 *
 * Memory safety:
 *   - All geometries and materials are tracked and disposed on unmount.
 *   - Trail resets properly remove the old Three.js Line from the scene
 *     before creating a new one, preventing leaks on every respawn cycle.
 *   - Line geometries created inside rebuildLines() are disposed on the
 *     next rebuild and on final unmount.
 *
 * Performance:
 *   - Single BufferGeometry for all 110 particles → one GPU draw call.
 *   - Network lines rebuilt every 8 frames only.
 *   - pixelRatio capped at 1.5, antialias off.
 *   - Visibility API pauses RAF when tab is hidden.
 *
 * Accessibility:
 *   - prefers-reduced-motion: all mutation skipped after first static frame.
 *   - aria-hidden="true", pointer-events: none.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export interface TechBackgroundProps {
  className?: string
}

// ── Palette (E-RAKSHAK brand blues) ─────────────────────────────────────────
const C_PARTICLE = 0x93c5fd   // primary-300 — soft blue dots
const C_NODE     = 0x60a5fa   // primary-400 — network nodes
const C_LINE     = 0x1e40af   // primary-800 — connection lines (subtle)
const C_PULSE    = 0x3b82f6   // primary-500 — radar rings
const C_TRAIL    = 0x38bdf8   // sky-400     — light trails

// ── Scene geometry constants ─────────────────────────────────────────────────
const PARTICLE_COUNT = 110
const NODE_COUNT     = 14
const TRAIL_COUNT    = 6
const PULSE_COUNT    = 3
const SW = 20   // scene width  (world units)
const SH = 12   // scene height
const SD = 5    // scene depth
const LINE_DIST = 5.5   // max distance for node→node connection

// ─────────────────────────────────────────────────────────────────────────────
export function TechBackground({ className = '' }: TechBackgroundProps) {
  const containerRef     = useRef<HTMLDivElement>(null)
  const frameRef         = useRef<number>(0)
  const mouseRef         = useRef({ x: 0, y: 0 })
  const reducedMotionRef = useRef(false)
  const hiddenRef        = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // ── prefers-reduced-motion ─────────────────────────────────────────────
    const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionMQ.matches
    const onMotionChange = (e: MediaQueryListEvent) => { reducedMotionRef.current = e.matches }
    motionMQ.addEventListener('change', onMotionChange)

    // ── Visibility API: pause RAF when tab is not visible ──────────────────
    const onVis = () => { hiddenRef.current = document.hidden }
    document.addEventListener('visibilitychange', onVis)

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()

    const W = el.clientWidth  || 1280
    const H = el.clientHeight || 700
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200)
    camera.position.set(0, 0, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    renderer.shadowMap.enabled = false
    el.appendChild(renderer.domElement)

    // ── Tracked resource lists for safe cleanup ────────────────────────────
    const trackedGeos: THREE.BufferGeometry[] = []
    const trackedMats: THREE.Material[]       = []
    const tG = <T extends THREE.BufferGeometry>(g: T): T => { trackedGeos.push(g); return g }
    const tM = <T extends THREE.Material>(m: T): T        => { trackedMats.push(m); return m }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. PARTICLE FIELD
    // ═══════════════════════════════════════════════════════════════════════
    const pPos = new Float32Array(PARTICLE_COUNT * 3)
    const pVel = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pPos[i * 3]     = (Math.random() - 0.5) * SW
      pPos[i * 3 + 1] = (Math.random() - 0.5) * SH
      pPos[i * 3 + 2] = (Math.random() - 0.5) * SD
      pVel[i * 3]     = (Math.random() - 0.5) * 0.0028
      pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.0020
      pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.0010
    }

    const particleGeo = tG(new THREE.BufferGeometry())
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    const particleMat = tM(new THREE.PointsMaterial({
      color: C_PARTICLE, size: 0.06,
      transparent: true, opacity: 0.42, sizeAttenuation: true,
    }))
    scene.add(new THREE.Points(particleGeo, particleMat))

    // ═══════════════════════════════════════════════════════════════════════
    // 2. NETWORK GRAPH
    // ═══════════════════════════════════════════════════════════════════════
    interface NodeDef { mesh: THREE.Mesh; vx: number; vy: number; phase: number }
    const nodes: NodeDef[] = []

    const nodeGeo = tG(new THREE.OctahedronGeometry(0.072, 0))
    const nodeMat = tM(new THREE.MeshBasicMaterial({
      color: C_NODE, transparent: true, opacity: 0.68,
    }))

    for (let i = 0; i < NODE_COUNT; i++) {
      const m = new THREE.Mesh(nodeGeo, nodeMat)
      m.position.set(
        (Math.random() - 0.5) * SW * 0.86,
        (Math.random() - 0.5) * SH * 0.86,
        (Math.random() - 0.5) * 2,
      )
      scene.add(m)
      nodes.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 0.004,
        vy: (Math.random() - 0.5) * 0.003,
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Shared material for connection lines — one instance, reused across all lines
    const lineMat = tM(new THREE.LineBasicMaterial({
      color: C_LINE, transparent: true, opacity: 0.17,
    }))

    const lineGroup = new THREE.Group()
    scene.add(lineGroup)
    let lineFrame = 0

    function rebuildLines() {
      // Dispose only the geometries (materials are shared, don't dispose them here)
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
    //
    // Each trail owns its own geometry + material so opacity can be
    // controlled independently. On respawn the old Three.js Line is
    // properly removed from the scene and its geo/mat disposed before
    // the new one is created — no scene accumulation.
    // ═══════════════════════════════════════════════════════════════════════
    interface TrailDef {
      obj:    THREE.Line
      geo:    THREE.BufferGeometry
      mat:    THREE.LineBasicMaterial
      hx: number; hy: number; hz: number   // head position
      dx: number; dy: number               // normalised direction
      len: number                          // segment length (world units)
      spd: number                          // speed per frame
      life: number                         // 0→1→0
      dir: 1 | -1                          // life direction
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
        color: C_TRAIL, transparent: true, opacity: 0,
      })
      const obj = new THREE.Line(geo, mat)
      scene.add(obj)

      return {
        obj, geo, mat,
        hx, hy, hz, dx, dy,
        len: 1.8 + Math.random() * 2.2,
        spd: 0.016 + Math.random() * 0.012,
        life: 0,
        dir: 1,
      }
    }

    function resetTrail(t: TrailDef): void {
      // Remove old object from scene and release GPU memory
      scene.remove(t.obj)
      t.geo.dispose()
      t.mat.dispose()

      // Spawn fresh and mutate the existing slot in-place
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
      // Stagger life so trails are not all at phase 0 on first render
      tr.life    = Math.random()
      tr.dir     = Math.random() < 0.5 ? 1 : -1
      trails.push(tr)
    }

    function updateTrail(t: TrailDef) {
      t.hx  += t.dx * t.spd
      t.hy  += t.dy * t.spd
      t.life += t.dir * 0.010

      if (t.life >= 1) t.dir = -1
      if (t.life <= 0 && t.dir === -1) { resetTrail(t); return }

      // Smooth fade: bell curve
      const fade = Math.sin(t.life * Math.PI)
      t.mat.opacity = fade * 0.50

      t.geo.setFromPoints([
        new THREE.Vector3(t.hx - t.dx * t.len, t.hy - t.dy * t.len, t.hz),
        new THREE.Vector3(t.hx, t.hy, t.hz),
      ])
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. RADAR PULSES
    // Each pulse is a RingGeometry mesh that scales up from near-zero.
    // The geometry is created once; scale drives apparent radius.
    // ═══════════════════════════════════════════════════════════════════════
    interface PulseDef {
      mesh: THREE.Mesh
      mat:  THREE.MeshBasicMaterial
      r:    number   // current scale (= apparent radius)
      maxR: number
      spd:  number
    }

    const pulses: PulseDef[] = []
    for (let i = 0; i < PULSE_COUNT; i++) {
      const geo = tG(new THREE.RingGeometry(0.9, 1.0, 72))
      const mat = tM(new THREE.MeshBasicMaterial({
        color: C_PULSE, transparent: true, opacity: 0, side: THREE.DoubleSide,
      }))
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(
        (Math.random() - 0.5) * SW * 0.65,
        (Math.random() - 0.5) * SH * 0.65,
        (Math.random() - 0.5) * 1.5,
      )
      scene.add(mesh)
      const maxR = 2.2 + Math.random() * 2.0
      // Stagger starting radii so pulses fire at different times
      const r = maxR * (i / PULSE_COUNT)
      pulses.push({ mesh, mat, r, maxR, spd: 0.015 + Math.random() * 0.010 })
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
        p.maxR = 2.2 + Math.random() * 2.0
        p.spd  = 0.015 + Math.random() * 0.010
      }
      p.mesh.scale.set(p.r, p.r, 1)
      // Opacity follows sin curve — full near mid-expansion, zero at edges
      p.mat.opacity = Math.sin((p.r / p.maxR) * Math.PI) * 0.10
    }

    // ── Mouse: gentle camera parallax ─────────────────────────────────────
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

    // ── Animation loop ─────────────────────────────────────────────────────
    let clock = 0

    function animate() {
      frameRef.current = requestAnimationFrame(animate)
      if (hiddenRef.current) return

      if (!reducedMotionRef.current) {
        clock += 0.007

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
          // Subtle scale pulse per node
          nd.mesh.scale.setScalar(0.85 + Math.sin(clock * 1.1 + nd.phase) * 0.16)
        }

        // Rebuild connection lines every 8 frames
        if (++lineFrame % 8 === 0) rebuildLines()

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
      window.removeEventListener('mousemove', onMouseMove)
      motionMQ.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVis)

      // Dispose connection-line geometries (materials are in trackedMats)
      for (const child of lineGroup.children) {
        (child as THREE.Line).geometry.dispose()
      }

      // Dispose trail objects (each owns its own geo + mat, not in tracked arrays)
      for (const tr of trails) {
        tr.geo.dispose()
        tr.mat.dispose()
        scene.remove(tr.obj)
      }

      // Dispose all tracked geometries and materials
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
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

export default TechBackground
