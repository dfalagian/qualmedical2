import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import qualmedicalLogo from "@/assets/qualmedical-logo.jpg";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Schema de validación para login
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "El email es requerido")
    .email("Email inválido")
    .max(255, "Email demasiado largo")
    .toLowerCase(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "Contraseña demasiado larga"),
});

// Schema de validación para registro con validación de RFC
const signupSchema = loginSchema.extend({
  full_name: z
    .string()
    .trim()
    .min(1, "El nombre completo es requerido")
    .max(100, "Nombre demasiado largo"),
  company_name: z
    .string()
    .trim()
    .min(1, "El nombre de empresa es requerido")
    .max(100, "Nombre de empresa demasiado largo"),
  rfc: z
    .string()
    .trim()
    .min(12, "El RFC debe tener 12 caracteres (Persona Moral) o 13 caracteres (Persona Física)")
    .max(13, "El RFC no puede tener más de 13 caracteres")
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, "Formato de RFC inválido"),
  phone: z
    .string()
    .trim()
    .max(20, "Teléfono demasiado largo")
    .optional(),
  tipo_venta: z.enum(["medicamentos", "otros"], {
    required_error: "Selecciona el tipo de venta",
  }),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

export const AuthForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      full_name: "",
      company_name: "",
      rfc: "",
      phone: "",
      tipo_venta: undefined,
    },
  });

  // Detectar tipo de persona según longitud del RFC
  const rfcValue = signupForm.watch("rfc");
  const tipoPersona = rfcValue?.length === 13 ? "fisica" : rfcValue?.length === 12 ? "moral" : null;

  // Resetear formularios cuando cambie entre login y registro
  useEffect(() => {
    if (isSignUp) {
      loginForm.reset();
    } else {
      signupForm.reset();
    }
  }, [isSignUp, loginForm, signupForm]);

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        // No revelar información específica sobre si el usuario existe
        if (error.message.includes("Invalid") || error.message.includes("incorrect")) {
          throw new Error("Credenciales inválidas");
        }
        throw error;
      }
      
      toast.success("Sesión iniciada correctamente");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Error al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (data: SignupFormValues) => {
    setIsLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;
      
      // Crear usuario con Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: data.full_name,
          }
        }
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          throw new Error("Este email ya está registrado");
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Error al crear la cuenta");
      }

      // Determinar tipo de persona por longitud del RFC
      const tipoPersonaValue = data.rfc.length === 13 ? 'fisica' : 'moral';

      // Actualizar perfil con tipo_persona y tipo_venta
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: authData.user.id,
          email: data.email,
          full_name: data.full_name,
          company_name: data.company_name,
          rfc: data.rfc,
          phone: data.phone || null,
          tipo_persona: tipoPersonaValue,
          tipo_venta: data.tipo_venta,
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        throw new Error("Error al actualizar el perfil");
      }

      toast.success("Cuenta creada correctamente. Puedes iniciar sesión.");
      setIsSignUp(false);
      loginForm.reset();
    } catch (error: any) {
      toast.error(error.message || "Error al crear la cuenta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4">
            <img 
              src={qualmedicalLogo} 
              alt="QualMedical Farma" 
              className="h-16 w-auto mx-auto"
            />
          </div>
          <CardTitle className="text-2xl font-bold">
            {isSignUp ? "Crear Cuenta" : "Iniciar Sesión"}
          </CardTitle>
          <CardDescription>
            {isSignUp 
              ? "Regístrate como proveedor en el sistema" 
              : "Ingresa tus credenciales para acceder al sistema"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isSignUp ? (
            <Form {...loginForm} key="login-form">
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo Electrónico</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="tu@email.com"
                          autoComplete="email"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar Sesión
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  ¿No tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className="text-primary hover:underline font-medium"
                    disabled={isLoading}
                  >
                    Regístrate aquí
                  </button>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...signupForm} key="signup-form">
              <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                <FormField
                  control={signupForm.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo *</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="JUAN PÉREZ"
                          disabled={isLoading}
                          required
                          {...field}
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo Electrónico *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="tu@email.com"
                          disabled={isLoading}
                          required
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de Empresa *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="MI EMPRESA S.A."
                          disabled={isLoading}
                          required
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="rfc"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>RFC *</FormLabel>
                        {tipoPersona && (
                          <Badge variant={tipoPersona === "fisica" ? "secondary" : "default"}>
                            {tipoPersona === "fisica" ? "Persona Física (13 caracteres)" : "Persona Moral (12 caracteres)"}
                          </Badge>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="XAXX010101000"
                          disabled={isLoading}
                          required
                          maxLength={13}
                          style={{ textTransform: 'uppercase' }}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        {!tipoPersona && "Ingresa tu RFC para detectar si eres Persona Física o Moral"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="tipo_venta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Venta *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isLoading}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el tipo de venta" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="medicamentos">Venta de Medicamentos</SelectItem>
                          <SelectItem value="otros">Venta de otros productos o servicios</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Esto determina los documentos que deberás subir
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={signupForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder="5512345678"
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear Cuenta
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  ¿Ya tienes cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="text-primary hover:underline font-medium"
                    disabled={isLoading}
                  >
                    Inicia sesión aquí
                  </button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};