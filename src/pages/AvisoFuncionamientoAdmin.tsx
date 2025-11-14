import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, RefreshCw, Eye, Trash2, Check, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ImageViewer } from "@/components/admin/ImageViewer";

const AvisoFuncionamientoAdmin = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const { data: avisosFuncionamiento, isLoading } = useQuery({
    queryKey: ["avisos-funcionamiento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles!documents_supplier_id_fkey(full_name, company_name)")
        .eq("document_type", "aviso_funcionamiento")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const extractMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.functions.invoke('extract-document-info', {
        body: { documentId }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Extracción iniciada");
      queryClient.invalidateQueries({ queryKey: ["avisos-funcionamiento"] });
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
      queryClient.invalidateQueries({ queryKey: ["avisos-funcionamiento"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar documento");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      documentId, 
      status, 
      supplierId 
    }: { 
      documentId: string; 
      status: 'aprobado' | 'rechazado'; 
      supplierId: string;
    }) => {
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('document_type')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: updateError } = await supabase
        .from('documents')
        .update({ 
          status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (updateError) throw updateError;

      const { error: notifyError } = await supabase.functions.invoke('notify-supplier', {
        body: {
          supplier_id: supplierId,
          type: status === 'aprobado' ? 'document_approved' : 'document_rejected',
          data: {
            document_type: document.document_type,
            document_id: documentId
          }
        }
      });

      if (notifyError) {
        console.error('Error al notificar:', notifyError);
      }

      return { status, documentType: document.document_type };
    },
    onSuccess: (data) => {
      const message = data.status === 'aprobado' 
        ? '✓ Documento aprobado y proveedor notificado'
        : '✗ Documento rechazado y proveedor notificado';
      
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["avisos-funcionamiento"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar estado");
    },
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      pendiente: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      aprobado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      rechazado: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants] || variants.pendiente}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

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
          <h2 className="text-3xl font-bold tracking-tight">Validación de Avisos de Funcionamiento</h2>
          <p className="text-muted-foreground">
            Información extraída automáticamente de los avisos de funcionamiento
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Avisos de Funcionamiento Registrados
            </CardTitle>
            <CardDescription>
              Información extraída mediante IA de los documentos PDF
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
            ) : avisosFuncionamiento && avisosFuncionamiento.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {avisosFuncionamiento.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.profiles?.company_name || doc.profiles?.full_name || "N/A"}
                        </TableCell>
                        <TableCell>{doc.razon_social || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">{doc.direccion || "-"}</TableCell>
                        <TableCell>{getExtractionBadge(doc.extraction_status)}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ 
                                documentId: doc.id, 
                                status: 'aprobado',
                                supplierId: doc.supplier_id
                              })}
                              className="bg-success hover:bg-success/90"
                              disabled={updateStatusMutation.isPending || doc.status === 'aprobado'}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateStatusMutation.mutate({ 
                                documentId: doc.id, 
                                status: 'rechazado',
                                supplierId: doc.supplier_id
                              })}
                              disabled={updateStatusMutation.isPending || doc.status === 'rechazado'}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
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
                                  <DialogTitle>Detalles del Aviso de Funcionamiento</DialogTitle>
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
                                      <h4 className="font-semibold text-sm text-muted-foreground">Dirección</h4>
                                      <p className="text-sm">{selectedDoc.direccion || "No extraído"}</p>
                                    </div>
                                    {selectedDoc.rfc && (
                                      <div>
                                        <h4 className="font-semibold text-sm text-muted-foreground">RFC</h4>
                                        <p className="font-mono text-lg">{selectedDoc.rfc}</p>
                                      </div>
                                    )}
                                    {selectedDoc.actividad_economica && (
                                      <div>
                                        <h4 className="font-semibold text-sm text-muted-foreground">Actividad Económica</h4>
                                        <p className="text-sm">{selectedDoc.actividad_economica}</p>
                                      </div>
                                    )}
                                    {selectedDoc.fecha_emision && (
                                      <div>
                                        <h4 className="font-semibold text-sm text-muted-foreground">Fecha de Emisión</h4>
                                        <p>{new Date(selectedDoc.fecha_emision).toLocaleDateString('es-MX')}</p>
                                      </div>
                                    )}
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Nombre del Archivo</h4>
                                      <p className="text-sm">{selectedDoc.file_name}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Fecha de Carga</h4>
                                      <p>{new Date(selectedDoc.created_at).toLocaleDateString('es-MX', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Estado de Extracción</h4>
                                      <div className="mt-1">{getExtractionBadge(selectedDoc.extraction_status)}</div>
                                    </div>
                                    {selectedDoc.notes && (
                                      <div>
                                        <h4 className="font-semibold text-sm text-muted-foreground">Notas</h4>
                                        <p className="text-sm">{selectedDoc.notes}</p>
                                      </div>
                                    )}
                                    <div className="flex gap-2 pt-4">
                                      <ImageViewer 
                                        fileUrl={selectedDoc.file_url}
                                        imageUrls={selectedDoc.image_urls}
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
                              imageUrls={doc.image_urls}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay avisos de funcionamiento registrados
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AvisoFuncionamientoAdmin;
