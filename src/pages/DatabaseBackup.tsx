import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface BackupStats {
  tables: number;
  functions: number;
  triggers: number;
  policies: number;
}

const DatabaseBackup = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate("/");
    }
  }, [user, isAdmin, loading, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Cargando...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const handleExportSchema = async () => {
    setIsExporting(true);
    setError(null);
    setStats(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('export-database-schema');

      if (functionError) throw functionError;

      if (data.success) {
        // Crear el archivo para descargar
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qualmedical_schema_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setStats(data.stats);
        toast.success("Script de base de datos exportado exitosamente");
      } else {
        throw new Error(data.error || 'Error desconocido al exportar schema');
      }
    } catch (err: any) {
      console.error('Error al exportar schema:', err);
      setError(err.message || 'Error al generar el script de backup');
      toast.error("Error al exportar schema de base de datos");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Backup de Base de Datos</h1>
          <p className="text-muted-foreground">
            Genera un script SQL completo con toda la estructura de la base de datos
          </p>
        </div>

        <div className="grid gap-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Exportar Estructura de Base de Datos
              </CardTitle>
              <CardDescription>
                Genera un script SQL que incluye toda la estructura de la base de datos: 
                tablas, columnas, tipos, funciones, triggers, relaciones y políticas RLS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Nota:</strong> Este script solo exporta la <strong>estructura</strong> de la base de datos, 
                  no incluye los datos. Puede ejecutarse en cualquier instancia de PostgreSQL para 
                  recrear la estructura completa.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-medium mb-2">El script incluye:</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Tipos ENUM personalizados
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Definición de tablas con columnas y tipos de datos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Primary Keys y Constraints UNIQUE
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Foreign Keys y relaciones entre tablas
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Funciones de base de datos (security definer)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Triggers automáticos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Políticas de Row Level Security (RLS)
                  </li>
                </ul>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {stats && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Script generado exitosamente:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• {stats.tables} tablas</li>
                      <li>• {stats.functions} funciones</li>
                      <li>• {stats.triggers} triggers</li>
                      <li>• {stats.policies} políticas RLS</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleExportSchema}
                disabled={isExporting}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando script...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Estructura de Base de Datos
                  </>
                )}
              </Button>

              <div className="text-sm text-muted-foreground border-t pt-4">
                <h4 className="font-medium mb-2">Cómo usar el script exportado:</h4>
                <ol className="space-y-1 list-decimal list-inside">
                  <li>Descarga el archivo .sql generado</li>
                  <li>Conéctate a tu instancia de PostgreSQL de destino</li>
                  <li>Ejecuta el script completo para recrear la estructura</li>
                  <li>La base de datos estará lista con la misma estructura</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DatabaseBackup;
