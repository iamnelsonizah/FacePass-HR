"""Email Delivery & HTML Template Service for FacePass.

Provides transactional emails styled with the clean, modern invitation-grade
template requested for account activations, welcome emails with Employee IDs,
and password reset requests.
"""

import os
import smtplib
import logging
import json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("facepass.email")

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
)
SENT_EMAILS_LOG = os.path.join(DATA_DIR, "sent_emails.json")

# Resend API Configuration
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "FacePass <onboarding@resend.dev>").strip()

# SMTP Configuration from Environment
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "no-reply@facepass.io")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "FacePass Attendance")


def _record_email(to_email: str, subject: str, html_content: str, text_content: str):
    """Save record of sent email locally for dev inspection and testing."""
    os.makedirs(DATA_DIR, exist_ok=True)
    records = []
    if os.path.exists(SENT_EMAILS_LOG):
        try:
            with open(SENT_EMAILS_LOG, "r", encoding="utf-8") as f:
                records = json.load(f)
        except Exception:
            records = []

    records.append({
        "timestamp": datetime.utcnow().isoformat(),
        "to_email": to_email,
        "subject": subject,
        "html": html_content,
        "text": text_content,
    })
    # Keep last 50
    records = records[-50:]
    try:
        with open(SENT_EMAILS_LOG, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
    except Exception as e:
        logger.warning("Could not write sent_emails.json: %s", e)


def send_html_email(to_email: str, subject: str, html_body: str, plain_text: str = "") -> bool:
    """Send an HTML email via Resend API (preferred) or SMTP if configured, or gracefully log in development."""
    clean_to = to_email.strip().lower()
    _record_email(clean_to, subject, html_body, plain_text)

    # 1. Resend API Delivery
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        from_email = os.getenv("RESEND_FROM_EMAIL", "FacePass <onboarding@resend.dev>").strip()
        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": from_email,
                        "to": [clean_to],
                        "subject": subject,
                        "html": html_body,
                        "text": plain_text or subject,
                    },
                )
            if res.status_code in (200, 201):
                email_id = res.json().get("id", "ok")
                logger.info("Successfully delivered email to %s via Resend API (ID: %s)", clean_to, email_id)
                return True
            else:
                logger.error("Resend API delivery failed [%s]: %s", res.status_code, res.text)
                if not os.getenv("SMTP_HOST", ""):
                    return False
        except Exception as e:
            logger.error("Exception delivering email via Resend API to %s: %s", clean_to, e)
            if not os.getenv("SMTP_HOST", ""):
                return False

    # 2. SMTP Delivery (if SMTP_HOST is configured)
    smtp_host = os.getenv("SMTP_HOST", "")
    if smtp_host:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
            msg["To"] = clean_to

            if plain_text:
                msg.attach(MIMEText(plain_text, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            server = smtplib.SMTP(smtp_host, SMTP_PORT, timeout=10)
            server.ehlo()
            if SMTP_PORT == 587:
                server.starttls()
                server.ehlo()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)

            server.sendmail(SMTP_FROM_EMAIL, [clean_to], msg.as_string())
            server.quit()
            logger.info("Successfully sent email to %s via %s", clean_to, smtp_host)
            return True
        except Exception as e:
            logger.error("Failed to deliver SMTP email to %s: %s", clean_to, e)
            return False

    # 3. Development Fallback
    logger.info(
        "📧 [DEV EMAIL] To: %s | Subject: '%s'\n%s\n---",
        clean_to,
        subject,
        plain_text or subject,
    )
    return True


def _render_email_template(
    title: str,
    heading: str,
    body_paragraphs: list[str],
    box_title: str,
    box_rows: list[tuple[str, str, str]],  # (label, value, color)
    box_note: str,
    button_text: str = "",
    button_url: str = "#",
    secondary_button_text: str = "",
    secondary_button_url: str = "#",
    plain_link_text: str = "",
    plain_link_url: str = "",
) -> str:
    """Render the responsive HTML email template using the user's provided structure."""

    paragraphs_html = "".join(
        f'<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #4B5563;">{p}</p>'
        for p in body_paragraphs
    )

    rows_html = ""
    for label, val, color in box_rows:
        val_style = f"font-weight: 700; color: {color or '#111827'};"
        rows_html += f"""
        <tr>
          <td style="width: 150px; color: #6B7280; padding: 6px 0; font-size: 15px;">{label}:</td>
          <td style="{val_style} padding: 6px 0; font-size: 16px;">{val}</td>
        </tr>
        """

    buttons_html = ""
    if button_text:
        primary_btn = f"""
        <td style="padding-right: 12px; padding-bottom: 10px;">
          <a href="{button_url}" style="display: inline-block; background-color: #2563EB; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
            {button_text}
          </a>
        </td>
        """
        secondary_btn = ""
        if secondary_button_text:
            secondary_btn = f"""
            <td style="padding-bottom: 10px;">
              <a href="{secondary_button_url}" style="display: inline-block; background-color: #F3F4F6; color: #374151; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px; border: 1px solid #D1D5DB;">
                {secondary_button_text}
              </a>
            </td>
            """
        buttons_html = f"""
        <tr>
          <td style="padding-bottom: 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                {primary_btn}
                {secondary_btn}
              </tr>
            </table>
          </td>
        </tr>
        """

    fallback_html = ""
    if plain_link_text and plain_link_url:
        fallback_html = f"""
        <tr>
          <td style="padding-bottom: 28px;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #9CA3AF;">
              {plain_link_text}:
            </p>
            <a href="{plain_link_url}" style="font-size: 13px; color: #2563EB; word-break: break-all; text-decoration: underline;">
              {plain_link_url}
            </a>
          </td>
        </tr>
        """

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC;">
    <tr>
      <td align="center" style="padding: 48px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; padding: 36px 32px; text-align: left; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Logo / Brand Mark -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #EFF6FF; border: 1px solid #DBEAFE; border-radius: 12px; padding: 10px; width: 36px; height: 36px; text-align: center; vertical-align: middle;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 8V6C4 4.89543 4.89543 4 6 4H8" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M16 4H18C19.1046 4 20 4.89543 20 6V8" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M20 16V18C20 19.1046 19.1046 20 18 20H16" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M8 20H6C4.89543 20 4 19.1046 4 18V16" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <circle cx="9" cy="11" r="1.5" fill="#2563EB"/>
                      <circle cx="15" cy="11" r="1.5" fill="#2563EB"/>
                      <path d="M9.5 15C10.5 16 13.5 16 14.5 15" stroke="#2563EB" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </td>
                  <td style="padding-left: 14px; font-size: 22px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px;">
                    FacePass
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom: 20px;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px; line-height: 1.3;">
                {heading}
              </h1>
            </td>
          </tr>

          <!-- Body Text -->
          <tr>
            <td style="padding-bottom: 24px;">
              {paragraphs_html}
            </td>
          </tr>

          <!-- Credentials / Code Box -->
          <tr>
            <td style="padding-bottom: 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px 24px;">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 800; color: #2563EB; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">
                      {box_title}
                    </div>
                    <table role="presentation" width="100%" style="font-size: 15px; color: #4B5563; line-height: 1.8;">
                      {rows_html}
                    </table>
                    <p style="margin: 14px 0 0 0; font-size: 13px; color: #64748B; line-height: 1.5; border-top: 1px solid #E2E8F0; padding-top: 12px;">
                      {box_note}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Buttons -->
          {buttons_html}

          <!-- Plain Text Fallback Link -->
          {fallback_html}

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #F1F5F9; padding-top: 24px;">
              <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 600; color: #64748B;">
                FacePass Technologies
              </p>
              <p style="margin: 0; font-size: 12px; color: #94A3B8;">
                Contactless Facial Attendance & Smart Worksite Security
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_activation_code_email(to_email: str, name: str, code: str) -> bool:
    """Send 6-digit account activation OTP code email."""
    subject = f"Your FacePass Activation Code: {code}"
    heading = "Activate your FacePass Account"
    paragraphs = [
        f"Hello <strong>{name}</strong>,",
        "Thank you for signing up for FacePass. To verify your email and activate your attendance account, please use the 6-digit activation code below in the mobile app:",
    ]
    box_title = "YOUR 6-DIGIT ACTIVATION CODE"
    box_rows = [
        ("Account Email", to_email, "#0F172A"),
        (
            "Activation Code",
            f'<span style="font-family: Courier, monospace; font-size: 24px; letter-spacing: 4px; color: #2563EB;">{code}</span>',
            "#2563EB",
        ),
        ("Expires in", "15 minutes", "#DC2626"),
    ]
    box_note = "Enter this 6-digit code in the FacePass app to activate your profile and receive your official Employee ID."

    html = _render_email_template(
        title="Activate your FacePass Account",
        heading=heading,
        body_paragraphs=paragraphs,
        box_title=box_title,
        box_rows=box_rows,
        box_note=box_note,
    )
    plain = f"Hello {name},\n\nYour FacePass activation code is: {code}\nThis code expires in 15 minutes.\n\nFacePass Technologies"
    return send_html_email(to_email, subject, html, plain)


def send_welcome_employee_id_email(to_email: str, name: str, employee_code: str, role_name: str = "Employee") -> bool:
    """Send Welcome Email with the user's official Employee ID upon successful activation."""
    subject = f"Welcome to FacePass! Your Official Employee ID is {employee_code}"
    heading = f"Welcome to FacePass, {name}!"
    paragraphs = [
        f"Hello <strong>{name}</strong>,",
        "Congratulations! Your account has been successfully verified and activated. You are now officially enrolled on the <strong>FacePass Enterprise</strong> platform.",
        "Here are your permanent login credentials for the FacePass mobile app:",
    ]
    box_title = "OFFICIAL ATTENDANCE CREDENTIALS"
    box_rows = [
        ("Assigned role", role_name, "#0F172A"),
        ("Login email", to_email, "#0F172A"),
        (
            "Official Employee ID",
            f'<span style="font-family: Courier, monospace; font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #16A34A;">{employee_code}</span>',
            "#16A34A",
        ),
        ("Account status", "Active & Verified", "#16A34A"),
    ]
    box_note = "You can sign in to FacePass using either your official Employee ID or your email address along with the password you created."

    html = _render_email_template(
        title=f"Welcome to FacePass — Employee ID {employee_code}",
        heading=heading,
        body_paragraphs=paragraphs,
        box_title=box_title,
        box_rows=box_rows,
        box_note=box_note,
    )
    plain = f"Hello {name},\n\nYour FacePass account is active!\nOfficial Employee ID: {employee_code}\nLogin email: {to_email}\n\nFacePass Technologies"
    return send_html_email(to_email, subject, html, plain)


def send_password_reset_email(to_email: str, name: str, code: str) -> bool:
    """Send 6-digit password reset OTP email."""
    subject = f"Reset your FacePass Password — Code: {code}"
    heading = "Password Reset Request"
    paragraphs = [
        f"Hello <strong>{name}</strong>,",
        "We received a request to reset the password for your FacePass employee account. Use the 6-digit verification code below to establish a new password:",
    ]
    box_title = "PASSWORD RESET VERIFICATION"
    box_rows = [
        ("Account Email", to_email, "#0F172A"),
        (
            "Reset Code",
            f'<span style="font-family: Courier, monospace; font-size: 24px; letter-spacing: 4px; color: #2563EB;">{code}</span>',
            "#2563EB",
        ),
        ("Expires in", "15 minutes", "#DC2626"),
    ]
    box_note = "If you did not request a password reset, you can safely disregard this email. Your existing credentials remain completely secure."

    html = _render_email_template(
        title="Reset your FacePass Password",
        heading=heading,
        body_paragraphs=paragraphs,
        box_title=box_title,
        box_rows=box_rows,
        box_note=box_note,
    )
    plain = f"Hello {name},\n\nYour FacePass password reset code is: {code}\nThis code expires in 15 minutes.\n\nFacePass Technologies"
    return send_html_email(to_email, subject, html, plain)
