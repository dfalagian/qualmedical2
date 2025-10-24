import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, RefreshCw, Eye, Trash2, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ImageViewer } from "@/components/admin/ImageViewer";

const DocumentsAdmin = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const { data: actasConstitutivas, isLoading } = useQuery({
    queryKey: ["actas-constitutivas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles!documents_supplier_id_fkey(full_name, company_name)")
        .eq("document_type", "acta_constitutiva")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const hasCoincidencias = (validationErrors: any) => {
    if (!validationErrors || !Array.isArray(validationErrors)) return false;
    return validationErrors.some((error: string) => 
      error.includes('✅ Coincidencia confirmada')
    );
  };

  const getCoincidencias = (validationErrors: any) => {
    if (!validationErrors || !Array.isArray(validationErrors)) return [];
    return validationErrors.filter((error: string) => 
      error.includes('✅ Coincidencia confirmada')
    );
  };

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.functions.invoke('extract-document-info', {
        body: { documentId }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Extracción iniciada");
      queryClient.invalidateQueries({ queryKey: ["actas-constitutivas"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al extraer información");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento eliminado");
      queryClient.invalidateQueries({ queryKey: ["actas-constitutivas"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar documento");
    },
  });

  const getExtractionBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success">Completado</Badge>;
      case "processing":
        return <Badge variant="secondary">Procesando</Badge>;
      case "failed":
        return <Badge variant="destructive">Fallido</Badge>;
      default:
        return <Badge variant="outline">Pendiente</Badge>;
    }
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
          <h2 className="text-3xl font-bold tracking-tight">Validación de Actas Constitutivas</h2>
          <p className="text-muted-foreground">
            Información extraída automáticamente de los documentos
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Actas Constitutivas Registradas
            </CardTitle>
            <CardDescription>
              Información extraída mediante IA de los documentos PDF
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
            ) : actasConstitutivas && actasConstitutivas.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>Representante Legal</TableHead>
                      <TableHead>Registro Público</TableHead>
                      <TableHead>Validación Cruzada</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actasConstitutivas.map((doc: any) => {
                      const tieneCoincidencias = hasCoincidencias(doc.validation_errors);
                      return (
                        <TableRow key={doc.id} className={tieneCoincidencias ? "bg-success/10" : ""}>
                          <TableCell className="font-medium">
                            {doc.profiles?.company_name || doc.profiles?.full_name || "N/A"}
                          </TableCell>
                          <TableCell>{doc.razon_social || "-"}</TableCell>
                          <TableCell>{doc.representante_legal || "-"}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {doc.registro_publico || "-"}
                          </TableCell>
                          <TableCell>
                            {tieneCoincidencias ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-success" />
                                <span className="text-success text-sm font-medium">
                                  {getCoincidencias(doc.validation_errors).length} coincidencia(s)
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sin validar</span>
                            )}
                          </TableCell>
                          <TableCell>{getExtractionBadge(doc.extraction_status)}</TableCell>
                          <TableCell>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedDoc(doc)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Ver Detalles
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Detalles del Acta Constitutiva</DialogTitle>
                                </DialogHeader>
                                {selectedDoc && (
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Proveedor</h4>
                                      <p>{selectedDoc.profiles?.company_name || selectedDoc.profiles?.full_name}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Razón Social</h4>
                                      <p>{selectedDoc.razon_social || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Representante Legal</h4>
                                      <p>{selectedDoc.representante_legal || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Objeto Social</h4>
                                      <p className="text-sm">{selectedDoc.objeto_social || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Registro Público</h4>
                                      <p className="text-sm">{selectedDoc.registro_publico || "No extraído"}</p>
                                    </div>
                                    {selectedDoc.fecha_emision && (
                                      <div>
                                        <h4 className="font-semibold text-sm text-muted-foreground">Fecha de Emisión</h4>
                                        <p>{new Date(selectedDoc.fecha_emision).toLocaleDateString('es-MX')}</p>
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Estado de Extracción</h4>
                                      <div className="mt-1">{getExtractionBadge(selectedDoc.extraction_status)}</div>
                                    </div>
                                    {hasCoincidencias(selectedDoc.validation_errors) && (
                                      <div className="border-l-4 border-success bg-success/10 p-4 rounded">
                                        <h4 className="font-semibold text-sm text-success flex items-center gap-2 mb-2">
                                          <CheckCircle2 className="h-4 w-4" />
                                          Validaciones Cruzadas Confirmadas
                                        </h4>
                                        <ul className="space-y-1 text-sm">
                                          {getCoincidencias(selectedDoc.validation_errors).map((msg: string, idx: number) => (
                                            <li key={idx} className="text-foreground/80">
                                              {msg.replace('✅ ', '')}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    <div className="flex gap-2 pt-4">
                                      <ImageViewer 
                                        fileUrl={selectedDoc.file_url}
                                        fileName={selectedDoc.file_name}
                                        triggerText="Ver"
                                      />
                                      {selectedDoc.extraction_status !== "processing" && (
                                        <Button
                                          size="sm"
                                          onClick={() => extractMutation.mutate(selectedDoc.id)}
                                          disabled={extractMutation.isPending}
                                        >
                                          <RefreshCw className="h-4 w-4 mr-1" />
                                          Re-procesar
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>

                            <ImageViewer 
                              fileUrl={doc.file_url}
                              fileName={doc.file_name}
                              triggerText=""
                              triggerSize="icon"
                            />

                            {doc.extraction_status !== "processing" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => extractMutation.mutate(doc.id)}
                                disabled={extractMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            )}

                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteMutation.mutate(doc.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay actas constitutivas registradas
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DocumentsAdmin;
