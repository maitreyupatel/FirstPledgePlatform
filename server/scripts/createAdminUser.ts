/**
 * Script to create an admin user in Supabase
 * Usage: npm run tsx server/scripts/createAdminUser.ts <email> <password>
 * 
 * This script:
 * 1. Creates a user in Supabase Auth
 * 2. Creates a user profile with admin role
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load environment variables FIRST before importing anything that uses them
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

async function createAdminUser(email: string, password: string) {
  console.log(`🔐 Creating admin user: ${email}`);

  try {
    const supabase = getSupabaseAdminClient();

    // Step 1: Create auth user
    console.log("📝 Creating authentication user...");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error("User creation succeeded but no user data returned");
    }

    const userId = authData.user.id;
    console.log(`✅ Auth user created with ID: ${userId}`);

    // Step 2: Create user profile with admin role
    console.log("👤 Creating user profile with admin role...");
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        id: userId,
        email: email,
        role: "admin",
      });

    if (profileError) {
      // If profile already exists, update it
      if (profileError.code === "23505") {
        console.log("⚠️  Profile already exists, updating role to admin...");
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({ role: "admin" })
          .eq("id", userId);

        if (updateError) {
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }
        console.log("✅ Profile updated to admin role");
      } else {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
    } else {
      console.log("✅ User profile created with admin role");
    }

    console.log("\n🎉 Admin user created successfully!");
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Role: admin`);
    console.log("\n💡 You can now log in at http://localhost:5173/login");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run tsx server/scripts/createAdminUser.ts <email> <password>");
  console.error("\nExample:");
  console.error('  npm run tsx server/scripts/createAdminUser.ts admin@example.com "SecurePassword123!"');
  process.exit(1);
}

const [email, password] = args;

if (!email || !password) {
  console.error("Error: Email and password are required");
  process.exit(1);
}

if (password.length < 6) {
  console.error("Error: Password must be at least 6 characters long");
  process.exit(1);
}

createAdminUser(email, password);

