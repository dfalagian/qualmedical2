import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Upload, CheckCircle2, Eye, X, Trash2, AlertTriangle, Copy, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getSignedUrl } from "@/lib/storage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PaymentComplementUploadProps {
  invoiceId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceUUID?: string | null;
}

export function PaymentComplementUpload({ 
  invoiceId, 
  supplierId,
  invoiceNumber,
  invoiceUUID
}: PaymentComplementUploadProps) {
  const [open, setOpen] = useState(false);
  const [complementFile, setComplementFile] = useState<File | null>(null);
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);
  const [complementToDelete, setComplementToDelete] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [viewingComplementUrl, setViewingComplementUrl] = useState<string | null>(null);
  const [loadingComplementImage, setLoadingComplementImage] = useState(false);
  const [copiedUUID, setCopiedUUID] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // Fetch payment proofs for this invoice
  const { data: paymentProofs, isLoading: loadingProofs } = useQuery({
    queryKey: ["payment-proofs-for-complements", invoiceId],
    queryFn: async () => {
      // First get the pago for this invoice
      const { data: pago, error: pagoError } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoiceId)
        .maybeSingle();

      if (pagoError) throw pagoError;
      if (!pago) return [];

      // Then get all payment proofs
      const { data: proofs, error: proofsError } = await supabase
        .from("payment_proofs")
        .select("*")
        .eq("pago_id", pago.id)
        .order("proof_number", { ascending: true });

      if (proofsError) throw proofsError;

      // Get complements for each proof
      const proofsWithComplements = await Promise.all(
        (proofs || []).map(async (proof) => {
          const { data: complements, error: complementsError } = await supabase
            .from("payment_complements")
            .select("*")
            .eq("payment_proof_id", proof.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (complementsError) console.error("Error fetching complements:", complementsError);

          return {
            ...proof,
            complement: complements?.[0] || null
          };
        })
      );

      return proofsWithComplements;
    },
    enabled: open
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ proofId, file }: { proofId: string; file: File }) => {
      // Subir archivo temporalmente para validación
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const isPdf = fileExt === 'pdf';
      const tempFileName = `${supplierId}/complementos/temp_${Date.now()}.${fileExt}`;
      
      setIsValidating(true);
      
      // Subir archivo temporalmente
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(tempFileName, file);

      if (uploadError) throw uploadError;

      try {
        // Validar UUID del complemento con la edge function
        const { data: validationResult, error: validationError } = await supabase.functions
          .invoke('validate-payment-complement', {
            body: {
              invoiceId,
              filePath: tempFileName,
              fileType: isPdf ? 'pdf' : 'image'
            }
          });

        if (validationError) {
          // Eliminar archivo temporal
          await supabase.storage.from('documents').remove([tempFileName]);
          throw new Error('Error al validar el complemento de pago');
        }

        if (!validationResult.valid) {
          // Eliminar archivo temporal
          await supabase.storage.from('documents').remove([tempFileName]);
          throw new Error(validationResult.error || 'El complemento de pago no es válido para esta factura');
        }

        // Validación exitosa - mover archivo a ubicación final
        const finalFileName = `${supplierId}/complementos/${Date.now()}.${fileExt}`;
        
        // Copiar a ubicación final
        const { error: copyError } = await supabase.storage
          .from('documents')
          .copy(tempFileName, finalFileName);

        if (copyError) {
          await supabase.storage.from('documents').remove([tempFileName]);
          throw copyError;
        }

        // Eliminar temporal
        await supabase.storage.from('documents').remove([tempFileName]);

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(finalFileName);

        // Guardar en payment_complements
        const { data: existingComplement } = await supabase
          .from("payment_complements")
          .select("id")
          .eq("payment_proof_id", proofId)
          .maybeSingle();

        const complementData: any = {
          xml_url: publicUrl, // Usamos xml_url para mantener compatibilidad
          pdf_url: isPdf ? publicUrl : null,
          updated_at: new Date().toISOString()
        };

        // Agregar datos extraídos si existen
        if (validationResult.extractedInfo) {
          if (validationResult.extractedInfo.fecha_pago) {
            complementData.fecha_pago = validationResult.extractedInfo.fecha_pago;
          }
          if (validationResult.extractedInfo.monto_pagado) {
            complementData.monto = validationResult.extractedInfo.monto_pagado;
          }
          if (validationResult.extractedInfo.uuid_complemento) {
            complementData.uuid_cfdi = validationResult.extractedInfo.uuid_complemento;
          }
        }

        if (existingComplement) {
          const { error: updateError } = await supabase
            .from("payment_complements")
            .update(complementData)
            .eq("id", existingComplement.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from("payment_complements")
            .insert({
              payment_proof_id: proofId,
              invoice_id: invoiceId,
              supplier_id: supplierId,
              ...complementData
            });

          if (insertError) throw insertError;
        }

        return { 
          success: true, 
          extractedInfo: validationResult.extractedInfo 
        };

      } catch (error) {
        // Asegurar que se elimine el archivo temporal en caso de error
        await supabase.storage.from('documents').remove([tempFileName]);
        throw error;
      } finally {
        setIsValidating(false);
      }
    },
    onSuccess: (data) => {
      toast.success("Complemento de pago validado y subido correctamente", {
        description: "El UUID del complemento coincide con la factura"
      });
      queryClient.invalidateQueries({ queryKey: ["payment-proofs-for-complements", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setComplementFile(null);
      setSelectedProofId(null);
    },
    onError: (error: any) => {
      toast.error("Error de validación", {
        description: error.message || "Error al subir el complemento"
      });
    },
  });

  // Mutation para eliminar complemento (solo admin)
  const deleteComplementMutation = useMutation({
    mutationFn: async (complementId: string) => {
      const { error } = await supabase
        .from("payment_complements")
        .delete()
        .eq("id", complementId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      toast.success("Complemento de pago eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs-for-complements", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setComplementToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el complemento");
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    const fileName = selectedFile.name.toLowerCase();
    const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValid) {
      toast.error('Solo se permiten archivos PDF, JPG o PNG');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }
    setComplementFile(selectedFile);
  };

  const handleUpload = (proofId: string) => {
    if (!complementFile) {
      toast.error("Seleccione un archivo de complemento de pago");
      return;
    }
    uploadMutation.mutate({ proofId, file: complementFile });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  // Ver complemento en visor interno
  const handleViewComplement = async (url: string) => {
    setLoadingComplementImage(true);
    try {
      if (url.includes('/documents/')) {
        const urlParts = url.split('/documents/');
        if (urlParts.length > 1) {
          const path = urlParts[1];
          const signedUrl = await getSignedUrl('documents', path, 3600);
          if (signedUrl) {
            setViewingComplementUrl(signedUrl);
            return;
          }
        }
      }
      setViewingComplementUrl(url);
    } catch (error) {
      console.error('Error al obtener URL del complemento:', error);
      toast.error('Error al cargar el complemento');
    } finally {
      setLoadingComplementImage(false);
    }
  };

  const handleCopyUUID = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedUUID(uuid);
    setTimeout(() => setCopiedUUID(null), 2000);
    toast.success('UUID copiado al portapapeles');
  };

  const proofsWithoutComplement = paymentProofs?.filter(p => !p.complement) || [];
  const proofsWithComplement = paymentProofs?.filter(p => p.complement) || [];

  const isPending = uploadMutation.isPending || isValidating;

  return (
    <>
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        setComplementFile(null);
        setSelectedProofId(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="h-4 w-4" />
          Complementos de Pago
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Complementos de Pago - Factura {invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        {/* Aviso sobre validación de UUID */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <strong>Validación automática:</strong> El sistema verificará que el UUID del complemento de pago 
            coincida con el UUID de la factura antes de aceptarlo.
          </div>
        </div>

        {loadingProofs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !paymentProofs || paymentProofs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay comprobantes de pago registrados para esta factura.</p>
            <p className="text-sm mt-2">Los complementos de pago se asocian a cada comprobante de pago.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Comprobantes pendientes de complemento */}
            {proofsWithoutComplement.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium text-destructive">
                  Pendientes de Complemento ({proofsWithoutComplement.length})
                </h3>
                {proofsWithoutComplement.map((proof: any) => (
                  <div key={proof.id} className="border rounded-lg p-4 space-y-3 bg-destructive/5 border-destructive/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Pago #{proof.proof_number}</Badge>
                        <span className="font-medium">{formatCurrency(proof.amount)}</span>
                        {proof.fecha_pago && (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(proof.fecha_pago), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                      </div>
                      <Badge variant="destructive">Sin Complemento</Badge>
                    </div>

                    {selectedProofId === proof.id ? (
                      <div className="space-y-3 pt-2 border-t">
                        <div>
                          <Label htmlFor={`complement-${proof.id}`}>
                            Archivo del Complemento de Pago (PDF o imagen)
                          </Label>
                          <Input 
                            id={`complement-${proof.id}`} 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png" 
                            onChange={handleFileChange} 
                            className="mt-1"
                            disabled={isPending}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Se validará que el UUID del documento relacionado coincida con la factura
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleUpload(proof.id)} 
                            disabled={!complementFile || isPending}
                            className="flex-1"
                          >
                            {isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {isValidating ? 'Validando UUID...' : 'Subiendo...'}</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />Subir y Validar</>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSelectedProofId(null);
                              setComplementFile(null);
                            }}
                            disabled={isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => setSelectedProofId(proof.id)}
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Subir Complemento de Pago
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Comprobantes con complemento */}
            {proofsWithComplement.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium text-green-600">
                  Con Complemento ({proofsWithComplement.length})
                </h3>
                {proofsWithComplement.map((proof: any) => (
                  <div key={proof.id} className="border rounded-lg p-4 space-y-3 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          Pago #{proof.proof_number}
                        </Badge>
                        <span className="font-medium">{formatCurrency(proof.amount)}</span>
                        {proof.fecha_pago && (
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(proof.fecha_pago), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                      </div>
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        UUID Validado
                      </Badge>
                    </div>

                    {/* Mostrar UUID extraído vs UUID de factura */}
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
                      <div className="font-medium text-sm mb-2 text-muted-foreground">Comparación de UUIDs:</div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">UUID Factura (Base de datos):</span>
                        <div className="flex items-center gap-1 font-mono bg-background rounded px-2 py-1">
                          <span className="truncate max-w-[200px]" title={invoiceUUID || 'No disponible'}>
                            {invoiceUUID || 'No disponible'}
                          </span>
                          {invoiceUUID && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleCopyUUID(invoiceUUID)}
                            >
                              {copiedUUID === invoiceUUID ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">UUID Complemento (Extraído):</span>
                        <div className="flex items-center gap-1 font-mono bg-background rounded px-2 py-1">
                          <span className="truncate max-w-[200px]" title={proof.complement.uuid_cfdi || 'No disponible'}>
                            {proof.complement.uuid_cfdi || 'No disponible'}
                          </span>
                          {proof.complement.uuid_cfdi && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleCopyUUID(proof.complement.uuid_cfdi)}
                            >
                              {copiedUUID === proof.complement.uuid_cfdi ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {invoiceUUID && proof.complement.uuid_cfdi && 
                       invoiceUUID.toUpperCase() === proof.complement.uuid_cfdi.toUpperCase() && (
                        <div className="flex items-center gap-1 text-green-600 mt-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Los UUIDs coinciden correctamente</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-green-200 dark:border-green-900">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewComplement(proof.complement.xml_url)}
                        className="gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver Complemento
                      </Button>
                      {proof.complement.pdf_url && proof.complement.pdf_url !== proof.complement.xml_url && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewComplement(proof.complement.pdf_url)}
                          className="gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver PDF
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedProofId(proof.id)}
                        className="gap-1 text-muted-foreground"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Reemplazar
                      </Button>
                      {isAdmin && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setComplementToDelete(proof.complement.id)}
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </Button>
                      )}
                    </div>

                    {selectedProofId === proof.id && (
                      <div className="space-y-3 pt-2 border-t border-green-200 dark:border-green-900">
                        <div>
                          <Label htmlFor={`complement-replace-${proof.id}`}>
                            Nuevo Complemento de Pago (PDF o imagen)
                          </Label>
                          <Input 
                            id={`complement-replace-${proof.id}`} 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png" 
                            onChange={handleFileChange} 
                            className="mt-1"
                            disabled={isPending}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Se validará que el UUID del documento relacionado coincida con la factura
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleUpload(proof.id)} 
                            disabled={!complementFile || isPending}
                            className="flex-1"
                          >
                            {isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {isValidating ? 'Validando UUID...' : 'Subiendo...'}</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />Reemplazar y Validar</>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSelectedProofId(null);
                              setComplementFile(null);
                            }}
                            disabled={isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Visor interno de complemento de pago */}
    <Dialog open={!!viewingComplementUrl} onOpenChange={(open) => !open && setViewingComplementUrl(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Complemento de Pago
          </DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center bg-muted/30 rounded-lg min-h-[400px] max-h-[70vh] overflow-auto">
          {loadingComplementImage ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Cargando complemento...</span>
            </div>
          ) : viewingComplementUrl ? (
            viewingComplementUrl.toLowerCase().includes('.pdf') ? (
              <iframe 
                src={viewingComplementUrl} 
                className="w-full h-[70vh] rounded-lg"
                title="Complemento de Pago PDF"
              />
            ) : (
              <img 
                src={viewingComplementUrl} 
                alt="Complemento de Pago"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                onError={() => {
                  toast.error('Error al cargar la imagen del complemento');
                  setViewingComplementUrl(null);
                }}
              />
            )
          ) : (
            <p className="text-muted-foreground">No se pudo cargar el complemento</p>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* AlertDialog para confirmar eliminación */}
    <AlertDialog open={!!complementToDelete} onOpenChange={(open) => !open && setComplementToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar complemento de pago?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará el complemento de pago permanentemente. El proveedor deberá subir uno nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => complementToDelete && deleteComplementMutation.mutate(complementToDelete)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteComplementMutation.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
