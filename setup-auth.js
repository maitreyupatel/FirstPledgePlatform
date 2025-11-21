/**
 * Quick Auth Setup Script
 * Run this in your browser console to set up authentication
 * 
 * Usage: Copy and paste this entire script into browser console
 */

(function() {
  // Your Supabase Service Role Key (from .env file)
  const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsc3dnc2lkemR3b3Zrd2l2Z2doIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzYyNTM3NiwiZXhwIjoyMDc5MjAxMzc2fQ.NDSBPVPNwzwZEyUU7Sb_wKPEwWjdwBqf_7Nh3OYo5kg';
  
  // Set the token in localStorage
  localStorage.setItem('dev_api_key', SERVICE_ROLE_KEY);
  
  console.log('✅ Authentication token set successfully!');
  console.log('🔄 Please refresh the page for changes to take effect.');
  console.log('🧪 Try deleting/editing a product to verify it works.');
})();

