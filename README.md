# FirstPledgePlatform

Trust-as-a-Service platform for product safety verification.

## Setup

### Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in your actual API keys and configuration in `.env`:
   - **Supabase**: Get keys from [Supabase Dashboard](https://app.supabase.com) > Settings > API
   - **AI Provider**: Choose one and get the API key:
     - **Groq** (recommended, free tier): [console.groq.com](https://console.groq.com)
     - **OpenAI**: [platform.openai.com](https://platform.openai.com/api-keys)
     - **Gemini**: [makersuite.google.com](https://makersuite.google.com/app/apikey)
   - **Google Custom Search** (optional): For citation functionality

3. **IMPORTANT**: Never commit your `.env` file to the repository!

### Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## Security

- All API keys and secrets are stored in `.env` (local only, not committed)
- The `.env` file is gitignored and should never be committed
- If you accidentally commit credentials, rotate them immediately
- Use `.env.example` as a template for required variables