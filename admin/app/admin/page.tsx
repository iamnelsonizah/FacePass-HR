import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";

/**
 * Administrative Route Gateway (/admin)
 * Discreet entry point for facility administrators.
 * Redirects to /dashboard if already authenticated, or /login to authenticate.
 */
export default async function AdminGatewayPage() {
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
