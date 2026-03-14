import { Switch, Route, Redirect, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery, QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LoginPage from "./pages/LoginPage";
import AdminDashboard from "./pages/AdminDashboard";
import ClientDashboard from "./pages/ClientDashboard";
import NotFound from "./pages/not-found";

function AppRouter() {
  const { data: me, isLoading } = useQuery<{ id: number; name: string; email: string; role: string } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-gold rounded-full border-t-transparent spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {me ? <Redirect to={me.role === "admin" ? "/admin" : "/dashboard"} /> : <LoginPage />}
      </Route>
      <Route path="/admin">
        {!me ? <Redirect to="/login" /> : me.role !== "admin" ? <Redirect to="/dashboard" /> : <AdminDashboard user={me} />}
      </Route>
      <Route path="/dashboard">
        {!me ? <Redirect to="/login" /> : me.role === "admin" ? <Redirect to="/admin" /> : <ClientDashboard user={me} />}
      </Route>
      <Route path="/">
        {me ? <Redirect to={me.role === "admin" ? "/admin" : "/dashboard"} /> : <Redirect to="/login" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
