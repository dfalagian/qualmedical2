import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UserPlus, Trash2, User, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ContadorInfo {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export function ManageContador() {
  const { user } = useAuth();
  const [contador, setContador] = useState<ContadorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: ""
  });

  useEffect(() => {
    if (user?.id) {
      fetchContador();
    }
  }, [user?.id]);

  const fetchContador = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at')
        .eq('parent_supplier_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setContador(data);
    } catch (error) {
      console.error('Error fetching contador:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContador = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password || !formData.fullName) {
      toast.error("Todos los campos son requeridos");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    try {
      setCreating(true);
      
      const response = await supabase.functions.invoke('create-supplier-contador', {
        body: {
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName
        }
      });

      // Check for error in response data first (edge function returned error)
      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      // Check for SDK-level error
      if (response.error) {
        // Try to parse the error context for the actual message
        const errorMessage = response.error.context?.body 
          ? JSON.parse(response.error.context.body)?.error 
          : response.error.message;
        throw new Error(errorMessage || 'Error al crear contador');
      }

      toast.success("Contador creado exitosamente");
      setFormData({ email: "", password: "", fullName: "" });
      setShowForm(false);
      fetchContador();
    } catch (error: any) {
      console.error('Error creating contador:', error);
      // Translate common error messages
      let errorMsg = error.message || "Error al crear el contador";
      if (errorMsg.includes('already been registered')) {
        errorMsg = "Este correo electrónico ya está registrado en el sistema";
      }
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteContador = async () => {
    if (!contador) return;

    try {
      setDeleting(true);
      
      const response = await supabase.functions.invoke('delete-supplier-contador', {
        body: { contadorId: contador.id }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success("Contador eliminado exitosamente");
      setContador(null);
    } catch (error: any) {
      console.error('Error deleting contador:', error);
      toast.error(error.message || "Error al eliminar el contador");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Mi Contador de Medicamentos
        </CardTitle>
        <CardDescription>
          Gestiona el acceso de tu contador para el conteo de medicamentos
        </CardDescription>
      </CardHeader>
      <CardContent>
        {contador ? (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{contador.full_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{contador.email}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Registrado: {new Date(contador.created_at).toLocaleDateString('es-MX')}
              </p>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm">
              <p className="text-blue-700 dark:text-blue-300">
                <strong>Permisos:</strong> Solo puede ver y realizar conteos de medicamentos y ver órdenes de compra.
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={deleting}>
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Eliminar Contador
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar contador?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente el acceso de {contador.full_name} al sistema.
                    No podrá recuperar esta cuenta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteContador} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : showForm ? (
          <form onSubmit={handleCreateContador} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                placeholder="Nombre del contador"
                value={formData.fullName}
                onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="contador@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-sm">
              <p className="text-amber-700 dark:text-amber-300">
                <strong>Nota:</strong> El contador solo tendrá acceso a:
              </p>
              <ul className="list-disc list-inside mt-1 text-amber-600 dark:text-amber-400">
                <li>Conteo de medicamentos</li>
                <li>Ver órdenes de compra</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                Cancelar
              </Button>
              <Button type="submit" disabled={creating} className="flex-1">
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creando...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear Contador
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <div className="text-muted-foreground">
              <p>No tienes un contador registrado.</p>
              <p className="text-sm">Crea una cuenta para tu contador de medicamentos.</p>
            </div>
            <Button onClick={() => setShowForm(true)} className="w-full">
              <UserPlus className="h-4 w-4 mr-2" />
              Agregar Contador
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
