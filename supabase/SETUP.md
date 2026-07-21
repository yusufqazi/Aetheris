# Supabase Setup

Open your existing `.env.local` file in the Aetheris project root and add these
two lines. Paste values from **Supabase Dashboard > Connect** after each `=`.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use the **Project URL** for `NEXT_PUBLIC_SUPABASE_URL` and the **Publishable
Key** for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The URL must be exactly the
root project address, for example `https://your-project-ref.supabase.co`; do
not append `/auth/v1`, `/rest/v1`, or any other path.

Do not put either value in source code. `.env.local` is already ignored by Git.
Do not add a service-role key unless a future server-only administrative feature
explicitly requires it; that key must never be exposed in the browser.

## Database and Authentication

1. Authenticate the Supabase CLI locally with `npx supabase login`. Do not
   paste the generated personal access token into source files or chat.
2. Link this repository with `npx supabase link --project-ref YOUR_PROJECT_REF`.
   The project ref is the first hostname segment in the project URL.
3. Apply the versioned database migration with `npx supabase db push`.
4. In **Authentication > URL Configuration**, add `http://localhost:3000` to
   the allowed redirect URLs for local development. Add the production domain
   there when you deploy.
5. In **Authentication > Providers > Email**, keep Email enabled. Aetheris
   uses Supabase's email-and-password authentication flow and asks new users
   to confirm their address when email confirmation is enabled.

The migration creates `public.research_sessions`, assigns new rows to
`auth.uid()`, revokes anonymous table access, and enables Row Level Security.
Authenticated users can select, insert, update, or delete only their own rows.
