import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Users, ShieldCheck, Pencil, Trash2, UserPlus, FileText, KeyRound, ClipboardList, Bell, BarChart3, ClipboardCheck } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationRecipientsManager } from "@/components/admin/NotificationRecipientsManager";
import { ExportInventoryButton } from "@/components/inventory/ExportInventoryButton";
import { PhysicalInventoryCount } from "@/components/admin/PhysicalInventoryCount";


const userFormSchema = z.object({
  full_name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido"),
  company_name: z.string().optional(),
  rfc: z.string().optional(),
  phone: z.string().optional(),
});

const createUserFormSchema = z.object({
  full_name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  role: z.enum(["admin", "proveedor", "contador", "contador_proveedor", "inventario_rfid"], { required_error: "Selecciona un rol" }),
  company_name: z.string().optional(),
  rfc: z.string().optional(),
  phone: z.string().optional(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type UserFormValues = z.infer<typeof userFormSchema>;
type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

const Admin = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordChangeUser, setPasswordChangeUser] = useState<any>(null);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      company_name: "",
      rfc: "",
      phone: "",
    },
  });

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      role: "proveedor",
      company_name: "",
      rfc: "",
      phone: "",
    },
  });

  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["all_users"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      
      console.log("Users fetched:", profiles);
      
      // Para cada usuario, obtener sus pagos con comprobantes
      const usersWithPayments = await Promise.all(
        profiles.map(async (profile: any) => {
          const { data: pagosData } = await supabase
            .from("pagos")
            .select("id, comprobante_pago_url, amount, fecha_pago, invoices(invoice_number)")
            .eq("supplier_id", profile.id)
            .not("comprobante_pago_url", "is", null)
            .order("created_at", { ascending: false });
          
          return {
            ...profile,
            pagos_con_comprobante: pagosData || []
          };
        })
      );
      
      return usersWithPayments;
    },
    refetchInterval: false,
    staleTime: 0, // Always treat data as stale to ensure fresh data
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

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: UserFormValues }) => {
      const { error } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuario actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["all_users"] });
      setDialogOpen(false);
      setEditingUser(null);
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar usuario");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No hay sesión activa");

      const response = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);
    },
    onSuccess: () => {
      toast.success("Usuario eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: ["all_users"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar usuario");
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormValues) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No hay sesión activa");

      const response = await supabase.functions.invoke("create-user", {
        body: {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          role: data.role,
          company_name: data.company_name || null,
          rfc: data.rfc || null,
          phone: data.phone || null,
        },
      });

      console.log("Create user response:", response);

      if (response.error) {
        console.error("Response error:", response.error);
        throw response.error;
      }
      
      if (response.data?.error) {
        console.error("Data error:", response.data.error);
        throw new Error(response.data.error);
      }

      if (!response.data?.success) {
        throw new Error("Error inesperado al crear usuario");
      }
    },
    onSuccess: () => {
      toast.success("Usuario creado correctamente");
      queryClient.invalidateQueries({ queryKey: ["all_users"] });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      console.error("Create user mutation error:", error);
      const errorMessage = error.message || "Error al crear usuario";
      toast.error(errorMessage);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const response = await supabase.functions.invoke("change-user-password", {
        body: { userId, newPassword },
      });

      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);
      
      return response.data;
    },
    onSuccess: () => {
      toast.success("Contraseña cambiada exitosamente");
      setPasswordDialogOpen(false);
      setPasswordChangeUser(null);
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al cambiar contraseña");
    },
  });

  const handleOpenPasswordDialog = (user: any) => {
    setPasswordChangeUser(user);
    passwordForm.reset();
    setPasswordDialogOpen(true);
  };

  const onPasswordSubmit = (data: ChangePasswordValues) => {
    if (passwordChangeUser) {
      changePasswordMutation.mutate({ 
        userId: passwordChangeUser.id, 
        newPassword: data.newPassword 
      });
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    form.reset({
      full_name: user.full_name || "",
      email: user.email || "",
      company_name: user.company_name || "",
      rfc: user.rfc || "",
      phone: user.phone || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = (data: UserFormValues) => {
    if (editingUser) {
      updateUserMutation.mutate({ userId: editingUser.id, data });
    }
  };

  const onCreateSubmit = (data: CreateUserFormValues) => {
    createUserMutation.mutate(data);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

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

        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Bitácora
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notificaciones
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Reportes
            </TabsTrigger>
            <TabsTrigger value="physical-inventory" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Inventario Físico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4 space-y-6">
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Gestión de Usuarios
                </CardTitle>
                <CardDescription>
                  Administra los roles de los usuarios del sistema
                </CardDescription>
              </div>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear Usuario
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                    <DialogDescription>
                      Completa los datos del nuevo usuario
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...createForm}>
                    <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                      <FormField
                        control={createForm.control}
                        name="full_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre Completo</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contraseña</FormLabel>
                            <FormControl>
                              <Input {...field} type="password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rol</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona un rol" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="proveedor">Proveedor</SelectItem>
                                <SelectItem value="contador">Contador</SelectItem>
                                <SelectItem value="contador_proveedor">Contador Proveedor</SelectItem>
                                <SelectItem value="inventario_rfid">Inventario RFID</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="company_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Empresa (opcional)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="rfc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>RFC (opcional)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Teléfono (opcional)</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setCreateDialogOpen(false);
                            createForm.reset();
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button type="submit" disabled={createUserMutation.isPending}>
                          {createUserMutation.isPending ? "Creando..." : "Crear Usuario"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando usuarios...</p>
            ) : users && users.length > 0 ? (
              <div className="space-y-3">
                {users.map((user: any) => {
                  const userRole = user.user_roles?.[0]?.role;
                  const isUserAdmin = userRole === "admin";
                  const isUserContador = userRole === "contador";

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
                          ) : isUserContador ? (
                            <Badge className="bg-blue-500">Contador</Badge>
                          ) : (
                            <>
                              <Badge variant="secondary">Proveedor</Badge>
                              {user.approved ? (
                                <Badge className="bg-success">Aprobado</Badge>
                              ) : (
                                <Badge variant="destructive">Sin Aprobar</Badge>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-muted-foreground">{user.email}</span>
                          <div className="flex items-center gap-3 text-xs">
                            {user.first_login_at && (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                Primer ingreso: {new Date(user.first_login_at).toLocaleDateString('es-MX', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                            {user.last_login_at && (
                              <span className="text-green-600 dark:text-green-400 font-medium">
                                Último ingreso: {new Date(user.last_login_at).toLocaleDateString('es-MX', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            )}
                            {!user.first_login_at && (
                              <span className="text-orange-600 dark:text-orange-400 font-semibold">
                                Sin ingresos al sistema
                              </span>
                            )}
                          </div>
                        </div>
                        {user.company_name && (
                          <p className="text-sm text-muted-foreground">
                            Empresa: {user.company_name}
                          </p>
                        )}
                        {user.rfc && (
                          <p className="text-sm text-muted-foreground">RFC: {user.rfc}</p>
                        )}
                        {user.pagos_con_comprobante && user.pagos_con_comprobante.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                            <ImageViewer
                              imageUrls={user.pagos_con_comprobante.map((p: any) => p.comprobante_pago_url)}
                              bucket="documents"
                              fileName="Comprobantes de Pago"
                              triggerText={`Ver ${user.pagos_con_comprobante.length} Comprobante${user.pagos_con_comprobante.length > 1 ? 's' : ''}`}
                              triggerVariant="outline"
                              triggerSize="sm"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPasswordDialog(user)}
                          disabled={changePasswordMutation.isPending}
                          title="Cambiar contraseña del usuario"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Dialog open={dialogOpen && editingUser?.id === user.id} onOpenChange={(open) => {
                          setDialogOpen(open);
                          if (!open) {
                            setEditingUser(null);
                            form.reset();
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditUser(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Editar Usuario</DialogTitle>
                              <DialogDescription>
                                Modifica la información del usuario
                              </DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                  control={form.control}
                                  name="full_name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Nombre Completo</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="email"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Email</FormLabel>
                                      <FormControl>
                                        <Input {...field} type="email" disabled />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="company_name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Empresa</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="rfc"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>RFC</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="phone"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Teléfono</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setDialogOpen(false);
                                      setEditingUser(null);
                                      form.reset();
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button type="submit">
                                    Guardar Cambios
                                  </Button>
                                </div>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>


                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente el usuario
                                <strong> {user.full_name}</strong> y todos sus datos asociados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUserMutation.mutate(user.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityLog />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationRecipientsManager />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Reportes
                </CardTitle>
                <CardDescription>
                  Exporta información del sistema en diferentes formatos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <ExportInventoryButton />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="physical-inventory" className="mt-4">
            <PhysicalInventoryCount />
          </TabsContent>
        </Tabs>

        <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
          setPasswordDialogOpen(open);
          if (!open) {
            setPasswordChangeUser(null);
            passwordForm.reset();
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Cambiar Contraseña
              </DialogTitle>
              <DialogDescription>
                Establece una nueva contraseña para <strong>{passwordChangeUser?.email}</strong>
              </DialogDescription>
            </DialogHeader>
            
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva Contraseña</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" placeholder="Mínimo 6 caracteres" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repetir Contraseña</FormLabel>
                      <FormControl>
                        <Input {...field} type="password" placeholder="Repite la contraseña" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPasswordDialogOpen(false);
                      setPasswordChangeUser(null);
                      passwordForm.reset();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={changePasswordMutation.isPending}>
                    {changePasswordMutation.isPending ? "Cambiando..." : "Cambiar Contraseña"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Admin;