from supabase import create_client, Client
from .config import settings

# Initialize the Supabase client using the URL and the Service Role Key
# We use the Service Role key in the backend to bypass RLS policies and have full admin access.
supabase: Client = create_client(
    supabase_url=settings.SUPABASE_URL,
    supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY.get_secret_value()
)