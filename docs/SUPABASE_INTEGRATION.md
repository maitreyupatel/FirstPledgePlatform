# Supabase Integration Guide for FirstPledge

## Overview

This document provides a comprehensive analysis and step-by-step guide for integrating Supabase (database + authentication) into the FirstPledge platform.

## Current State Analysis

### Current Architecture
- **Storage**: In-memory (`MemStorage`) - data is lost on server restart
- **Database**: Drizzle ORM configured for PostgreSQL (Neon), but not connected
- **Authentication**: No authentication implemented (passport-local in dependencies but unused)
- **Schema**: PostgreSQL schema defined in `shared/schema.ts` with products and ingredients tables

### Why Supabase?

**Supabase** is recommended over Clerk + separate database because:

1. **Single Service**: Provides both PostgreSQL database and authentication in one platform
2. **Cost Effective**: Free tier includes database + auth, reducing infrastructure costs
3. **Row Level Security (RLS)**: Built-in security policies for data protection
4. **Real-time Capabilities**: Optional real-time subscriptions for live updates
5. **Storage**: Built-in file storage for product images
6. **Developer Experience**: Excellent TypeScript support and auto-generated APIs
7. **Migration Path**: Easy migration from current MemStorage implementation

## Integration Steps

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in project details:
   - Name: `firstpledge` (or your preferred name)
   - Database Password: Generate a strong password (save it!)
   - Region: Choose closest to your users
4. Wait for project to be provisioned (~2 minutes)

### Step 2: Get Connection Details

1. Go to Project Settings → Database
2. Copy the connection string (URI format)
3. Go to Project Settings → API
4. Copy:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/Public Key (starts with `eyJ...`)
   - Service Role Key (keep this secret!)

### Step 3: Install Dependencies

```bash
npm install @supabase/supabase-js
```

### Step 4: Set Up Environment Variables

Create or update `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database (use Supabase connection string)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Optional: Keep existing PORT and CLIENT_ORIGIN
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
```

### Step 5: Create Supabase Storage Implementation

Create `server/storage/supabaseStorage.ts` implementing the same interface as `MemStorage`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Product, Ingredient } from '@shared/types';

// This will implement the same interface as MemStorage
// See server/storage/memStorage.ts for reference
```

### Step 6: Set Up Database Schema in Supabase

1. Go to Supabase Dashboard → SQL Editor
2. Run the migration from `shared/schema.ts` (convert Drizzle schema to SQL)
3. Or use Drizzle Kit to push schema:
   ```bash
   npm run db:push
   ```

### Step 7: Implement Authentication

#### Backend (Server)

Create `server/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Verify Supabase JWT token from Authorization header
  // Allow access to admin routes only
}
```

#### Frontend (Client)

Create `client/src/contexts/AuthContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Auth context for managing user sessions
```

Create `client/src/pages/Login.tsx`:

```typescript
// Login page with email/password or OAuth providers
```

### Step 8: Protect Admin Routes

Update `server/index.ts`:

```typescript
import { requireAuth } from './middleware/auth';

// Protect admin routes
app.post('/api/products', requireAuth, (req, res) => {
  // Create product
});

app.patch('/api/products/:id', requireAuth, (req, res) => {
  // Update product
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  // Delete product
});
```

### Step 9: Replace MemStorage with SupabaseStorage

Update `server/index.ts`:

```typescript
import { SupabaseStorage } from './storage/supabaseStorage';

// Replace
// const storage = new MemStorage(seedProducts);

// With
const storage = new SupabaseStorage();
```

### Step 10: Set Up Row Level Security (RLS)

In Supabase Dashboard → Authentication → Policies:

1. Create policies for `products` table:
   - Public read access for published products
   - Admin-only write access
2. Create policies for `ingredients` table:
   - Public read access (linked to products)
   - Admin-only write access

## Migration Strategy

### Phase 1: Parallel Implementation
1. Keep `MemStorage` working
2. Implement `SupabaseStorage` alongside
3. Test both implementations

### Phase 2: Gradual Migration
1. Switch to SupabaseStorage in development
2. Test thoroughly
3. Deploy to production

### Phase 3: Data Migration
1. Export data from MemStorage (if any)
2. Import into Supabase
3. Verify data integrity

## Authentication Flow

### Admin Login Flow
1. Admin visits `/admin` → redirected to `/login` if not authenticated
2. Admin enters credentials → Supabase Auth validates
3. JWT token stored in httpOnly cookie or localStorage
4. Token sent with each API request
5. Server validates token on protected routes

### Public Access Flow
1. Public users can view published products without authentication
2. No login required for browsing

## Security Considerations

1. **Environment Variables**: Never commit `.env` file to git
2. **Service Role Key**: Only use on server-side, never expose to client
3. **RLS Policies**: Always enable Row Level Security
4. **JWT Validation**: Always validate tokens on server
5. **HTTPS**: Use HTTPS in production

## Testing Checklist

- [ ] Supabase project created and configured
- [ ] Database schema migrated successfully
- [ ] SupabaseStorage implements all MemStorage methods
- [ ] Authentication working (login/logout)
- [ ] Admin routes protected
- [ ] Public routes accessible without auth
- [ ] RLS policies configured correctly
- [ ] Data migration completed (if applicable)
- [ ] All CRUD operations working
- [ ] Error handling implemented

## Troubleshooting

### Connection Issues
- Verify DATABASE_URL format
- Check network firewall rules
- Ensure Supabase project is active

### Authentication Issues
- Verify SUPABASE_URL and keys are correct
- Check JWT token expiration
- Verify RLS policies allow access

### Migration Issues
- Test with small dataset first
- Keep MemStorage as fallback during migration
- Monitor Supabase logs for errors

## Cost Considerations

### Supabase Free Tier Includes:
- 500 MB database storage
- 2 GB bandwidth
- 50,000 monthly active users
- Unlimited API requests

### When to Upgrade:
- Database exceeds 500 MB
- Need more bandwidth
- Require additional features (backups, etc.)

## Next Steps

1. Review this guide with your team
2. Create Supabase project
3. Follow integration steps sequentially
4. Test thoroughly before production deployment
5. Monitor performance and costs

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Drizzle ORM with Supabase](https://orm.drizzle.team/docs/get-started-postgresql)

## Support

For issues or questions:
1. Check Supabase documentation
2. Review Supabase Discord community
3. Check project GitHub issues

