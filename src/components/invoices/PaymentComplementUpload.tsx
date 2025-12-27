import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Upload, CheckCircle2, Download, Eye, X, Trash2 } from "lucide-react";
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
}

export function PaymentComplementUpload({ 
  invoiceId, 
  supplierId,
  invoiceNumber
}: PaymentComplementUploadProps) {
  const [open, setOpen] = useState(false);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);
  const [complementToDelete, setComplementToDelete] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();

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
    mutationFn: async ({ proofId, xmlFile, pdfFile }: { proofId: string; xmlFile: File; pdfFile?: File }) => {
      // Upload XML
      const xmlExt = xmlFile.name.split('.').pop();
      const xmlFileName = `${supplierId}/complementos/${Date.now()}.${xmlExt}`;
      
      const { error: xmlUploadError } = await supabase.storage
        .from('documents')
        .upload(xmlFileName, xmlFile);

      if (xmlUploadError) throw xmlUploadError;

      const { data: { publicUrl: xmlUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(xmlFileName);

      let pdfUrl = null;
      if (pdfFile) {
        const pdfExt = pdfFile.name.split('.').pop();
        const pdfFileName = `${supplierId}/complementos/${Date.now()}_pdf.${pdfExt}`;
        
        const { error: pdfUploadError } = await supabase.storage
          .from('documents')
          .upload(pdfFileName, pdfFile);

        if (pdfUploadError) throw pdfUploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(pdfFileName);
        pdfUrl = publicUrl;
      }

      // Check if complement already exists for this proof
      const { data: existingComplement } = await supabase
        .from("payment_complements")
        .select("id")
        .eq("payment_proof_id", proofId)
        .maybeSingle();

      if (existingComplement) {
        // Update existing
        const { error: updateError } = await supabase
          .from("payment_complements")
          .update({
            xml_url: xmlUrl,
            pdf_url: pdfUrl,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingComplement.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { error: insertError } = await supabase
          .from("payment_complements")
          .insert({
            payment_proof_id: proofId,
            invoice_id: invoiceId,
            supplier_id: supplierId,
            xml_url: xmlUrl,
            pdf_url: pdfUrl
          });

        if (insertError) throw insertError;
      }

      return { success: true };
    },
    onSuccess: () => {
      toast.success("Complemento de pago subido correctamente");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs-for-complements", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setXmlFile(null);
      setPdfFile(null);
      setSelectedProofId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir el complemento");
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

  const handleXmlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.xml')) {
      toast.error('Solo se permiten archivos XML');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }
    setXmlFile(selectedFile);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se permiten archivos PDF');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('El archivo no debe superar los 10MB');
      return;
    }
    setPdfFile(selectedFile);
  };

  const handleUpload = (proofId: string) => {
    if (!xmlFile) {
      toast.error("El archivo XML es obligatorio");
      return;
    }
    uploadMutation.mutate({ proofId, xmlFile, pdfFile: pdfFile || undefined });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const handleViewDocument = async (url: string, isPrivate: boolean = true) => {
    if (isPrivate && url.includes('/documents/')) {
      // Extract path from URL
      const urlParts = url.split('/documents/');
      if (urlParts.length > 1) {
        const path = urlParts[1];
        const signedUrl = await getSignedUrl('documents', path, 3600);
        if (signedUrl) {
          window.open(signedUrl, '_blank');
          return;
        }
      }
    }
    window.open(url, '_blank');
  };

  const proofsWithoutComplement = paymentProofs?.filter(p => !p.complement) || [];
  const proofsWithComplement = paymentProofs?.filter(p => p.complement) || [];

  return (
    <>
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        setXmlFile(null);
        setPdfFile(null);
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
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`xml-${proof.id}`}>Archivo XML (obligatorio)</Label>
                            <Input 
                              id={`xml-${proof.id}`} 
                              type="file" 
                              accept=".xml" 
                              onChange={handleXmlChange} 
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`pdf-${proof.id}`}>Archivo PDF (opcional)</Label>
                            <Input 
                              id={`pdf-${proof.id}`} 
                              type="file" 
                              accept=".pdf" 
                              onChange={handlePdfChange} 
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleUpload(proof.id)} 
                            disabled={!xmlFile || uploadMutation.isPending}
                            className="flex-1"
                          >
                            {uploadMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Subiendo...</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />Subir Complemento</>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSelectedProofId(null);
                              setXmlFile(null);
                              setPdfFile(null);
                            }}
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
                        Complemento Subido
                      </Badge>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-green-200 dark:border-green-900">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewDocument(proof.complement.xml_url)}
                        className="gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver XML
                      </Button>
                      {proof.complement.pdf_url && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewDocument(proof.complement.pdf_url)}
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
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`xml-replace-${proof.id}`}>Nuevo XML (obligatorio)</Label>
                            <Input 
                              id={`xml-replace-${proof.id}`} 
                              type="file" 
                              accept=".xml" 
                              onChange={handleXmlChange} 
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`pdf-replace-${proof.id}`}>Nuevo PDF (opcional)</Label>
                            <Input 
                              id={`pdf-replace-${proof.id}`} 
                              type="file" 
                              accept=".pdf" 
                              onChange={handlePdfChange} 
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleUpload(proof.id)} 
                            disabled={!xmlFile || uploadMutation.isPending}
                            className="flex-1"
                          >
                            {uploadMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Subiendo...</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />Reemplazar Complemento</>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSelectedProofId(null);
                              setXmlFile(null);
                              setPdfFile(null);
                            }}
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