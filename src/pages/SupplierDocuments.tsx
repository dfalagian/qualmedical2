import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Search, FileText, Download, Eye, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SupplierDocuments = () => {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers", searchTerm],
    enabled: isAdmin,
    queryFn: async () => {
      // First get all profiles
      let profilesQuery = supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      if (searchTerm) {
        profilesQuery = profilesQuery.or(
          `full_name.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%`
        );
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      // Get all admin user IDs
      const { data: adminRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (rolesError) throw rolesError;

      const adminIds = new Set(adminRoles?.map(r => r.user_id) || []);
      
      // Filter out admins
      return profiles?.filter(p => !adminIds.has(p.id)) || [];
    },
  });

  const { data: documents, isLoading: loadingDocuments } = useQuery({
    queryKey: ["supplier_documents", selectedSupplier?.id],
    enabled: !!selectedSupplier,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("supplier_id", selectedSupplier.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getDocumentTypeName = (type: string) => {
    const types: Record<string, string> = {
      acta_constitutiva: "Acta Constitutiva",
      constancia_fiscal: "Constancia Fiscal",
      comprobante_domicilio: "Comprobante de Domicilio",
      aviso_funcionamiento: "Aviso de Funcionamiento",
    };
    return types[type] || type;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "aprobado":
        return <Badge className="bg-green-500">Aprobado</Badge>;
      case "rechazado":
        return <Badge variant="destructive">Rechazado</Badge>;
      case "pendiente":
        return <Badge variant="secondary">Pendiente</Badge>;
      default:
        return <Badge variant="outline">Sin estado</Badge>;
    }
  };

  const getExtractionBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">✓ Completado</Badge>;
      case "processing":
        return <Badge className="bg-blue-500">⏳ Procesando</Badge>;
      case "failed":
        return <Badge variant="destructive">✗ Falló</Badge>;
      default:
        return <Badge variant="outline">⏸ Pendiente</Badge>;
    }
  };

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
      queryClient.invalidateQueries({ queryKey: ["supplier_documents", selectedSupplier?.id] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar documento");
    },
  });

  const handleViewDetails = (doc: any) => {
    setSelectedDocument(doc);
    setDialogOpen(true);
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
          <h2 className="text-3xl font-bold tracking-tight">Documentación por Proveedor</h2>
          <p className="text-muted-foreground">
            Busca un proveedor para ver todos sus documentos
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar Proveedor
            </CardTitle>
            <CardDescription>
              Busca por nombre, empresa o RFC
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="Escribe para buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />

              {loadingSuppliers ? (
                <p className="text-center py-4 text-muted-foreground">Buscando...</p>
              ) : suppliers && suppliers.length > 0 ? (
                <div className="grid gap-3">
                  {suppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedSupplier?.id === supplier.id
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-accent/5"
                      }`}
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{supplier.full_name}</h4>
                          {supplier.company_name && (
                            <p className="text-sm text-muted-foreground">
                              {supplier.company_name}
                            </p>
                          )}
                          {supplier.rfc && (
                            <p className="text-sm text-muted-foreground">RFC: {supplier.rfc}</p>
                          )}
                        </div>
                        <Button
                          variant={selectedSupplier?.id === supplier.id ? "default" : "outline"}
                          size="sm"
                        >
                          Ver Documentos
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">
                  {searchTerm ? "No se encontraron proveedores" : "Escribe para buscar proveedores"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedSupplier && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Documentos de {selectedSupplier.full_name}
              </CardTitle>
              <CardDescription>
                {selectedSupplier.company_name && `${selectedSupplier.company_name} - `}
                Total de documentos: {documents?.length || 0}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocuments ? (
                <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
              ) : documents && documents.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo de Documento</TableHead>
                        <TableHead>Nombre del Archivo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Extracción</TableHead>
                        <TableHead>Fecha de Subida</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            {getDocumentTypeName(doc.document_type)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{doc.file_name}</TableCell>
                          <TableCell>{getStatusBadge(doc.status)}</TableCell>
                          <TableCell>{getExtractionBadge(doc.extraction_status)}</TableCell>
                          <TableCell>
                            {new Date(doc.created_at).toLocaleDateString("es-MX")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewDetails(doc)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(doc.file_url, "_blank")}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
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
                  Este proveedor no ha subido ningún documento
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Documento</DialogTitle>
            <DialogDescription>
              {selectedDocument && getDocumentTypeName(selectedDocument.document_type)}
            </DialogDescription>
          </DialogHeader>

          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Estado</p>
                  <div className="mt-1">{getStatusBadge(selectedDocument.status)}</div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Extracción</p>
                  <div className="mt-1">
                    {getExtractionBadge(selectedDocument.extraction_status)}
                  </div>
                </div>
              </div>

              {selectedDocument.razon_social && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Razón Social</p>
                  <p className="mt-1">{selectedDocument.razon_social}</p>
                </div>
              )}

              {selectedDocument.rfc && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">RFC</p>
                  <p className="mt-1">{selectedDocument.rfc}</p>
                </div>
              )}

              {selectedDocument.direccion && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Dirección</p>
                  <p className="mt-1">{selectedDocument.direccion}</p>
                </div>
              )}

              {selectedDocument.codigo_postal && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Código Postal</p>
                  <p className="mt-1">{selectedDocument.codigo_postal}</p>
                </div>
              )}

              {selectedDocument.representante_legal && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Representante Legal
                  </p>
                  <p className="mt-1">{selectedDocument.representante_legal}</p>
                </div>
              )}

              {selectedDocument.registro_publico && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Registro Público
                  </p>
                  <p className="mt-1">{selectedDocument.registro_publico}</p>
                </div>
              )}

              {selectedDocument.objeto_social && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Objeto Social</p>
                  <p className="mt-1 whitespace-pre-wrap">{selectedDocument.objeto_social}</p>
                </div>
              )}

              {selectedDocument.regimen_tributario && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Régimen Tributario
                  </p>
                  <p className="mt-1">{selectedDocument.regimen_tributario}</p>
                </div>
              )}

              {selectedDocument.actividad_economica && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Actividad Económica
                  </p>
                  <p className="mt-1">{selectedDocument.actividad_economica}</p>
                </div>
              )}

              {selectedDocument.nombre_completo_ine && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Nombre Completo (INE)
                  </p>
                  <p className="mt-1">{selectedDocument.nombre_completo_ine}</p>
                </div>
              )}

              {selectedDocument.curp && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">CURP</p>
                  <p className="mt-1 font-mono">{selectedDocument.curp}</p>
                </div>
              )}

              {selectedDocument.fecha_emision && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    Fecha de Emisión
                  </p>
                  <p className="mt-1">
                    {new Date(selectedDocument.fecha_emision).toLocaleDateString('es-MX')}
                  </p>
                </div>
              )}

              {selectedDocument.notes && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">Notas</p>
                  <p className="mt-1">{selectedDocument.notes}</p>
                </div>
              )}

              {selectedDocument.validation_errors &&
                selectedDocument.validation_errors.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      Errores de Validación
                    </p>
                    <ul className="mt-1 list-disc list-inside text-sm text-destructive">
                      {selectedDocument.validation_errors.map((error: string, idx: number) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedDocument.file_url, "_blank")}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default SupplierDocuments;
