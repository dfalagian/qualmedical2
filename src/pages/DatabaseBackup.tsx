import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, Download, Loader2, AlertCircle, CheckCircle2, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface BackupStats {
  tables: number;
  functions: number;
  triggers: number;
  policies: number;
  totalRows?: number;
  tableRowCounts?: Record<string, number>;
}

const DatabaseBackup = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [isExportingSchema, setIsExportingSchema] = useState(false);
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [schemaStats, setSchemaStats] = useState<BackupStats | null>(null);
  const [fullStats, setFullStats] = useState<BackupStats | null>(null);
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
    setIsExportingSchema(true);
    setError(null);
    setSchemaStats(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('export-database-schema');

      if (functionError) throw functionError;

      if (data.success) {
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qualmedical_schema_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setSchemaStats(data.stats);
        toast.success("Estructura de base de datos exportada exitosamente");
      } else {
        throw new Error(data.error || 'Error desconocido al exportar schema');
      }
    } catch (err: unknown) {
      console.error('Error al exportar schema:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al generar el script de backup';
      setError(errorMessage);
      toast.error("Error al exportar estructura de base de datos");
    } finally {
      setIsExportingSchema(false);
    }
  };

  const handleExportFull = async () => {
    setIsExportingFull(true);
    setError(null);
    setFullStats(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('export-database-full');

      if (functionError) throw functionError;

      if (data.success) {
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qualmedical_backup_completo_${new Date().toISOString().split('T')[0]}.sql`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setFullStats(data.stats);
        toast.success("Backup completo exportado exitosamente");
      } else {
        throw new Error(data.error || 'Error desconocido al exportar backup');
      }
    } catch (err: unknown) {
      console.error('Error al exportar backup completo:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error al generar el backup completo';
      setError(errorMessage);
      toast.error("Error al exportar backup completo");
    } finally {
      setIsExportingFull(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Backup de Base de Datos</h1>
          <p className="text-muted-foreground">
            Genera scripts SQL para respaldar la estructura y datos del sistema
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 max-w-4xl">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 max-w-4xl lg:grid-cols-2">
          {/* Card 1: Exportar Estructura */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Estructura de Base de Datos
              </CardTitle>
              <CardDescription>
                Exporta solo la estructura: tablas, funciones, triggers y políticas RLS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-medium mb-2">Incluye:</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Tipos ENUM personalizados
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Definición de tablas y columnas
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Primary Keys y Foreign Keys
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Funciones y Triggers
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Políticas de Row Level Security
                  </li>
                </ul>
              </div>

              {schemaStats && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Exportado:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• {schemaStats.tables} tablas</li>
                      <li>• {schemaStats.functions} funciones</li>
                      <li>• {schemaStats.triggers} triggers</li>
                      <li>• {schemaStats.policies} políticas RLS</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleExportSchema}
                disabled={isExportingSchema || isExportingFull}
                className="w-full"
                variant="outline"
              >
                {isExportingSchema ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Estructura
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Card 2: Backup Completo */}
          <Card className="border-primary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Backup Completo
              </CardTitle>
              <CardDescription>
                Exporta estructura + todos los datos del sistema.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Advertencia:</strong> Este archivo contendrá información sensible 
                  de proveedores, facturas y documentos. Manéjelo con cuidado.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-medium mb-2">Incluye todo lo anterior más:</h3>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Datos de perfiles de usuarios
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Facturas y items de facturas
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Documentos y versiones
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Órdenes de compra y pagos
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Conteos de medicamentos
                  </li>
                </ul>
              </div>

              {fullStats && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Backup completado:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• {fullStats.tables} tablas</li>
                      <li>• {fullStats.totalRows} registros totales</li>
                      {fullStats.tableRowCounts && Object.entries(fullStats.tableRowCounts).map(([table, count]) => (
                        <li key={table} className="text-xs text-muted-foreground ml-2">
                          {table}: {count} registros
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleExportFull}
                disabled={isExportingSchema || isExportingFull}
                className="w-full"
              >
                {isExportingFull ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando backup...
                  </>
                ) : (
                  <>
                    <HardDrive className="mr-2 h-4 w-4" />
                    Backup Completo con Datos
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Instrucciones de uso */}
        <div className="mt-8 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Cómo usar los scripts exportados</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 list-decimal list-inside text-sm text-muted-foreground">
                <li>Descarga el archivo .sql generado</li>
                <li>Conéctate a tu instancia de PostgreSQL de destino</li>
                <li>Ejecuta el script completo para recrear la estructura (y datos si es backup completo)</li>
                <li>Verifica que todas las tablas y datos se hayan importado correctamente</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DatabaseBackup;
