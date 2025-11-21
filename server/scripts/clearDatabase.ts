/**
 * Script to clear all products and ingredients from Supabase
 * Use with caution - this will delete all data!
 * Run with: npm run tsx server/scripts/clearDatabase.ts
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

async function clearDatabase() {
  console.log("⚠️  WARNING: This will delete ALL products and ingredients!");
  console.log("Press Ctrl+C to cancel, or wait 3 seconds to continue...\n");
  
  await new Promise(resolve => setTimeout(resolve, 3000));

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Delete all ingredients first (due to foreign key constraint)
    console.log("🗑️  Deleting all ingredients...");
    const { error: ingredientsError } = await supabase
      .from("ingredients")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    if (ingredientsError) {
      throw new Error(`Failed to delete ingredients: ${ingredientsError.message}`);
    }
    console.log("✅ Ingredients deleted");

    // Delete all products
    console.log("🗑️  Deleting all products...");
    const { error: productsError } = await supabase
      .from("products")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    if (productsError) {
      throw new Error(`Failed to delete products: ${productsError.message}`);
    }
    console.log("✅ Products deleted");

    // Verify deletion
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    const { count: ingredientCount } = await supabase
      .from("ingredients")
      .select("*", { count: "exact", head: true });

    console.log("\n✅ Database cleared successfully!");
    console.log(`   Products remaining: ${productCount || 0}`);
    console.log(`   Ingredients remaining: ${ingredientCount || 0}`);
    console.log("\n💡 You can now add products via the admin portal");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    process.exit(1);
  }
}

clearDatabase();

