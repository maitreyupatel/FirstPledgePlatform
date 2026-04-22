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
      {/* Orb 1 — mint/green, top-left */}
      <div
        className="absolute -top-64 -left-64 w-[900px] h-[700px] rounded-full opacity-100 animate-float-orb-1"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-1) 0%, transparent 70%)",
        }}
      />
      {/* Orb 2 — blue, bottom-right */}
      <div
        className="absolute -bottom-80 -right-48 w-[700px] h-[800px] rounded-full animate-float-orb-2"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-2) 0%, transparent 70%)",
        }}
      />
      {/* Orb 3 — purple, center */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[500px] rounded-full animate-float-orb-3"
        style={{
          background: "radial-gradient(ellipse at center, var(--orb-3) 0%, transparent 70%)",
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
  // Default to dark mode for the Liquid Glass experience
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
