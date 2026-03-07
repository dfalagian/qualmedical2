import { todayLocalStr } from "@/lib/formatters";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt, Upload, FileText, Download, DollarSign, Eye, Trash2, FileImage, Truck, X, Check, ChevronsUpDown, Layers, RotateCcw, History, RefreshCw, AlertTriangle, ShoppingCart } from "lucide-react";
import { SupplierActiveOCBanner } from "@/components/dashboard/SupplierActiveOCBanner";
import { PaymentProofsHistory } from "@/components/payments/PaymentProofsHistory";
import { ImageViewer } from "@/components/admin/ImageViewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InvoiceDetailsDialog } from "@/components/invoices/InvoiceDetailsDialog";
import { InvoicePaymentProofUpload } from "@/components/invoices/InvoicePaymentProofUpload";
import { PaymentComplementUpload } from "@/components/invoices/PaymentComplementUpload";
import { getSignedUrl } from "@/lib/storage";
import { formatSupplierName } from "@/lib/formatters";
import { calculateInvoiceTotal } from "@/lib/invoiceTotals";
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
  const [searchParams] = useSearchParams();
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
  const [paymentHistoryInvoice, setPaymentHistoryInvoice] = useState<any>(null);
  const [complementoToDelete, setComplementoToDelete] = useState<string | null>(null);
  
  // PO-Invoice reconciliation state
  const poFromUrl = searchParams.get("po");
  const [selectedPOId, setSelectedPOId] = useState<string | null>(poFromUrl);
  const [reconciliationWarnings, setReconciliationWarnings] = useState<string[]>([]);
  const [showReconciliationDialog, setShowReconciliationDialog] = useState(false);

  // Sync PO from URL param
  useEffect(() => {
    if (poFromUrl && poFromUrl !== selectedPOId) {
      setSelectedPOId(poFromUrl);
    }
  }, [poFromUrl]);

  // Ref para prevenir doble-clic/subidas simultáneas
  const uploadInProgressRef = useRef(false);

  // Mutation para eliminar complemento de pago
  const deleteComplementoMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ complemento_pago_url: null })
        .eq("id", invoiceId);
      
      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      toast.success("Complemento de pago eliminado correctamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setComplementoToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar el complemento");
    },
  });

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

  // Supplier's purchase orders for PO selection
  const { data: supplierPOs = [] } = useQuery({
    queryKey: ["supplier-pos-for-invoice", user?.id],
    enabled: !isAdmin && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, description, amount, currency, status, delivery_date")
        .eq("supplier_id", user!.id)
        .in("status", ["pendiente", "en_proceso"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch items of the selected PO
  const { data: selectedPOItems = [] } = useQuery({
    queryKey: ["po-items-for-reconciliation", selectedPOId],
    enabled: !!selectedPOId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, quantity_ordered, unit_price, products:product_id(name, sku)")
        .eq("purchase_order_id", selectedPOId!);
      if (error) throw error;
      return data || [];
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
      // Guard para prevenir doble-clic / subidas simultáneas
      if (uploadInProgressRef.current) {
        throw new Error("Ya hay una subida en proceso. Por favor espera.");
      }
      uploadInProgressRef.current = true;

      try {
        if (!pdfFile || !xmlFile || !user) {
          throw new Error("Los archivos PDF y XML son obligatorios");
        }

        // Validar que los archivos tengan contenido
        console.log('Validando archivos antes de subir:', {
          xmlName: xmlFile.name,
          xmlSize: xmlFile.size,
          xmlType: xmlFile.type,
          pdfName: pdfFile.name,
          pdfSize: pdfFile.size,
          pdfType: pdfFile.type
        });

        if (xmlFile.size === 0) {
          throw new Error("El archivo XML está vacío. Por favor, selecciona un archivo XML válido.");
        }

        if (pdfFile.size === 0) {
          throw new Error("El archivo PDF está vacío. Por favor, selecciona un archivo PDF válido.");
        }

        setIsUploading(true);

      // Upload PDF primero
      const pdfExt = pdfFile.name.split(".").pop();
      const pdfFileName = `${user.id}/invoices/${Date.now()}.${pdfExt}`;
      const { error: pdfError } = await supabase.storage
        .from("invoices")
        .upload(pdfFileName, pdfFile);

      if (pdfError) throw pdfError;

      // Pequeña pausa para asegurar nombres únicos
      await new Promise(resolve => setTimeout(resolve, 50));

      // Upload XML - leer el contenido como ArrayBuffer para asegurar que se suba correctamente
      const xmlExt = xmlFile.name.split(".").pop();
      const xmlFileName = `${user.id}/invoices/${Date.now()}.${xmlExt}`;
      
      // Leer el archivo XML como ArrayBuffer para evitar problemas de encoding
      const xmlArrayBuffer = await xmlFile.arrayBuffer();
      const xmlBlob = new Blob([xmlArrayBuffer], { type: 'text/xml' });
      
      console.log('Subiendo XML:', { 
        fileName: xmlFileName, 
        blobSize: xmlBlob.size,
        originalSize: xmlFile.size 
      });

      const { error: xmlError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, xmlBlob, {
          contentType: 'text/xml',
          cacheControl: '3600'
        });

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
      const invoiceUuid = validationData.uuid;
      const tipoComprobante = validationData.tipoComprobante as string | null | undefined;

      const looksLikePaymentCfdi =
        tipoComprobante === "P" ||
        (amount === 0 &&
          Array.isArray(validationData?.conceptos) &&
          validationData.conceptos.some((c: any) => c?.claveProdServ === "84111506"));

      if (looksLikePaymentCfdi) {
        throw new Error(
          'Este XML parece ser un CFDI de tipo P ("Pago"). Por definición puede venir con $0.00. Súbelo como “Complemento de pago”, no como “Factura”.'
        );
      }

      if (!invoiceNumber || (amount === null || amount === undefined)) {
        throw new Error('No se pudo extraer el número de factura o el monto del XML. Verifica que el archivo XML sea válido.');
      }


      // Verificar que no exista una factura con el mismo UUID (duplicado)
      if (invoiceUuid) {
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("uuid", invoiceUuid)
          .maybeSingle();

        if (existingInvoice) {
          throw new Error(`Esta factura ya fue subida anteriormente (Folio: ${existingInvoice.invoice_number}). No se permiten facturas duplicadas.`);
        }
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

      if (insertError) {
        // Detectar error de duplicado por restricción única
        if (insertError.code === '23505' && insertError.message?.includes('idx_invoices_supplier_uuid_unique')) {
          throw new Error(`Esta factura ya existe en tu perfil. No se permiten facturas duplicadas.`);
        }
        throw insertError;
      }

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
        return { requiereComplemento: true, mensaje: validationData.mensaje, conceptos: validationData.conceptos, amount: parseFloat(amount), totalImpuestos: validationData.totalImpuestos || 0 };
      }

      return { requiereComplemento: false, conceptos: validationData.conceptos, amount: parseFloat(amount), totalImpuestos: validationData.totalImpuestos || 0 };
      } finally {
        uploadInProgressRef.current = false;
      }
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

      // PO-Invoice reconciliation
      if (selectedPOId && selectedPOItems.length > 0 && data?.conceptos) {
        const warnings: string[] = [];
        const invoiceConceptos: any[] = data.conceptos || [];

        // Compare total amount — use subtotal + traslados - descuento (without retentions)
        // because PO amount represents pre-retention total and XML Total already deducts retentions
        const selectedPO = supplierPOs.find((po: any) => po.id === selectedPOId);
        if (selectedPO) {
          // Calculate invoice total before retentions: sum of all conceptos importe - descuento + traslados
          const invoiceSubtotal = invoiceConceptos.reduce((sum: number, c: any) => sum + (c.importe || 0), 0);
          const invoiceDescuento = invoiceConceptos.reduce((sum: number, c: any) => sum + (c.descuento || 0), 0);
          // Use the IVA/traslados from validationData if available
          const invoiceTotalImpuestosTrasladados = data?.totalImpuestos || 0;
          const invoiceTotalSinRetenciones = invoiceSubtotal - invoiceDescuento + invoiceTotalImpuestosTrasladados;
          
          const poAmount = selectedPO.amount || 0;
          const diff = Math.abs(poAmount - invoiceTotalSinRetenciones);
          if (diff > 1) { // tolerance of $1 for rounding
            warnings.push(
              `El monto total de la factura ($${invoiceTotalSinRetenciones.toLocaleString('es-MX', { minimumFractionDigits: 2 })}) no coincide con el de la OC ($${poAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}). Diferencia: $${diff.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
            );
          }
        }

        // Global optimal assignment with pharmaceutical stopwords filter
        const pharmaStopwords = new Set([
          "sol", "iny", "mg", "ml", "gr", "g", "pieza", "piezas", "h87",
          "tab", "cap", "amp", "fco", "cja", "env", "sobre", "susp",
          "100", "200", "300", "400", "500", "50", "10", "20", "25", "30", "45",
          "04", "06", "4", "1", "2", "3", "5", "6", "8", "16",
        ]);

        const normalizeStr = (s: string) =>
          s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

        const getMeaningfulTokens = (normalized: string): string[] => {
          const tokens = normalized.match(/[a-z]+/g) || [];
          return tokens.filter((t: string) => t.length > 3 && !pharmaStopwords.has(t));
        };

        const calcNameSimilarity = (normA: string, normB: string): number => {
          if (normB.includes(normA) || normA.includes(normB)) return 1;
          const tokensA = getMeaningfulTokens(normA);
          if (tokensA.length === 0) return 0;
          const matchCount = tokensA.filter((t: string) => normB.includes(t)).length;
          return matchCount / tokensA.length;
        };

        // Build full score matrix (PO items × invoice concepts)
        const poItemsList = selectedPOItems;
        const scoreMatrix: number[][] = poItemsList.map((poItem: any) => {
          const normProduct = normalizeStr(poItem.products?.name || "");
          const poPrice = poItem.unit_price || 0;
          const poQty = poItem.quantity_ordered;
          return invoiceConceptos.map((ic: any) => {
            const normDesc = normalizeStr(ic.descripcion || "");
            const nameScore = calcNameSimilarity(normProduct, normDesc);
            if (nameScore < 0.4) return -1;
            const icPrice = Number(ic.valorUnitario) || 0;
            const icQty = Number(ic.cantidad) || 0;
            let priceScore = 0;
            if (poPrice > 0 && icPrice > 0) {
              priceScore = Math.min(poPrice, icPrice) / Math.max(poPrice, icPrice);
            }
            let qtyScore = 0;
            if (poQty > 0 && icQty > 0) {
              qtyScore = Math.min(poQty, icQty) / Math.max(poQty, icQty);
            }
            return nameScore * 0.4 + priceScore * 0.4 + qtyScore * 0.2;
          });
        });

        // Greedy global assignment — pick highest score pairs first
        const allPairs: { po: number; inv: number; score: number }[] = [];
        for (let p = 0; p < poItemsList.length; p++) {
          for (let i = 0; i < invoiceConceptos.length; i++) {
            if (scoreMatrix[p][i] >= 0) {
              allPairs.push({ po: p, inv: i, score: scoreMatrix[p][i] });
            }
          }
        }
        allPairs.sort((a, b) => b.score - a.score);

        const assignedPO = new Set<number>();
        const assignedInv = new Set<number>();
        const poToInv = new Map<number, number>();

        for (const pair of allPairs) {
          if (assignedPO.has(pair.po) || assignedInv.has(pair.inv)) continue;
          assignedPO.add(pair.po);
          assignedInv.add(pair.inv);
          poToInv.set(pair.po, pair.inv);
        }

        // Compare matched items
        for (let p = 0; p < poItemsList.length; p++) {
          const poItem = poItemsList[p] as any;
          const productName = poItem.products?.name || '';
          const poQty = poItem.quantity_ordered;
          const poPrice = poItem.unit_price || 0;
          const matchedIdx = poToInv.get(p);

          if (matchedIdx === undefined) {
            warnings.push(
              `Producto "${productName}" de la OC (${poQty} uds) no encontrado en la factura.`
            );
          } else {
            const mc = invoiceConceptos[matchedIdx];
            const poTotal = poPrice * poQty;
            const invTotal = (mc.valorUnitario || 0) * (mc.cantidad || 0);
            const totalMatch = Math.abs(poTotal - invTotal) <= 1;

            if (mc.cantidad !== poQty && totalMatch) {
              // Same total but different qty/price — likely same product sold as pack vs individual
              warnings.push(
                `ℹ️ "${productName}": La OC indica ${poQty} uds a $${poPrice.toFixed(2)} c/u, la factura indica ${mc.cantidad} uds a $${Number(mc.valorUnitario).toFixed(2)} c/u. El importe total es equivalente ($${poTotal.toFixed(2)} vs $${invTotal.toFixed(2)}), posible diferencia de presentación o marca.`
              );
            } else {
              if (mc.cantidad !== poQty) {
                warnings.push(
                  `⚠️ "${productName}": Cantidad OC: ${poQty}, Factura: ${mc.cantidad}`
                );
              }
              if (poPrice > 0 && mc.valorUnitario) {
                const priceDiff = Math.abs(poPrice - mc.valorUnitario);
                if (priceDiff > 0.01) {
                  warnings.push(
                    `⚠️ "${productName}": Precio unitario OC: $${poPrice.toFixed(2)}, Factura: $${Number(mc.valorUnitario).toFixed(2)}`
                  );
                }
              }
            }
          }
        }

        // Check unmatched invoice concepts
        for (let i = 0; i < invoiceConceptos.length; i++) {
          if (!assignedInv.has(i)) {
            const concepto = invoiceConceptos[i];
            warnings.push(
              `Concepto de factura "${concepto.descripcion}" (${concepto.cantidad} uds, $${concepto.valorUnitario}) no encontrado en la OC.`
            );
          }
        }

        if (warnings.length > 0) {
          setReconciliationWarnings(warnings);
          setShowReconciliationDialog(true);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-pos-for-invoice"] });
      setPdfFile(null);
      setXmlFile(null);
      setSelectedPOId(null);
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
        const invoiceTotal = calculateInvoiceTotal(invoice);
        updates.payment_date = todayLocalStr();
        
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
              amount: invoiceTotal,
              original_amount: invoiceTotal,
              fecha_pago: todayLocalStr(),
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
      const invoiceTotalForEmail = calculateInvoiceTotal(invoice);
      let notificationData: any = {
        invoice_number: invoice.invoice_number,
        invoice_amount: invoiceTotalForEmail,
        invoice_date: invoice.fecha_emision
      };

      switch (status) {
        case "procesando":
          notificationType = 'invoice_status_processing';
          break;
        case "pagado":
          notificationType = 'invoice_status_paid';
          notificationData.payment_date = todayLocalStr();
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
      const invoiceTotal = calculateInvoiceTotal(invoice);
      // Actualizar el estado de la evidencia y cambiar estado de factura a "procesando" (Aprobada)
      const { error } = await supabase
        .from("invoices")
        .update({
          evidence_status: 'approved',
          evidence_reviewed_by: user!.id,
          evidence_reviewed_at: new Date().toISOString(),
          status: 'procesando' // Cambiar automáticamente a Aprobada cuando se aprueba la evidencia
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
              amount: invoiceTotal,
              original_amount: invoiceTotal,
              fecha_pago: todayLocalStr(),
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
            invoice_amount: invoiceTotal
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
      const invoiceTotal = calculateInvoiceTotal(invoice);
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
            invoice_amount: invoiceTotal,
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

  // Estado para reprocesar todas las facturas
  const [reprocessingAll, setReprocessingAll] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState({ current: 0, total: 0 });

  // Función para reprocesar una factura individual
  const reprocessSingleInvoice = async (invoice: any) => {
    const xmlUrl = invoice.xml_url;
    if (!xmlUrl) return null;

    let xmlPath: string;
    try {
      const urlPath = new URL(xmlUrl).pathname;
      const parts = urlPath.split('/');
      const invoicesIndex = parts.findIndex(p => p === 'invoices');
      if (invoicesIndex !== -1) {
        xmlPath = parts.slice(invoicesIndex + 1).join('/');
      } else {
        xmlPath = parts.slice(-3).join('/');
      }
    } catch {
      xmlPath = xmlUrl;
    }

    const { data: validationData, error: validationError } = await supabase.functions.invoke(
      'validate-invoice-xml',
      { body: { xmlPath } }
    );

    if (validationError || !validationData?.success) {
      console.error('Error reprocesando factura:', invoice.invoice_number);
      return null;
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        subtotal: validationData.subtotal,
        descuento: validationData.descuento || 0,
        total_impuestos: validationData.totalImpuestos || 0,
        impuestos_detalle: validationData.impuestosDetalle || {},
        updated_at: new Date().toISOString()
      })
      .eq("id", invoice.id);

    if (updateError) {
      console.error('Error actualizando factura:', invoice.invoice_number);
      return null;
    }

    return validationData;
  };

  // Función para reprocesar todas las facturas
  const handleReprocessAll = async () => {
    if (!invoices || invoices.length === 0) return;
    
    setReprocessingAll(true);
    setReprocessProgress({ current: 0, total: invoices.length });
    
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < invoices.length; i++) {
      setReprocessProgress({ current: i + 1, total: invoices.length });
      const result = await reprocessSingleInvoice(invoices[i]);
      if (result) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    setReprocessingAll(false);
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    
    if (errorCount === 0) {
      toast.success(`Se reprocesaron ${successCount} facturas correctamente`);
    } else {
      toast.warning(`Se reprocesaron ${successCount} facturas. ${errorCount} tuvieron errores.`);
    }
  };

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
        return <Badge className="bg-blue-500">Aprobada</Badge>;
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
          <>
            <SupplierActiveOCBanner onSelectPO={(poId) => {
              setSelectedPOId(poId);
              setReconciliationWarnings([]);
            }} />
            {(supplierProfile as any)?.approved ? (
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
                  {/* PO Selector */}
                  {supplierPOs.length > 0 && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Orden de Compra asociada
                      </Label>
                      <Select
                        value={selectedPOId || "none"}
                        onValueChange={(val) => {
                          setSelectedPOId(val === "none" ? null : val);
                          setReconciliationWarnings([]);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar orden de compra..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin orden de compra</SelectItem>
                          {supplierPOs.map((po: any) => (
                            <SelectItem key={po.id} value={po.id}>
                              {po.order_number} — ${po.amount?.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {po.currency || 'MXN'}
                              {po.description ? ` (${po.description})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedPOId && (
                        <p className="text-xs text-muted-foreground">
                          La factura se comparará automáticamente contra esta OC al subirse.
                        </p>
                      )}
                    </div>
                  )}

                  {!xmlFile && (
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <p className="text-sm text-primary font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Primero debe subir el archivo XML
                      </p>
                    </div>
                  )}
                  
                  {xmlFile && !pdfFile && (
                    <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                      <p className="text-sm text-success font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Ahora puede subir el archivo PDF
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="xmlFile">Archivo XML *</Label>
                      <Input
                        id="xmlFile"
                        type="file"
                        accept=".xml"
                        onChange={(e) => {
                          setXmlFile(e.target.files?.[0] || null);
                          setPdfFile(null);
                          setReconciliationWarnings([]);
                        }}
                        required
                      />
                      {xmlFile && (
                        <p className="text-xs text-success flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {xmlFile.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pdfFile" className={!xmlFile ? "text-muted-foreground" : ""}>
                        Archivo PDF *
                      </Label>
                      <Input
                        id="pdfFile"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                        disabled={!xmlFile}
                        required
                        className={!xmlFile ? "opacity-50 cursor-not-allowed" : ""}
                      />
                      {pdfFile && (
                        <p className="text-xs text-success flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {pdfFile.name}
                        </p>
                      )}
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
          </>
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
                        : (suppliers.find((s: any) => s.id === supplierFilter)?.company_name ||
                          suppliers.find((s: any) => s.id === supplierFilter)?.full_name ||
                          "Seleccionar proveedor").toUpperCase()}
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
                              {(supplier.company_name || supplier.full_name).toUpperCase()}
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
                          ${calculateInvoiceTotal(invoice).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {invoice.currency}
                        </span>
                        {invoice.payment_date ? (
                          <span className="text-success">
                            {new Date(invoice.payment_date).toLocaleDateString('es-MX')}
                          </span>
                        ) : invoice.fecha_emision ? (
                          <span>
                            {new Date(invoice.fecha_emision).toLocaleDateString('es-MX')}
                          </span>
                        ) : (
                          <span>
                            {new Date(invoice.created_at).toLocaleDateString('es-MX')}
                          </span>
                        )}
                      </div>
                      {isAdmin && invoice.profiles && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Proveedor: {formatSupplierName(invoice.profiles)}
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
                        <>
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
                          {isAdmin && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      setComplementoToDelete(invoice.id);
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Eliminar complemento de pago</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </>
                      )}

                      {/* Botón de historial de pagos */}
                      {invoice.pago_id && invoice.paid_amount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="h-8 w-8 border-green-500 text-green-600 hover:bg-green-50"
                                onClick={() => setPaymentHistoryInvoice(invoice)}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Ver historial de pagos</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      
                      {/* Mostrar botón de comprobante: admin siempre puede ver/subir, proveedor solo puede ver cuando hay comprobante */}
                      {(isAdmin || (!isAdmin && invoice.paid_amount > 0)) && (invoice.status === 'pagado' || invoice.status === 'procesando' || invoice.evidence_status === 'approved') && (
                        <InvoicePaymentProofUpload
                          invoiceId={invoice.id}
                          supplierId={invoice.supplier_id}
                          hasProof={!!invoice.comprobante_pago_url}
                          proofUrl={invoice.comprobante_pago_url}
                          invoiceAmount={calculateInvoiceTotal(invoice)}
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

                      {/* Botón de complementos de pago - visible para proveedores y admins cuando hay comprobantes */}
                      {invoice.pago_id && invoice.paid_amount > 0 && (
                        <PaymentComplementUpload
                          invoiceId={invoice.id}
                          supplierId={invoice.supplier_id}
                          invoiceNumber={invoice.invoice_number}
                          invoiceUUID={invoice.uuid}
                        />
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

      {/* Diálogo de historial de pagos */}
      <Dialog open={!!paymentHistoryInvoice} onOpenChange={(open) => !open && setPaymentHistoryInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-green-600" />
              Historial de Pagos
            </DialogTitle>
            <DialogDescription>
              Factura: {paymentHistoryInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          {paymentHistoryInvoice && (
            <div className="py-2">
              <PaymentProofsHistory
                pagoId={paymentHistoryInvoice.pago_id}
                invoiceAmount={calculateInvoiceTotal(paymentHistoryInvoice)}
                paidAmount={paymentHistoryInvoice.paid_amount || 0}
                status={paymentHistoryInvoice.pago_status || paymentHistoryInvoice.status}
                defaultOpen={true}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Diálogo para confirmar eliminación de complemento de pago */}
      <AlertDialog open={!!complementoToDelete} onOpenChange={(open) => !open && setComplementoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar complemento de pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el complemento de pago de esta factura permanentemente. El proveedor deberá subir uno nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => complementoToDelete && deleteComplementoMutation.mutate(complementoToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteComplementoMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de advertencias de reconciliación OC vs Factura */}
      <AlertDialog open={showReconciliationDialog} onOpenChange={setShowReconciliationDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Discrepancias entre OC y Factura
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-3">
                Se encontraron las siguientes diferencias entre la Orden de Compra y la factura subida:
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {reconciliationWarnings.map((warning, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground">{warning}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm font-medium">
                Por favor, corrija la factura o póngase en contacto con Administración de QualMedical para resolver las discrepancias.
              </p>
              <div
                onClick={() => window.open("https://wa.me/525647599227", "_blank", "noopener,noreferrer")}
                role="button"
                tabIndex={0}
                className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <div>
                  <p className="text-sm font-medium">Contactar a QualMedical</p>
                  <p className="text-xs text-muted-foreground">+52 56 4759 9227</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Invoices;