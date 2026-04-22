# Migration Checklist

Use this checklist to track your Supabase setup progress.

## ✅ Step 1: Database Migrations

- [ ] Opened Supabase Dashboard → SQL Editor
- [ ] Ran `001_initial_schema.sql` - Success
- [ ] Ran `002_ingredient_analyses.sql` - Success  
- [ ] Ran `003_user_profiles.sql` - Success
- [ ] Verified tables exist in Table Editor:
  - [ ] `products`
  - [ ] `ingredients`
  - [ ] `ingredient_analyses`
  - [ ] `user_profiles`

## ✅ Step 2: Environment Variables

- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` to `.env`
- [ ] Set `USE_SUPABASE_STORAGE=true` in `.env`
- [ ] Set `INGREDIENT_REFRESH_DAYS=30` in `.env`
- [ ] Verified `VITE_SUPABASE_URL` is set
- [ ] Verified `VITE_SUPABASE_ANON_KEY` is set

**To get Service Role Key:**
1. Supabase Dashboard → Project Settings → API
2. Copy the `service_role` key (secret key)

## ✅ Step 3: Create Admin User

**Choose one method:**

**Method A: Script (Easier)**
- [ ] Ran: `npm run create:admin admin@example.com "password"`
- [ ] Script completed successfully
- [ ] Verified user in Supabase Dashboard → Authentication → Users

**Method B: Manual**
- [ ] Signed up via `/login` page
- [ ] Got User ID from Authentication → Users
- [ ] Ran SQL to create user_profile with admin role
- [ ] Verified: `SELECT * FROM user_profiles WHERE role = 'admin';`

## ✅ Step 4: Migrate Seed Data

- [ ] Ran: `npm run migrate:supabase`
- [ ] Migration completed successfully
- [ ] Verified products in Table Editor → `products` table
- [ ] Verified ingredients in Table Editor → `ingredients` table

## ✅ Step 5: Test Setup

- [ ] Started server: `npm run server:dev`
- [ ] Started client: `npm run client:dev`
- [ ] Logged in at `/login`
- [ ] Accessed `/admin` dashboard successfully
- [ ] Created a test product (draft)
- [ ] Verified draft appears in "Drafts" tab
- [ ] Published a product
- [ ] Verified product persists after server restart
- [ ] Tested ingredient vetting (should cache in database)

## Verification Queries

Run these in SQL Editor to verify setup:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'ingredients', 'ingredient_analyses', 'user_profiles');

-- Check admin user exists
SELECT id, email, role FROM user_profiles WHERE role = 'admin';

-- Check products migrated
SELECT COUNT(*) as product_count FROM products;

-- Check ingredients migrated
SELECT COUNT(*) as ingredient_count FROM ingredients;
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Migration fails | Check SQL syntax, ensure previous migrations ran |
| "Service role key required" | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env` |
| "Admin role required" | Verify user_profile exists with `role = 'admin'` |
| Products not persisting | Check `USE_SUPABASE_STORAGE=true` is set |
| Can't log in | Verify `VITE_SUPABASE_ANON_KEY` is set correctly |

## Next Steps After Setup

- [ ] Start using the platform normally
- [ ] All data will persist in Supabase
- [ ] Ingredient analyses will cache automatically
- [ ] Draft products visible in admin dashboard

