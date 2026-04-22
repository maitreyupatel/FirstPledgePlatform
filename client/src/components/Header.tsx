import { Link, useLocation } from "wouter";
import { Shield, LogOut, Sparkles } from "lucide-react";
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
    <header className="sticky top-0 z-50 w-full">
      {/* Glass bar */}
      <div className="mx-auto px-4 pt-3 pb-2 md:px-6">
        <div
          className="glass rounded-2xl px-5 flex h-13 items-center justify-between"
          style={{ height: "52px" }}
        >
          {/* Logo */}
          <Link href="/">
            <div
              className="flex items-center gap-2.5 cursor-pointer group"
              data-testid="link-home"
            >
              <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-primary/15 group-hover:bg-primary/25 transition-colors duration-300">
                <Shield className="h-4 w-4 text-primary" />
                <div className="absolute inset-0 rounded-xl ring-1 ring-primary/20 group-hover:ring-primary/40 transition-all duration-300" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-800 text-base tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
                  FirstPledge
                </span>
                <span className="text-[9px] tracking-widest uppercase text-muted-foreground font-medium opacity-70">
                  Trust as a Service
                </span>
              </div>
            </div>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1.5">
            {showAdminLink && (
              <Link href="/admin">
                <Button
                  variant="ghost"
                  data-testid="link-admin"
                  className="h-8 px-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/10 dark:hover:bg-white/8 transition-all duration-200"
                >
                  Admin
                </Button>
              </Link>
            )}
            {isAdminPage && user && (
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="h-8 px-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-white/10 dark:hover:bg-white/8 transition-all duration-200"
                data-testid="button-logout"
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" />
                Logout
              </Button>
            )}
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
