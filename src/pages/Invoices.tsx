import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, Upload, FileText, Download, DollarSign, Eye, Trash2, FileImage, Truck, X, Check, ChevronsUpDown, Layers, RotateCcw } from "lucide-react";
import { PaymentProofsHistory } from "@/components/payments/PaymentProofsHistory";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InvoiceDetailsDialog } from "@/components/invoices/InvoiceDetailsDialog";
import { InvoicePaymentProofUpload } from "@/components/invoices/InvoicePaymentProofUpload";
import { getSignedUrl } from "@/lib/storage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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

const Invoices = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [complementoDialogOpen, setComplementoDialogOpen] = useState(false);
  const [invoiceForComplemento, setInvoiceForComplemento] = useState<string | null>(null);
  const [complementoFile, setComplementoFile] = useState<File | null>(null);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");
  const [supplierComboOpen, setSupplierComboOpen] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [currentEvidenceUrls, setCurrentEvidenceUrls] = useState<string[]>([]);
  const [replacingEvidence, setReplacingEvidence] = useState<string | null>(null);
  const [rejectionReasonDialog, setRejectionReasonDialog] = useState<{ 
    open: boolean; 
    reason: string;
    type: 'invoice' | 'evidence';
  }>({ 
    open: false, 
    reason: '',
    type: 'evidence'
  });

  // Query para obtener el perfil del proveedor y verificar si está aprobado
  const { data: supplierProfile } = useQuery({
    queryKey: ["supplier_profile", user?.id],
    enabled: !isAdmin && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("*, profiles(full_name, company_name)")
        .order("created_at", { ascending: false });

      if (invoicesError) throw invoicesError;

      // Obtener comprobantes de pago para cada factura (incluir datos de pagos parciales)
      const { data: pagosData, error: pagosError } = await supabase
        .from("pagos")
        .select("id, invoice_id, comprobante_pago_url, is_split_payment, total_installments, paid_amount, original_amount, status");

      if (pagosError) console.error("Error fetching pagos:", pagosError);

      // Combinar datos
      const invoicesWithComprobantes = invoicesData?.map(invoice => {
        const pago = pagosData?.find(p => p.invoice_id === invoice.id);
        return {
          ...invoice,
          comprobante_pago_url: pago?.comprobante_pago_url || null,
          pago_id: pago?.id || null,
          is_split_payment: pago?.is_split_payment || false,
          total_installments: pago?.total_installments || null,
          paid_amount: pago?.paid_amount || 0,
          pago_status: pago?.status || null
        };
      });

      return invoicesWithComprobantes;
    },
  });

  const { data: invoiceItems } = useQuery({
    queryKey: ["invoice-items", selectedInvoice?.id],
    queryFn: async () => {
      if (!selectedInvoice?.id) return [];
      
      const { data, error } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", selectedInvoice.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedInvoice?.id,
  });

  // Obtener lista de proveedores para el filtro
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email")
        .neq("id", user?.id);

      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pdfFile || !xmlFile || !user) {
        throw new Error("Los archivos PDF y XML son obligatorios");
      }

      setIsUploading(true);

      // Upload PDF
      const pdfExt = pdfFile.name.split(".").pop();
      const pdfFileName = `${user.id}/invoices/${Date.now()}.${pdfExt}`;
      const { error: pdfError } = await supabase.storage
        .from("invoices")
        .upload(pdfFileName, pdfFile);

      if (pdfError) throw pdfError;

      // Upload XML
      const xmlExt = xmlFile.name.split(".").pop();
      const xmlFileName = `${user.id}/invoices/${Date.now()}.${xmlExt}`;
      const { error: xmlError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, xmlFile);

      if (xmlError) throw xmlError;

      // Validar XML ANTES de insertar en la base de datos
      console.log('Llamando a validate-invoice-xml con:', xmlFileName);
      
      let validationData, validationError;
      try {
        const response = await supabase.functions.invoke(
          'validate-invoice-xml',
          {
            body: { xmlPath: xmlFileName }
          }
        );
        validationData = response.data;
        validationError = response.error;
        
        console.log('Respuesta de validate-invoice-xml:', { validationData, validationError });
      } catch (invokeError) {
        console.error('Error al invocar validate-invoice-xml:', invokeError);
        throw new Error('Error al conectar con el servicio de validación. Por favor, intenta de nuevo.');
      }

      // Si hay error de conexión/red con el edge function
      if (validationError) {
        console.error('Error de validación:', validationError);
        throw new Error('Error al validar el archivo XML: ' + (validationError.message || 'Error de validación'));
      }

      // Si la validación falló (RFC incorrecto, FormaPago=99 pero MetodoPago!=PPD, etc.)
      if (validationData?.success === false) {
        throw new Error(validationData.mensaje || validationData.error || 'Error de validación en el XML');
      }

      // Extraer datos del XML validado
      const invoiceNumber = validationData.invoiceNumber;
      const amount = validationData.amount;

      if (!invoiceNumber || !amount) {
        throw new Error('No se pudo extraer el número de factura o el monto del XML');
      }

      console.log('Datos extraídos del XML:', validationData);

      // Get URLs
      const { data: { publicUrl: pdfUrl } } = supabase.storage
        .from("invoices")
        .getPublicUrl(pdfFileName);

      const { data: { publicUrl: xmlUrl } } = supabase.storage
        .from("invoices")
        .getPublicUrl(xmlFileName);

      // Insert invoice solo si la validación fue exitosa
      const { data: invoiceData, error: insertError } = await supabase
        .from("invoices")
        .insert({
          supplier_id: user.id,
          invoice_number: invoiceNumber,
          amount: parseFloat(amount),
          subtotal: validationData.subtotal,
          descuento: validationData.descuento || 0,
          total_impuestos: validationData.totalImpuestos || 0,
          impuestos_detalle: validationData.impuestosDetalle || {},
          pdf_url: pdfUrl,
          xml_url: xmlUrl,
          uuid: validationData.uuid,
          fecha_emision: validationData.fecha,
          lugar_expedicion: validationData.lugarExpedicion,
          forma_pago: validationData.formaPago,
          metodo_pago: validationData.metodoPago,
          emisor_nombre: validationData.emisorNombre,
          emisor_rfc: validationData.emisorRfc,
          emisor_regimen_fiscal: validationData.emisorRegimenFiscal,
          receptor_nombre: validationData.receptorNombre,
          receptor_rfc: validationData.receptorRfc,
          receptor_uso_cfdi: validationData.receptorUsoCfdi,
          requiere_complemento: validationData?.requiereComplemento || false,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Insertar conceptos/artículos si existen
      if (validationData.conceptos && validationData.conceptos.length > 0) {
        const itemsToInsert = validationData.conceptos.map((concepto: any) => ({
          invoice_id: invoiceData.id,
          clave_prod_serv: concepto.claveProdServ,
          clave_unidad: concepto.claveUnidad,
          unidad: concepto.unidad,
          descripcion: concepto.descripcion,
          cantidad: concepto.cantidad,
          valor_unitario: concepto.valorUnitario,
          importe: concepto.importe,
          descuento: concepto.descuento || 0,
        }));

        const { error: itemsError } = await supabase
          .from("invoice_items")
          .insert(itemsToInsert);

        if (itemsError) {
          console.error('Error al insertar conceptos:', itemsError);
          // No lanzamos error aquí para no bloquear la creación de la factura
        }
      }

      // Si todo está bien pero requiere complemento de pago
      if (validationData?.requiereComplemento) {
        return { requiereComplemento: true, mensaje: validationData.mensaje };
      }

      return { requiereComplemento: false };
    },
    onSuccess: (data) => {
      toast.success("Factura subida exitosamente");
      
      // Mostrar mensaje de complemento de pago si es necesario
      if (data?.requiereComplemento) {
        setTimeout(() => {
          toast.info(data.mensaje, {
            duration: 8000,
          });
        }, 500);
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setPdfFile(null);
      setXmlFile(null);
      setIsUploading(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al subir factura");
      setIsUploading(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ 
      invoice,
      status,
      rejectionReason
    }: { 
      invoice: any;
      status: "pendiente" | "procesando" | "pagado" | "rechazado" | "cancelado";
      rejectionReason?: string;
    }) => {
      // Verificar si la factura tiene comprobante de pago subido
      const { data: pagoData } = await supabase
        .from('pagos')
        .select('comprobante_pago_url')
        .eq('invoice_id', invoice.id)
        .maybeSingle();

      // Bloquear cambio si ya tiene comprobante de pago subido
      if (pagoData?.comprobante_pago_url) {
        throw new Error('No se puede cambiar el estado de una factura que tiene comprobante de pago. El estado está bloqueado en "Pagado".');
      }

      const updates: any = { status };
      
      if (status === "rechazado" && rejectionReason) {
        updates.rejection_reason = rejectionReason;
      } else if (status !== "rechazado") {
        // Limpiar rejection_reason si se cambia a otro estado
        updates.rejection_reason = null;
      }
      
      if (status === "pagado") {
        updates.payment_date = new Date().toISOString().split('T')[0];
        
        // Verificar si ya existe un registro de pago para esta factura
        const { data: existingPago } = await supabase
          .from("pagos")
          .select("id")
          .eq("invoice_id", invoice.id)
          .maybeSingle();
        
        // Si no existe, crear el registro de pago automáticamente
        if (!existingPago) {
          // Obtener los datos bancarios aprobados del proveedor
          const { data: datosBancarios, error: datosBancariosError } = await supabase
            .from("documents")
            .select("id, nombre_banco, numero_cuenta_clabe")
            .eq("supplier_id", invoice.supplier_id)
            .eq("document_type", "datos_bancarios")
            .eq("status", "aprobado")
            .maybeSingle();
          
          if (datosBancariosError) {
            console.error("Error al obtener datos bancarios:", datosBancariosError);
          }
          
          if (!datosBancarios) {
            throw new Error("El proveedor no tiene datos bancarios aprobados. No se puede crear el registro de pago.");
          }
          
          // Crear el registro de pago
          const { error: pagoError } = await supabase
            .from("pagos")
            .insert({
              supplier_id: invoice.supplier_id,
              datos_bancarios_id: datosBancarios.id,
              invoice_id: invoice.id,
              amount: invoice.amount,
              fecha_pago: new Date().toISOString().split('T')[0],
              status: "pendiente",
              nombre_banco: datosBancarios.nombre_banco,
              created_by: user?.id
            });
          
          if (pagoError) {
            console.error("Error al crear registro de pago:", pagoError);
            throw new Error("Error al crear el registro de pago automáticamente");
          }
        }
      } else {
        // Limpiar payment_date si se cambia de "pagado" a otro estado
        updates.payment_date = null;
      }

      const { error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoice.id);

      if (error) throw error;

      // Enviar notificación por email según el estado
      let notificationType: string | null = null;
      let notificationData: any = {
        invoice_number: invoice.invoice_number,
        invoice_amount: invoice.amount,
        invoice_date: invoice.fecha_emision
      };

      switch (status) {
        case "procesando":
          notificationType = 'invoice_status_processing';
          break;
        case "pagado":
          notificationType = 'invoice_status_paid';
          notificationData.payment_date = new Date().toISOString().split('T')[0];
          break;
        case "rechazado":
          notificationType = 'invoice_status_rejected';
          notificationData.rejection_reason = rejectionReason || "No se especificó una razón";
          break;
        case "cancelado":
          notificationType = 'invoice_status_rejected';
          notificationData.rejection_reason = "La factura ha sido cancelada.";
          break;
      }

      // Solo enviar notificación si hay un tipo válido (no para "pendiente")
      if (notificationType) {
        console.log('Enviando notificación:', { 
          supplier_id: invoice.supplier_id, 
          type: notificationType, 
          data: notificationData 
        });
        
        const { data: notifResult, error: notifError } = await supabase.functions.invoke("notify-supplier", {
          body: {
            supplier_id: invoice.supplier_id,
            type: notificationType,
            data: notificationData
          }
        });
        
        if (notifError) {
          console.error('Error al enviar notificación:', notifError);
          throw new Error(`Error al enviar notificación: ${notifError.message}`);
        }
        
        console.log('Notificación enviada exitosamente:', notifResult);
      }
    },
    onSuccess: () => {
      toast.success("Estado actualizado y notificación enviada");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Factura eliminada exitosamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar factura");
    },
  });

  const uploadComplementoMutation = useMutation({
    mutationFn: async ({ invoiceId, file }: { invoiceId: string; file: File }) => {
      if (!user) throw new Error("Usuario no autenticado");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/complementos/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("invoices")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("invoices")
        .update({ complemento_pago_url: publicUrl })
        .eq("id", invoiceId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Complemento de pago adjuntado exitosamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setComplementoDialogOpen(false);
      setComplementoFile(null);
      setInvoiceForComplemento(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al adjuntar complemento de pago");
    },
  });

  const uploadEvidenceMutation = useMutation({
    mutationFn: async ({ invoiceId, files, existingUrls }: { invoiceId: string; files: File[]; existingUrls: string[] }) => {
      if (!user) throw new Error("Usuario no autenticado");
      
      const uploadedPaths: string[] = [];
      
      // Subir cada archivo
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/evidence/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('invoices')
          .upload(fileName, file);
        
        if (uploadError) {
          // Si hay error, limpiar archivos subidos
          for (const path of uploadedPaths) {
            await supabase.storage.from('invoices').remove([path]);
          }
          throw uploadError;
        }
        
        uploadedPaths.push(fileName);
      }
      
      // Combinar URLs existentes con las nuevas
      const allUrls = [...existingUrls, ...uploadedPaths];
      
      // Actualizar la factura con todas las URLs
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ 
          delivery_evidence_url: allUrls,
          updated_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

      if (updateError) throw updateError;

      return allUrls;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Evidencia de entrega subida exitosamente");
      setUploadingEvidence(null);
      setEvidenceFiles([]);
    },
    onError: (error: any) => {
      console.error("Error uploading evidence:", error);
      toast.error(error.message || "Error al subir la evidencia de entrega");
    },
  });

  const replaceEvidenceMutation = useMutation({
    mutationFn: async ({ invoiceId, files, oldUrls }: { invoiceId: string; files: File[]; oldUrls: string[] }) => {
      if (!user) throw new Error("Usuario no autenticado");
      
      const uploadedPaths: string[] = [];
      
      try {
        // Subir nuevos archivos
        for (const file of files) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}/evidence/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, file);
          
          if (uploadError) throw uploadError;
          uploadedPaths.push(fileName);
        }
        
        // Actualizar la factura con las nuevas URLs y resetear estado
        const { error: updateError } = await supabase
          .from('invoices')
          .update({ 
            delivery_evidence_url: uploadedPaths,
            evidence_status: 'pending',
            evidence_rejection_reason: null,
            evidence_reviewed_at: null,
            evidence_reviewed_by: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', invoiceId);

        if (updateError) throw updateError;
        
        // Eliminar archivos antiguos del storage
        if (oldUrls.length > 0) {
          // Extraer solo las rutas del storage, ya que oldUrls puede contener URLs completas o solo rutas
          const oldPaths = oldUrls.map(url => {
            // Si la URL comienza con http, es una URL completa
            if (url.startsWith('http')) {
              const urlPath = new URL(url).pathname;
              return urlPath.split('/').slice(-3).join('/');
            }
            // Si no, ya es una ruta del storage
            return url;
          });
          
          await supabase.storage.from('invoices').remove(oldPaths);
        }
        
        return uploadedPaths;
      } catch (error) {
        // Si hay error, limpiar archivos nuevos subidos
        if (uploadedPaths.length > 0) {
          await supabase.storage.from('invoices').remove(uploadedPaths);
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Evidencia reemplazada exitosamente");
      setReplacingEvidence(null);
      setEvidenceFiles([]);
    },
    onError: (error: any) => {
      console.error("Error replacing evidence:", error);
      toast.error(error.message || "Error al reemplazar la evidencia");
    },
  });

  const approveEvidenceMutation = useMutation({
    mutationFn: async (invoice: any) => {
      // Actualizar el estado de la evidencia
      const { error } = await supabase
        .from("invoices")
        .update({
          evidence_status: 'approved',
          evidence_reviewed_by: user!.id,
          evidence_reviewed_at: new Date().toISOString()
        } as any)
        .eq("id", invoice.id);

      if (error) throw error;
      
      // Verificar si ya existe un registro de pago para esta factura
      const { data: existingPago } = await supabase
        .from("pagos")
        .select("id")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
      
      // Si no existe, crear el registro de pago automáticamente
      if (!existingPago) {
        // Obtener los datos bancarios aprobados del proveedor
        const { data: datosBancarios, error: datosBancariosError } = await supabase
          .from("documents")
          .select("id, nombre_banco, numero_cuenta_clabe")
          .eq("supplier_id", invoice.supplier_id)
          .eq("document_type", "datos_bancarios")
          .eq("status", "aprobado")
          .maybeSingle();
        
        if (datosBancariosError) {
          console.error("Error al obtener datos bancarios:", datosBancariosError);
        }
        
        if (datosBancarios) {
          // Crear el registro de pago
          const { error: pagoError } = await supabase
            .from("pagos")
            .insert({
              supplier_id: invoice.supplier_id,
              datos_bancarios_id: datosBancarios.id,
              invoice_id: invoice.id,
              amount: invoice.amount,
              fecha_pago: new Date().toISOString().split('T')[0],
              status: "pendiente",
              nombre_banco: datosBancarios.nombre_banco,
              created_by: user?.id
            });
          
          if (pagoError) {
            console.error("Error al crear registro de pago:", pagoError);
            // No lanzamos error aquí para no bloquear la aprobación de evidencia
            toast.warning("Evidencia aprobada, pero no se pudo crear el registro de pago automáticamente");
          }
        } else {
          console.warn("No se encontraron datos bancarios aprobados para crear el registro de pago");
          toast.info("Evidencia aprobada. Recuerda que el proveedor necesita datos bancarios aprobados para crear el pago.");
        }
      }

      // Enviar notificación por email al proveedor
      await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: invoice.supplier_id,
          type: 'evidence_approved',
          data: {
            invoice_number: invoice.invoice_number,
            invoice_amount: invoice.amount
          }
        }
      });
    },
    onSuccess: () => {
      toast.success("Evidencia aprobada");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al aprobar evidencia");
    },
  });

  const rejectEvidenceMutation = useMutation({
    mutationFn: async ({ invoice, reason }: { invoice: any; reason: string }) => {
      const { error } = await supabase
        .from("invoices")
        .update({
          evidence_status: 'rejected',
          evidence_reviewed_by: user!.id,
          evidence_reviewed_at: new Date().toISOString(),
          evidence_rejection_reason: reason
        } as any)
        .eq("id", invoice.id);

      if (error) throw error;

      // Enviar notificación por email al proveedor
      await supabase.functions.invoke("notify-supplier", {
        body: {
          supplier_id: invoice.supplier_id,
          type: 'evidence_rejected',
          data: {
            invoice_number: invoice.invoice_number,
            invoice_amount: invoice.amount,
            rejection_reason: reason
          }
        }
      });
    },
    onSuccess: () => {
      toast.success("Evidencia rechazada");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al rechazar evidencia");
    },
  });

  const revertEvidenceMutation = useMutation({
    mutationFn: async (invoice: any) => {
      const { error } = await supabase
        .from("invoices")
        .update({
          evidence_status: 'pending',
          evidence_reviewed_by: null,
          evidence_reviewed_at: null,
          evidence_rejection_reason: null
        } as any)
        .eq("id", invoice.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evidencia revertida a pendiente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al revertir evidencia");
    },
  });

  const handleEvidenceUpload = async (invoiceId: string, existingUrls: string[]) => {
    if (evidenceFiles.length === 0) {
      toast.error("Por favor selecciona al menos una imagen");
      return;
    }
    
    const totalImages = existingUrls.length + evidenceFiles.length;
    if (totalImages > 4) {
      toast.error(`Solo puedes tener un máximo de 4 imágenes. Actualmente tienes ${existingUrls.length} y estás intentando subir ${evidenceFiles.length}.`);
      return;
    }
    
    uploadEvidenceMutation.mutate({ invoiceId, files: evidenceFiles, existingUrls });
  };

  // Cargar las URLs firmadas de las evidencias cuando se abre el diálogo
  useEffect(() => {
    const loadEvidenceUrls = async () => {
      if (uploadingEvidence) {
        const invoice = invoices?.find(inv => inv.id === uploadingEvidence);
        if (invoice?.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url)) {
          const signedUrls = await Promise.all(
            invoice.delivery_evidence_url.map(url => getSignedUrl('invoices', url, 3600))
          );
          setCurrentEvidenceUrls(signedUrls.filter((url): url is string => url !== null));
        } else {
          setCurrentEvidenceUrls([]);
        }
      }
    };

    loadEvidenceUrls();
  }, [uploadingEvidence, invoices]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pagado":
        return <Badge className="bg-success">Pagado</Badge>;
      case "procesando":
        return <Badge className="bg-blue-500">Procesando</Badge>;
      case "rechazado":
        return <Badge variant="destructive">Rechazado</Badge>;
      case "cancelado":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  const getEvidenceStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-success">Evidencia Aprobada</Badge>;
      case "rejected":
        return <Badge variant="destructive">Evidencia Rechazada</Badge>;
      default:
        return <Badge className="bg-warning">Evidencia Pendiente</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestión de Facturas</h2>
          <p className="text-muted-foreground">
            {isAdmin ? "Administra las facturas de los proveedores" : "Sube y consulta tus facturas"}
          </p>
        </div>

        {!isAdmin && (
          (supplierProfile as any)?.approved ? (
            <Card className="shadow-md border-accent/20">
              <CardHeader className="bg-gradient-accent/10">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Subir Nueva Factura
                </CardTitle>
                <CardDescription>Los datos se extraen automáticamente del XML</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    uploadMutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pdfFile">Archivo PDF *</Label>
                      <Input
                        id="pdfFile"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="xmlFile">Archivo XML *</Label>
                      <Input
                        id="xmlFile"
                        type="file"
                        accept=".xml"
                        onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={isUploading} className="w-full">
                    {isUploading ? "Subiendo..." : "Subir Factura"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-md border-warning/20">
              <CardHeader className="bg-warning/10">
                <CardTitle className="flex items-center gap-2 text-warning">
                  <Receipt className="h-5 w-5" />
                  Cuenta en Proceso de Validación
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Tu cuenta está siendo revisada por nuestro equipo. Para poder subir facturas, 
                    necesitas tener todos tus documentos aprobados:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                    <li>INE (Credencial de Identidad)</li>
                    <li>Constancia de Situación Fiscal</li>
                    <li>Comprobante de Domicilio</li>
                    <li>Datos Bancarios</li>
                  </ul>
                  <p className="text-sm text-muted-foreground">
                    Por favor, asegúrate de haber subido todos los documentos requeridos en la sección 
                    de <strong>Documentos</strong>. Una vez que todos sean aprobados, podrás comenzar a subir facturas.
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Facturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isAdmin && suppliers && suppliers.length > 0 && (
              <div className="mb-4">
                <Label className="mb-2 block">
                  Filtrar por proveedor
                </Label>
                <Popover open={supplierComboOpen} onOpenChange={setSupplierComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierComboOpen}
                      className="w-full max-w-md justify-between"
                    >
                      {supplierFilter === "all"
                        ? "Todos los proveedores"
                        : suppliers.find((s: any) => s.id === supplierFilter)?.company_name ||
                          suppliers.find((s: any) => s.id === supplierFilter)?.full_name ||
                          "Seleccionar proveedor"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full max-w-md p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar proveedor..." />
                      <CommandList>
                        <CommandEmpty>No se encontró proveedor.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setSupplierFilter("all");
                              setSupplierComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                supplierFilter === "all" ? "opacity-100" : "opacity-0"
                              )}
                            />
                            Todos los proveedores
                          </CommandItem>
                          {suppliers.map((supplier: any) => (
                            <CommandItem
                              key={supplier.id}
                              value={`${supplier.company_name || supplier.full_name} ${supplier.rfc || ""}`}
                              onSelect={() => {
                                setSupplierFilter(supplier.id);
                                setSupplierComboOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  supplierFilter === supplier.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {supplier.company_name || supplier.full_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando facturas...</p>
            ) : invoices && invoices.length > 0 ? (
              <div className="space-y-4">
                {invoices
                  .filter((invoice: any) => {
                    if (!isAdmin || !supplierFilter || supplierFilter === "all") return true;
                    return invoice.supplier_id === supplierFilter;
                  })
                  .map((invoice: any) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          {invoice.invoice_number}
                        </h4>
                        {getStatusBadge(invoice.status)}
                        {invoice.status === 'rechazado' && invoice.rejection_reason && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-destructive text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectionReasonDialog({ 
                                open: true, 
                                reason: invoice.rejection_reason,
                                type: 'invoice'
                              });
                            }}
                          >
                            Ver motivo
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          ${invoice.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                        <span>
                          {new Date(invoice.created_at).toLocaleDateString('es-MX')}
                        </span>
                        {invoice.payment_date && (
                          <span className="text-success">
                            Pagado: {new Date(invoice.payment_date).toLocaleDateString('es-MX')}
                          </span>
                        )}
                      </div>
                      {isAdmin && invoice.profiles && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Proveedor: {invoice.profiles.company_name || invoice.profiles.full_name}
                        </p>
                      )}
                      {!isAdmin && invoice.requiere_complemento && !invoice.complemento_pago_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                            Requiere Complemento de Pago
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setInvoiceForComplemento(invoice.id);
                              setComplementoDialogOpen(true);
                            }}
                          >
                            Adjuntar
                          </Button>
                        </div>
                      )}
                      {invoice.complemento_pago_url && (
                        <div className="mt-2">
                          <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                            Complemento de Pago Adjuntado
                          </Badge>
                        </div>
                      )}
                      
                      {/* Mostrar historial de pagos si hay comprobantes */}
                      {invoice.pago_id && invoice.paid_amount > 0 && (
                        <PaymentProofsHistory
                          pagoId={invoice.pago_id}
                          invoiceAmount={invoice.amount}
                          paidAmount={invoice.paid_amount}
                          status={invoice.pago_status || invoice.status}
                        />
                      )}
                    </div>

                    <div className="flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setShowDetailsDialog(true);
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Ver detalles de la factura</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={async () => {
                                try {
                                  const urlPath = new URL(invoice.pdf_url).pathname;
                                  const filePath = urlPath.split('/').slice(-3).join('/');
                                  
                                  const { data, error } = await supabase.storage
                                    .from('invoices')
                                    .download(filePath);
                                  
                                  if (error) throw error;
                                  
                                  const url = URL.createObjectURL(data);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `factura-${invoice.invoice_number}.pdf`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  URL.revokeObjectURL(url);
                                } catch (error) {
                                  toast.error('Error al descargar el PDF');
                                }
                              }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Descargar PDF de la factura</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={async () => {
                                try {
                                  const urlPath = new URL(invoice.xml_url).pathname;
                                  const filePath = urlPath.split('/').slice(-3).join('/');
                                  
                                  const { data, error } = await supabase.storage
                                    .from('invoices')
                                    .download(filePath);
                                  
                                  if (error) throw error;
                                  
                                  const url = URL.createObjectURL(data);
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `factura-${invoice.invoice_number}.xml`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                  URL.revokeObjectURL(url);
                                } catch (error) {
                                  toast.error('Error al descargar el XML');
                                }
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Descargar XML de la factura</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {invoice.complemento_pago_url && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={async () => {
                                  try {
                                    const urlPath = new URL(invoice.complemento_pago_url).pathname;
                                    const filePath = urlPath.split('/').slice(-3).join('/');
                                    
                                    const { data, error } = await supabase.storage
                                      .from('invoices')
                                      .download(filePath);
                                    
                                    if (error) throw error;
                                    
                                    const url = URL.createObjectURL(data);
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = `complemento-${invoice.invoice_number}.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(url);
                                  } catch (error) {
                                    toast.error('Error al descargar el complemento');
                                  }
                                }}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Descargar complemento de pago (PDF)</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      
                      {isAdmin && (invoice.status === 'pagado' || invoice.status === 'procesando' || invoice.evidence_status === 'approved') && (
                        <InvoicePaymentProofUpload
                          invoiceId={invoice.id}
                          supplierId={invoice.supplier_id}
                          hasProof={!!invoice.comprobante_pago_url}
                          proofUrl={invoice.comprobante_pago_url}
                          invoiceAmount={invoice.amount}
                          paidAmount={invoice.paid_amount || 0}
                        />
                      )}

                      {invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) && invoice.delivery_evidence_url.length > 0 && (
                        <>
                          <ImageViewer
                            imageUrls={invoice.delivery_evidence_url}
                            fileName={`Evidencia-${invoice.invoice_number}`}
                            triggerText="Evidencia"
                            triggerSize="icon"
                            triggerVariant="outline"
                            bucket="invoices"
                          />
                          
                          <div className="flex items-center gap-1">
                            {getEvidenceStatusBadge(invoice.evidence_status || 'pending')}
                          </div>
                          
                          {invoice.evidence_status === 'rejected' && (
                            <>
                              {invoice.evidence_rejection_reason ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-destructive text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRejectionReasonDialog({ 
                                      open: true, 
                                      reason: invoice.evidence_rejection_reason,
                                      type: 'evidence'
                                    });
                                  }}
                                >
                                  Ver motivo
                                </Button>
                              ) : (
                                <Badge variant="outline" className="border-destructive text-destructive">
                                  Sin motivo especificado
                                </Badge>
                              )}
                              
                              {isAdmin && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 text-warning hover:bg-warning/10"
                                        onClick={() => revertEvidenceMutation.mutate(invoice)}
                                        disabled={revertEvidenceMutation.isPending}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Revertir a pendiente</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              
                              {!isAdmin && (
                                <Dialog 
                                  open={replacingEvidence === invoice.id} 
                                  onOpenChange={(open) => {
                                    setReplacingEvidence(open ? invoice.id : null);
                                    if (!open) setEvidenceFiles([]);
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 border-destructive text-destructive hover:bg-destructive/10"
                                    >
                                      Reemplazar Evidencia
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Reemplazar Evidencia Rechazada</DialogTitle>
                                      <DialogDescription>
                                        La evidencia anterior será eliminada. Sube hasta 4 nuevas imágenes para reemplazarla.
                                      </DialogDescription>
                                    </DialogHeader>
                                    
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor={`replace-evidence-${invoice.id}`}>
                                          Selecciona nuevas imágenes (máximo 4)
                                        </Label>
                                        <Input
                                          id={`replace-evidence-${invoice.id}`}
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          onChange={(e) => {
                                            const files = Array.from(e.target.files || []);
                                            if (files.length > 4) {
                                              toast.error("Solo puedes subir un máximo de 4 imágenes");
                                              e.target.value = '';
                                              return;
                                            }
                                            setEvidenceFiles(files);
                                          }}
                                          className="mt-2"
                                        />
                                      </div>
                                      
                                      {evidenceFiles.length > 0 && (
                                        <div className="space-y-2">
                                          <p className="text-sm font-medium">Archivos seleccionados:</p>
                                          <ul className="text-sm text-muted-foreground space-y-1">
                                            {evidenceFiles.map((file, idx) => (
                                              <li key={idx} className="flex items-center gap-2">
                                                <FileImage className="h-4 w-4" />
                                                {file.name}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      
                                      <Button
                                        onClick={() => {
                                          if (evidenceFiles.length === 0) {
                                            toast.error("Selecciona al menos una imagen");
                                            return;
                                          }
                                          replaceEvidenceMutation.mutate({ 
                                            invoiceId: invoice.id, 
                                            files: evidenceFiles,
                                            oldUrls: invoice.delivery_evidence_url || []
                                          });
                                        }}
                                        disabled={evidenceFiles.length === 0 || replaceEvidenceMutation.isPending}
                                        className="w-full"
                                      >
                                        {replaceEvidenceMutation.isPending 
                                          ? "Reemplazando..." 
                                          : `Reemplazar con ${evidenceFiles.length} Imagen(es)`
                                        }
                                      </Button>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </>
                          )}
                          
                          {isAdmin && (invoice.evidence_status === 'pending' || invoice.evidence_status === 'approved') && (
                            <>
                              {invoice.evidence_status === 'pending' && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 text-success hover:bg-success/10"
                                        onClick={() => approveEvidenceMutation.mutate(invoice)}
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Aprobar evidencia</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => {
                                        const reason = prompt("Razón del rechazo:");
                                        if (reason) {
                                          rejectEvidenceMutation.mutate({ invoice, reason });
                                        }
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{invoice.evidence_status === 'approved' ? 'Rechazar evidencia aprobada' : 'Rechazar evidencia'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          )}
                        </>
                      )}

                      {!isAdmin && invoice.evidence_status !== 'rejected' && (
                        <Dialog 
                          open={uploadingEvidence === invoice.id} 
                          onOpenChange={(open) => {
                            setUploadingEvidence(open ? invoice.id : null);
                            if (!open) setEvidenceFiles([]);
                          }}
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <Truck className="h-3.5 w-3.5" />
                                  </Button>
                                </DialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) && invoice.delivery_evidence_url.length > 0 
                                    ? `Actualizar evidencia de entrega (${invoice.delivery_evidence_url.length}/4)` 
                                    : "Subir evidencia de entrega"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Evidencia de Entrega</DialogTitle>
                              <DialogDescription>
                                {invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) && invoice.delivery_evidence_url.length > 0
                                  ? `Puedes subir hasta ${4 - invoice.delivery_evidence_url.length} imagen(es) más (máximo 4 en total)`
                                  : "Sube hasta 4 imágenes como evidencia de entrega para esta factura"
                                }
                              </DialogDescription>
                            </DialogHeader>
                            
                            {currentEvidenceUrls.length > 0 && (
                              <div className="mb-4">
                                <p className="text-sm text-muted-foreground mb-2">
                                  Evidencias actuales ({currentEvidenceUrls.length}):
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  {currentEvidenceUrls.map((url, index) => (
                                    <img 
                                      key={index}
                                      src={url} 
                                      alt={`Evidencia de entrega ${index + 1}`}
                                      className="w-full h-auto rounded-lg border max-h-32 object-contain"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="evidence-files">
                                  Seleccionar imágenes (hasta {4 - (invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) ? invoice.delivery_evidence_url.length : 0)})
                                </Label>
                                <Input
                                  id="evidence-files"
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    const currentCount = invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) 
                                      ? invoice.delivery_evidence_url.length 
                                      : 0;
                                    const maxAllowed = 4 - currentCount;
                                    
                                    if (files.length > maxAllowed) {
                                      toast.error(`Solo puedes subir ${maxAllowed} imagen(es) más`);
                                      e.target.value = '';
                                      return;
                                    }
                                    
                                    setEvidenceFiles(files);
                                  }}
                                  className="mt-2"
                                />
                                {evidenceFiles.length > 0 && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {evidenceFiles.length} archivo(s) seleccionado(s)
                                  </p>
                                )}
                              </div>
                              
                              <Button
                                onClick={() => handleEvidenceUpload(
                                  invoice.id, 
                                  invoice.delivery_evidence_url && Array.isArray(invoice.delivery_evidence_url) 
                                    ? invoice.delivery_evidence_url 
                                    : []
                                )}
                                disabled={evidenceFiles.length === 0 || uploadEvidenceMutation.isPending}
                                className="w-full"
                              >
                                {uploadEvidenceMutation.isPending 
                                  ? "Subiendo..." 
                                  : `Subir ${evidenceFiles.length} Imagen(es)`
                                }
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}

                      {isAdmin && (
                        <Select
                          value={invoice.comprobante_pago_url ? "pagado" : invoice.status}
                          onValueChange={(value: any) => {
                            // Si es rechazado, solicitar razón
                            if (value === "rechazado") {
                              const reason = prompt("Razón del rechazo de la factura:");
                              if (reason) {
                                updateStatusMutation.mutate({ 
                                  invoice, 
                                  status: value,
                                  rejectionReason: reason
                                });
                              }
                            } else {
                              updateStatusMutation.mutate({ invoice, status: value });
                            }
                          }}
                          disabled={!!invoice.comprobante_pago_url}
                        >
                          <SelectTrigger className="w-32" disabled={!!invoice.comprobante_pago_url}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="procesando">Procesando</SelectItem>
                            <SelectItem value="pagado">Pagado</SelectItem>
                            <SelectItem value="rechazado">Rechazado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      
                      {isAdmin && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setInvoiceToDelete(invoice.id);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Eliminar factura</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay facturas disponibles
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <InvoiceDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        invoice={selectedInvoice}
        items={invoiceItems}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La factura y todos sus artículos asociados serán eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (invoiceToDelete) {
                  deleteMutation.mutate(invoiceToDelete);
                  setDeleteDialogOpen(false);
                  setInvoiceToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={complementoDialogOpen} onOpenChange={setComplementoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adjuntar Complemento de Pago</AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona el archivo del complemento de pago (PDF, JPG o PNG)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setComplementoFile(e.target.files?.[0] || null)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setComplementoFile(null);
              setInvoiceForComplemento(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (invoiceForComplemento && complementoFile) {
                  uploadComplementoMutation.mutate({
                    invoiceId: invoiceForComplemento,
                    file: complementoFile,
                  });
                }
              }}
              disabled={!complementoFile}
            >
              Adjuntar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectionReasonDialog.open} onOpenChange={(open) => setRejectionReasonDialog({ open, reason: '', type: 'evidence' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <X className="h-5 w-5" />
              {rejectionReasonDialog.type === 'invoice' 
                ? 'Motivo del Rechazo de Factura'
                : 'Motivo del Rechazo de Evidencia'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base pt-4">
              {rejectionReasonDialog.reason}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRejectionReasonDialog({ open: false, reason: '', type: 'evidence' })}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Invoices;