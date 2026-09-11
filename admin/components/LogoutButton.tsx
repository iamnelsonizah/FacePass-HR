"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/**
 * Logout button component.
 */
export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="text-gray-500 hover:text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
    >
      Sign Out
    </button>
  );
}
