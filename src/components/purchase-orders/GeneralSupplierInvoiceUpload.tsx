import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, CheckCircle2, XCircle, FileUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GeneralSupplierInvoiceUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
}

const parseInvoiceXml = (xmlContent: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  const parseError = xmlDoc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    throw new Error("XML mal formado");
  }

  const findElement = (doc: Document, localName: string): Element | null => {
    const prefixes = ["cfdi:", "tfd:", "pago20:", "pago10:", ""];
    for (const prefix of prefixes) {
      const elements = doc.getElementsByTagName(prefix + localName);
      if (elements.length > 0) return elements[0];
    }
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].localName === localName) return allElements[i];
    }
    return null;
  };

  const comprobante = findElement(xmlDoc, "Comprobante");
  if (!comprobante) throw new Error("No contiene elemento 'Comprobante'");

  const tipoComprobante = comprobante.getAttribute("TipoDeComprobante");
  if (tipoComprobante === "P") {
    throw new Error("Es un Complemento de Pago (tipo P), no una factura");
  }

  const folio = comprobante.getAttribute("Folio") || "";
  const serie = comprobante.getAttribute("Serie") || "";
  const fecha = comprobante.getAttribute("Fecha") || "";
  const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
  const total = parseFloat(comprobante.getAttribute("Total") || "0");
  const moneda = comprobante.getAttribute("Moneda") || "MXN";
  const formaPago = comprobante.getAttribute("FormaPago") || "";
  const metodoPago = comprobante.getAttribute("MetodoPago") || "";
  const lugarExpedicion = comprobante.getAttribute("LugarExpedicion") || "";
  const descuento = parseFloat(comprobante.getAttribute("Descuento") || "0");

  const timbre = findElement(xmlDoc, "TimbreFiscalDigital");
  const uuid = timbre?.getAttribute("UUID") || null;

  const emisor = findElement(xmlDoc, "Emisor");
  const emisorNombre = emisor?.getAttribute("Nombre") || "";
  const emisorRfc = emisor?.getAttribute("Rfc") || "";

  const receptor = findElement(xmlDoc, "Receptor");
  const receptorNombre = receptor?.getAttribute("Nombre") || "";
  const receptorRfc = receptor?.getAttribute("Rfc") || "";

  // Get total taxes from consolidated block
  const impuestos = findElement(xmlDoc, "Impuestos");
  const totalImpuestos = parseFloat(impuestos?.getAttribute("TotalImpuestosTrasladados") || "0");

  const generatedFolio = serie && folio
    ? `${serie}-${folio}`
    : folio || uuid?.substring(0, 8) || `SIN-FOLIO-${Date.now()}`;

  return {
    invoice_number: generatedFolio,
    uuid,
    fecha_emision: fecha ? new Date(fecha).toISOString() : null,
    subtotal,
    amount: total || subtotal,
    total_impuestos: totalImpuestos,
    descuento,
    currency: moneda,
    emisor_nombre: emisorNombre,
    emisor_rfc: emisorRfc,
    receptor_nombre: receptorNombre,
    receptor_rfc: receptorRfc,
    forma_pago: formaPago,
    metodo_pago: metodoPago,
    lugar_expedicion: lugarExpedicion,
  };
};

