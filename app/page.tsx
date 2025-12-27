import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/lobby");
  }

  redirect("/auth");
}
