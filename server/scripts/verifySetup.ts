/**
 * Verification script to check Supabase setup
 * Run with: npm run tsx server/scripts/verifySetup.ts
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables FIRST
dotenv.config();

// Create Supabase admin client directly (bypassing middleware to avoid module load issues)
function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase URL and Service Role Key must be set in environment variables");
  }
  
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function verifySetup() {
  console.log("🔍 Verifying Supabase setup...\n");

  const supabase = getSupabaseAdminClient();
  let allChecksPassed = true;

  // Check 1: Tables exist
  console.log("1️⃣  Checking tables exist...");
  const requiredTables = ["products", "ingredients", "ingredient_analyses", "user_profiles"];
  
  for (const tableName of requiredTables) {
    const { data, error } = await supabase
      .from(tableName)
      .select("id")
      .limit(1);
    
    if (error) {
      console.error(`   ❌ Table '${tableName}' not found or inaccessible: ${error.message}`);
      allChecksPassed = false;
    } else {
      console.log(`   ✅ Table '${tableName}' exists`);
    }
  }

  // Check 2: Admin users exist
  console.log("\n2️⃣  Checking admin users...");
  const { data: adminUsers, error: adminError } = await supabase
    .from("user_profiles")
    .select("id, email, role")
    .eq("role", "admin");

  if (adminError) {
    console.error(`   ❌ Error checking admin users: ${adminError.message}`);
    allChecksPassed = false;
  } else if (!adminUsers || adminUsers.length === 0) {
    console.warn("   ⚠️  No admin users found. Create one with: npm run create:admin");
    allChecksPassed = false;
  } else {
    console.log(`   ✅ Found ${adminUsers.length} admin user(s):`);
    adminUsers.forEach((user) => {
      console.log(`      - ${user.email} (${user.id})`);
    });
  }

  // Check 3: Products count
  console.log("\n3️⃣  Checking products...");
  const { count: productCount, error: productError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  if (productError) {
    console.error(`   ❌ Error checking products: ${productError.message}`);
    allChecksPassed = false;
  } else {
    console.log(`   ✅ Found ${productCount || 0} product(s)`);
    if ((productCount || 0) === 0) {
      console.warn("   ⚠️  No products found. Run migration with: npm run migrate:supabase");
    }
  }

  // Check 4: Environment variables
  console.log("\n4️⃣  Checking environment variables...");
  const requiredEnvVars = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    USE_SUPABASE_STORAGE: process.env.USE_SUPABASE_STORAGE,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  };

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      console.error(`   ❌ ${key} is not set`);
      allChecksPassed = false;
    } else {
      // Never expose API keys in logs - only show that they're set
      if (key.includes("KEY")) {
        const maskedValue = "*".repeat(Math.min(value.length, 20)) + "...";
        console.log(`   ✅ ${key} = ${maskedValue} (length: ${value.length})`);
      } else {
        console.log(`   ✅ ${key} = ${value}`);
      }
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  if (allChecksPassed) {
    console.log("✅ All checks passed! Setup is complete.");
    console.log("\nNext steps:");
    console.log("   1. Start server: npm run server:dev");
    console.log("   2. Start client: npm run client:dev");
    console.log("   3. Log in at: http://localhost:5173/login");
  } else {
    console.log("❌ Some checks failed. Please review the errors above.");
    console.log("\nCommon fixes:");
    console.log("   - Run migrations: Copy SQL from supabase/migrations/ to Supabase SQL Editor");
    console.log("   - Create admin: npm run create:admin admin@example.com 'password'");
    console.log("   - Migrate data: npm run migrate:supabase");
    console.log("   - Set env vars: Check SUPABASE_SETUP_GUIDE.md");
  }
  console.log("=".repeat(50));

  process.exit(allChecksPassed ? 0 : 1);
}

verifySetup();