export const GeneralSupplierInvoiceUpload = ({
  open,
  onOpenChange,
  supplierId,
  supplierName,
}: GeneralSupplierInvoiceUploadProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setXmlFile(null);
    setPdfFile(null);
    setParsedData(null);
    setParseError(null);
    setIsUploading(false);
  };

  const handleXmlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXmlFile(file);
    setParseError(null);

    try {
      const content = await file.text();
      const data = parseInvoiceXml(content);
      setParsedData(data);
    } catch (err: any) {
      setParseError(err.message);
      setParsedData(null);
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPdfFile(file);
  };

  const handleUpload = async () => {
    if (!xmlFile || !parsedData || !user) return;
    setIsUploading(true);

    try {
      // Check duplicate UUID
      if (parsedData.uuid) {
        const { data: existing } = await supabase
          .from("general_supplier_invoices")
          .select("invoice_number")
          .eq("general_supplier_id", supplierId)
          .eq("uuid", parsedData.uuid)
          .maybeSingle();

        if (existing) {
          toast.error(`Ya existe una factura con este UUID: ${existing.invoice_number}`);
          setIsUploading(false);
          return;
        }
      }

      // Upload XML
      const xmlPath = `general-suppliers/${supplierId}/${Date.now()}_${xmlFile.name}`;
      const { error: xmlUploadError } = await supabase.storage
        .from("invoices")
        .upload(xmlPath, xmlFile, { contentType: "text/xml" });
      if (xmlUploadError) throw new Error("Error al subir XML: " + xmlUploadError.message);

      // Upload PDF if provided
      let pdfPath: string | null = null;
      if (pdfFile) {
        pdfPath = `general-suppliers/${supplierId}/${Date.now()}_${pdfFile.name}`;
        const { error: pdfUploadError } = await supabase.storage
          .from("invoices")
          .upload(pdfPath, pdfFile, { contentType: "application/pdf" });
        if (pdfUploadError) throw new Error("Error al subir PDF: " + pdfUploadError.message);
      }

      // Insert record
      const { error: insertError } = await supabase
        .from("general_supplier_invoices")
        .insert({
          general_supplier_id: supplierId,
          invoice_number: parsedData.invoice_number,
          uuid: parsedData.uuid,
          amount: parsedData.amount,
          subtotal: parsedData.subtotal,
          total_impuestos: parsedData.total_impuestos,
          descuento: parsedData.descuento,
          currency: parsedData.currency,
          fecha_emision: parsedData.fecha_emision,
          emisor_nombre: parsedData.emisor_nombre,
          emisor_rfc: parsedData.emisor_rfc,
          receptor_nombre: parsedData.receptor_nombre,
          receptor_rfc: parsedData.receptor_rfc,
          forma_pago: parsedData.forma_pago,
          metodo_pago: parsedData.metodo_pago,
          lugar_expedicion: parsedData.lugar_expedicion,
          xml_url: xmlPath,
          pdf_url: pdfPath,
          created_by: user.id,
        });

      if (insertError) throw insertError;

      toast.success(`Factura ${parsedData.invoice_number} cargada correctamente`);
      queryClient.invalidateQueries({ queryKey: ["general_supplier_invoices"] });
      resetState();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar factura");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Cargar Factura
          </DialogTitle>
          <DialogDescription>
            Sube la factura XML (y opcionalmente PDF) para <strong>{supplierName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* XML Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Archivo XML *</Label>
            <input
              ref={xmlInputRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={handleXmlChange}
            />
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-auto py-3"
              onClick={() => xmlInputRef.current?.click()}
            >
              {xmlFile ? (
                <>
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate text-sm">{xmlFile.name}</span>
                  {parsedData && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 ml-auto" />}
                  {parseError && <XCircle className="h-4 w-4 text-destructive shrink-0 ml-auto" />}
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-sm">Seleccionar archivo XML...</span>
                </>
              )}
            </Button>
            {parseError && (
              <p className="text-xs text-destructive">{parseError}</p>
            )}
          </div>

          {/* PDF Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Archivo PDF (opcional)</Label>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfChange}
            />
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-auto py-3"
              onClick={() => pdfInputRef.current?.click()}
            >
              {pdfFile ? (
                <>
                  <FileText className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="truncate text-sm">{pdfFile.name}</span>
                </>
              ) : (
                <>
                  <FileUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-sm">Seleccionar archivo PDF...</span>
                </>
              )}
            </Button>
          </div>

          {/* Parsed data preview */}
          {parsedData && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-sm font-medium">Datos extraídos del XML</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Folio:</span>
                <span className="font-medium">{parsedData.invoice_number}</span>
                <span className="text-muted-foreground">UUID:</span>
                <span className="font-mono truncate">{parsedData.uuid || "—"}</span>
                <span className="text-muted-foreground">Emisor:</span>
                <span className="truncate">{parsedData.emisor_nombre}</span>
                <span className="text-muted-foreground">RFC Emisor:</span>
                <span className="font-mono">{parsedData.emisor_rfc}</span>
                <span className="text-muted-foreground">Receptor:</span>
                <span className="truncate">{parsedData.receptor_nombre}</span>
                <span className="text-muted-foreground">Subtotal:</span>
                <span>${parsedData.subtotal?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold text-primary">
                  ${parsedData.amount?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-muted-foreground">Moneda:</span>
                <span>{parsedData.currency}</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!xmlFile || !parsedData || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Cargar Factura
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
