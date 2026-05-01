import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center min-h-screen bg-[#f8f9ff]">
      <SignUp />
    </main>
  )
}
