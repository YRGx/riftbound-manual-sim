import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import AuthForm from "./AuthForm";

export default async function AuthPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/lobby");
  }

  return <AuthForm />;
}
