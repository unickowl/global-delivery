import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Transaction } from "../../../data/transactions"
import { type Vec3, copyVec3 } from "./vec3"

export function makeGlobeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      frontColor: { value: new THREE.Color("#27699d") },
      midColor: { value: new THREE.Color("#123765") },
      edgeColor: { value: new THREE.Color("#06152f") },
      brightness: { value: 1.75 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 frontColor;
      uniform vec3 midColor;
      uniform vec3 edgeColor;
      uniform float brightness;
      varying vec3 vNormalView;
      void main() {
        float facing = clamp(vNormalView.z * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(edgeColor, midColor, smoothstep(0.0, 0.72, facing));
        color = mix(color, frontColor, smoothstep(0.58, 1.0, facing) * 0.72);
        color *= brightness;
        color += vec3(0.015, 0.035, 0.07);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

export function orientToSurface(mesh: THREE.Object3D, vec: Vec3, radius = 1.01, scratch = new THREE.Vector3()) {
  const normal = copyVec3(scratch, vec, 1).normalize()
  mesh.position.copy(normal.multiplyScalar(radius))
}

export function positionLabelAtVec(
  label: HTMLDivElement,
  vec: Vec3,
  globeGroup: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
  scratch = new THREE.Vector3(),
) {
  const point = copyVec3(scratch, vec, 1.08)
  point.applyMatrix4(globeGroup.matrixWorld)
  point.project(camera)
  label.style.left = `${(point.x * 0.5 + 0.5) * width}px`
  label.style.top = `${(-point.y * 0.5 + 0.5) * height}px`
}

export function createGlowSprite(texture: THREE.Texture, size: number, opacity: number, depthTest = true) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(size)
  sprite.visible = false
  return sprite
}

export function setSegments(line: THREE.LineSegments, positions: Float32Array) {
  const old = line.geometry
  line.geometry = new THREE.BufferGeometry()
  line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  old.dispose()
}

export function createFatSegments(color: string, opacity: number, linewidth: number, resolution: THREE.Vector2) {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions([])
  const material = new LineMaterial({
    color,
    linewidth,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    resolution,
  })
  return new LineSegments2(geometry, material)
}

export function setFatSegments(line: LineSegments2, positions: Float32Array) {
  if (positions.length === 0 && line.geometry.instanceCount === 0) return
  const old = line.geometry
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)
  line.geometry = geometry
  old.dispose()
}

export function disposeFatSegments(line: LineSegments2) {
  line.geometry.dispose()
  ;(line.material as THREE.Material).dispose()
}

export function createGlowTexture(color: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.Texture()
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, "rgba(255,255,255,1)")
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(0.55, color.replace(/[\d.]+\)$/, "0.22)"))
  gradient.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 96, 96)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, color)
  g.addColorStop(0.45, color.replace(/[\d.]+\)$/, "0.18)"))
  g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function drawFlightScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
  progress: number,
  success: number,
  selected: Transaction,
) {
  const cx = width * 0.5
  const cy = height * 0.46
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.72)
  bg.addColorStop(0, "rgba(255, 40, 30, 0.12)")
  bg.addColorStop(0.45, "rgba(10, 4, 6, 0.95)")
  bg.addColorStop(1, "rgba(6, 2, 3, 1)")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  for (let i = 0; i < 44; i += 1) {
    const angle = (i / 44) * Math.PI * 2
    const phase = (now * 0.002 + i * 0.09 + progress * 3) % 1
    const inner = 18 + phase * 56
    const outer = inner + 42 + (1 - phase) * 240
    const alpha = (1 - phase) * 0.32
    ctx.strokeStyle = i % 4 === 0 ? `rgba(255,80,60,${alpha})` : `rgba(255,180,160,${alpha * 0.5})`
    ctx.lineWidth = 1 + (1 - phase) * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
  }
  const arrival = Math.max(0, (progress - 0.7) / 0.3)
  drawGlow(ctx, cx, cy, 22 + arrival * 90 + success * 120, success > 0 ? `rgba(74,222,128,${0.45 + success * 0.5})` : `rgba(255,60,40,${0.22 + arrival * 0.45})`)
  ctx.restore()

  ctx.fillStyle = `rgba(255,206,200,${0.75 + arrival * 0.25})`
  ctx.font = "800 14px 'IBM Plex Mono', 'JetBrains Mono', monospace"
  ctx.textAlign = "center"
  ctx.fillText(selected.target.city.toUpperCase(), cx, cy - 50 - arrival * 20)
  ctx.fillStyle = "rgba(255,150,130,0.55)"
  ctx.font = "500 11px 'IBM Plex Mono', 'JetBrains Mono', monospace"
  ctx.fillText(`${Math.round(progress * 100)}% ROUTE TRAVERSED`, cx, height - 50)

  if (success > 0) {
    ctx.fillStyle = `rgba(74,222,128,${success})`
    ctx.font = "800 28px 'IBM Plex Mono', 'JetBrains Mono', monospace"
    ctx.fillText("SETTLEMENT CONFIRMED", cx, cy + 80)
    ctx.fillStyle = `rgba(74,222,128,${success * 0.7})`
    ctx.font = "700 18px 'IBM Plex Mono', 'JetBrains Mono', monospace"
    ctx.fillText("決済完了", cx, cy + 110)
  }
}

export function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const pixelWidth = Math.max(1, Math.floor(width * dpr))
  const pixelHeight = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
}
