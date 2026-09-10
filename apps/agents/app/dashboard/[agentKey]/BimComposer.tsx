'use client'

// BIM Composer — ARC + MEP presentation renders blended into one image.
// Ported from Maxim's standalone Composer v5.2 (canvas compositing, Web Worker
// blend mask, perspective analysis for AI backgrounds, pan/zoom viewport).

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Download, Sparkles, ImagePlus, Check } from 'lucide-react'

const ACCENT = '#1e248c' // EPM platform navy — matches postMeta ACCENT

export interface ComposerProject {
  projectNumber: string
  projectName: string
}

type BgMode = 'transparent' | 'color' | 'photo' | 'ai'

interface Params {
  posX: number
  blendPct: number
  cutAngle: number
  bgBrightness: number
  horizPct: number
  bgMode: BgMode
  bgColor: string
  whiteThresh: number
  opacityAll: number
  opacityMep: number
  offY1: number
  offY2: number
}

interface HoughLine { theta: number; rho: number; votes: number }

interface Persp {
  valid: boolean
  reason?: string
  horizonPct?: number
  horizonY?: number
  cameraAngle?: string
  cameraAngleLabel?: string
  viewDir?: string
  viewDirLabel?: string
  vp1?: { x: number; y: number } | null
  vp2?: { x: number; y: number } | null
  lineCount?: number
  canvasW?: number
  canvasH?: number
  allLines?: HoughLine[]
}

interface Sources {
  all: HTMLImageElement | null
  mep: HTMLImageElement | null
  bg: HTMLCanvasElement | null
  ai: HTMLCanvasElement | null
}

// ══════════════════════════════════════════════════════════════
// Perspective analysis engine (ARC image only — MEP never affects
// perspective; ground line = bottom of visible walls).
// ══════════════════════════════════════════════════════════════

function sobelEdges(imgData: ImageData, W: number, H: number): Float32Array {
  const src = imgData.data
  const out = new Float32Array(W * H)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const g = (r: number, c: number) => {
        const i = ((y + r) * W + (x + c)) * 4
        return src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114
      }
      const gx = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1)
      const gy = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1)
      out[y * W + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return out
}

function houghLines(edges: Float32Array, W: number, H: number, threshold = 55): HoughLine[] {
  const SCALE = 3
  const sw = Math.floor(W / SCALE), sh = Math.floor(H / SCALE)
  const pts: [number, number][] = []
  for (let y = 2; y < sh - 2; y++)
    for (let x = 2; x < sw - 2; x++) {
      const ex = Math.min(W - 1, x * SCALE), ey = Math.min(H - 1, y * SCALE)
      if (edges[ey * W + ex] > threshold) pts.push([x, y])
    }
  if (pts.length < 20) return []

  const NTHETA = 180
  const diagLen = Math.ceil(Math.sqrt(sw * sw + sh * sh))
  const acc = new Int32Array(NTHETA * diagLen * 2)
  const cosT: number[] = [], sinT: number[] = []
  for (let t = 0; t < NTHETA; t++) {
    const rad = t * Math.PI / NTHETA
    cosT.push(Math.cos(rad)); sinT.push(Math.sin(rad))
  }
  const sampleN = Math.min(pts.length, 3000)
  for (let i = 0; i < sampleN; i++) {
    const [x, y] = pts[Math.floor(Math.random() * pts.length)]
    for (let t = 0; t < NTHETA; t++) {
      const rho = Math.round(x * cosT[t] + y * sinT[t]) + diagLen
      if (rho >= 0 && rho < diagLen * 2) acc[t * diagLen * 2 + rho]++
    }
  }
  const PEAK = Math.max(18, sampleN * 0.035)
  const lines: HoughLine[] = []
  for (let t = 0; t < NTHETA; t++)
    for (let r = 1; r < diagLen * 2 - 1; r++) {
      const v = acc[t * diagLen * 2 + r]
      if (v < PEAK) continue
      if (v < acc[t * diagLen * 2 + r - 1] || v < acc[t * diagLen * 2 + r + 1]) continue
      lines.push({ theta: t * Math.PI / NTHETA, rho: (r - diagLen) * SCALE, votes: v })
    }
  lines.sort((a, b) => b.votes - a.votes)
  return lines.slice(0, 40)
}

function lineIntersect(t1: number, r1: number, t2: number, r2: number) {
  const c1 = Math.cos(t1), s1 = Math.sin(t1), c2 = Math.cos(t2), s2 = Math.sin(t2)
  const det = c1 * s2 - c2 * s1
  if (Math.abs(det) < 1e-6) return null
  return { x: (r1 * s2 - r2 * s1) / det, y: (r2 * c1 - r1 * c2) / det }
}

// Ground line = base of the building walls; columns/bases extend below it.
function detectGroundLine(edges: Float32Array, W: number, H: number) {
  const rowStrength = new Float32Array(H)
  for (let y = 0; y < H; y++) {
    let sum = 0
    for (let x = 0; x < W; x++) sum += edges[y * W + x]
    rowStrength[y] = sum / W
  }
  const smooth = new Float32Array(H)
  for (let y = 3; y < H - 3; y++) {
    let s = 0
    for (let dy = -3; dy <= 3; dy++) s += rowStrength[y + dy]
    smooth[y] = s / 7
  }
  const maxStr = Math.max(...Array.from(smooth))
  const thresh = maxStr * 0.20

  let contentBottom = Math.round(H * 0.85)
  for (let y = H - 4; y >= H * 0.3; y--) {
    if (smooth[y] > thresh) { contentBottom = y; break }
  }
  const groundLineY = Math.max(
    Math.round(H * 0.35),
    Math.min(Math.round(H * 0.85), contentBottom - Math.round(H * 0.04)),
  )
  let maxEdgeY = groundLineY
  let maxEdgeV = 0
  for (let y = Math.round(H * 0.40); y < Math.round(H * 0.90); y++) {
    if (smooth[y] > maxEdgeV) { maxEdgeV = smooth[y]; maxEdgeY = y }
  }
  const finalY = Math.min(
    Math.round(H * 0.88),
    maxEdgeV > thresh * 1.5 ? maxEdgeY : groundLineY,
  )
  return { groundLineY: finalY }
}

