import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen bg-[#f8f9ff] overflow-hidden">
      {/* Background blobs */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#44b8d3]/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/3 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-[#1e248c]/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      <div className="relative flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <Image
            src="/easybim_logo-b.png"
            alt="EasyBIM"
            width={160}
            height={52}
            className="object-contain"
            priority
          />
          <p className="text-sm font-medium text-[#6b7280]">Newsletter Generator</p>
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
  );
}
