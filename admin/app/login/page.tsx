import LoginForm from "@/components/LoginForm";

/**
 * Admin login page — FacePass Security & Workforce Operations.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper,#F6F5F1)] px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-[3px] bg-[var(--ink,#14171C)] flex items-center justify-center mx-auto mb-3 shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--ink,#14171C)]">FacePass Operations</h1>
          <p className="text-xs text-[var(--muted,#6E7175)] mt-0.5">Facility Administration &amp; Identity Console</p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted,#6E7175)] mb-4 text-center">
            Sign in to Console
          </h2>
          <LoginForm />
        </div>

        {/* Switch to Employee Portal */}
        <div className="mt-4 text-center">
          <a
            href="/portal/login"
            className="text-xs text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] transition-colors underline"
          >
            Looking to clock in? Go to Employee Portal &rarr;
          </a>
        </div>

        <p className="text-center text-[var(--muted,#6E7175)] text-xs mt-4 font-mono">
          FacePass v2.4 · Marrakesh Regional Center
        </p>
      </div>
    </div>
  );
}
