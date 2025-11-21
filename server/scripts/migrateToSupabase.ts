/**
 * Verification script to check Supabase connection
 * Seed data has been removed - products should be added via admin portal
 * Run with: npm run migrate:supabase
 */

import dotenv from "dotenv";
import { SupabaseStorage } from "../storage/supabaseStorage";

dotenv.config();

async function migrate() {
  console.log("🚀 Starting migration to Supabase...");
  console.log("⚠️  Note: Seed data has been removed. Products should be added via admin portal.");

  try {
    const storage = new SupabaseStorage();
    
    // Verify connection
    const products = await storage.list({ includeUnpublished: true });
    console.log(`✅ Connected to Supabase successfully`);
    console.log(`   Current products in database: ${products.length}`);
    console.log("\n💡 You can now add products via the admin portal at http://localhost:5173/admin");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration check failed:", error);
    process.exit(1);
  }
}

migrate();

