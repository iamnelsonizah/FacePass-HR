"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

interface LogoutButtonProps {
  className?: string;
  showText?: boolean;
}

/**
 * Logout button component.
 */
export default function LogoutButton({ className, showText = false }: LogoutButtonProps) {
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
      className={
        className ||
        "text-[#84878D] hover:text-white transition-colors p-1 bg-transparent border-0 cursor-pointer flex items-center gap-1.5"
      }
      title="Sign out"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20H15M10 8l-4 4 4 4M6 12h12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showText && <span className="text-xs">Sign out</span>}
    </button>
  );
}
