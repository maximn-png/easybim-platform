export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">EasyBIM Agents</h1>
      <p className="mt-2 text-sm opacity-70">
        Autonomous agents hub. The LinkedIn marketing agent runs weekly (Vercel Cron) and
        reacts to Monday status changes (webhook). Dashboard UI is coming in Phase 2.
      </p>
    </main>
  );
}
