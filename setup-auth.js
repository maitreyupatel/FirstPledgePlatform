/**
 * Quick Auth Setup Script
 * Run this in your browser console to set up authentication
 * 
 * Usage: 
 * 1. Get your Supabase Service Role Key from your .env file (SUPABASE_SERVICE_ROLE_KEY)
 * 2. Copy and paste this script into browser console
 * 3. When prompted, paste your Service Role Key
 * 
 * IMPORTANT: Never commit your actual API keys to the repository!
 * This script prompts you to enter the key locally.
 */

(function() {
  // Prompt user to enter their Service Role Key (from local .env file)
  const SERVICE_ROLE_KEY = prompt(
    'Enter your Supabase Service Role Key (from .env file):\n' +
    '⚠️  This key is stored locally in your browser only.\n' +
    'Find it in Supabase Dashboard > Settings > API > service_role key'
  );
  
  if (!SERVICE_ROLE_KEY || SERVICE_ROLE_KEY.trim() === '') {
    console.error('❌ No key provided. Authentication setup cancelled.');
    return;
  }
  
  // Validate it looks like a JWT token
  if (!SERVICE_ROLE_KEY.startsWith('eyJ')) {
    console.warn('⚠️  Warning: This does not look like a valid JWT token.');
    const proceed = confirm('Do you want to continue anyway?');
    if (!proceed) {
      console.log('Setup cancelled.');
      return;
    }
  }
  
  // Set the token in localStorage (local only, never committed)
  localStorage.setItem('dev_api_key', SERVICE_ROLE_KEY.trim());
  
  console.log('✅ Authentication token set successfully!');
  console.log('🔄 Please refresh the page for changes to take effect.');
  console.log('🧪 Try deleting/editing a product to verify it works.');
  console.log('🔒 Key stored locally in browser only - not committed to repo.');
})();