function analysePerspective(arcImg: HTMLImageElement): Persp {
  const AW = 400, AH = Math.round(arcImg.naturalHeight * AW / arcImg.naturalWidth)
  const c = Object.assign(document.createElement('canvas'), { width: AW, height: AH })
  const ctx = c.getContext('2d')!
  ctx.drawImage(arcImg, 0, 0, AW, AH)
  const imgData = ctx.getImageData(0, 0, AW, AH)

  const edges = sobelEdges(imgData, AW, AH)
  const lines = houghLines(edges, AW, AH, 50)
  if (lines.length < 3) return { valid: false, reason: 'Not enough structural lines detected in ARC image' }

  const diagonal = lines.filter((l) => { const d = l.theta * 180 / Math.PI; return (d >= 20 && d <= 75) || (d >= 105 && d <= 160) })

  const { groundLineY } = detectGroundLine(edges, AW, AH)
  const horizonY = groundLineY
  const horizonPct = horizonY / AH

  const vps: { x: number; y: number }[] = []
  for (let i = 0; i < Math.min(diagonal.length, 14); i++)
    for (let j = i + 1; j < Math.min(diagonal.length, 14); j++) {
      const pt = lineIntersect(diagonal[i].theta, diagonal[i].rho, diagonal[j].theta, diagonal[j].rho)
      if (!pt || pt.x < -AW * 1.5 || pt.x > AW * 2.5 || pt.y < -AH || pt.y > AH * 2) continue
      vps.push(pt)
    }

  let vp1: { x: number; y: number } | null = null, vp2: { x: number; y: number } | null = null
  if (vps.length >= 2) {
    const R = AW * 0.18
    let best = 0, bx = 0, by = 0
    for (const s of vps) {
      const near = vps.filter((p) => Math.hypot(p.x - s.x, p.y - s.y) < R)
      if (near.length > best) { best = near.length; bx = near.reduce((a, p) => a + p.x, 0) / near.length; by = near.reduce((a, p) => a + p.y, 0) / near.length }
    }
    if (best >= 2) {
      vp1 = { x: bx, y: by }
      const rem = vps.filter((p) => Math.hypot(p.x - vp1!.x, p.y - vp1!.y) > R * 1.5)
      if (rem.length >= 2) {
        let b2 = 0, bx2 = 0, by2 = 0
        for (const s of rem) {
          const near = rem.filter((p) => Math.hypot(p.x - s.x, p.y - s.y) < R)
          if (near.length > b2) { b2 = near.length; bx2 = near.reduce((a, p) => a + p.x, 0) / near.length; by2 = near.reduce((a, p) => a + p.y, 0) / near.length }
        }
        if (b2 >= 2) vp2 = { x: bx2, y: by2 }
      }
    }
  }

  let cameraAngle: string, cameraAngleLabel: string
  if (horizonPct < 0.30) { cameraAngle = 'worms-eye'; cameraAngleLabel = "Worm's-eye (looking up strongly)" }
  else if (horizonPct < 0.44) { cameraAngle = 'low'; cameraAngleLabel = 'Low angle view' }
  else if (horizonPct < 0.60) { cameraAngle = 'eye-level'; cameraAngleLabel = 'Eye-level / street-level view' }
  else if (horizonPct < 0.74) { cameraAngle = 'high'; cameraAngleLabel = 'High angle view' }
  else { cameraAngle = 'birds-eye'; cameraAngleLabel = "Bird's-eye aerial view" }

  let viewDir = 'frontal', viewDirLabel = 'Frontal view'
  if (vp1) {
    const vx = vp1.x / AW
    if (vx < -0.15) { viewDir = 'right-oblique'; viewDirLabel = 'Right oblique' }
    else if (vx < 0.22) { viewDir = 'left-oblique'; viewDirLabel = 'Left oblique' }
    else if (vx > 1.15) { viewDir = 'left-oblique'; viewDirLabel = 'Left oblique' }
    else if (vx > 0.78) { viewDir = 'right-oblique'; viewDirLabel = 'Right oblique' }
    else { viewDir = 'frontal'; viewDirLabel = 'Frontal / symmetric' }
    if (vp2) { viewDir += '-2pt'; viewDirLabel += ' (two-point perspective)' }
  }

  return {
    valid: true, horizonPct, horizonY, cameraAngle, cameraAngleLabel,
    viewDir, viewDirLabel, vp1, vp2,
    lineCount: lines.length, canvasW: AW, canvasH: AH, allLines: lines,
  }
}

function buildSmartPrompt(persp: Persp | null, userExtra: string): string {
  if (!persp || !persp.valid) {
    return `architectural building exterior background, photorealistic, ${userExtra || 'clear sky, urban environment'}`
  }
  const parts: string[] = []
  const horizPctInt = Math.round((persp.horizonPct ?? 0.5) * 100)
  parts.push(`background scene where the ground level is at exactly ${horizPctInt}% from the top of the image`)
  parts.push(`sky fills the upper ${horizPctInt}% of the image`)
  parts.push(`ground, pavement, or street fills the lower ${100 - horizPctInt}% of the image`)
  parts.push('the building sits directly on this ground — no gap between building base and ground')
  switch (persp.cameraAngle) {
    case 'worms-eye': parts.push('extreme upward angle, very low camera, sky dominates, massive perspective foreshortening'); break
    case 'low': parts.push('low camera angle, street-level view, slight upward tilt'); break
    case 'eye-level': parts.push('eye-level camera, natural human perspective, street scene'); break
    case 'high': parts.push('elevated viewpoint, slightly looking down, rooftops of surrounding buildings visible'); break
    case 'birds-eye': parts.push("aerial bird's-eye view, top-down perspective, city grid from above"); break
  }
  if (persp.viewDir?.includes('2pt')) parts.push('strong two-point perspective, vanishing lines going both left and right')
  else if (persp.viewDir === 'left-oblique') parts.push('perspective lines converging to the left side')
  else if (persp.viewDir === 'right-oblique') parts.push('perspective lines converging to the right side')
  else parts.push('symmetric frontal perspective')
  parts.push('photorealistic architectural environment, no overlapping buildings in foreground')
  parts.push('wide panoramic format 16:9')
  if (userExtra) parts.push(userExtra)
  parts.push('high resolution, no text, no watermark, no people in foreground')
  return parts.join(', ')
}

// ══════════════════════════════════════════════════════════════
// Compositing (blend mask runs in a Web Worker so the UI never freezes)
// ══════════════════════════════════════════════════════════════

function drawSrc(imgObj: HTMLImageElement | null, W: number, H: number, offY: number): HTMLCanvasElement {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const cx = c.getContext('2d')!
  cx.fillStyle = 'white'; cx.fillRect(0, 0, W, H)
  if (!imgObj) return c
  const sh = Math.round(imgObj.naturalHeight * W / imgObj.naturalWidth)
  cx.drawImage(imgObj, 0, offY, W, sh)
  return c
}

function drawProceduralSky(ctx: CanvasRenderingContext2D, W: number, H: number, horizPct: number, brightness: number) {
  const hy = H * horizPct / 100, b = brightness / 100
  const sg = ctx.createLinearGradient(0, 0, 0, hy)
  sg.addColorStop(0, `rgba(${Math.round(85 * b)},${Math.round(130 * b)},${Math.round(180 * b)},1)`)
  sg.addColorStop(1, `rgba(${Math.round(220 * b)},${Math.round(235 * b)},${Math.round(245 * b)},1)`)
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, hy)
  const gg = ctx.createLinearGradient(0, hy, 0, H)
  gg.addColorStop(0, `rgba(${Math.round(145 * b)},${Math.round(140 * b)},${Math.round(120 * b)},1)`)
  gg.addColorStop(1, `rgba(${Math.round(90 * b)},${Math.round(88 * b)},${Math.round(75 * b)},1)`)
  ctx.fillStyle = gg; ctx.fillRect(0, hy, W, H - hy)
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, p: Params, srcs: Sources) {
  switch (p.bgMode) {
    case 'transparent': ctx.clearRect(0, 0, W, H); break
    case 'color': {
      const hex = p.bgColor.replace('#', '')
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
      const br = p.bgBrightness / 100
      ctx.fillStyle = `rgb(${Math.round(r * br)},${Math.round(g * br)},${Math.round(b * br)})`
      ctx.fillRect(0, 0, W, H); break
    }
    case 'photo':
    case 'ai': {
      const bgC = p.bgMode === 'ai' ? srcs.ai : srcs.bg
      if (bgC) {
        const bw = bgC.width, bh = bgC.height
        const scale = Math.max(W / bw, H / bh)
        const dw = bw * scale, dh = bh * scale
        ctx.filter = `brightness(${p.bgBrightness}%)`
        ctx.drawImage(bgC, (W - dw) / 2, (H - dh) / 2, dw, dh)
        ctx.filter = 'none'
      } else {
        drawProceduralSky(ctx, W, H, p.horizPct, p.bgBrightness)
      }
      break
    }
  }
}

