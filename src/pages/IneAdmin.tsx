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

const IneAdmin = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const { data: credencialesIne, isLoading } = useQuery({
    queryKey: ["credenciales-ine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles!documents_supplier_id_fkey(full_name, company_name)")
        .eq("document_type", "ine")
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
      queryClient.invalidateQueries({ queryKey: ["credenciales-ine"] });
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
      queryClient.invalidateQueries({ queryKey: ["credenciales-ine"] });
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
      // 1. Obtener información del documento
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('document_type')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      // Obtener estado de aprobación actual del proveedor
      const { data: supplierBefore } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', supplierId)
        .single();

      // 2. Actualizar estado del documento
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

      // 3. Notificar al proveedor sobre el documento
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
        console.error('Error al notificar documento:', notifyError);
      }

      // 4. Verificar si el proveedor acaba de ser aprobado
      const { data: supplierAfter } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', supplierId)
        .single();

      if (supplierBefore && supplierAfter && !(supplierBefore as any).approved && (supplierAfter as any).approved) {
        const { error: approvalNotifyError } = await supabase.functions.invoke('notify-supplier', {
          body: {
            supplier_id: supplierId,
            type: 'supplier_approved',
            data: {}
          }
        });

        if (approvalNotifyError) {
          console.error('Error al notificar aprobación del proveedor:', approvalNotifyError);
        }
      }

      return { status, documentType: document.document_type };
    },
    onSuccess: (data) => {
      const message = data.status === 'aprobado' 
        ? '✓ Documento aprobado y proveedor notificado'
        : '✗ Documento rechazado y proveedor notificado';
      
      toast.success(message);
      queryClient.invalidateQueries({ queryKey: ["credenciales-ine"] });
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
          <h2 className="text-3xl font-bold tracking-tight">Validación de Credenciales INE</h2>
          <p className="text-muted-foreground">
            Información extraída automáticamente de las credenciales de identificación
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Credenciales INE Registradas
            </CardTitle>
            <CardDescription>
              Información extraída mediante IA de las imágenes de credenciales
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
            ) : credencialesIne && credencialesIne.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Nombre Completo</TableHead>
                      <TableHead>CURP</TableHead>
                      <TableHead>Archivo</TableHead>
                      <TableHead>Extracción</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Validación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credencialesIne.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.profiles?.company_name || doc.profiles?.full_name || "N/A"}
                        </TableCell>
                        <TableCell>{doc.nombre_completo_ine || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{doc.curp || "-"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-xs">
                          {doc.file_name}
                        </TableCell>
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
                              className="bg-success/10 hover:bg-success/20 text-success border-success/20"
                              variant="outline"
                              disabled={updateStatusMutation.isPending || doc.status === 'aprobado'}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/20"
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
                                  <DialogTitle>Detalles de la Credencial INE</DialogTitle>
                                </DialogHeader>
                                {selectedDoc && (
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Proveedor</h4>
                                      <p>{selectedDoc.profiles?.company_name || selectedDoc.profiles?.full_name}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Nombre Completo</h4>
                                      <p className="text-lg">{selectedDoc.nombre_completo_ine || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">CURP</h4>
                                      <p className="font-mono text-lg">{selectedDoc.curp || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Nombre del Archivo</h4>
                                      <p className="text-sm">{selectedDoc.file_name}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Estado de Extracción</h4>
                                      <div className="mt-1">{getExtractionBadge(selectedDoc.extraction_status)}</div>
                                    </div>
                                    {selectedDoc.validation_errors && selectedDoc.validation_errors.length > 0 && (
                                      <div className="border-l-4 border-destructive bg-destructive/10 p-4 rounded">
                                        <h4 className="font-semibold text-sm text-destructive mb-2">⚠️ Errores de Validación</h4>
                                        <ul className="list-disc list-inside space-y-1">
                                          {selectedDoc.validation_errors.map((error: string, idx: number) => (
                                            <li key={idx} className="text-sm text-destructive">{error}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {selectedDoc.is_valid && selectedDoc.extraction_status === 'completed' && (
                                      <div className="border-l-4 border-success bg-success/10 p-4 rounded">
                                        <p className="text-sm text-success font-medium">✓ Credencial válida</p>
                                      </div>
                                    )}
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
                No hay credenciales INE registradas
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default IneAdmin;
