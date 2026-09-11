#!/usr/bin/env python3
"""Test script for verifying Resend email configuration."""

import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.services.email import (
    send_activation_code_email,
    send_welcome_employee_id_email,
)

def main():
    recipient = sys.argv[1] if len(sys.argv) > 1 else os.getenv("TEST_EMAIL", "nelizah99@gmail.com")
    print("==================================================")
    print(" FacePass Resend Delivery Test")
    print("==================================================")
    print(f"Recipient:         {recipient}")
    print(f"RESEND_FROM_EMAIL: {os.getenv('RESEND_FROM_EMAIL') or '(empty)'}")
    
    key = os.getenv("RESEND_API_KEY", "").strip()
    if not key:
        print("❌ Notice: RESEND_API_KEY is not set in backend/.env yet.")
        print("Please provide your Resend API key (starts with re_...)")
        sys.exit(1)
    
    masked_key = key[:6] + "..." + key[-4:] if len(key) > 10 else "***"
    print(f"RESEND_API_KEY:    {masked_key}")
    print("\nSending test 6-digit activation code email...")

    ok = send_activation_code_email(
        to_email=recipient,
        name="Nelson Izah",
        code="998877",
    )

    if ok:
        print("\n✅ Email successfully dispatched via Resend API!")
        print(f"Please check your inbox at: {recipient}")
    else:
        print("\n❌ Failed to dispatch email. Check error logs above.")
        sys.exit(1)

if __name__ == "__main__":
    main()