// Blend-mask pixel loop — verbatim from Composer v5.2, run off the main thread.
const WORKER_SRC = `
'use strict';
self.onmessage = function(e) {
  const { W, H, p } = e.data;
  const dAll = new Uint8ClampedArray(e.data.dAll);
  const dMep = new Uint8ClampedArray(e.data.dMep);
  const o    = new Uint8ClampedArray(e.data.bgData);

  function ss(t){ return t*t*(3-2*t); }

  const angleRad  = p.cutAngle * Math.PI / 180;
  const halfShift = Math.tan(angleRad) * 0.5;

  const xCenter = (p.posX - 50) / 100;
  const ctBase  = 0.5 + xCenter - halfShift;
  const cbBase  = 0.5 + xCenter + halfShift;

  const zoneOffset = (p.blendPct / 100 - 0.5);
  const bPx = W;

  const mask = new Float32Array(W*H);
  for(let y=0;y<H;y++){
    const t  = y / H;
    const cx = W * (ctBase + (cbBase - ctBase) * t);
    const lo = cx - W * 0.5 + zoneOffset * W;
    for(let x=0;x<W;x++) mask[y*W+x] = Math.max(0, Math.min(1, (x - lo) / bPx));
  }

  const r = Math.min(W * 0.04, 20);
  if(r>=1){
    const sigma=r/3, ks=(Math.ceil(r*2)|1), half=ks>>1;
    const k=new Float32Array(ks); let s=0;
    for(let i=0;i<ks;i++){const x=i-half;k[i]=Math.exp(-x*x/(2*sigma*sigma));s+=k[i];}
    for(let i=0;i<ks;i++)k[i]/=s;
    const tmp=new Float32Array(W*H);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let v=0;for(let j=0;j<ks;j++){const xi=Math.max(0,Math.min(W-1,x+j-half));v+=mask[y*W+xi]*k[j];}
      tmp[y*W+x]=v;
    }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      let v=0;for(let j=0;j<ks;j++){const yi=Math.max(0,Math.min(H-1,y+j-half));v+=tmp[yi*W+x]*k[j];}
      mask[y*W+x]=v;
    }
  }

  const thr  = p.whiteThresh;
  const opA  = p.opacityAll/100, opM = p.opacityMep/100;
  const useTransparent = p.bgMode==='transparent';

  for(let i=0,p4=0;i<W*H;i++,p4+=4){
    const ar=dAll[p4],ag=dAll[p4+1],ab=dAll[p4+2];
    const mr=dMep[p4],mg=dMep[p4+1],mb=dMep[p4+2];
    const wA=ar>=thr&&ag>=thr&&ab>=thr;
    const wM=mr>=thr&&mg>=thr&&mb>=thr;
    const bf   = ss(mask[i]);
    const aw   = (1-bf)*opA, mw = bf*opM;
    let r=ar*aw+mr*mw, g=ag*aw+mg*mw, b=ab*aw+mb*mw;
    const tw=aw+mw; if(tw>0){r/=tw;g/=tw;b/=tw;}
    const alpha=Math.min(1,(1-bf)*(wA?0:opA)+bf*(wM?0:opM));
    if(useTransparent){
      o[p4]=r|0;o[p4+1]=g|0;o[p4+2]=b|0;o[p4+3]=(alpha*255)|0;
    } else {
      o[p4]  =(o[p4]  *(1-alpha)+r*alpha)|0;
      o[p4+1]=(o[p4+1]*(1-alpha)+g*alpha)|0;
      o[p4+2]=(o[p4+2]*(1-alpha)+b*alpha)|0;
      o[p4+3]=255;
    }
    if(i%(W*H/10|0)===0) self.postMessage({type:'progress',pct:Math.round(i/(W*H)*100)});
  }
  self.postMessage({type:'done', pixels:o.buffer},[o.buffer]);
};
`

async function composite(outW: number, p: Params, srcs: Sources, onProgress?: (pct: number) => void): Promise<HTMLCanvasElement> {
  const ref = srcs.all || srcs.mep
  if (!ref) throw new Error('No source image loaded')
  const H = Math.round(ref.naturalHeight * outW / ref.naturalWidth), W = outW

  const cAll = drawSrc(srcs.all, W, H, p.offY1)
  const cMep = drawSrc(srcs.mep, W, H, p.offY2)
  const dAll = cAll.getContext('2d')!.getImageData(0, 0, W, H).data
  const dMep = cMep.getContext('2d')!.getImageData(0, 0, W, H).data

  const out = Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ox = out.getContext('2d')!
  drawBackground(ox, W, H, p, srcs)
  const id = ox.getImageData(0, 0, W, H)

  return new Promise((resolve, reject) => {
    const blob = new Blob([WORKER_SRC], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const w = new Worker(url)
    const done = () => { w.terminate(); URL.revokeObjectURL(url) }
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'progress') { onProgress?.(e.data.pct); return }
      const pixels = new Uint8ClampedArray(e.data.pixels)
      ox.putImageData(new ImageData(pixels, W, H), 0, 0)
      done(); resolve(out)
    }
    w.onerror = (err) => { done(); reject(err) }
    // Slice into new ArrayBuffers so the originals stay valid, then transfer.
    const bufAll = dAll.buffer.slice(0)
    const bufMep = dMep.buffer.slice(0)
    const bufBG = id.data.buffer.slice(0)
    w.postMessage({ dAll: bufAll, dMep: bufMep, bgData: bufBG, W, H, p }, [bufAll, bufMep, bufBG])
  })
}

// Two-pass adaptive live preview: 480px draft while dragging, 1280px HQ after.
const DRAFT_W = 480
const HQ_W = 1280

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════

