import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key. Check your environment variables.");
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

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

interface CreateClientOptions {
  allowCookieWrite?: boolean;
}

export async function createSupabaseServerClient(options?: CreateClientOptions) {
  const { allowCookieWrite = false } = options ?? {};
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }));
      },
      setAll(cookiesToSet) {
        if (!allowCookieWrite) {
          return;
        }
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookie(cookieStore, name, value, options);
        });
      },
    },
  });
}
