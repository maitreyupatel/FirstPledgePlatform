# Quick Setup Guide

Follow these steps in order to set up Supabase for FirstPledge.

## Step 1: Run Database Migrations

1. Open Supabase Dashboard → SQL Editor
2. Copy and run each migration file in order:

**File 1:** `supabase/migrations/001_initial_schema.sql`
**File 2:** `supabase/migrations/002_ingredient_analyses.sql`
**File 3:** `supabase/migrations/003_user_profiles.sql`

✅ Verify: Check Table Editor - you should see `products`, `ingredients`, `ingredient_analyses`, `user_profiles` tables

## Step 2: Set Environment Variables

Add to your `.env` file:

```env
# Get Service Role Key from: Supabase Dashboard → Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Enable Supabase storage
USE_SUPABASE_STORAGE=true

# Ingredient refresh window
INGREDIENT_REFRESH_DAYS=30

# Frontend (already set in .env.example)
VITE_SUPABASE_URL=https://ilswgsidzdwovkwivggh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsc3dnc2lkemR3b3Zrd2l2Z2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MjUzNzYsImV4cCI6MjA3OTIwMTM3Nn0.C4fFLWZ8Es2un_FjxFQmJZeoSMw2T0K2qT51svoXqRM
```

## Step 3: Create Admin User

**Option A: Using Script (Recommended)**
```bash
npm run create:admin admin@example.com "YourPassword123!"
```

**Option B: Manual**
1. Go to `http://localhost:5173/login` and sign up
2. Get User ID from Supabase Dashboard → Authentication → Users
3. Run in SQL Editor:
```sql
INSERT INTO user_profiles (id, email, role)
VALUES ('<user-id>', '<email>', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

## Step 4: Migrate Seed Data

```bash
npm run migrate:supabase
```

✅ Verify: Check Supabase Table Editor → `products` table should have seed data

## Step 5: Test

1. Start servers:
   ```bash
   npm run server:dev
   npm run client:dev
   ```

2. Log in at `http://localhost:5173/login`
3. Access admin dashboard at `http://localhost:5173/admin`

## Troubleshooting

- **"Failed to initialize Supabase storage"** → Check `SUPABASE_SERVICE_ROLE_KEY` is set
- **"Authentication required"** → Check `VITE_SUPABASE_ANON_KEY` is set
- **"Admin role required"** → Verify user profile has `role = 'admin'`

See `SUPABASE_SETUP_GUIDE.md` for detailed instructions.

