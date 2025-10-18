import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Users, ShieldCheck } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

const Admin = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery({
    queryKey: ["all_users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      return profiles;
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, currentRole }: { userId: string; currentRole: string | null }) => {
      if (currentRole === "admin") {
        // Remove admin role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");

        if (error) throw error;
      } else {
        // Add admin role
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: userId, role: "admin" }]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Rol actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["all_users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar rol");
    },
  });

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Administración</h2>
          <p className="text-muted-foreground">
            Gestiona usuarios y configuración del sistema
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gestión de Usuarios
            </CardTitle>
            <CardDescription>
              Administra los roles de los usuarios del sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando usuarios...</p>
            ) : users && users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user: any) => {
                  const userRole = user.user_roles?.[0]?.role;
                  const isUserAdmin = userRole === "admin";

                  return (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="font-semibold">{user.full_name}</h4>
                          {isUserAdmin ? (
                            <Badge className="bg-primary">
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Administrador
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Proveedor</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {user.company_name && (
                          <p className="text-sm text-muted-foreground">
                            Empresa: {user.company_name}
                          </p>
                        )}
                        {user.rfc && (
                          <p className="text-sm text-muted-foreground">RFC: {user.rfc}</p>
                        )}
                      </div>

                      <Button
                        variant={isUserAdmin ? "destructive" : "default"}
                        size="sm"
                        onClick={() =>
                          toggleAdminMutation.mutate({
                            userId: user.id,
                            currentRole: userRole,
                          })
                        }
                      >
                        {isUserAdmin ? "Quitar Admin" : "Hacer Admin"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay usuarios registrados
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuración del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Almacenamiento de Documentos</h4>
                <p className="text-sm text-muted-foreground">
                  Los documentos se almacenan de forma segura en buckets privados
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Seguridad</h4>
                <p className="text-sm text-muted-foreground">
                  Row Level Security (RLS) activo en todas las tablas
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Autenticación</h4>
                <p className="text-sm text-muted-foreground">
                  Auto-confirmación de email habilitada para facilitar el registro
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Admin;