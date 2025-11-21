import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Get auth token from Supabase session or localStorage fallback
 */
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  // Try to get token from Supabase session
  try {
    const { supabase } = await import('./supabase');
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.warn("Error getting Supabase session:", error);
      // Fall through to localStorage fallback
    } else if (session?.access_token) {
      // Check if token is expired (basic check - JWT exp claim)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          console.warn("Supabase token expired, attempting refresh...");
          // Try to refresh the session
          const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshedSession?.session?.access_token) {
            return refreshedSession.session.access_token;
          }
          // If refresh fails, fall through to fallback
        } else {
          return session.access_token;
        }
      } catch (e) {
        // If token parsing fails, use it anyway (let server validate)
        return session.access_token;
      }
    }
  } catch (error) {
    // Supabase not configured or error, fall back to localStorage
    console.debug("Supabase auth not available, using fallback");
  }
  
  // Fallback to localStorage tokens (for development)
  return localStorage.getItem('admin_token') || 
         localStorage.getItem('supabase_token') || 
         localStorage.getItem('dev_api_key');
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  // Add Content-Type for requests with body
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add Authorization header if token is available
  const token = await getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    console.log(`🔐 API Request: ${method} ${url}`);
    console.log(`   Token present: ${!!token}, length: ${token.length}`);
  } else {
    console.warn(`⚠️  API Request without token: ${method} ${url}`);
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API Error: ${res.status} ${res.statusText}`);
    console.error(`   Response: ${errorText}`);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
