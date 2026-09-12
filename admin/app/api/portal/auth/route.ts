import { NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...payload } = body;

    let targetEndpoint = "";
    switch (action) {
      case "signup":
        targetEndpoint = "/api/auth/signup";
        break;
      case "verify-activation":
        targetEndpoint = "/api/auth/verify-activation";
        break;
      case "resend-activation":
        targetEndpoint = "/api/auth/resend-activation";
        break;
      case "forgot-password":
        targetEndpoint = "/api/auth/forgot-password";
        break;
      case "verify-reset-code":
        targetEndpoint = "/api/auth/verify-reset-code";
        break;
      case "reset-password":
        targetEndpoint = "/api/auth/reset-password";
        break;
      case "login":
        targetEndpoint = "/api/auth/login";
        break;
      default:
        return NextResponse.json({ error: "Invalid auth action" }, { status: 400 });
    }

    const res = await fetch(`${BACKEND_URL}${targetEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || data.message || `Request failed (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Authentication gateway service error" },
      { status: 500 }
    );
  }
}
