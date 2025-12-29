import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { formatSupplierName } from "@/lib/formatters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Download, RefreshCw, Eye, Check, XCircle, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { ImageViewer } from "@/components/admin/ImageViewer";

const ConstanciaFiscalAdmin = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  const { data: constanciasFiscales, isLoading } = useQuery({
    queryKey: ["constancias-fiscales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles!documents_supplier_id_fkey(full_name, company_name)")
        .eq("document_type", "constancia_fiscal")
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
      queryClient.invalidateQueries({ queryKey: ["constancias-fiscales"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al extraer información");
    },
  });

  const reprocessAllMutation = useMutation({
    mutationFn: async () => {
      if (!constanciasFiscales || constanciasFiscales.length === 0) {
        throw new Error("No hay constancias fiscales para reprocesar");
      }

      const results = await Promise.allSettled(
        constanciasFiscales.map(async (doc: any) => {
          const { error } = await supabase.functions.invoke('extract-document-info', {
            body: { documentId: doc.id }
          });
          if (error) throw error;
          return doc.id;
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return { successful, failed, total: constanciasFiscales.length };
    },
    onSuccess: (data) => {
      toast.success(`Reprocesamiento completado: ${data.successful} exitosos, ${data.failed} fallidos`);
      queryClient.invalidateQueries({ queryKey: ["constancias-fiscales"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al reprocesar constancias");
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
      queryClient.invalidateQueries({ queryKey: ["constancias-fiscales"] });
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

      const { data: supplierBefore } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', supplierId)
        .single();

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
        console.error('Error al notificar documento:', notifyError);
      }

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
      queryClient.invalidateQueries({ queryKey: ["constancias-fiscales"] });
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
          <h2 className="text-3xl font-bold tracking-tight">Validación de Constancias Fiscales</h2>
          <p className="text-muted-foreground">
            Información extraída automáticamente de las constancias de situación fiscal
          </p>
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Constancias de Situación Fiscal Registradas
                </CardTitle>
                <CardDescription>
                  Información extraída mediante IA de los documentos PDF
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => reprocessAllMutation.mutate()}
                disabled={reprocessAllMutation.isPending || !constanciasFiscales || constanciasFiscales.length === 0}
              >
                {reprocessAllMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Reprocesando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reprocesar Todas
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
            ) : constanciasFiscales && constanciasFiscales.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>RFC</TableHead>
                      <TableHead>Régimen Tributario</TableHead>
                      <TableHead>Régimen Fiscal</TableHead>
                      <TableHead>Fecha Emisión</TableHead>
                      <TableHead>Extracción</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Validación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {constanciasFiscales.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {formatSupplierName(doc.profiles)}
                        </TableCell>
                        <TableCell>{doc.razon_social || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{doc.rfc || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">{doc.regimen_tributario || "-"}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {doc.regimen_fiscal || <span className="text-muted-foreground">No extraído</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(doc.fecha_emision)}</TableCell>
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
                                  <DialogTitle>Detalles de la Constancia Fiscal</DialogTitle>
                                </DialogHeader>
                                {selectedDoc && (
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Proveedor</h4>
                                      <p>{formatSupplierName(selectedDoc.profiles)}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Razón Social</h4>
                                      <p>{selectedDoc.razon_social || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">RFC</h4>
                                      <p className="font-mono">{selectedDoc.rfc || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Actividad Económica</h4>
                                      <p className="text-sm">{selectedDoc.actividad_economica || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Régimen Tributario</h4>
                                      <p className="text-sm">{selectedDoc.regimen_tributario || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Régimen Fiscal</h4>
                                      <p className="text-sm">{selectedDoc.regimen_fiscal || "No extraído"}</p>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm text-muted-foreground">Fecha de Emisión</h4>
                                      <p>{formatDate(selectedDoc.fecha_emision)}</p>
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
                                        <p className="text-sm text-success font-medium">✓ Documento válido y vigente</p>
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
                              onClick={() => {
                                if (confirm("¿Estás seguro de eliminar este documento?")) {
                                  deleteMutation.mutate(doc.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              Eliminar
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
                No hay constancias fiscales registradas
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ConstanciaFiscalAdmin;
