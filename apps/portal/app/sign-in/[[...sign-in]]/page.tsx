import { SignIn } from '@clerk/nextjs'
import Image from 'next/image'

export default function SignInPage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #eef6fb 0%, #f8f9ff 45%, #f0f4ff 100%)' }}>

      {/* Background blobs */}
      <div style={{ position: 'fixed', top: '-5%', right: '-8%', width: 700, height: 700, background: 'radial-gradient(circle, rgba(68,184,211,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-8%', left: '-8%', width: 620, height: 620, background: 'radial-gradient(circle, rgba(30,36,140,0.10) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div className="relative flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <Image
            src="/easybim_logo-w.png"
            alt="EasyBIM"
            width={200}
            height={65}
            className="object-contain"
            priority
          />
          <p className="text-sm font-medium text-[#6b7280] mt-1">Internal Tools Platform</p>
        </div>

        <SignIn
          appearance={{
            variables: {
              colorPrimary: '#1e248c',
              colorBackground: '#ffffff',
              borderRadius: '16px',
            },
            elements: {
              card: 'shadow-sm border border-[#e8eaff]',
            },
          }}
        />
      </div>
    </main>
  )
}
