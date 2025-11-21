# Vercel Deployment Guide

## Prerequisites

- ✅ GitHub repository with your code pushed
- ✅ Vercel account (sign up at https://vercel.com)
- ✅ Supabase project configured
- ✅ All environment variables ready

## Step 1: Prepare Your Repository

1. **Commit all changes:**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Verify these files exist:**
   - ✅ `vercel.json` - Vercel configuration
   - ✅ `api/index.ts` - Serverless function wrapper
   - ✅ `.env.example` - Environment variable template
   - ✅ `package.json` - With build scripts

## Step 2: Connect Repository to Vercel

1. **Go to Vercel Dashboard:**
   - Visit https://vercel.com/dashboard
   - Click "Add New..." → "Project"

2. **Import your repository:**
   - Select your GitHub repository
   - Vercel will auto-detect the project

3. **Configure Project Settings:**
   - **Framework Preset:** Other (or leave blank)
   - **Root Directory:** `./` (root)
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `dist/public` (auto-detected from vercel.json)
   - **Install Command:** `npm install` (auto-detected)

## Step 3: Set Environment Variables

**Critical:** Set these in Vercel Dashboard → Project Settings → Environment Variables

### Required Variables (Production):

```env
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# Frontend Supabase Keys
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# AI Provider (at least one required)
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key-here
# OR
GEMINI_API_KEY=your-gemini-api-key-here
# OR
OPENAI_API_KEY=your-openai-api-key-here

# Google Custom Search (Optional)
GOOGLE_API_KEY=your-google-api-key-here
GOOGLE_CX_ID=your-custom-search-engine-id-here

# Server Configuration
PORT=3000
CLIENT_ORIGIN=https://your-vercel-domain.vercel.app
```

**Important Notes:**
- Set `CLIENT_ORIGIN` to your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
- You can add multiple origins: `https://your-app.vercel.app,https://your-custom-domain.com`
- Set variables for **Production**, **Preview**, and **Development** environments as needed
- Vercel will automatically inject `VERCEL=1` environment variable

## Step 4: Deploy

1. **Click "Deploy"** in Vercel Dashboard
2. **Monitor the build:**
   - Watch the build logs in real-time
   - The build will:
     - Install dependencies (`npm install`)
     - Build frontend (`vite build`)
     - Build backend (`esbuild server/index.ts`)
     - Deploy to Vercel's edge network

3. **Wait for deployment to complete:**
   - First deployment may take 2-5 minutes
   - Subsequent deployments are faster (~1-2 minutes)

## Step 5: Verify Deployment

1. **Check deployment URL:**
   - Vercel provides a URL like: `https://your-app-abc123.vercel.app`
   - Visit the URL in your browser

2. **Test the application:**
   - ✅ Frontend loads correctly
   - ✅ API endpoints work: `https://your-app.vercel.app/api/health`
   - ✅ Authentication works
   - ✅ Database connections work

3. **Check function logs:**
   - Go to Vercel Dashboard → Your Project → Functions
   - Click on `api/index.ts` to view logs
   - Check for any errors or warnings

## Step 6: Configure Custom Domain (Optional)

1. **Add domain in Vercel:**
   - Project Settings → Domains
   - Add your custom domain
   - Follow DNS configuration instructions

2. **Update CORS:**
   - Update `CLIENT_ORIGIN` environment variable to include your custom domain
   - Redeploy or wait for automatic redeploy

## Troubleshooting

### Build Fails

**Error: "Module not found"**
- Check that all dependencies are in `package.json`
- Verify `node_modules` is not committed (should be in `.gitignore`)

**Error: "TypeScript errors"**
- Run `npm run check` locally first
- Fix any TypeScript errors before deploying

### Runtime Errors

**Error: "Missing environment variables"**
- Verify all required variables are set in Vercel Dashboard
- Check that variable names match exactly (case-sensitive)
- Redeploy after adding variables

**Error: "Cannot connect to Supabase"**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct
- Check Supabase project is active
- Verify network connectivity from Vercel

**Error: "CORS errors"**
- Update `CLIENT_ORIGIN` to include your Vercel domain
- Check that CORS configuration in `server/index.ts` allows your domain
- Redeploy after updating

### Function Timeout

**Error: "Function execution timeout"**
- Check `vercel.json` - `maxDuration` is set to 30 seconds
- For longer operations, consider:
  - Increasing `maxDuration` in `vercel.json`
  - Optimizing slow operations
  - Using background jobs for long-running tasks

### Static Assets Not Loading

**Issue: Images or assets not found**
- Verify `attached_assets` directory is included in deployment
- Check that static file serving in `server/index.ts` works correctly
- Consider moving assets to Supabase Storage or CDN for production

## Post-Deployment Checklist

- [ ] Application loads correctly
- [ ] API endpoints respond (`/api/health`)
- [ ] Authentication works
- [ ] Database operations work
- [ ] Static assets load
- [ ] Environment variables are set correctly
- [ ] CORS is configured for production domain
- [ ] Custom domain configured (if applicable)
- [ ] Monitoring/logging is set up

## Continuous Deployment

Vercel automatically deploys on every push to your main branch:
- **Production:** Deploys from `main` branch
- **Preview:** Creates preview deployments for pull requests
- **Automatic:** No manual action needed after initial setup

## Monitoring

- **Function Logs:** Vercel Dashboard → Functions → `api/index.ts`
- **Analytics:** Vercel Dashboard → Analytics (if enabled)
- **Real-time:** View logs during deployment in dashboard

## Next Steps

1. Set up monitoring and alerts
2. Configure backup strategies for Supabase
3. Set up CI/CD workflows if needed
4. Optimize performance (caching, CDN)
5. Set up error tracking (Sentry, etc.)

