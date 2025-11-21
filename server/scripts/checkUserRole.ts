import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkUserRole(email: string) {
  try {
    // Get user from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      return;
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      return;
    }

    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);

    // Check user_profiles
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("❌ Error fetching profile:", profileError);
      console.log("Creating profile with admin role...");
      
      // Create profile with admin role
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          id: user.id,
          email: user.email,
          role: "admin",
        });

      if (insertError) {
        console.error("❌ Error creating profile:", insertError);
      } else {
        console.log("✅ Created user profile with admin role");
      }
    } else {
      console.log(`Current role: ${profile.role}`);
      
      if (profile.role !== "admin") {
        console.log("⚠️  User does not have admin role. Updating...");
        
        const { error: updateError } = await supabase
          .from("user_profiles")
          .update({ role: "admin" })
          .eq("id", user.id);

        if (updateError) {
          console.error("❌ Error updating role:", updateError);
        } else {
          console.log("✅ Updated user role to admin");
        }
      } else {
        console.log("✅ User already has admin role");
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

const email = process.argv[2] || "maitreypatel4703@gmail.com";
console.log(`Checking role for: ${email}\n`);
checkUserRole(email).then(() => process.exit(0));

