'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function PhotoGallery() {
  const [photos, setPhotos] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/photos')
      .then(r => r.json())
      .then(d => setPhotos(d.photos ?? []))
      .catch(() => {})
  }, [])

  if (photos.length === 0) return null

  const doubled = [...photos, ...photos]

  return (
    <section className="w-full mt-4" style={{ background: '#0a0e2e' }}>
      <div className="py-5">
        {/* Section heading */}
        <div className="text-center mb-5 px-6">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-2"
            style={{ color: '#44b8d3' }}
          >
            Our Team
          </p>
          <h2 className="text-white text-2xl font-black">
            EasyBIM &mdash; It&rsquo;s All About People
          </h2>
        </div>

        {/* Marquee strip */}
        <div className="relative overflow-hidden">
          {/* Left vignette */}
          <div
            className="absolute left-0 top-0 bottom-0 w-28 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, #0a0e2e, transparent)' }}
          />
          {/* Right vignette */}
          <div
            className="absolute right-0 top-0 bottom-0 w-28 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, #0a0e2e, transparent)' }}
          />

          <div className="flex gap-4 animate-marquee" style={{ width: 'max-content' }}>
            {doubled.map((url, i) => (
              <div
                key={i}
                className="relative flex-shrink-0 rounded-2xl overflow-hidden"
                style={{
                  width: 260,
                  height: 180,
                  boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                  border: '1px solid rgba(68,184,211,0.15)',
                }}
              >
                <Image
                  src={url}
                  alt="EasyBIM team"
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom accent */}
        <p className="text-center text-xs mt-5 font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>
          EasyBIM Platform &mdash; Built by People, Driven by Innovation
        </p>
      </div>
    </section>
  )
}