export default function BimComposer({ project, onClose }: { project: ComposerProject | null; onClose: () => void }) {
  // ── UI state ──
  const [arcInfo, setArcInfo] = useState<string | null>(null)
  const [mepInfo, setMepInfo] = useState<string | null>(null)
  const [bgInfo, setBgInfo] = useState<string | null>(null)
  const [bgMode, setBgMode] = useState<BgMode>('transparent')
  const [bgColor, setBgColor] = useState('#f5f5f5')
  const [posX, setPosX] = useState(50)
  const [blendW, setBlendW] = useState(28)
  const [cutAngle, setCutAngle] = useState(10)
  const [colorBright, setColorBright] = useState(100)
  const [photoBright, setPhotoBright] = useState(100)
  const [aiBright, setAiBright] = useState(100)
  const [horizon, setHorizon] = useState(52)
  const [resW, setResW] = useState<3840 | 7680>(3840)
  const [persp, setPersp] = useState<Persp | null>(null)
  const [showLines, setShowLines] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiStatus, setAiStatus] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiPreview, setAiPreview] = useState<string | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportPct, setExportPct] = useState(0)
  const [exportMsg, setExportMsg] = useState('Exporting…')
  const [canDownload, setCanDownload] = useState(false)
  const [dragOver, setDragOver] = useState<'arc' | 'mep' | 'bg' | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [coords, setCoords] = useState('—')

  // ── refs ──
  const srcsRef = useRef<Sources>({ all: null, mep: null, bg: null, ai: null })
  const paramsRef = useRef<Params | null>(null)
  const renderingRef = useRef(false)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hqTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null)
  const minimapVpRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)
  const zoomDisplayRef = useRef<HTMLSpanElement>(null)
  const debugCanvasRef = useRef<HTMLCanvasElement>(null)
  const fiArc = useRef<HTMLInputElement>(null)
  const fiMep = useRef<HTMLInputElement>(null)
  const fiBg = useRef<HTMLInputElement>(null)
  const vpRef = useRef({ x: 0, y: 0, s: 1 })

  // ── viewport transform ──
  const updateMinimap = useCallback(() => {
    const mm = minimapRef.current, mc = canvasRef.current, cw = wrapRef.current
    const mmC = minimapCanvasRef.current, vr = minimapVpRef.current
    if (!mm || !mc || !cw || !mmC || !vr || !mc.width) return
    const mmW = mm.clientWidth, mmH = mm.clientHeight
    mmC.width = mmW; mmC.height = mmH
    const ctx = mmC.getContext('2d')!
    ctx.clearRect(0, 0, mmW, mmH)
    const s = Math.min(mmW / mc.width, mmH / mc.height)
    const dw = mc.width * s, dh = mc.height * s
    const dx = (mmW - dw) / 2, dy = (mmH - dh) / 2
    ctx.drawImage(mc, dx, dy, dw, dh)
    const vp = vpRef.current
    const vl = (-vp.x / vp.s) * s + dx
    const vt = (-vp.y / vp.s) * s + dy
    const vw = (cw.clientWidth / vp.s) * s
    const vh = (cw.clientHeight / vp.s) * s
    vr.style.left = Math.max(dx, vl) + 'px'
    vr.style.top = Math.max(dy, vt) + 'px'
    vr.style.width = Math.min(dw, vw) + 'px'
    vr.style.height = Math.min(dh, vh) + 'px'
  }, [])

  const applyTransform = useCallback(() => {
    const vp = vpRef.current
    if (viewportRef.current) viewportRef.current.style.transform = `translate(${vp.x}px,${vp.y}px) scale(${vp.s})`
    if (zoomDisplayRef.current && document.activeElement !== zoomDisplayRef.current) {
      zoomDisplayRef.current.textContent = Math.round(vp.s * 100) + '%'
    }
    updateMinimap()
  }, [updateMinimap])

  const zoomAround = useCallback((factor: number, cx: number, cy: number) => {
    const vp = vpRef.current
    const newScale = Math.max(0.05, Math.min(20, vp.s * factor))
    const ratio = newScale / vp.s
    vp.x = cx - (cx - vp.x) * ratio
    vp.y = cy - (cy - vp.y) * ratio
    vp.s = newScale
    applyTransform()
  }, [applyTransform])

  const zoomStep = useCallback((factor: number) => {
    const cw = wrapRef.current
    if (cw) zoomAround(factor, cw.clientWidth / 2, cw.clientHeight / 2)
  }, [zoomAround])

  const zoomTo = useCallback((scale: number) => {
    const cw = wrapRef.current, mc = canvasRef.current
    if (!cw || !mc) return
    const vp = vpRef.current
    vp.s = scale
    vp.x = cw.clientWidth / 2 - mc.width * scale / 2
    vp.y = cw.clientHeight / 2 - mc.height * scale / 2
    applyTransform()
  }, [applyTransform])

  const zoomToFit = useCallback(() => {
    const cw = wrapRef.current, mc = canvasRef.current
    if (!cw || !mc || !mc.width || !mc.height) return
    const s = Math.min((cw.clientWidth - 40) / mc.width, (cw.clientHeight - 40) / mc.height, 1)
    const vp = vpRef.current
    vp.s = s
    vp.x = (cw.clientWidth - mc.width * s) / 2
    vp.y = (cw.clientHeight - mc.height * s) / 2
    applyTransform()
  }, [applyTransform])

  const resetPan = useCallback(() => {
    const cw = wrapRef.current, mc = canvasRef.current
    if (!cw || !mc) return
    const vp = vpRef.current
    vp.x = (cw.clientWidth - mc.width * vp.s) / 2
    vp.y = (cw.clientHeight - mc.height * vp.s) / 2
    applyTransform()
  }, [applyTransform])

  // ── live rendering ──
  const doLive = useCallback(async (targetW: number, isHQ: boolean) => {
    const srcs = srcsRef.current
    if (!srcs.all && !srcs.mep) return
    if (renderingRef.current && !isHQ) return
    renderingRef.current = true
    try {
      const p = paramsRef.current
      if (!p) return
      const c = await composite(targetW, p, srcs)
      const mc = canvasRef.current
      if (!mc) return
      const firstLoad = mc.width === 1
      const oldW = mc.width
      mc.width = c.width; mc.height = c.height
      mc.getContext('2d')!.drawImage(c, 0, 0)
      setHasImage(true)
      if (firstLoad) {
        setTimeout(zoomToFit, 80)
      } else if (oldW !== c.width) {
        // Draft↔HQ swap changes canvas resolution — compensate the viewport
        // scale so the image keeps the same on-screen size and position.
        vpRef.current.s *= oldW / c.width
        applyTransform()
      }
      updateMinimap()
    } catch { /* worker error — keep last frame */ } finally { renderingRef.current = false }
  }, [zoomToFit, updateMinimap, applyTransform])

  const scheduleLive = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    if (hqTimerRef.current) clearTimeout(hqTimerRef.current)
    draftTimerRef.current = setTimeout(() => doLive(DRAFT_W, false), 40)
    hqTimerRef.current = setTimeout(() => doLive(HQ_W, true), 350)
  }, [doLive])

  // Keep paramsRef in sync with the controls and re-render the preview.
  useEffect(() => {
    paramsRef.current = {
      posX, blendPct: blendW, cutAngle,
      bgBrightness: bgMode === 'photo' ? photoBright : bgMode === 'ai' ? aiBright : colorBright,
      horizPct: horizon, bgMode, bgColor,
      // fixed thresholds — no UI knobs
      whiteThresh: 248, opacityAll: 100, opacityMep: 100, offY1: 0, offY2: 0,
    }
    scheduleLive()
  }, [posX, blendW, cutAngle, bgMode, bgColor, colorBright, photoBright, aiBright, horizon, scheduleLive])

  // ── file loading ──
  const loadImageFile = useCallback((file: File, which: 'arc' | 'mep' | 'bg') => {
    const img = new Image()
    img.onload = () => {
      const info = `${file.name} · ${img.naturalWidth}×${img.naturalHeight}`
      if (which === 'arc') {
        srcsRef.current.all = img
        setArcInfo(info)
        setPersp(analysePerspective(img))
      } else if (which === 'mep') {
        srcsRef.current.mep = img
        setMepInfo(info)
      } else {
        const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight })
        c.getContext('2d')!.drawImage(img, 0, 0)
        srcsRef.current.bg = c
        setBgInfo(info)
      }
      setCanDownload(false)
      scheduleLive()
    }
    img.onerror = () => alert('Could not load image: ' + file.name)
    img.src = URL.createObjectURL(file)
  }, [scheduleLive])

  const dropProps = (which: 'arc' | 'mep' | 'bg') => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(which) },
    onDragLeave: () => setDragOver((d) => (d === which ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragOver(null)
      if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0], which)
    },
  })

  // ── AI background ──
  const generateAI = useCallback(async () => {
    const arc = srcsRef.current.all
    let p = persp
    if (arc) { p = analysePerspective(arc); setPersp(p) }
    const fullPrompt = buildSmartPrompt(p, aiPrompt.trim())
    setAiBusy(true)
    setAiStatus('🔍 Perspective analysed → generating…')
    const w = 1920, h = 864, seed = Math.floor(Math.random() * 99999)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=true&model=flux`
    const toCanvas = (img: HTMLImageElement) => {
      const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth || w, height: img.naturalHeight || h })
      c.getContext('2d')!.drawImage(img, 0, 0)
      return c
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          srcsRef.current.ai = toCanvas(img)
          setAiPreview(img.src)
          setAiStatus('✓ Generated — perspective-matched to ARC image')
          scheduleLive(); resolve()
        }
        img.onerror = () => {
          // retry without CORS — preview still shows; canvas may taint, so warn
          const img2 = new Image()
          img2.onload = () => {
            try { srcsRef.current.ai = toCanvas(img2) } catch { /* tainted */ }
            setAiPreview(img2.src)
            setAiStatus('✓ Generated')
            scheduleLive(); resolve()
          }
          img2.onerror = () => reject(new Error('Generation failed — check internet connection'))
          img2.src = url
        }
        img.src = url
      })
    } catch (e) { setAiStatus('✗ ' + (e as Error).message) }
    setAiBusy(false)
  }, [persp, aiPrompt, scheduleLive])

  const appendChip = (text: string) => setAiPrompt((v) => (v ? v.trimEnd() + ', ' + text : text))

  // ── debug lines overlay ──
  useEffect(() => {
    const dc = debugCanvasRef.current
    const img = srcsRef.current.all
    if (!showLines || !dc || !persp?.valid || !img) return
    const W = persp.canvasW!, H = persp.canvasH!
    dc.width = W; dc.height = H
    const ctx = dc.getContext('2d')!
    ctx.drawImage(img, 0, 0, W, H)
    ctx.globalAlpha = 0.6
    persp.allLines!.forEach((l, i) => {
      const c = Math.cos(l.theta), s = Math.sin(l.theta)
      ctx.strokeStyle = i < 5 ? ACCENT : '#3b82f6'
      ctx.lineWidth = i < 5 ? 1.5 : 0.7
      ctx.beginPath()
      ctx.moveTo(c * l.rho - s * 1000, s * l.rho + c * 1000)
      ctx.lineTo(c * l.rho + s * 1000, s * l.rho - c * 1000)
      ctx.stroke()
    })
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2.5; ctx.setLineDash([8, 4])
    ctx.beginPath(); ctx.moveTo(0, persp.horizonY!); ctx.lineTo(W, persp.horizonY!); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 10px sans-serif'
    ctx.fillText('ground line (columns below)', 4, persp.horizonY! - 5)
    ctx.fillStyle = 'rgba(120,80,20,0.18)'
    ctx.fillRect(0, persp.horizonY!, W, H - persp.horizonY!)
    const vps = [persp.vp1, persp.vp2]
    vps.forEach((vp, i) => {
      if (!vp) return
      ctx.fillStyle = i === 0 ? ACCENT : '#8b5cf6'
      ctx.beginPath(); ctx.arc(vp.x, vp.y, 6, 0, Math.PI * 2); ctx.fill()
      ctx.font = 'bold 9px sans-serif'
      ctx.fillText(`VP${i + 1}`, vp.x + 8, vp.y + 4)
    })
  }, [showLines, persp])

  // ── pan / zoom / keyboard listeners ──
  useEffect(() => {
    const cw = wrapRef.current
    if (!cw) return
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest?.('[data-minimap]')) return
      drag = true; sx = e.clientX; sy = e.clientY
      ox = vpRef.current.x; oy = vpRef.current.y
      cw.style.cursor = 'grabbing'; e.preventDefault()
    }
    const onMove = (e: MouseEvent) => {
      if (drag) {
        vpRef.current.x = ox + (e.clientX - sx)
        vpRef.current.y = oy + (e.clientY - sy)
        applyTransform()
      }
      const rect = cw.getBoundingClientRect()
      const vp = vpRef.current
      const cx = (e.clientX - rect.left - vp.x) / vp.s
      const cy = (e.clientY - rect.top - vp.y) / vp.s
      const mc = canvasRef.current
      if (mc && cx >= 0 && cy >= 0 && cx <= mc.width && cy <= mc.height) {
        setCoords(`x:${Math.round(cx)}  y:${Math.round(cy)}  |  ${Math.round(vp.s * 100)}%`)
      } else {
        setCoords(`${Math.round(vp.s * 100)}%`)
      }
    }
    const onUp = () => { drag = false; cw.style.cursor = 'default' }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = cw.getBoundingClientRect()
      zoomAround(e.deltaY < 0 ? 1.1 : 0.909, e.clientX - rect.left, e.clientY - rect.top)
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomStep(1.2) }
      if (e.key === '-') { e.preventDefault(); zoomStep(0.833) }
      if (e.key === '0') { e.preventDefault(); zoomToFit() }
      if (e.key === '1') { e.preventDefault(); zoomTo(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); vpRef.current.x += 40; applyTransform() }
      if (e.key === 'ArrowRight') { e.preventDefault(); vpRef.current.x -= 40; applyTransform() }
      if (e.key === 'ArrowUp') { e.preventDefault(); vpRef.current.y += 40; applyTransform() }
      if (e.key === 'ArrowDown') { e.preventDefault(); vpRef.current.y -= 40; applyTransform() }
    }

    cw.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cw.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      cw.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cw.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [applyTransform, zoomAround, zoomStep, zoomTo, zoomToFit, onClose])

  // Lock body scroll while the composer is open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Click mini-map to teleport.
  const onMinimapClick = (e: React.MouseEvent) => {
    const mm = minimapRef.current, mc = canvasRef.current, cw = wrapRef.current
    if (!mm || !mc || !cw) return
    const rect = mm.getBoundingClientRect()
    const mmW = mm.clientWidth, mmH = mm.clientHeight
    const s = Math.min(mmW / mc.width, mmH / mc.height)
    const dw = mc.width * s, dh = mc.height * s
    const dx = (mmW - dw) / 2, dy = (mmH - dh) / 2
    const imgX = (e.clientX - rect.left - dx) / s, imgY = (e.clientY - rect.top - dy) / s
    const vp = vpRef.current
    vp.x = cw.clientWidth / 2 - imgX * vp.s
    vp.y = cw.clientHeight / 2 - imgY * vp.s
    applyTransform()
  }

  const commitZoomInput = (el: HTMLElement) => {
    const val = parseFloat((el.textContent ?? '').replace('%', '').trim())
    if (!isNaN(val) && val > 0) zoomTo(Math.max(0.05, Math.min(20, val / 100)))
    else el.textContent = Math.round(vpRef.current.s * 100) + '%'
  }

  // ── export & download ──
  const doRender = async () => {
    setExporting(true); setExportPct(10); setExportMsg(`Exporting at ${resW}px…`)
    try {
      const p = paramsRef.current
      if (!p) throw new Error('Not ready')
      setExportMsg('Processing pixels…')
      resultCanvasRef.current = await composite(resW, p, srcsRef.current, (pct) => setExportPct(Math.max(10, pct)))
      setCanDownload(true)
      setExportPct(100); setExportMsg('Done!')
      await new Promise((r) => setTimeout(r, 400))
    } catch (e) { alert('Export error: ' + (e as Error).message) }
    setExporting(false)
  }

  const doDownload = () => {
    const rc = resultCanvasRef.current
    if (!rc) return
    const isPNG = bgMode === 'transparent'
    const base = project
      ? `${project.projectNumber}_${project.projectName}`.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_')
      : 'BIM'
    rc.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${base}_${rc.width}px.${isPNG ? 'png' : 'jpg'}`
      a.click()
    }, isPNG ? 'image/png' : 'image/jpeg', 0.97)
  }

  /**
   * Send the rendered canvas to a post as its cover.
   *
   * Posts the same bytes Download would have written, so what lands on the post
   * is exactly the full-resolution export — not the draft preview. The project
   * rides along so the post finally records which project it is about.
   */
  const attachToPost = async (postId: string) => {
    const rc = resultCanvasRef.current
    if (!rc) return { ok: false, error: 'Export the full-resolution image first.' }
    const isPNG = bgMode === 'transparent'
    const blob = await new Promise<Blob | null>((resolve) =>
      rc.toBlob(resolve, isPNG ? 'image/png' : 'image/jpeg', 0.97)
    )
    if (!blob) return { ok: false, error: 'Could not read the rendered image.' }

    const base = project
      ? `${project.projectNumber}_${project.projectName}`.replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_')
      : 'BIM'
    const body = new FormData()
    body.append('file', blob, `${base}_${rc.width}px.${isPNG ? 'png' : 'jpg'}`)
    body.append('origin', 'composer')
    if (project?.projectNumber) body.append('projectNumber', project.projectNumber)

    try {
      const res = await fetch(`/api/dashboard/peacock/posts/${postId}/image`, { method: 'POST', body })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: d.error ?? `Upload failed (${res.status}).` }
      return { ok: true as const }
    } catch {
      return { ok: false, error: 'Upload failed — check the connection.' }
    }
  }

  const hasSource = !!(arcInfo || mepInfo)

  // ── render ──
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', background: '#f0f2f5', color: '#1e293b' }}>
      {/* header */}
      <div className="flex items-center gap-3" style={{ background: '#fff', padding: '10px 20px', borderBottom: `2px solid ${ACCENT}`, boxShadow: '0 1px 4px rgba(0,0,0,.07)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: ACCENT, letterSpacing: '.2px' }}>BIM Composer</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Architecture + Systems → Presentation Render</div>
        </div>
        {project && (
          <span dir="auto" style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT, background: '#eef3fe', padding: '5px 12px', borderRadius: 999, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.projectNumber} · {project.projectName}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10 }}>v5.2</span>
        <button onClick={onClose} title="Close (Esc)"
          className="inline-flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #dfe6f3', background: '#fff', color: '#64748b', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* ── sidebar ── */}
        <div style={{ background: '#fff', padding: '12px 11px', overflowY: 'auto', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 9 }}>

          {/* source files */}
          <Card title="Source Files">
            <FileRow icon="🏗" label="Architecture (ARC)" badge="LEFT" badgeCls="bg-blue-100 text-blue-700"
              info={arcInfo} dragOver={dragOver === 'arc'} onClick={() => fiArc.current?.click()} {...dropProps('arc')} />
            <input ref={fiArc} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) loadImageFile(e.target.files[0], 'arc'); e.target.value = '' }} />
            <FileRow icon="🔧" label="Systems / MEP" badge="RIGHT" badgeCls="bg-emerald-100 text-emerald-700"
              info={mepInfo} dragOver={dragOver === 'mep'} onClick={() => fiMep.current?.click()} {...dropProps('mep')} />
            <input ref={fiMep} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) loadImageFile(e.target.files[0], 'mep'); e.target.value = '' }} />
          </Card>

          {/* background */}
          <Card title="Background">
            <div className="flex gap-1.5 mb-2">
              {(['transparent', 'color', 'photo', 'ai'] as BgMode[]).map((m) => (
                <button key={m} onClick={() => setBgMode(m)}
                  className="flex-1 rounded-md text-center font-semibold"
                  style={{
                    padding: '6px 3px', fontSize: 10.5, cursor: 'pointer', transition: '.14s',
                    border: `1.5px solid ${bgMode === m ? ACCENT : '#e2e8f0'}`,
                    background: bgMode === m ? '#eef3fe' : '#f8fafc',
                    color: bgMode === m ? ACCENT : '#64748b',
                  }}>
                  {m === 'transparent' ? '⬜ None' : m === 'color' ? '🎨 Color' : m === 'photo' ? '🌆 Photo' : '✨ AI'}
                </button>
              ))}
            </div>

            {bgMode === 'transparent' && (
              <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '4px 0 2px' }}>
                Transparent background — exports as PNG
              </div>
            )}

            {bgMode === 'color' && (
              <>
                <div className="flex items-center gap-2 mt-1">
                  <label style={{ fontSize: 11.5, color: '#475569', fontWeight: 500, flex: 1 }}>Background color</label>
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: 34, height: 26, border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', padding: 2, background: '#fff' }} />
                </div>
                <Ctrl label="Brightness" value={colorBright} unit="%" min={20} max={100} onChange={setColorBright} />
              </>
            )}

            {bgMode === 'photo' && (
              <>
                <FileRow icon="🌆" label="Background Photo" info={bgInfo} dragOver={dragOver === 'bg'}
                  onClick={() => fiBg.current?.click()} {...dropProps('bg')} />
                <input ref={fiBg} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files?.[0]) loadImageFile(e.target.files[0], 'bg'); e.target.value = '' }} />
                <Ctrl label="Brightness" value={photoBright} unit="%" min={20} max={100} onChange={setPhotoBright} />
                <Ctrl label="Horizon" value={horizon} unit="%" min={20} max={80} onChange={setHorizon} />
              </>
            )}

            {bgMode === 'ai' && (
              <>
                {/* perspective analysis */}
                <div style={{ background: '#f0f4fd', border: '1px solid #c9d5f0', borderRadius: 7, padding: '9px 10px', marginBottom: 8, fontSize: 11 }}>
                  <div style={{ fontWeight: 700, marginBottom: 5, color: ACCENT }}>📐 Perspective Analysis</div>
                  {!persp ? (
                    <span style={{ color: '#94a3b8' }}>Load Architecture (ARC) image to enable analysis</span>
                  ) : !persp.valid ? (
                    <span style={{ color: '#94a3b8' }}>{persp.reason} — load the ARC image first</span>
                  ) : (
                    <div style={{ lineHeight: 1.7, color: '#1e293b', fontSize: 10.5 }}>
                      <b>Ground line:</b> {Math.round((persp.horizonPct ?? 0) * 100)}% from top (walls end here — columns below)<br />
                      <b>Camera:</b> {persp.cameraAngleLabel}<br />
                      <b>Direction:</b> {persp.viewDirLabel}<br />
                      <b>Lines:</b> {persp.lineCount} &nbsp;·&nbsp; <b>VP:</b> {persp.vp1 ? 'VP1' + (persp.vp2 ? '+VP2' : '') : 'not found'}
                    </div>
                  )}
                  {persp?.valid && (
                    <>
                      {showLines && <canvas ref={debugCanvasRef} style={{ width: '100%', borderRadius: 4, marginTop: 6, border: '1px solid #c9d5f0' }} />}
                      <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer" style={{ fontSize: 10.5, color: '#475569' }}>
                        <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} style={{ accentColor: ACCENT }} />
                        Show detected lines
                      </label>
                    </>
                  )}
                </div>

                <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={2}
                  placeholder="Add scene details… (auto-filled from analysis)"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 11.5, fontFamily: 'inherit', resize: 'none', outline: 'none', color: '#1e293b', background: '#fff' }} />

                <div className="flex flex-wrap gap-1 my-1.5">
                  {[
                    ['🌇 Dusk', 'golden hour, warm light'],
                    ['☁️ Overcast', 'overcast sky, soft shadows'],
                    ['⛈ Storm', 'stormy sky, dramatic clouds'],
                    ['🌙 Night', 'night, city lights, long exposure'],
                    ['🏖 Coastal', 'Mediterranean coastline background'],
                    ['🏙 Urban', 'dense urban skyline'],
                  ].map(([label, text]) => (
                    <button key={label} onClick={() => appendChip(text)}
                      style={{ padding: '3px 8px', border: '1.5px solid #e2e8f0', borderRadius: 20, background: '#f8fafc', color: '#475569', fontSize: 10.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {label}
                    </button>
                  ))}
                </div>

                <button onClick={generateAI} disabled={aiBusy}
                  className="flex items-center justify-center gap-1.5 w-full font-bold"
                  style={{ padding: 9, background: aiBusy ? '#a9b3dd' : ACCENT, border: 'none', borderRadius: 7, color: '#fff', fontSize: 12.5, cursor: aiBusy ? 'not-allowed' : 'pointer' }}>
                  <Sparkles size={13} /> {aiBusy ? 'Generating…' : 'Analyse & Generate'}
                </button>
                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4, minHeight: 14 }}>{aiStatus}</div>
                {aiPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={aiPreview} alt="AI background" style={{ width: '100%', borderRadius: 6, marginTop: 6, border: '1px solid #e2e8f0' }} />
                )}
                <Ctrl label="Brightness" value={aiBright} unit="%" min={20} max={100} onChange={setAiBright} />
              </>
            )}
          </Card>

          {/* cut & blend */}
          <Card title="Cut & Blend" badge="● LIVE">
            <Ctrl label="X Position" value={posX} unit="%" min={0} max={100} onChange={setPosX}
              hint="0 = far left · 50 = center · 100 = far right" />
            <Ctrl label="Blend Width" value={blendW} unit="%" min={0} max={100} onChange={setBlendW}
              hint="0 = blend zone left of image · 50 = center · 100 = right of image" />
            <Ctrl label="Cut Angle" value={cutAngle} unit="°" min={0} max={90} onChange={setCutAngle}
              hint="0° = vertical cut · 90° = full diagonal" />
          </Card>

          {/* resolution */}
          <Card title="Export Resolution">
            <div className="flex gap-1.5">
              {([3840, 7680] as const).map((w) => (
                <button key={w} onClick={() => setResW(w)}
                  className="flex-1 text-center"
                  style={{
                    padding: '7px 3px', borderRadius: 6, cursor: 'pointer', transition: '.14s',
                    border: `1.5px solid ${resW === w ? ACCENT : '#e2e8f0'}`,
                    background: resW === w ? '#eef3fe' : '#f8fafc',
                    color: resW === w ? ACCENT : '#475569',
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{w === 3840 ? '4K' : '8K'}</div>
                  <div style={{ fontSize: 9.5, color: '#94a3b8' }}>{w}px</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 5, textAlign: 'center' }}>Export: {resW} × auto px</div>
          </Card>

          <button onClick={doRender} disabled={!hasSource || exporting}
            className="w-full font-bold"
            style={{ padding: 10, border: 'none', borderRadius: 7, fontSize: 13.5, cursor: hasSource && !exporting ? 'pointer' : 'not-allowed', background: hasSource && !exporting ? ACCENT : '#a9b3dd', color: '#fff' }}>
            ▶ Export Full Resolution
          </button>
          <button onClick={doDownload} disabled={!canDownload}
            className="w-full font-bold inline-flex items-center justify-center gap-1.5"
            style={{ padding: 10, borderRadius: 7, fontSize: 13.5, background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0', cursor: canDownload ? 'pointer' : 'not-allowed', opacity: canDownload ? 1 : 0.4 }}>
            <Download size={14} /> Download
          </button>
          {/* The render only existed in this canvas until now: closing the
              composer threw it away, and Download put it in the OS downloads
              folder rather than anywhere the platform could see. */}
          <button onClick={() => setPickerOpen(true)} disabled={!canDownload}
            className="w-full font-bold inline-flex items-center justify-center gap-1.5"
            style={{ padding: 10, borderRadius: 7, fontSize: 13.5, background: canDownload ? '#eef3fe' : '#f1f5f9',
              color: ACCENT, border: `1.5px solid ${canDownload ? '#b9c6ea' : '#e2e8f0'}`,
              cursor: canDownload ? 'pointer' : 'not-allowed', opacity: canDownload ? 1 : 0.4 }}>
            <ImagePlus size={14} /> Use in a post…
          </button>
          {!canDownload && hasSource && (
            <div style={{ fontSize: 10.5, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              Export first — both actions work on the full-resolution render.
            </div>
          )}
        </div>

        {pickerOpen && (
          <PostPicker
            project={project}
            onClose={() => setPickerOpen(false)}
            onPick={attachToPost}
          />
        )}

        {/* ── preview ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: '#dde1e7' }}>
          {/* toolbar */}
          <div className="flex items-center gap-1.5" style={{ background: '#fff', padding: '6px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
            <TbBtn onClick={() => zoomStep(1.25)} title="Zoom in (scroll up)">＋</TbBtn>
            <span ref={zoomDisplayRef} contentEditable suppressContentEditableWarning
              onBlur={(e) => commitZoomInput(e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() }
                if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.textContent = Math.round(vpRef.current.s * 100) + '%'; (e.currentTarget as HTMLElement).blur() }
              }}
              style={{ fontSize: 11.5, color: '#475569', fontWeight: 600, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 8px', minWidth: 52, textAlign: 'center', cursor: 'text', fontVariantNumeric: 'tabular-nums' }}>
              100%
            </span>
            <TbBtn onClick={() => zoomStep(0.8)} title="Zoom out (scroll down)">－</TbBtn>
            <Sep />
            <TbBtn onClick={zoomToFit} title="Fit canvas to window">⊡ Fit</TbBtn>
            <TbBtn onClick={() => zoomTo(1)} title="Actual size (100%)">1:1</TbBtn>
            <TbBtn onClick={() => zoomTo(2)} title="200%">2×</TbBtn>
            <Sep />
            <TbBtn onClick={resetPan} title="Centre canvas">⌖ Centre</TbBtn>
            <span style={{ fontSize: 10.5, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto', minWidth: 120, textAlign: 'right' }}>{coords}</span>
          </div>

          {/* viewport */}
          <div ref={wrapRef} style={{
            flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0,
            backgroundColor: '#dde1e7',
            backgroundImage: 'linear-gradient(45deg,#c8cdd6 25%,transparent 25%),linear-gradient(-45deg,#c8cdd6 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c8cdd6 75%),linear-gradient(-45deg,transparent 75%,#c8cdd6 75%)',
            backgroundSize: '18px 18px',
            backgroundPosition: '0 0,0 9px,9px -9px,-9px 0',
          }}>
            {!hasImage && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ fontSize: '4rem', filter: 'grayscale(1) opacity(.25)' }}>🏗</div>
                <p style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, color: '#94a3b8' }}>
                  Load BIM renders on the left<br />to see a <strong style={{ color: ACCENT }}>live preview</strong>
                </p>
              </div>
            )}
            <div ref={viewportRef} style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', willChange: 'transform' }}>
              <canvas ref={canvasRef} width={1} height={1}
                style={{ display: 'block', borderRadius: 4, boxShadow: '0 6px 36px rgba(0,0,0,.2), 0 1px 6px rgba(0,0,0,.12)' }} />
            </div>
          </div>

          {/* mini-map */}
          <div ref={minimapRef} data-minimap onClick={onMinimapClick} title="Click to navigate"
            style={{ position: 'absolute', bottom: 14, right: 14, width: 140, height: 80, background: 'rgba(255,255,255,.9)', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.12)', cursor: 'pointer', display: hasImage ? 'block' : 'none' }}>
            <canvas ref={minimapCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div ref={minimapVpRef} style={{ position: 'absolute', border: `1.5px solid ${ACCENT}`, background: 'rgba(30,36,140,.08)', pointerEvents: 'none' }} />
          </div>

          {/* export spinner */}
          {exporting && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(240,242,245,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, flexDirection: 'column' }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '24px 34px', textAlign: 'center', minWidth: 190, boxShadow: '0 4px 20px rgba(0,0,0,.10)' }}>
                <div style={{ width: 34, height: 34, border: '3px solid #e2e8f0', borderTopColor: ACCENT, borderRadius: '50%', animation: 'bimspin .7s linear infinite', margin: '0 auto 11px' }} />
                <div style={{ fontSize: 12.5, color: '#64748b' }}>{exportMsg}</div>
                <div style={{ marginTop: 10, background: '#f1f5f9', borderRadius: 4, height: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: ACCENT, borderRadius: 4, transition: 'width .3s', width: `${Math.max(5, exportPct)}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{'@keyframes bimspin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )
}

// ── small presentational pieces ──

interface PickerPost {
  id: string
  title: string
  status: string
  postType: string | null
  publishDate: string | null
  projectNumber: string | null
  imageUrl: string | null
}

/**
 * Choose the post this render belongs to.
 *
 * Posts already tied to this project sort to the top, but the full list stays
 * available: `projectNumber` is empty on every existing post, so filtering down
 * to the project would show an empty picker and the feature would look broken.
 * Attaching a composer render is what starts filling that field in.
 */
function PostPicker({
  project, onClose, onPick,
}: {
  project: ComposerProject | null
  onClose: () => void
  onPick: (postId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [posts, setPosts] = useState<PickerPost[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/peacock/posts?slim=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => setError('Could not load the content plan.'))
      .finally(() => setLoading(false))
  }, [])

  const needle = q.trim().toLowerCase()
  const shown = posts
    .filter((p) => !needle || p.title.toLowerCase().includes(needle))
    .sort((a, b) => {
      // This project's posts first, then Project-pillar posts, then the rest.
      const rank = (p: PickerPost) =>
        project && p.projectNumber === project.projectNumber ? 0 : p.postType === '4. Project' ? 1 : 2
      const d = rank(a) - rank(b)
      if (d !== 0) return d
      return (b.publishDate ?? '').localeCompare(a.publishDate ?? '')
    })
    .slice(0, 60)

  async function pick(p: PickerPost) {
    if (busyId) return
    if (p.imageUrl && !confirm(`"${p.title}" already has a cover. Replace it?`)) return
    setBusyId(p.id)
    setError(null)
    const res = await onPick(p.id)
    setBusyId(null)
    if (res.ok) {
      setDoneId(p.id)
      setPosts((xs) => xs.map((x) => (x.id === p.id ? { ...x, imageUrl: 'set' } : x)))
      setTimeout(onClose, 900)
    } else {
      setError(res.error ?? 'Could not attach the image.')
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: 560, maxWidth: '100%', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div className="flex items-center justify-between gap-3">
            <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>Use this render in a post</div>
            <button onClick={onClose} aria-label="Close"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
              <X size={17} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
            {project
              ? `Project ${project.projectNumber} — ${project.projectName}. The post will record this project number.`
              : 'No project context — the image attaches without a project link.'}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the content plan…"
            dir="auto"
            style={{ marginTop: 10, width: '100%', fontSize: 13, fontFamily: 'inherit', padding: '7px 10px',
              border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none' }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {loading && <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading posts…</p>}
          {!loading && shown.length === 0 && (
            <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No posts match.</p>
          )}
          {shown.map((p) => {
            const mine = project && p.projectNumber === project.projectNumber
            return (
              <button
                key={p.id}
                onClick={() => pick(p)}
                disabled={!!busyId}
                className="w-full text-left flex items-center gap-3"
                style={{ border: 'none', background: doneId === p.id ? '#e8f9ee' : 'transparent', fontFamily: 'inherit',
                  padding: '9px 10px', borderRadius: 8, cursor: busyId ? 'wait' : 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div dir="auto" style={{ fontSize: 13, fontWeight: 600, color: '#1e293b',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {p.postType ?? '—'} · {p.status.replace(/_/g, ' ')}
                    {p.projectNumber ? ` · project ${p.projectNumber}` : ''}
                    {p.imageUrl ? ' · has a cover' : ''}
                  </div>
                </div>
                {mine && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, background: '#eef3fe',
                    padding: '3px 7px', borderRadius: 999, flex: 'none' }}>
                    this project
                  </span>
                )}
                {doneId === p.id && <Check size={15} style={{ color: '#16a34a', flex: 'none' }} />}
                {busyId === p.id && <span style={{ fontSize: 11, color: '#94a3b8', flex: 'none' }}>attaching…</span>}
              </button>
            )
          })}
        </div>

        {error && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#e2445c' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: 11 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.6, color: '#94a3b8', marginBottom: 9, fontWeight: 600 }}>
        <span style={{ display: 'block', width: 3, height: 10, background: ACCENT, borderRadius: 2 }} />
        {title}
        {badge && <span style={{ fontSize: 9, background: '#e6f9f0', color: '#065f46', padding: '1px 6px', borderRadius: 8, marginLeft: 4, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>{badge}</span>}
      </div>
      {children}
    </div>
  )
}

function FileRow({ icon, label, badge, badgeCls, info, dragOver, onClick, ...drop }: {
  icon: string; label: string; badge?: string; badgeCls?: string
  info: string | null; dragOver: boolean; onClick: () => void
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div onClick={onClick} {...drop}
      className="flex items-center gap-2"
      style={{
        padding: '8px 10px', borderRadius: 7, cursor: 'pointer', transition: 'all .18s', marginBottom: 7, userSelect: 'none',
        border: info ? '1.5px solid #10b981' : dragOver ? `1.5px solid ${ACCENT}` : '1.5px dashed #cbd5e1',
        background: info ? '#f0fdf4' : dragOver ? '#f0f4fd' : '#fff',
      }}>
      <div style={{ fontSize: '1.3rem', flexShrink: 0, pointerEvents: 'none' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0, pointerEvents: 'none' }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#475569' }}>{label}</div>
        <div style={{ fontSize: 9.5, color: info ? '#059669' : '#94a3b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: info ? 500 : 400 }}>
          {info ?? 'Click or drag image here'}
        </div>
      </div>
      {badge && <span className={`${badgeCls ?? ''}`} style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 3, fontWeight: 600, flexShrink: 0, pointerEvents: 'none' }}>{badge}</span>}
    </div>
  )
}

function Ctrl({ label, value, unit, min, max, onChange, hint }: {
  label: string; value: number; unit: string; min: number; max: number
  onChange: (v: number) => void; hint?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
      <div className="flex justify-between" style={{ fontSize: 11.5, color: '#475569', fontWeight: 500 }}>
        {label} <span style={{ color: ACCENT, fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: ACCENT, cursor: 'pointer' }} />
      {hint && <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

function TbBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center gap-1"
      style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

function Sep() {
  return <span style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 3px' }} />
}
