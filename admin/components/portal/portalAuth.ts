export interface PortalUser {
  user_id: string;
  email: string;
  employee_code?: string;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  token: string;
  is_enrolled?: boolean;
}

const STORAGE_KEY = "facepass_portal_session";

export function getPortalSession(): PortalUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setPortalSession(data: PortalUser): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Also set a lightweight cookie for Next.js SSR awareness if needed
    document.cookie = `facepass_portal_token=${data.token}; path=/portal; max-age=604800; SameSite=Lax`;
  } catch (err) {
    console.warn("Could not save portal session:", err);
  }
}

export function clearPortalSession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = "facepass_portal_token=; path=/portal; max-age=0; SameSite=Lax";
  } catch (err) {
    console.warn("Could not clear portal session:", err);
  }
}

export function getPortalAuthHeaders(): Record<string, string> {
  const session = getPortalSession();
  const headers: Record<string, string> = {};
  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }
  return headers;
}
