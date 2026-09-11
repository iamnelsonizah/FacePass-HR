import LoginForm from "@/components/LoginForm";

/**
 * Admin login page.
 */
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-3xl font-bold text-blue-600">FacePass</h1>
          <p className="text-gray-500 mt-1">Admin Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
            Sign in to your account
          </h2>
          <LoginForm />
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          FacePass © {new Date().getFullYear()} — Contactless Facial Attendance
        </p>
      </div>
    </div>
  );
}
