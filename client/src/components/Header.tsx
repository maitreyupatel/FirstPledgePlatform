import { Link, useLocation } from "wouter";
import { Shield, LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth/AuthProvider";

interface HeaderProps {
  showAdminLink?: boolean;
}

export default function Header({ showAdminLink = false }: HeaderProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const isAdminPage = location.startsWith("/admin");

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/">
          <div className="flex items-center gap-2 hover-elevate active-elevate-2 px-2 py-1 rounded-md -ml-2 cursor-pointer" data-testid="link-home">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">FirstPledge</span>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {showAdminLink && (
            <Link href="/admin">
              <Button variant="ghost" data-testid="link-admin" className="h-9">
                Admin
              </Button>
            </Link>
          )}
          {isAdminPage && user && (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="h-9"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
