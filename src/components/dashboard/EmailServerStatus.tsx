import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const EmailServerStatus = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'warning'>('idle');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [errorDetails, setErrorDetails] = useState<string>("");

  const checkEmailServer = async () => {
    setIsChecking(true);
    setStatus('idle');
    setErrorDetails("");

    try {
      // Intentar hacer una llamada de prueba al edge function
      const { data, error } = await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: "test-connection",
          type: "test",
          data: {}
        }
      });

      if (error) {
        // Si hay error, verificar el mensaje
        if (error.message?.includes("timed out") || error.message?.includes("Connection")) {
          setStatus('error');
          setErrorDetails("No se puede conectar al servidor SMTP. El servidor de correo no es accesible.");
        } else if (error.message?.includes("proveedor")) {
          // Este error es esperado ya que usamos un ID de prueba
          setStatus('warning');
          setErrorDetails("El servidor SMTP parece estar configurado, pero no se pudo verificar completamente.");
        } else {
          setStatus('error');
          setErrorDetails(error.message || "Error desconocido al verificar el servidor de correo.");
        }
      } else {
        setStatus('success');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorDetails(err.message || "Error al intentar conectar con el servidor de correo.");
    } finally {
      setIsChecking(false);
      setLastCheck(new Date());
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <Mail className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'success':
        return <Badge variant="outline" className="bg-success/10 text-success border-success">Conectado</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive">Desconectado</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning">Advertencia</Badge>;
      default:
        return <Badge variant="outline" className="bg-muted text-muted-foreground">Sin verificar</Badge>;
    }
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-lg">Estado del Servidor de Correo Electrónico</CardTitle>
              <CardDescription>
                Verificación del servidor SMTP para notificaciones
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {lastCheck ? (
              <span>Última verificación: {lastCheck.toLocaleString('es-ES')}</span>
            ) : (
              <span>No se ha realizado ninguna verificación</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkEmailServer}
            disabled={isChecking}
          >
            {isChecking ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Verificar Estado
              </>
            )}
          </Button>
        </div>

        {status === 'error' && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Servidor de correo no disponible</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p className="font-medium">{errorDetails}</p>
              <div className="text-sm mt-3 space-y-1">
                <p className="font-semibold">Posibles causas:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>El servidor SMTP no acepta conexiones desde servidores cloud</li>
                  <li>Credenciales SMTP incorrectas o expiradas</li>
                  <li>Puerto o configuración TLS incorrectos</li>
                  <li>Firewall bloqueando las conexiones</li>
                </ul>
                <p className="font-semibold mt-3">Acción recomendada:</p>
                <p>Contacte con el administrador del servidor SMTP o considere migrar a un servicio de correo compatible con edge functions como Resend.</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {status === 'warning' && (
          <Alert className="border-warning bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Verificación parcial</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="text-foreground">{errorDetails}</p>
              <p className="text-sm mt-2 text-foreground">
                Se recomienda enviar un correo de prueba real para confirmar que el sistema funciona correctamente.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {status === 'success' && (
          <Alert className="border-success bg-success/10">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertTitle className="text-success">Servidor operativo</AlertTitle>
            <AlertDescription className="text-foreground">
              El servidor de correo electrónico está funcionando correctamente y puede enviar notificaciones.
            </AlertDescription>
          </Alert>
        )}

        {status === 'idle' && (
          <Alert>
            <Mail className="h-4 w-4" />
            <AlertTitle>Estado desconocido</AlertTitle>
            <AlertDescription>
              Haz clic en "Verificar Estado" para comprobar la conexión con el servidor de correo electrónico.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
