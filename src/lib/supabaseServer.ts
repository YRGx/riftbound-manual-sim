import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key. Check your environment variables.");
}

type CookieStore = ReturnType<typeof cookies>;

function setCookie(
  cookieStore: CookieStore,
  name: string,
  value: string,
  options?: CookieOptions
) {
  cookieStore.set({
    name,
    value,
    ...options,
    // App Router requires explicit path for auth cookies to stick
    path: options?.path ?? "/",
  });
}

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: CookieOptions) {
        setCookie(cookieStore, name, value, options);
      },
      remove(name: string, options?: CookieOptions) {
        setCookie(cookieStore, name, "", {
          ...options,
          maxAge: 0,
        });
      },
    },
  });
}
