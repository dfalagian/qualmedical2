import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Upload, CheckCircle2, Eye, X, Trash2, AlertTriangle, Copy, Check, FileCode } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getSignedUrl } from "@/lib/storage";
import { PdfInlineViewer } from "@/components/pdf/PdfInlineViewer";
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
import { parseLocalDate } from "@/lib/formatters";

interface PaymentComplementUploadProps {
  invoiceId: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceUUID?: string | null;
  invoiceTotal?: number | null;
}

interface ProofWithComplement {
  id: string;
  proof_number: number;
  amount: number;
  fecha_pago: string | null;
  complement: {
    id: string;
    xml_url: string;
    pdf_url: string | null;
    uuid_cfdi: string | null;
    fecha_pago: string | null;
    monto: number | null;
    num_parcialidad: number | null;
    imp_saldo_ant: number | null;
    imp_saldo_insoluto: number | null;
  } | null;
}

interface ValidationCheck {
  label: string;
  xmlValue: string;
  proofValue: string;
  pass: boolean | null;
  detail?: string;
}

export function PaymentComplementUpload({
  invoiceId,
  supplierId,
  invoiceNumber,
  invoiceUUID,
  invoiceTotal,
}: PaymentComplementUploadProps) {
  const [open, setOpen] = useState(false);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedProofId, setSelectedProofId] = useState<string | null>(null);
  const [complementToDelete, setComplementToDelete] = useState<string | null>(null);
  const [isValidatingXml, setIsValidatingXml] = useState(false);
  const [xmlValidated, setXmlValidated] = useState(false);
  const [xmlValidationData, setXmlValidationData] = useState<any>(null);
  const [viewingComplementUrl, setViewingComplementUrl] = useState<string | null>(null);
  const [viewingComplementType, setViewingComplementType] = useState<'xml' | 'pdf' | 'image'>('image');
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

      return proofsWithComplements as ProofWithComplement[];
    },
    enabled: open
  });

  // Mutation para validar XML
  const validateXmlMutation = useMutation({
    mutationFn: async ({ proofId, file }: { proofId: string; file: File }) => {
      setIsValidatingXml(true);
      
      // Subir archivo XML temporalmente
      const tempFileName = `${supplierId}/complementos/temp_xml_${Date.now()}.xml`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(tempFileName, file);

      if (uploadError) throw uploadError;

      try {
        // Validar XML con la edge function
        const { data: validationResult, error: validationError } = await supabase.functions
          .invoke('validate-complement-xml', {
            body: {
              invoiceId,
              filePath: tempFileName
            }
          });

        if (validationError) {
          await supabase.storage.from('documents').remove([tempFileName]);
          throw new Error('Error al validar el XML del complemento');
        }

        if (!validationResult.valid) {
          await supabase.storage.from('documents').remove([tempFileName]);
          throw new Error(validationResult.error || 'El XML del complemento no es válido');
        }

        // XML válido - guardar la ruta temporal para después
        return { 
          success: true, 
          tempFilePath: tempFileName,
          extractedInfo: validationResult.extractedInfo,
          uuidComplemento: validationResult.uuidComplemento
        };

      } catch (error) {
        await supabase.storage.from('documents').remove([tempFileName]);
        throw error;
      } finally {
        setIsValidatingXml(false);
      }
    },
    onSuccess: (data) => {
      toast.success("XML validado correctamente", {
        description: "El UUID del complemento coincide con la factura. Ahora puede subir el PDF (opcional)."
      });
      setXmlValidated(true);
      setXmlValidationData(data);
    },
    onError: (error: any) => {
      toast.error("Error de validación del XML", {
        description: error.message || "El XML no pudo ser validado"
      });
      setXmlValidated(false);
      setXmlValidationData(null);
    },
  });

  // Mutation para guardar el complemento (XML + PDF opcional)
  const saveComplementMutation = useMutation({
    mutationFn: async ({ proofId }: { proofId: string }) => {
      if (!xmlValidationData?.tempFilePath) {
        throw new Error('Primero debe validar el XML');
      }

      // Mover XML a ubicación final
      const finalXmlPath = `${supplierId}/complementos/${Date.now()}_complemento.xml`;
      
      const { error: copyXmlError } = await supabase.storage
        .from('documents')
        .copy(xmlValidationData.tempFilePath, finalXmlPath);

      if (copyXmlError) throw copyXmlError;

      // Eliminar temporal
      await supabase.storage.from('documents').remove([xmlValidationData.tempFilePath]);

      const { data: { publicUrl: xmlPublicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(finalXmlPath);

      let pdfPublicUrl = null;

      // Si hay PDF, subirlo
      if (pdfFile) {
        const fileExt = pdfFile.name.split('.').pop()?.toLowerCase();
        const finalPdfPath = `${supplierId}/complementos/${Date.now()}_complemento.${fileExt}`;
        
        const { error: uploadPdfError } = await supabase.storage
          .from('documents')
          .upload(finalPdfPath, pdfFile);

        if (uploadPdfError) throw uploadPdfError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(finalPdfPath);
        
        pdfPublicUrl = publicUrl;
      }

      // Verificar si ya existe un complemento para este proof
      const { data: existingComplement } = await supabase
        .from("payment_complements")
        .select("id")
        .eq("payment_proof_id", proofId)
        .maybeSingle();

      const complementData: any = {
        xml_url: xmlPublicUrl,
        pdf_url: pdfPublicUrl,
        updated_at: new Date().toISOString()
      };

      // Agregar datos extraídos
      if (xmlValidationData.extractedInfo) {
        const ei = xmlValidationData.extractedInfo;
        if (ei.fecha_pago) complementData.fecha_pago = ei.fecha_pago;
        if (ei.monto_pagado != null) complementData.monto = ei.monto_pagado;
        if (ei.num_parcialidad != null) complementData.num_parcialidad = parseInt(ei.num_parcialidad, 10);
        if (ei.imp_saldo_ant != null) complementData.imp_saldo_ant = ei.imp_saldo_ant;
        if (ei.imp_saldo_insoluto != null) complementData.imp_saldo_insoluto = ei.imp_saldo_insoluto;
      }
      if (xmlValidationData.uuidComplemento) {
        complementData.uuid_cfdi = xmlValidationData.uuidComplemento;
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

      return { success: true };
    },
    onSuccess: () => {
      toast.success("Complemento de pago guardado correctamente");
      queryClient.invalidateQueries({ queryKey: ["payment-proofs-for-complements", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      resetForm();
    },
    onError: (error: any) => {
      toast.error("Error al guardar", {
        description: error.message || "No se pudo guardar el complemento"
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

  const resetForm = () => {
    setXmlFile(null);
    setPdfFile(null);
    setSelectedProofId(null);
    setXmlValidated(false);
    setXmlValidationData(null);
  };

  const handleXmlFileChange = (e: ChangeEvent<HTMLInputElement>) => {
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
    // Reset validation when new file is selected
    setXmlValidated(false);
    setXmlValidationData(null);
    setPdfFile(null);
  };

  const handlePdfFileChange = (e: ChangeEvent<HTMLInputElement>) => {
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
    setPdfFile(selectedFile);
  };

  const handleValidateXml = (proofId: string) => {
    if (!xmlFile) {
      toast.error("Seleccione un archivo XML");
      return;
    }
    validateXmlMutation.mutate({ proofId, file: xmlFile });
  };

  const handleSaveComplement = (proofId: string) => {
    if (!xmlValidated) {
      toast.error("Primero debe validar el XML");
      return;
    }
    saveComplementMutation.mutate({ proofId });
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);

  const buildValidationChecks = (
    ei: any,
    proof: ProofWithComplement
  ): ValidationCheck[] => {
    const checks: ValidationCheck[] = [];
    const tol = 0.02;

    checks.push({
      label: 'IdDocumento == UUID Factura',
      xmlValue: ei.uuid_documento_relacionado ?? '—',
      proofValue: invoiceUUID ?? '—',
      pass: true,
      detail: 'Validado por el sistema al subir el XML',
    });

    // NumParcialidad vs número de comprobante de pago
    if (ei.num_parcialidad != null) {
      const xmlParcialidad = parseInt(ei.num_parcialidad, 10);
      const pass = xmlParcialidad === proof.proof_number;
      checks.push({
        label: 'NumParcialidad == Número de pago',
        xmlValue: `Parcialidad ${xmlParcialidad}`,
        proofValue: `Pago #${proof.proof_number}`,
        pass,
        detail: pass ? undefined : `El complemento es de la parcialidad ${xmlParcialidad} pero se está subiendo al comprobante de pago #${proof.proof_number}`,
      });
    }

    if (ei.monto_pagado != null && proof.amount != null) {
      const diff = Math.abs(ei.monto_pagado - proof.amount);
      checks.push({
        label: 'Monto (ImpPagado) vs Pago registrado',
        xmlValue: formatCurrency(ei.monto_pagado),
        proofValue: formatCurrency(proof.amount),
        pass: diff <= tol,
        detail: diff > tol ? `Diferencia: ${formatCurrency(diff)}` : undefined,
      });
    }

    if (ei.fecha_pago && proof.fecha_pago) {
      const xmlDate = ei.fecha_pago.substring(0, 10);
      const proofDate = proof.fecha_pago.substring(0, 10);
      checks.push({
        label: 'FechaPago vs Fecha pago registrada',
        xmlValue: xmlDate,
        proofValue: proofDate,
        pass: xmlDate === proofDate,
      });
    }

    if (ei.imp_saldo_ant != null && invoiceTotal != null && ei.num_parcialidad === '1') {
      const diff = Math.abs(ei.imp_saldo_ant - invoiceTotal);
      checks.push({
        label: 'ImpSaldoAnt == Total Factura (1ª parcialidad)',
        xmlValue: formatCurrency(ei.imp_saldo_ant),
        proofValue: formatCurrency(invoiceTotal),
        pass: diff <= tol,
        detail: diff > tol ? `Diferencia: ${formatCurrency(diff)}` : undefined,
      });
    } else if (ei.imp_saldo_ant != null) {
      checks.push({
        label: `ImpSaldoAnt (Parcialidad ${ei.num_parcialidad ?? '?'})`,
        xmlValue: formatCurrency(ei.imp_saldo_ant),
        proofValue: '—',
        pass: null,
        detail: 'Saldo pendiente antes de este pago',
      });
    }

    if (ei.imp_saldo_ant != null && ei.monto_pagado != null && ei.imp_saldo_insoluto != null) {
      const expected = ei.imp_saldo_ant - ei.monto_pagado;
      const diff = Math.abs(expected - ei.imp_saldo_insoluto);
      checks.push({
        label: 'ImpSaldoAnt − ImpPagado == ImpSaldoInsoluto',
        xmlValue: `${formatCurrency(ei.imp_saldo_ant)} − ${formatCurrency(ei.monto_pagado)} = ${formatCurrency(expected)}`,
        proofValue: formatCurrency(ei.imp_saldo_insoluto),
        pass: diff <= tol,
        detail: `Saldo insoluto: ${formatCurrency(ei.imp_saldo_insoluto)}`,
      });
    }

    return checks;
  };

  // Ver complemento en visor interno
  const handleViewComplement = async (url: string, type: 'xml' | 'pdf' | 'image' = 'image') => {
    setLoadingComplementImage(true);
    setViewingComplementType(type);
    try {
      let finalUrl = url;
      
      if (url.includes('/documents/')) {
        const urlParts = url.split('/documents/');
        if (urlParts.length > 1) {
          const path = urlParts[1];
          const signedUrl = await getSignedUrl('documents', path, 3600);
          if (signedUrl) {
            finalUrl = signedUrl;
          }
        }
      }
      
      setViewingComplementUrl(finalUrl);
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

  const isPending = validateXmlMutation.isPending || saveComplementMutation.isPending || isValidatingXml;

  return (
    <>
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) {
        resetForm();
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
            {isAdmin ? (
              <p>Vista de complementos de pago. El proveedor es quien los carga después de recibir el pago.</p>
            ) : (
              <>
                <strong>Proceso de carga:</strong>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li><strong>Primero suba el XML</strong> del Complemento de Pago CFDI (obligatorio)</li>
                  <li>El sistema validará UUID y cruzará los datos con el pago registrado</li>
                  <li>Después suba el <strong>PDF</strong> del complemento (representación impresa, opcional)</li>
                </ol>
              </>
            )}
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
                {proofsWithoutComplement.map((proof) => (
                  <div key={proof.id} className="border rounded-lg p-4 space-y-3 bg-destructive/5 border-destructive/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Pago #{proof.proof_number}</Badge>
                        <span className="font-medium">{formatCurrency(proof.amount)}</span>
                        {proof.fecha_pago && (
                          <span className="text-sm text-muted-foreground">
                            {format(parseLocalDate(proof.fecha_pago)!, "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                      </div>
                      <Badge variant="destructive">Sin Complemento</Badge>
                    </div>

                    {isAdmin ? (
                      <p className="text-xs text-muted-foreground italic">El proveedor debe subir el complemento de pago.</p>
                    ) : selectedProofId === proof.id ? (
                      <div className="space-y-4 pt-2 border-t">
                        {/* Paso 1: Subir y validar XML */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={xmlValidated ? "default" : "secondary"} className="gap-1">
                              {xmlValidated ? <CheckCircle2 className="h-3 w-3" /> : <FileCode className="h-3 w-3" />}
                              Paso 1: XML
                            </Badge>
                            {xmlValidated && <span className="text-xs text-green-600">✓ Validado</span>}
                          </div>
                          <Label htmlFor={`xml-${proof.id}`}>
                            Archivo XML del Complemento de Pago (Obligatorio)
                          </Label>
                          <Input 
                            id={`xml-${proof.id}`} 
                            type="file" 
                            accept=".xml" 
                            onChange={handleXmlFileChange} 
                            className="mt-1"
                            disabled={isPending || xmlValidated}
                          />
                          {!xmlValidated && (
                            <Button 
                              onClick={() => handleValidateXml(proof.id)} 
                              disabled={!xmlFile || isPending}
                              variant="secondary"
                              className="w-full mt-2"
                            >
                              {isValidatingXml || validateXmlMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando UUID...</>
                              ) : (
                                <><FileCode className="mr-2 h-4 w-4" />Validar XML</>
                              )}
                            </Button>
                          )}
                          {xmlValidated && xmlValidationData?.extractedInfo && (
                            <div className="rounded-lg border border-green-200 dark:border-green-800 text-sm overflow-hidden">
                              <div className="bg-green-50 dark:bg-green-950/40 px-3 py-2 flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <span className="font-medium text-green-700 dark:text-green-300">
                                  XML Validado — Cruce con pago registrado
                                </span>
                                {xmlValidationData.extractedInfo.num_parcialidad && (
                                  <Badge variant="outline" className="ml-auto text-xs">
                                    Parcialidad #{xmlValidationData.extractedInfo.num_parcialidad}
                                  </Badge>
                                )}
                              </div>
                              <div className="divide-y divide-border">
                                {buildValidationChecks(xmlValidationData.extractedInfo, proof).map((chk, i) => (
                                  <div key={i} className="px-3 py-2 flex items-start gap-2">
                                    <span className="text-base leading-tight mt-0.5 flex-shrink-0">
                                      {chk.pass === true ? '✅' : chk.pass === false ? '❌' : 'ℹ️'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-xs text-muted-foreground">{chk.label}</p>
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                        <span className="text-xs"><span className="text-muted-foreground">XML: </span>{chk.xmlValue}</span>
                                        {chk.proofValue !== '—' && (
                                          <span className="text-xs"><span className="text-muted-foreground">Registrado: </span>{chk.proofValue}</span>
                                        )}
                                      </div>
                                      {chk.detail && (
                                        <p className={`text-xs mt-0.5 ${chk.pass === false ? 'text-destructive' : 'text-muted-foreground'}`}>{chk.detail}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {xmlValidationData.uuidComplemento && (
                                <div className="bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
                                  UUID CFDI Pago: <span className="font-mono">{xmlValidationData.uuidComplemento}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Paso 2: Subir PDF (solo si XML validado) */}
                        {xmlValidated && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="gap-1">
                                <FileText className="h-3 w-3" />
                                Paso 2: PDF del Complemento (Opcional)
                              </Badge>
                            </div>
                            <Label htmlFor={`pdf-${proof.id}`}>
                              Representación impresa (PDF) del Complemento de Pago
                            </Label>
                            <Input 
                              id={`pdf-${proof.id}`} 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png" 
                              onChange={handlePdfFileChange} 
                              className="mt-1"
                              disabled={isPending}
                            />
                          </div>
                        )}

                        {/* Botones de acción */}
                        <div className="flex gap-2 pt-2">
                          <Button 
                            onClick={() => handleSaveComplement(proof.id)} 
                            disabled={!xmlValidated || isPending}
                            className="flex-1"
                          >
                            {saveComplementMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />
                                {pdfFile ? 'Guardar XML y PDF' : 'Guardar solo XML'}
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={resetForm}
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
                {proofsWithComplement.map((proof) => (
                  <div key={proof.id} className="border rounded-lg p-4 space-y-3 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="border-green-500 text-green-700">
                          Pago #{proof.proof_number}
                        </Badge>
                        <span className="font-medium">{formatCurrency(proof.amount)}</span>
                        {proof.fecha_pago && (
                          <span className="text-sm text-muted-foreground">
                            {format(parseLocalDate(proof.fecha_pago)!, "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                      </div>
                      <Badge className="bg-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        UUID Validado
                      </Badge>
                    </div>

                    {/* Resumen del cruce ya guardado */}
                    <div className="rounded-lg border border-green-200 dark:border-green-800 text-sm overflow-hidden">
                      <div className="bg-green-50 dark:bg-green-950/40 px-3 py-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-700 dark:text-green-300 text-xs">Complemento validado y cruzado</span>
                        {proof.complement?.num_parcialidad != null && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Parcialidad #{proof.complement.num_parcialidad}
                          </Badge>
                        )}
                      </div>
                      <div className="px-3 py-2 space-y-1 text-xs">
                        <div className="flex gap-1 items-center text-green-600">
                          <span>✅</span>
                          <span className="text-muted-foreground">IdDocumento == UUID Factura</span>
                        </div>
                        {proof.complement?.monto != null && (
                          <div className="flex gap-1 items-center">
                            <span>{Math.abs(proof.complement.monto - proof.amount) <= 0.02 ? '✅' : '❌'}</span>
                            <span className="text-muted-foreground">Monto XML: </span>
                            <span>{formatCurrency(proof.complement.monto)}</span>
                            <span className="text-muted-foreground ml-1">/ Banco: </span>
                            <span>{formatCurrency(proof.amount)}</span>
                          </div>
                        )}
                        {proof.complement?.fecha_pago && proof.fecha_pago && (
                          <div className="flex gap-1 items-center">
                            <span>{proof.complement.fecha_pago.substring(0,10) === proof.fecha_pago.substring(0,10) ? '✅' : '❌'}</span>
                            <span className="text-muted-foreground">FechaPago XML: </span>
                            <span>{proof.complement.fecha_pago.substring(0,10)}</span>
                            <span className="text-muted-foreground ml-1">/ Banco: </span>
                            <span>{proof.fecha_pago.substring(0,10)}</span>
                          </div>
                        )}
                        {proof.complement?.imp_saldo_ant != null && (
                          <div className="flex gap-1 items-center">
                            <span>ℹ️</span>
                            <span className="text-muted-foreground">ImpSaldoAnt: </span>
                            <span>{formatCurrency(proof.complement.imp_saldo_ant)}</span>
                            {proof.complement.imp_saldo_insoluto != null && (
                              <><span className="text-muted-foreground ml-1">→ Insoluto: </span>
                              <span>{formatCurrency(proof.complement.imp_saldo_insoluto)}</span></>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-1 pt-1 border-t border-green-200 dark:border-green-800 mt-1">
                          <span className="text-muted-foreground">UUID Factura:</span>
                          <span className="font-mono truncate max-w-[220px]">{invoiceUUID || '—'}</span>
                          {invoiceUUID && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onClick={() => handleCopyUUID(invoiceUUID)}>
                              {copiedUUID === invoiceUUID ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-green-200 dark:border-green-900">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewComplement(proof.complement!.xml_url, 'xml')}
                        className="gap-1"
                      >
                        <FileCode className="h-3.5 w-3.5" />
                        Ver XML
                      </Button>
                      {proof.complement?.pdf_url && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const url = proof.complement!.pdf_url!;
                            const isPdf = url.toLowerCase().includes('.pdf');
                            handleViewComplement(url, isPdf ? 'pdf' : 'image');
                          }}
                          className="gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver PDF
                        </Button>
                      )}
                      {!isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedProofId(proof.id)}
                          className="gap-1 text-muted-foreground"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Reemplazar
                        </Button>
                      )}
                      {isAdmin && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setComplementToDelete(proof.complement!.id)}
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </Button>
                      )}
                    </div>

                    {!isAdmin && selectedProofId === proof.id && (
                      <div className="space-y-4 pt-2 border-t border-green-200 dark:border-green-900">
                        {/* Paso 1: Nuevo XML */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={xmlValidated ? "default" : "secondary"} className="gap-1">
                              {xmlValidated ? <CheckCircle2 className="h-3 w-3" /> : <FileCode className="h-3 w-3" />}
                              Paso 1: Nuevo XML
                            </Badge>
                            {xmlValidated && <span className="text-xs text-green-600">✓ Validado</span>}
                          </div>
                          <Input 
                            type="file" 
                            accept=".xml" 
                            onChange={handleXmlFileChange} 
                            disabled={isPending || xmlValidated}
                          />
                          {!xmlValidated && (
                            <Button 
                              onClick={() => handleValidateXml(proof.id)} 
                              disabled={!xmlFile || isPending}
                              variant="secondary"
                              className="w-full"
                            >
                              {isValidatingXml || validateXmlMutation.isPending ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando...</>
                              ) : (
                                <><FileCode className="mr-2 h-4 w-4" />Validar nuevo XML</>
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Paso 2: Nuevo PDF */}
                        {xmlValidated && (
                          <div className="space-y-2">
                            <Badge variant="secondary" className="gap-1">
                              <FileText className="h-3 w-3" />
                              Paso 2: Nuevo PDF/Imagen (Opcional)
                            </Badge>
                            <Input 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png" 
                              onChange={handlePdfFileChange} 
                              disabled={isPending}
                            />
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleSaveComplement(proof.id)} 
                            disabled={!xmlValidated || isPending}
                            className="flex-1"
                          >
                            {saveComplementMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</>
                            ) : (
                              <><Upload className="mr-2 h-4 w-4" />Reemplazar Complemento</>
                            )}
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={resetForm}
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
            viewingComplementType === 'xml' ? (
              <div className="w-full h-[70vh] p-4 overflow-auto">
                <pre className="text-xs whitespace-pre-wrap break-all font-mono bg-muted p-4 rounded-lg">
                  Descargando XML...
                </pre>
                <div className="mt-4 text-center">
                  <a 
                    href={viewingComplementUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Descargar XML
                  </a>
                </div>
              </div>
            ) : viewingComplementType === 'pdf' ? (
              <div className="w-full">
                <PdfInlineViewer url={viewingComplementUrl} />
              </div>
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
