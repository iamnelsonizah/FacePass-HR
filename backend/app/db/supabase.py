"""Supabase client initialization for FacePass backend."""

from supabase import create_client, Client
from app.config import get_settings

_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Get or create a Supabase client using the service role key.

    The service role key bypasses Row Level Security, which is needed
    for backend operations like enrollment and attendance logging.
    """
    global _supabase_client
    settings = get_settings()
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_key,
        )
    _supabase_client.postgrest.auth(settings.supabase_service_key)
    return _supabase_client


def get_admin_client() -> Client:
    """Get a fresh, dedicated Supabase client for admin operations.
    
    Prevents session contamination from user sign-in operations.
    """
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_service_key,
    )
