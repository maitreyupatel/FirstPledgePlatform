# Environment Variables Setup

## Quick Start

1. **Create `.env` file** in the project root directory (same level as `package.json`)

2. **Add your API keys** to the `.env` file:

```env
# Get your API keys from:
# - GEMINI_API_KEY: https://makersuite.google.com/app/apikey
# - GOOGLE_API_KEY: https://console.cloud.google.com/apis/credentials
# - GOOGLE_CX_ID: https://programmablesearchengine.google.com/controlpanel/create
GEMINI_API_KEY=your-gemini-api-key-here
GOOGLE_API_KEY=your-google-api-key-here
GOOGLE_CX_ID=your-custom-search-engine-id-here

PORT=3000
CLIENT_ORIGIN=http://localhost:5173
```

3. **Install dependencies** (if not already installed):
```bash
npm install
```

4. **Restart your server** for changes to take effect

## Important Notes

- ✅ The `.env` file is already in `.gitignore` - your keys are safe
- ✅ Never commit the `.env` file to git
- ✅ The `.env.example` file shows the format without real keys
- ✅ Server will use fallback mode if keys are missing (keyword matching)

## Verification

After setting up, check your server console. You should see:
- ✅ `AI Vetting Service initialized`
- ✅ `Citation Service initialized`

If you see warnings, check that your keys are correct in the `.env` file.

## Troubleshooting

**"GEMINI_API_KEY not set" warning:**
- Check that `.env` file exists in project root
- Verify key name is exactly `GEMINI_API_KEY` (no spaces)
- Restart server after creating/editing `.env`

**"GOOGLE_API_KEY or GOOGLE_CX_ID not set" warning:**
- Citation search will be disabled but AI analysis will still work
- Add both keys to enable citation search

**API Errors:**
- Verify keys are correct and active
- Check API quotas/limits in Google Cloud Console
- Ensure Custom Search Engine is configured correctly

