import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const navigate = useNavigate();

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching role:", error);
        setUserRole(null);
        setRoleLoading(false);
        return;
      }

      setUserRole(data?.role || null);
      setRoleLoading(false);
    } catch (error) {
      console.error("Error in fetchUserRole:", error);
      setUserRole(null);
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        console.log('Auth state changed:', event, currentSession?.user?.id);
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        
        if (event === 'SIGNED_OUT') {
          setUserRole(null);
          setRoleLoading(false);
        } else if (currentSession?.user) {
          setRoleLoading(true);
          setTimeout(() => {
            if (mounted) {
              fetchUserRole(currentSession.user.id);
            }
          }, 0);
        } else {
          setUserRole(null);
          setRoleLoading(false);
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      
      if (currentSession?.user) {
        setRoleLoading(true);
        setTimeout(() => {
          if (mounted) {
            fetchUserRole(currentSession.user.id);
          }
        }, 0);
      } else {
        setRoleLoading(false);
      }
      
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      console.log('Starting sign out...');
      
      // Call Supabase signOut first
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("SignOut error:", error);
        // Ignore session not found errors - they mean we're already logged out
        const ignorableErrors = [
          "Auth session missing",
          "session_not_found",
          "Session from session_id claim in JWT does not exist"
        ];
        
        if (!ignorableErrors.some(msg => error.message?.includes(msg))) {
          throw error;
        }
      }
      
      // Clear local state
      setUser(null);
      setSession(null);
      setUserRole(null);
      
      toast.success("Sesión cerrada correctamente");
      
      console.log('Sign out complete, redirecting...');
      
      // Small delay before redirect to ensure state is cleared
      setTimeout(() => {
        window.location.href = "/auth";
      }, 100);
    } catch (error: any) {
      console.error("Error al cerrar sesión:", error);
      
      // Clear state anyway
      setUser(null);
      setSession(null);
      setUserRole(null);
      
      toast.error("Error al cerrar sesión: " + (error.message || "Error desconocido"));
      
      // Force navigation anyway
      setTimeout(() => {
        window.location.href = "/auth";
      }, 100);
    }
  };

  return {
    user,
    session,
    loading: loading || roleLoading,
    userRole,
    signOut,
    isAdmin: userRole === "admin",
    isSupplier: userRole === "proveedor",
  };
};