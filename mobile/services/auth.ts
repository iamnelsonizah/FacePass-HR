import api from "./api";
import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";

/**
 * Sign up a new employee account. Account will be pending 6-digit email OTP activation.
 */
export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  employeeCode?: string
) {
  const payload: any = {
    email: email.trim().toLowerCase(),
    password,
    first_name: firstName.trim(),
    last_name: lastName.trim(),
  };
  if (employeeCode && employeeCode.trim()) {
    payload.employee_code = employeeCode.trim();
  }

  const response = await api.post("/api/auth/signup", payload);
  return {
    pending_activation: response.data.pending_activation as boolean,
    email: response.data.email as string,
    message: response.data.message as string,
    dev_code: response.data.dev_code as string | undefined,
  };
}

/**
 * Verify the 6-digit activation code sent to the user's email.
 */
export async function verifyActivation(email: string, code: string) {
  const response = await api.post("/api/auth/verify-activation", {
    email: email.trim().toLowerCase(),
    code: code.trim(),
  });
  return response.data as {
    activated: boolean;
    employee_code: string | null;
    email: string;
    message: string;
  };
}

/**
 * Resend a new activation code to the user's email.
 */
export async function resendActivation(email: string) {
  const response = await api.post("/api/auth/resend-activation", {
    email: email.trim().toLowerCase(),
  });
  return response.data as { message: string; dev_code?: string };
}

/**
 * Request a password reset code sent to the user's email.
 */
export async function forgotPassword(emailOrId: string) {
  const response = await api.post("/api/auth/forgot-password", {
    email_or_id: emailOrId.trim(),
  });
  return response.data as { message: string; email?: string; dev_code?: string };
}

/**
 * Verify a password reset code.
 */
export async function verifyResetCode(email: string, code: string) {
  const response = await api.post("/api/auth/verify-reset-code", {
    email: email.trim().toLowerCase(),
    code: code.trim(),
  });
  return response.data as { valid: boolean; message: string };
}

/**
 * Reset the user's password with a verified OTP code.
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string
) {
  const response = await api.post("/api/auth/reset-password", {
    email: email.trim().toLowerCase(),
    code: code.trim(),
    new_password: newPassword,
  });
  return response.data as { message: string };
}

/**
 * Sign in with EITHER Employee ID (e.g. FP-49201) OR Email, plus password.
 */
export async function signIn(emailOrId: string, password: string) {
  const response = await api.post("/api/auth/login", {
    email_or_id: emailOrId.trim(),
    password,
  });

  const { access_token, employee_code, email, user_id } = response.data;
  if (access_token) {
    await supabase.auth.setSession({
      access_token,
      refresh_token: access_token,
    });
  }

  return {
    access_token,
    employee_code,
    email,
    user_id,
  };
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the current authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current session.
 */
export async function getSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Listen for auth state changes.
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);
  return subscription;
}
