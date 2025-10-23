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
  { value: "aviso_funcionamiento", label: "Aviso de Funcionamiento" },
  { value: "ine", label: "INE (Credencial de Identificación)" },
];

// Constantes de seguridad
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

const Documents = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");

  // Validación de archivo
  const validateFile = (file: File): string | null => {
    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return "El archivo es demasiado grande. Máximo 10MB.";
    }

    // Validar tipo MIME
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return "Tipo de archivo no permitido. Solo JPG, JPEG o PNG.";
    }

    // Validar extensión
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return "Extensión de archivo no válida.";
    }

    // Validar nombre de archivo (sin caracteres peligrosos)
    const dangerousChars = /[<>:"\/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(file.name)) {
      return "El nombre del archivo contiene caracteres no permitidos.";
    }

    return null;
  };

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, profiles!documents_supplier_id_fkey(full_name, company_name)")
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

      // Validar archivo antes de subir
      const validationError = validateFile(file);
      if (validationError) {
        throw new Error(validationError);
      }

      // Validar notas (prevenir inyección)
      if (notes.length > 1000) {
        throw new Error("Las notas son demasiado largas (máximo 1000 caracteres)");
      }

      setIsUploading(true);

      // Sanitizar nombre de archivo
      const fileExt = file.name.split(".").pop()?.toLowerCase();
      const sanitizedFileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(sanitizedFileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(sanitizedFileName);

      // Sanitizar datos antes de insertar
      const sanitizedNotes = notes.trim().substring(0, 1000);
      const sanitizedFileName2 = file.name.substring(0, 255); // Limitar longitud

      // Insert document record
      const { data: insertedDoc, error: insertError } = await supabase
        .from("documents")
        .insert([{
          supplier_id: user.id,
          document_type: selectedType as any,
          file_url: publicUrl,
          file_name: sanitizedFileName2,
          notes: sanitizedNotes || null,
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Si es un documento que requiere extracción automática, procesar
      if ((selectedType === "acta_constitutiva" || selectedType === "constancia_fiscal" || selectedType === "comprobante_domicilio" || selectedType === "aviso_funcionamiento" || selectedType === "ine") && insertedDoc) {
        toast.info("Procesando documento con IA...");
        
        try {
          const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-document-info', {
            body: { documentId: insertedDoc.id }
          });

          if (extractError) {
            console.error("Error extrayendo información:", extractError);
            toast.warning("Documento subido pero falló la extracción automática");
          } else {
            // Mostrar advertencias si existen
            if (extractData?.validation_errors && extractData.validation_errors.length > 0) {
              toast.warning(
                `⚠️ Advertencias encontradas:\n${extractData.validation_errors.join('\n')}`,
                { duration: 8000 }
              );
            } else {
              toast.success("✓ Información extraída exitosamente");
            }
          }
        } catch (error) {
          // No revelar detalles del error al usuario
          toast.error("Error al procesar el documento");
        }
      }
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
              <CardDescription>
                Los documentos se validan automáticamente con IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border-2 border-amber-500 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                      ⚠️ IMPORTANTE: Solo Imágenes Permitidas
                    </h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Únicamente se aceptan archivos de imagen en formato <strong>JPG, JPEG o PNG</strong>.
                      <br />
                      No se permiten PDFs, documentos de Word u otros formatos.
                    </p>
                  </div>
                </div>
              </div>

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
                  <Label htmlFor="file">Imagen (JPG, JPEG o PNG) *</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0];
                      if (selectedFile) {
                        const error = validateFile(selectedFile);
                        if (error) {
                          toast.error(error);
                          e.target.value = '';
                          setFile(null);
                          return;
                        }
                        setFile(selectedFile);
                      }
                    }}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo 10MB. Solo archivos JPG, JPEG o PNG.
                    <br />
                    <span className="text-primary">Asegúrate de que la imagen sea clara y legible para mejor extracción de datos.</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.substring(0, 1000))}
                    placeholder="Agrega comentarios adicionales..."
                    rows={3}
                    maxLength={1000}
                  />
                  <p className="text-xs text-muted-foreground">
                    {notes.length}/1000 caracteres
                  </p>
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
                       {(doc.document_type === "acta_constitutiva" || doc.document_type === "constancia_fiscal" || doc.document_type === "comprobante_domicilio" || doc.document_type === "aviso_funcionamiento" || doc.document_type === "ine") && doc.extraction_status && (
                        <div className="mt-2 text-sm space-y-1">
                          {doc.extraction_status === "completed" && (
                            <span className="text-success flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Información extraída por IA
                            </span>
                          )}
                          {doc.extraction_status === "processing" && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3 animate-spin" />
                              Validando con IA...
                            </span>
                          )}
                          {doc.extraction_status === "failed" && (
                            <span className="text-destructive flex items-center gap-1">
                              <XCircle className="h-3 w-3" />
                              Validación rechazada por IA
                            </span>
                          )}
                          {!doc.is_valid && doc.validation_errors && doc.validation_errors.length > 0 && (
                            <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-1">
                              <p className="font-semibold text-destructive text-xs">⚠️ Alertas de validación:</p>
                              {doc.validation_errors.slice(0, 3).map((error: string, idx: number) => (
                                <p key={idx} className="text-destructive text-xs">• {error}</p>
                              ))}
                              {doc.validation_errors.length > 3 && (
                                <p className="text-destructive text-xs italic">
                                  +{doc.validation_errors.length - 3} alertas más
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                       )}
                    </div>

                    <div className="flex gap-2">
                      {isAdmin && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-1" />
                            Ver
                          </a>
                        </Button>
                      )}

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