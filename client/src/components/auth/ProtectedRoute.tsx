import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./AuthProvider";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Replace current history entry so back-button skips the protected route
    // and returns to whatever the user was viewing before (e.g. home).
    if (!loading && !user) {
      setLocation("/login", { replace: true });
    }
  }, [user, loading, setLocation]);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect via useEffect)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // TODO: Check admin role from user_profiles table
  // For now, allow all authenticated users
  if (requireAdmin) {
    // In a real implementation, check user role from Supabase
    // const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    // if (profile?.role !== 'admin') {
    //   return <div>Access denied. Admin role required.</div>;
    // }
  }

  return <>{children}</>;
}

