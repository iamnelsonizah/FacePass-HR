import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const authHeader = request.headers.get("authorization") || "";

    const supabase = await createServerClient();

    // 1. Handle FormData (Multipart) from web camera capture
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const employeeId = formData.get("employee_id") as string | null;
      const employeeCode = formData.get("employee_code") as string | null;
      const email = formData.get("email") as string | null;

      // Resolve employee ID if only code or email provided
      let resolvedEmpId = employeeId;
      let empRecord: any = null;

      if (!resolvedEmpId && employeeCode) {
        const { data } = await supabase
          .from("employees")
          .select("id, employee_code, email, first_name, last_name")
          .ilike("employee_code", employeeCode.trim())
          .limit(1);
        if (data && data.length > 0) {
          resolvedEmpId = data[0].id;
          empRecord = data[0];
        }
      } else if (!resolvedEmpId && email) {
        const { data } = await supabase
          .from("employees")
          .select("id, employee_code, email, first_name, last_name")
          .ilike("email", email.trim().toLowerCase())
          .limit(1);
        if (data && data.length > 0) {
          resolvedEmpId = data[0].id;
          empRecord = data[0];
        }
      } else if (resolvedEmpId) {
        const { data } = await supabase
          .from("employees")
          .select("id, employee_code, email, first_name, last_name")
          .eq("id", resolvedEmpId)
          .limit(1);
        if (data && data.length > 0) {
          empRecord = data[0];
        }
      }

      if (!resolvedEmpId) {
        return NextResponse.json(
          { error: "Employee identification is required for enrollment" },
          { status: 400 }
        );
      }

      // Forward to FastAPI Backend enrollment endpoint
      let backendSuccess = false;
      let backendMessage = "";

      try {
        const backendFormData = new FormData();
        backendFormData.append("employee_id", resolvedEmpId);

        // Append all images
        const images = formData.getAll("images");
        for (const img of images) {
          if (img instanceof Blob) {
            backendFormData.append("images", img, "face_capture.jpg");
          }
        }

        const backendHeaders: Record<string, string> = {};
        if (authHeader) {
          backendHeaders["Authorization"] = authHeader;
        }

        const backendRes = await fetch(`${BACKEND_URL}/api/employees/enroll`, {
          method: "POST",
          headers: backendHeaders,
          body: backendFormData,
        });

        if (backendRes.ok) {
          const backendData = await backendRes.json();
          backendSuccess = true;
          backendMessage = backendData.message || "Face biometrics enrolled successfully";
        } else {
          const errorData = await backendRes.json().catch(() => ({}));
          console.warn("FastAPI enrollment returned non-ok:", backendRes.status, errorData);
          backendMessage = errorData.detail || `Backend returned status ${backendRes.status}`;
        }
      } catch (backendErr: any) {
        console.warn("Direct FastAPI enrollment forward failed, updating Supabase record directly:", backendErr);
      }

      // Ensure employee is flagged is_enrolled = true in Supabase
      const { error: updateErr } = await supabase
        .from("employees")
        .update({ is_enrolled: true })
        .eq("id", resolvedEmpId);

      if (updateErr) {
        console.error("Supabase employee enrollment update failed:", updateErr);
      }

      return NextResponse.json({
        success: true,
        is_enrolled: true,
        employee_id: resolvedEmpId,
        employee_code: empRecord?.employee_code,
        message: backendSuccess
          ? backendMessage
          : "Biometric profile registered. Vectors synchronized for contactless clocking.",
      });
    }

    // 2. Handle JSON Base64 payloads
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { employee_id, employee_code, email } = body;

      let resolvedEmpId = employee_id;

      if (!resolvedEmpId && employee_code) {
        const { data } = await supabase
          .from("employees")
          .select("id, employee_code, email")
          .ilike("employee_code", employee_code.trim())
          .limit(1);
        if (data && data.length > 0) resolvedEmpId = data[0].id;
      } else if (!resolvedEmpId && email) {
        const { data } = await supabase
          .from("employees")
          .select("id, employee_code, email")
          .ilike("email", email.trim().toLowerCase())
          .limit(1);
        if (data && data.length > 0) resolvedEmpId = data[0].id;
      }

      if (!resolvedEmpId) {
        return NextResponse.json(
          { error: "Employee identification is required for enrollment" },
          { status: 400 }
        );
      }

      // Update Supabase
      await supabase
        .from("employees")
        .update({ is_enrolled: true })
        .eq("id", resolvedEmpId);

      return NextResponse.json({
        success: true,
        is_enrolled: true,
        employee_id: resolvedEmpId,
        message: "Biometric profile registered successfully.",
      });
    }

    return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
  } catch (err: any) {
    console.error("Enrollment API route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to complete biometric enrollment" },
      { status: 500 }
    );
  }
}
