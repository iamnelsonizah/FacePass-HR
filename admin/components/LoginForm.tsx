"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/**
 * Login form component with email/password authentication.
 */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-[#AE3B26]/10 border border-[#AE3B26]/30 text-[#AE3B26] px-3 py-2 rounded-[3px] text-xs">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@facepass.com"
          required
          className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn btn-dark w-full py-2 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Authenticating..." : "Sign In to Operations"}
      </button>
    </form>
  );
}
