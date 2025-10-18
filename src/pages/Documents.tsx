import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Upload, CheckCircle, XCircle, Clock, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const DOCUMENT_TYPES = [
  { value: "factura", label: "Factura" },
  { value: "contrato", label: "Contrato" },
  { value: "certificado", label: "Certificado" },
  { value: "constancia_fiscal", label: "Constancia de Situación Fiscal" },
  { value: "acta_constitutiva", label: "Acta Constitutiva" },
  { value: "comprobante_domicilio", label: "Comprobante de Domicilio" },
];

const Documents = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles(full_name, company_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedType || !user) {
        throw new Error("Faltan datos requeridos");
      }

      setIsUploading(true);

      // Upload file to storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(fileName);

      // Insert document record
      const { error: insertError } = await supabase
        .from("documents")
        .insert([{
          supplier_id: user.id,
          document_type: selectedType as any,
          file_url: publicUrl,
          file_name: file.name,
          notes: notes || null,
        }]);

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast.success("Documento subido exitosamente");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setFile(null);
      setSelectedType("");
      setNotes("");
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir documento");
      setIsUploading(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      notes 
    }: { 
      id: string; 
      status: "pendiente" | "aprobado" | "rechazado"; 
      notes?: string 
    }) => {
      const { error } = await supabase
        .from("documents")
        .update({
          status,
          notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "aprobado":
        return <Badge className="bg-success"><CheckCircle className="h-3 w-3 mr-1" />Aprobado</Badge>;
      case "rechazado":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendiente</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Documentos</h2>
          <p className="text-muted-foreground">
            {isAdmin ? "Administra los documentos de los proveedores" : "Sube y gestiona tus documentos"}
          </p>
        </div>

        {!isAdmin && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Subir Nuevo Documento
              </CardTitle>
              <CardDescription>Solo se permiten archivos PDF</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  uploadMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="documentType">Tipo de Documento *</Label>
                  <Select value={selectedType} onValueChange={setSelectedType} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">Archivo PDF *</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Agrega comentarios adicionales..."
                    rows={3}
                  />
                </div>

                <Button type="submit" disabled={isUploading} className="w-full">
                  {isUploading ? "Subiendo..." : "Subir Documento"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando documentos...</p>
            ) : documents && documents.length > 0 ? (
              <div className="space-y-4">
                {documents.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold">{doc.file_name}</h4>
                        {getStatusBadge(doc.status)}
                        <span className="text-sm text-muted-foreground">v{doc.version}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {DOCUMENT_TYPES.find((t) => t.value === doc.document_type)?.label}
                      </p>
                      {isAdmin && doc.profiles && (
                        <p className="text-sm text-muted-foreground">
                          Proveedor: {doc.profiles.company_name || doc.profiles.full_name}
                        </p>
                      )}
                      {doc.notes && (
                        <p className="text-sm mt-1 italic">Notas: {doc.notes}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-1" />
                          Ver
                        </a>
                      </Button>

                      {isAdmin && doc.status === "pendiente" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              updateStatusMutation.mutate({ id: doc.id, status: "aprobado" })
                            }
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              updateStatusMutation.mutate({ id: doc.id, status: "rechazado" })
                            }
                          >
                            Rechazar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay documentos disponibles
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Documents;