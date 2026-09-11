import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

/**
 * Root page — redirects to /dashboard or /login based on auth state.
 */
export default async function Home() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
