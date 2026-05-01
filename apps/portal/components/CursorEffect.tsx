'use client'

import { useEffect, useRef, useState } from 'react'

export default function CursorEffect() {
  const [mouse, setMouse] = useState({ x: -300, y: -300 })
  const [trail, setTrail] = useState({ x: -300, y: -300 })
  const mouseRef = useRef({ x: -300, y: -300 })
  const rafRef   = useRef<number>(0)

  useEffect(() => {
    document.body.classList.add('landing-cursor-off')
    return () => document.body.classList.remove('landing-cursor-off')
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = { x: e.clientX, y: e.clientY }
      setMouse(p)
      mouseRef.current = p
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const tick = () => {
      setTrail(prev => ({
        x: prev.x + (mouseRef.current.x - prev.x) * 0.1,
        y: prev.y + (mouseRef.current.y - prev.y) * 0.1,
      }))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <>
      {/* Glowing dot */}
      <div style={{
        position: 'fixed', left: mouse.x, top: mouse.y,
        width: 10, height: 10, borderRadius: '50%',
        background: '#44b8d3',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', zIndex: 9999,
        boxShadow: '0 0 16px 6px rgba(68,184,211,0.6)',
      }} />
      {/* Lagging ring */}
      <div style={{
        position: 'fixed', left: trail.x, top: trail.y,
        width: 40, height: 40, borderRadius: '50%',
        border: '1.5px solid rgba(68,184,211,0.5)',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', zIndex: 9998,
      }} />
    </>
  )
}
