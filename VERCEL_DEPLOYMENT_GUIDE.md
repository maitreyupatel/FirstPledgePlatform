# Step-by-Step Guide: Deploying FirstPledgePlatform to Vercel

This guide walks you through deploying your FirstPledgePlatform application to Vercel, from initial setup to production deployment.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **GitHub Account** - Your code must be in a GitHub repository
- [ ] **Vercel Account** - Sign up at [vercel.com](https://vercel.com) (free tier available)
- [ ] **Supabase Project** - Database and authentication configured
- [ ] **AI Provider API Key** - At least one (Groq, Gemini, or OpenAI)
- [ ] **All Environment Variables** - Ready to paste into Vercel

---

## Step 1: Prepare Your GitHub Repository

### 1.1 Commit All Changes

Make sure all your changes are committed and pushed to GitHub:

```bash
# Check status
git status

# Add all files
git add .

# Commit changes
git commit -m "Prepare for Vercel deployment - remove Replit artifacts, add Vercel config"

# Push to GitHub
git push origin main
```

### 1.2 Verify Required Files Exist

Ensure these files are in your repository:

- ✅ `vercel.json` - Vercel configuration
- ✅ `api/index.ts` - Serverless function wrapper
- ✅ `.env.example` - Environment variable template
- ✅ `package.json` - With build scripts
- ✅ `server/index.ts` - Express app (exports for serverless)

---

## Step 2: Set Up Supabase (If Not Already Done)

### 2.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click **"New Project"**
4. Fill in:
   - **Project Name**: `firstpledge-platform` (or your choice)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
5. Click **"Create new project"**
6. Wait 2-3 minutes for project to initialize

### 2.2 Get Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy these values (you'll need them in Step 4):
   - **Project URL** → `SUPABASE_URL`
   - **anon/public key** → `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

### 2.3 Run Database Migrations

Your Supabase project needs the database schema. Run migrations:

```bash
# Option 1: Using Supabase CLI (recommended)
supabase db push

# Option 2: Using SQL files manually
# Copy contents of supabase/migrations/*.sql files into Supabase SQL Editor
```

Or manually run the SQL migrations from `supabase/migrations/` in the Supabase SQL Editor.

---

## Step 3: Get AI Provider API Key

Choose **at least one** AI provider:

### Option A: Groq (Recommended - Free Tier)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up/login
3. Navigate to **API Keys**
4. Click **"Create API Key"**
5. Copy the key → `GROQ_API_KEY`

### Option B: Google Gemini
1. Go to [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey)
2. Sign in with Google account
3. Click **"Create API Key"**
4. Copy the key → `GEMINI_API_KEY`

### Option C: OpenAI
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in/login
3. Click **"Create new secret key"**
4. Copy the key → `OPENAI_API_KEY`

---

## Step 4: Connect Repository to Vercel

### 4.1 Import Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. If prompted, connect your GitHub account (authorize Vercel)
4. Find and select your `FirstPledgePlatform` repository
5. Click **"Import"**

### 4.2 Configure Project Settings

Vercel should auto-detect settings, but verify:

- **Framework Preset**: Other (or leave blank)
- **Root Directory**: `./` (root of repository)
- **Build Command**: `npm run build` (auto-detected)
- **Output Directory**: `dist/public` (auto-detected from vercel.json)
- **Install Command**: `npm install` (auto-detected)

**Click "Deploy"** - Don't worry about environment variables yet, we'll add them next.

---

## Step 5: Configure Environment Variables

### 5.1 Access Environment Variables

1. After the first deployment starts, click **"Cancel"** or wait for it to fail (expected)
2. Go to **Project Settings** → **Environment Variables**
3. Or click the **"Settings"** tab in your project dashboard

### 5.2 Add Required Variables

Add each variable **for all environments** (Production, Preview, Development):

#### Supabase Configuration (REQUIRED)

```
SUPABASE_URL
Value: https://your-project-id.supabase.co
Environment: Production, Preview, Development
```

```
SUPABASE_SERVICE_ROLE_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (your service role key)
Environment: Production, Preview, Development
⚠️ WARNING: Keep this secret! Never expose to frontend.
```

```
SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (your anon key)
Environment: Production, Preview, Development
```

```
USE_SUPABASE_STORAGE
Value: true
Environment: Production, Preview, Development
```

#### Frontend Supabase Keys (REQUIRED)

```
VITE_SUPABASE_URL
Value: https://your-project-id.supabase.co (same as SUPABASE_URL)
Environment: Production, Preview, Development
```

```
VITE_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (same as SUPABASE_ANON_KEY)
Environment: Production, Preview, Development
```

#### AI Provider Configuration (At least one required)

```
AI_PROVIDER
Value: groq (or "gemini" or "openai")
Environment: Production, Preview, Development
```

Then add the corresponding API key:

```
GROQ_API_KEY
Value: gsk_... (if using Groq)
Environment: Production, Preview, Development
```

OR

```
GEMINI_API_KEY
Value: AIza... (if using Gemini)
Environment: Production, Preview, Development
```

OR

```
OPENAI_API_KEY
Value: sk-... (if using OpenAI)
Environment: Production, Preview, Development
```

#### Server Configuration

```
PORT
Value: 3000
Environment: Production, Preview, Development
```

```
CLIENT_ORIGIN
Value: https://your-app-name.vercel.app
Environment: Production
Value: https://your-preview-url.vercel.app
Environment: Preview
Value: http://localhost:5173
Environment: Development
```

**Note**: After first deployment, update `CLIENT_ORIGIN` with your actual Vercel URL.

#### Optional Configuration

```
GOOGLE_API_KEY
Value: (for enhanced citation search - optional)
Environment: Production, Preview, Development
```

```
GOOGLE_CX_ID
Value: (Custom Search Engine ID - optional)
Environment: Production, Preview, Development
```

```
ADMIN_API_KEY
Value: (for API key authentication - optional)
Environment: Production, Preview, Development
```

```
INGREDIENT_REFRESH_DAYS
Value: 30
Environment: Production, Preview, Development
```

### 5.3 Save and Redeploy

1. Click **"Save"** after adding all variables
2. Go to **Deployments** tab
3. Click **"Redeploy"** on the latest deployment
4. Or push a new commit to trigger automatic deployment

---

## Step 6: Monitor Deployment

### 6.1 Watch Build Logs

1. Go to **Deployments** tab
2. Click on the active deployment
3. Watch the build logs in real-time

**Expected build steps:**
- ✅ Installing dependencies (`npm install`)
- ✅ Building frontend (`vite build`)
- ✅ Building backend (`esbuild server/index.ts`)
- ✅ Deploying to Vercel's edge network

### 6.2 Check for Errors

Common issues and solutions:

**Error: "Missing environment variables"**
- Solution: Go back to Step 5 and add missing variables

**Error: "Cannot connect to Supabase"**
- Solution: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct

**Error: "Build failed"**
- Solution: Check build logs for specific error, may need to fix TypeScript errors locally first

**Error: "Function timeout"**
- Solution: Check `vercel.json` - `maxDuration` is set to 30 seconds (should be sufficient)

---

## Step 7: Verify Deployment

### 7.1 Test Your Application

1. **Get your deployment URL**:
   - Production: `https://your-app-name.vercel.app`
   - Preview: `https://your-app-name-git-branch-username.vercel.app`

2. **Test endpoints**:
   - Health check: `https://your-app.vercel.app/api/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

3. **Test frontend**:
   - Visit: `https://your-app.vercel.app`
   - Should load the React application

4. **Test authentication**:
   - Try logging in
   - Verify Supabase connection works

5. **Test API endpoints**:
   - Try creating a product (if authenticated)
   - Verify database operations work

### 7.2 Check Function Logs

1. Go to **Deployments** → Click on deployment
2. Click **"Functions"** tab
3. Click on `api/index.ts`
4. View real-time logs

---

## Step 8: Update CORS Configuration

### 8.1 Update CLIENT_ORIGIN

After your first successful deployment:

1. Copy your Vercel deployment URL
2. Go to **Project Settings** → **Environment Variables**
3. Update `CLIENT_ORIGIN`:
   - **Production**: `https://your-actual-domain.vercel.app`
   - **Preview**: `https://*.vercel.app` (wildcard for preview deployments)
4. Click **"Save"**
5. **Redeploy** to apply changes

### 8.2 Optional: Add Custom Domain

1. Go to **Project Settings** → **Domains**
2. Click **"Add Domain"**
3. Enter your custom domain (e.g., `firstpledge.com`)
4. Follow DNS configuration instructions
5. Update `CLIENT_ORIGIN` to include your custom domain

---

## Step 9: Set Up Continuous Deployment

Vercel automatically deploys on every push to your main branch:

### 9.1 Automatic Deployments

- **Production**: Deploys from `main` branch
- **Preview**: Creates preview deployments for pull requests
- **No action needed** - happens automatically!

### 9.2 Manual Deployment (if needed)

1. Go to **Deployments** tab
2. Click **"Redeploy"** on any deployment
3. Or push a new commit to trigger deployment

---

## Step 10: Post-Deployment Checklist

Verify everything works:

- [ ] Application loads at Vercel URL
- [ ] API health endpoint responds (`/api/health`)
- [ ] Frontend loads correctly
- [ ] Authentication works (Supabase)
- [ ] Database operations work (create/read products)
- [ ] AI vetting works (if API keys configured)
- [ ] Static assets load (`/generated_images/*`)
- [ ] Environment variables are set correctly
- [ ] Function logs show no errors
- [ ] CORS is configured for production domain

---

## Troubleshooting Common Issues

### Issue: "Application Error" on Vercel

**Symptoms**: Blank page or error message

**Solutions**:
1. Check **Function Logs** in Vercel dashboard
2. Verify all environment variables are set
3. Check Supabase credentials are correct
4. Verify database migrations ran successfully

### Issue: CORS Errors

**Symptoms**: Browser console shows CORS errors

**Solutions**:
1. Update `CLIENT_ORIGIN` environment variable with your Vercel URL
2. Include all domains (production + preview URLs)
3. Redeploy after updating environment variables

### Issue: Database Connection Fails

**Symptoms**: API returns 500 errors, logs show Supabase errors

**Solutions**:
1. Verify `SUPABASE_URL` is correct (no trailing slash)
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
3. Check Supabase project is active (not paused)
4. Verify database migrations ran successfully

### Issue: Build Fails

**Symptoms**: Deployment fails during build step

**Solutions**:
1. Run `npm run check` locally to find TypeScript errors
2. Run `npm run build` locally to test build
3. Check build logs in Vercel for specific error
4. Ensure all dependencies are in `package.json`

### Issue: Function Timeout

**Symptoms**: Requests timeout after 30 seconds

**Solutions**:
1. Check `vercel.json` - `maxDuration` is set to 30 seconds
2. Optimize slow operations (AI API calls, database queries)
3. Consider increasing timeout (Vercel Pro plan required for >30s)

### Issue: Static Assets Not Loading

**Symptoms**: Images or assets return 404

**Solutions**:
1. Verify `attached_assets` directory is committed to Git
2. Check file paths in code match Vercel routing
3. Consider moving assets to Supabase Storage or CDN

---

## Next Steps

After successful deployment:

1. **Set up monitoring**: Consider adding error tracking (Sentry, etc.)
2. **Set up alerts**: Configure Vercel notifications for deployment failures
3. **Optimize performance**: Enable Vercel Analytics (if on Pro plan)
4. **Set up backups**: Configure Supabase backups
5. **Domain setup**: Add custom domain if desired
6. **SSL/HTTPS**: Automatically handled by Vercel (free!)

---

## Quick Reference

### Environment Variables Summary

**Required:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `USE_SUPABASE_STORAGE=true`
- `AI_PROVIDER` (groq/gemini/openai)
- At least one AI API key (`GROQ_API_KEY`, `GEMINI_API_KEY`, or `OPENAI_API_KEY`)
- `PORT=3000`
- `CLIENT_ORIGIN` (your Vercel URL)

**Optional:**
- `GOOGLE_API_KEY`
- `GOOGLE_CX_ID`
- `ADMIN_API_KEY`
- `INGREDIENT_REFRESH_DAYS=30`

### Useful Vercel URLs

- **Dashboard**: https://vercel.com/dashboard
- **Documentation**: https://vercel.com/docs
- **Support**: https://vercel.com/support

### Useful Commands

```bash
# Test build locally
npm run build

# Check TypeScript errors
npm run check

# Test server locally
npm run dev

# Deploy via CLI (alternative to GitHub integration)
npx vercel
```

---

## Support

If you encounter issues:

1. Check **Function Logs** in Vercel dashboard
2. Review **Build Logs** for errors
3. Verify all environment variables are set
4. Test locally first (`npm run build`, `npm run dev`)
5. Check Vercel documentation: https://vercel.com/docs
6. Check Supabase documentation: https://supabase.com/docs

---

**Congratulations!** 🎉 Your FirstPledgePlatform is now deployed on Vercel!

