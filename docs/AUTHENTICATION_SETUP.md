# Authentication Setup Guide

## Current Authentication Status

**Currently, there is NO authentication implemented.** All admin routes are open and unprotected. This is fine for development but **MUST be fixed before hosting publicly**.

## Why You're Seeing "Requires Manual Review" Messages

The "requires manual review. AI analysis was unavailable" message appears when:

1. **Rate Limit Errors (429)**: The Gemini API free tier has very strict rate limits. When you exceed them, all API calls fail and trigger the fallback message.
2. **API Errors**: Network issues, invalid API keys, or other errors cause the AI analysis to fail.
3. **Parsing Errors**: If the AI response can't be parsed correctly.

**Solution**: The updated code now includes:
- Retry logic with exponential backoff for rate limits
- Sequential processing with delays between requests
- Better error handling and fallback to EWG data

## Authentication Options

### Option 1: Supabase (Recommended) ✅

**Why Supabase?**
- ✅ Single service for both database AND authentication
- ✅ Free tier includes both
- ✅ Built-in Row Level Security (RLS)
- ✅ Easy to integrate
- ✅ Already recommended in your codebase (`docs/SUPABASE_INTEGRATION.md`)

**Setup Steps:**

1. **Create Supabase Project**
   ```bash
   # Go to https://supabase.com and create a new project
   ```

2. **Install Dependencies**
   ```bash
   npm install @supabase/supabase-js
   ```

3. **Add Environment Variables**
   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkP... (keep secret!)
   ```

4. **Update Auth Middleware**
   - Uncomment the Supabase code in `server/middleware/auth.ts`
   - Replace `requireAuth` with `requireSupabaseAuth`

5. **Create User Profiles Table**
   ```sql
   CREATE TABLE user_profiles (
     id UUID REFERENCES auth.users(id) PRIMARY KEY,
     email TEXT,
     role TEXT DEFAULT 'user',
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

6. **Set Up Admin User**
   - Create user in Supabase Auth dashboard
   - Insert into `user_profiles` with `role = 'admin'`

### Option 2: Clerk (Alternative)

**Why Clerk?**
- ✅ Excellent developer experience
- ✅ Pre-built UI components
- ✅ Multiple auth providers (Google, GitHub, etc.)
- ❌ Requires separate database solution
- ❌ More expensive for small projects

**Setup Steps:**

1. **Install Clerk**
   ```bash
   npm install @clerk/clerk-sdk-node
   ```

2. **Add Environment Variables**
   ```env
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. **Update Auth Middleware**
   ```typescript
   import { clerkClient } from '@clerk/clerk-sdk-node';
   
   export async function requireClerkAuth(req, res, next) {
     const token = req.headers.authorization?.replace('Bearer ', '');
     // Verify token with Clerk
   }
   ```

### Option 3: Simple API Key (Current Implementation)

**Current Status**: Basic API key auth is implemented in `server/middleware/auth.ts`

**Setup:**
```env
ADMIN_API_KEY=your-secret-api-key-here
```

**Usage:**
```bash
curl -H "Authorization: Bearer your-secret-api-key-here" \
  http://localhost:3000/api/products
```

**Pros:**
- ✅ Simple to implement
- ✅ Works immediately
- ✅ Good for server-to-server communication

**Cons:**
- ❌ Not user-friendly (no login UI)
- ❌ Hard to revoke keys
- ❌ No user management
- ❌ Not suitable for public hosting

## Recommendation: Use Supabase

Based on your codebase and requirements:

1. **You already have Supabase documentation** (`docs/SUPABASE_INTEGRATION.md`)
2. **You need both database and auth** - Supabase provides both
3. **Cost-effective** - Free tier is generous
4. **Production-ready** - Used by many companies

## Migration Path

1. **Phase 1 (Now)**: Use API key auth for immediate protection
2. **Phase 2 (Next)**: Set up Supabase project
3. **Phase 3 (Before Public Launch)**: Migrate to Supabase JWT auth
4. **Phase 4**: Add login UI for admins

## Protecting Routes

Routes are now protected in `server/index.ts`:

```typescript
// Public routes (anyone can access)
app.get("/api/products", ...)  // View products
app.get("/api/products/:id", ...)  // View single product

// Admin routes (auth required)
app.post("/api/products", requireAuth, ...)  // Create product
app.patch("/api/products/:id", requireAuth, ...)  // Update product
app.delete("/api/products/:id", requireAuth, ...)  // Delete product
app.post("/api/products/:id/edit", requireAuth, ...)  // Create draft
```

## Testing Authentication

**With API Key:**
```bash
# Should work
curl -H "Authorization: Bearer your-api-key" \
  -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","brand":"Test"}'

# Should fail
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","brand":"Test"}'
```

## Next Steps

1. ✅ **Immediate**: Set `ADMIN_API_KEY` in `.env` to protect routes
2. ⏭️ **Before Public Launch**: Set up Supabase and migrate to JWT auth
3. ⏭️ **Future**: Add admin login UI using Supabase Auth components

