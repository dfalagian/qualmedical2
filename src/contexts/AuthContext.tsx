import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type UserRole = "admin" | "proveedor" | "contador";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** Solo carga inicial (primer render / bootstrap). */
  loading: boolean;
  /** Carga de rol (puede ocurrir en background). */
  roleLoading: boolean;
  userRole: UserRole | null;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSupplier: boolean;
  isContador: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Evita refetch innecesario del rol por múltiples renders/foco
  const roleFetchedForUserIdRef = useRef<string | null>(null);

  const fetchUserRole = useCallback(async (userId: string) => {
    // Si ya tenemos rol para este usuario, no lo vuelvas a pedir
    if (roleFetchedForUserIdRef.current === userId && userRole) return;

    setRoleLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      setUserRole((data?.role as UserRole) || null);
      roleFetchedForUserIdRef.current = userId;
    } catch (err) {
      console.error("Error fetching role:", err);
      setUserRole(null);
      roleFetchedForUserIdRef.current = null;
    } finally {
      setRoleLoading(false);
    }
  }, [userRole]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(data.session);
        setUser(data.session?.user ?? null);

        if (data.session?.user) {
          // Carga inicial: sí bloquea hasta tener rol
          await fetchUserRole(data.session.user.id);
        } else {
          setUserRole(null);
          roleFetchedForUserIdRef.current = null;
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (event === "SIGNED_OUT") {
        setUserRole(null);
        roleFetchedForUserIdRef.current = null;
        setRoleLoading(false);
        return;
      }

      // Evitar “pantalla en blanco” al volver al foco: no tocamos `loading` aquí.
      // Solo refrescamos rol si cambió el usuario.
      if (currentSession?.user) {
        if (roleFetchedForUserIdRef.current !== currentSession.user.id) {
          fetchUserRole(currentSession.user.id);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  const signOut = useCallback(async () => {
    try {
      setUser(null);
      setSession(null);
      setUserRole(null);
      roleFetchedForUserIdRef.current = null;

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (signOutError) {
        console.log("Server signout failed (expected if session expired):", signOutError);
      }

      toast.success("Sesión cerrada correctamente");
      window.location.href = "/auth";
    } catch (error: any) {
      console.error("Error al cerrar sesión:", error);
      window.location.href = "/auth";
    }
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    roleLoading,
    userRole,
    signOut,
    isAdmin: userRole === "admin",
    isSupplier: userRole === "proveedor",
    isContador: userRole === "contador",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
