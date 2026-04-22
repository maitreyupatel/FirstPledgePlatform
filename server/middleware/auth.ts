/**
 * Authentication Middleware
 * Protects admin routes using Supabase JWT tokens or API key fallback
 */

import dotenv from 'dotenv';
dotenv.config();

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Create Supabase client for auth verification
// IMPORTANT: Must use anon key for JWT verification, NOT service role key
// Service role key bypasses RLS and should only be used for admin operations
// JWTs are signed with the anon key, so they must be verified with the anon key
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabaseAnonKey) {
  console.error("❌ SUPABASE_ANON_KEY is required for JWT verification!");
  console.error("   Please add it to your .env file.");
  console.error("   Find it in Supabase Dashboard > Settings > API > anon/public key");
  console.error("   Without it, authentication will fail in production.");
}

/**
 * Middleware to require authentication for admin routes
 * Supports both Supabase JWT tokens and API key fallback
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // In development mode, allow requests without auth if no keys are configured
  const isDevelopment = process.env.NODE_ENV === 'development';
  // Check if we have proper auth configuration
  // For JWT verification, we need anon key. Service role key is only for fallback API key auth.
  const hasProperAuthConfig = !!(supabaseAnonKey && supabaseUrl);
  const hasApiKeyFallback = !!(ADMIN_API_KEY || supabaseServiceRoleKey);
  
  if (isDevelopment && !hasProperAuthConfig && !hasApiKeyFallback) {
    console.warn("⚠️  Development mode: Admin routes are unprotected (no auth keys configured)");
    (req as any).user = { id: 'dev', role: 'admin' };
    return next();
  }
  
  // Warn if anon key is missing (will cause JWT verification to fail)
  if (!supabaseAnonKey && supabaseClient === null) {
    console.error("❌ Cannot verify JWT tokens: SUPABASE_ANON_KEY is missing!");
    console.error("   JWT authentication will fail. Only API key fallback will work.");
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.error("❌ No Authorization header found");
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Authentication required. Please provide a token in the Authorization header."
    });
  }

  // Extract token from Authorization header
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔐 Auth check for ${req.method} ${req.path}`);
    console.log(`   Token present: ${!!token}`);
    console.log(`   Token length: ${token?.length || 0}`);
  }

  // Try Supabase JWT verification first
  if (supabaseClient) {
    try {
      console.log("   Attempting Supabase JWT verification...");
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      
      if (error) {
        console.error(`   ❌ Supabase JWT verification failed: ${error.message}`);
        console.error(`   Error code: ${error.status}`);
        // Fall through to API key check
      } else if (user) {
        console.log(`   ✅ Supabase user found: ${user.email} (${user.id})`);
        // Check user role from user_profiles table
        try {
          const adminClient = getSupabaseAdminClient();
          console.log("   Checking user profile...");
          const { data: profile, error: profileError } = await adminClient
            .from("user_profiles")
            .select("role")
            .eq("id", user.id)
            .single();

          if (profileError) {
            console.error("   ❌ Error fetching user profile:", profileError);
            // If profile doesn't exist, treat as non-admin
            return res.status(403).json({
              error: "Forbidden",
              message: "Admin role required. Please contact an administrator.",
              details: profileError.message
            });
          }

          const role = profile?.role || 'user';
          console.log(`   User role: ${role}`);
          
          // Only allow admin users
          if (role !== 'admin') {
            console.error(`   ❌ User does not have admin role (current: ${role})`);
            return res.status(403).json({
              error: "Forbidden",
              message: `Admin role required. Current role: ${role}`
            });
          }

          console.log("   ✅ User authenticated and authorized");
          // User authenticated via Supabase
          (req as any).user = {
            id: user.id,
            email: user.email,
            role: role
          };
          return next();
        } catch (profileErr: any) {
          console.error("   ❌ Error checking user role:", profileErr);
          return res.status(403).json({
            error: "Forbidden",
            message: "Unable to verify admin role.",
            details: profileErr?.message
          });
        }
      } else {
        console.error("   ❌ No user returned from Supabase");
      }
    } catch (error: any) {
      // Fall through to API key check
      console.error("   ❌ Supabase auth exception:", error?.message);
    }
  } else {
    console.log("   ⚠️  Supabase client not available");
  }

  // Fallback to API key authentication
  // IMPORTANT: Only use ADMIN_API_KEY here — never the service role key.
  // The service role key bypasses Supabase RLS and must not be used as a bearer token.
  const validApiKey = ADMIN_API_KEY;

  if (validApiKey) {
    console.log("   Attempting API key authentication...");
    if (token === validApiKey) {
      console.log("   ✅ API key authentication successful");
      (req as any).user = {
        id: 'admin',
        role: 'admin'
      };
      return next();
    } else {
      console.error("   ❌ API key mismatch");
    }
  } else {
    console.log("   ⚠️  No ADMIN_API_KEY configured");
  }

  // No valid authentication found
  console.error("   ❌ All authentication methods failed");
  return res.status(403).json({ 
    error: "Forbidden",
    message: "Invalid or expired token. Please log in again.",
    debug: {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      hasSupabaseClient: !!supabaseClient,
      hasApiKey: !!validApiKey
    }
  });
}

/**
 * Optional auth - doesn't fail if not authenticated, but attaches user if valid
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return next();
  }

  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : authHeader;

  // Try Supabase JWT verification
  if (supabaseClient) {
    try {
      const { data: { user }, error } = await supabaseClient.auth.getUser(token);
      if (!error && user) {
        // Check role from user_profiles — same check as requireAuth
        try {
          const adminClient = getSupabaseAdminClient();
          const { data: profile } = await adminClient
            .from("user_profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          const role = profile?.role || 'user';
          (req as any).user = {
            id: user.id,
            email: user.email,
            role
          };
        } catch {
          (req as any).user = { id: user.id, email: user.email, role: 'user' };
        }
        return next();
      }
    } catch (error) {
      // Continue to API key check
    }
  }

  // Fallback to ADMIN_API_KEY only (never service role key)
  const validApiKey = ADMIN_API_KEY;
  if (validApiKey && token === validApiKey) {
    (req as any).user = {
      id: 'admin',
      role: 'admin'
    };
  }

  next();
}

/**
 * Create Supabase client helper
 * Use this for database operations
 */
export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key must be set in environment variables");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/**
 * Create Supabase client with service role (for admin operations)
 * WARNING: Only use on server-side, never expose to client
 */
export function getSupabaseAdminClient() {
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

