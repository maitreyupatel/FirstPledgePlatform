import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LoginForm from "@/components/auth/LoginForm";
import Home from "@/pages/Home";
import ProductDetail from "@/pages/ProductDetail";
import AdminDashboard from "@/pages/AdminDashboard";
import ProductForm from "@/pages/ProductForm";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Animated gradient overlay — creates a living, breathing background */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(135deg, hsl(158 82% 8%) 0%, hsl(224 42% 5%) 25%, hsl(252 45% 9%) 50%, hsl(200 72% 6%) 75%, hsl(158 72% 5%) 100%)",
          backgroundSize: "400% 400%",
          animation: "gradientShift 22s ease infinite",
        }}
      />

      {/* Orb 1 — vivid mint/emerald, top-left */}
      <div
        className="absolute -top-64 -left-48 w-[1000px] h-[800px] rounded-full animate-float-orb-1"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-1) 0%, transparent 68%)",
        }}
      />
      {/* Orb 2 — electric blue, bottom-right */}
      <div
        className="absolute -bottom-72 -right-40 w-[900px] h-[900px] rounded-full animate-float-orb-2"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-2) 0%, transparent 68%)",
        }}
      />
      {/* Orb 3 — violet/indigo, center */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[600px] rounded-full animate-float-orb-3"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-3) 0%, transparent 68%)",
        }}
      />
      {/* Orb 4 — teal/cyan, top-right */}
      <div
        className="absolute -top-32 -right-32 w-[700px] h-[600px] rounded-full animate-float-orb-1"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-4) 0%, transparent 68%)",
          animationDuration: "18s",
          animationDelay: "-6s",
        }}
      />
      {/* Orb 5 — pink/rose, bottom-left */}
      <div
        className="absolute -bottom-48 -left-32 w-[650px] h-[700px] rounded-full animate-float-orb-2"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-5) 0%, transparent 68%)",
          animationDuration: "25s",
          animationDelay: "-12s",
        }}
      />

      {/* Fine grain noise overlay for premium texture */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/login" component={LoginForm} />
      <Route path="/admin">
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/:action/:id?">
        <ProtectedRoute>
          <ProductForm />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (!stored) {
      localStorage.setItem("theme", "dark");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.toggle("dark", stored === "dark");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AmbientBackground />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
