export default function TestPage() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold">Supabase Env Check</h1>
      <ul className="list-disc pl-6">
        <li>NEXT_PUBLIC_SUPABASE_URL: {hasUrl ? "✅" : "❌"}</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY: {hasAnon ? "✅" : "❌"}</li>
        <li>SUPABASE_SERVICE_ROLE_KEY: {hasService ? "✅" : "❌"}</li>
      </ul>
      <p className="text-sm opacity-80">
        If any are ❌, stop and check your .env.local values, then restart the dev server.
      </p>
    </main>
  );
}
