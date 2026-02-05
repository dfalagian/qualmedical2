import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SalesInvoiceUploadProps {
  onSuccess?: () => void;
}

interface UploadResult {
  fileName: string;
  status: "pending" | "uploading" | "success" | "error" | "duplicate";
  message?: string;
  folio?: string;
}

const parseXmlContent = (xmlContent: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  // Check for XML parsing errors
  const parseError = xmlDoc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    throw new Error("El archivo XML tiene un formato inválido");
  }

  // Helper function to find elements by local name (ignoring namespace prefix)
  const findElement = (doc: Document, localName: string): Element | null => {
    const prefixes = ["cfdi:", "tfd:", ""];
    for (const prefix of prefixes) {
      const elements = doc.getElementsByTagName(prefix + localName);
      if (elements.length > 0) return elements[0];
    }
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].localName === localName) {
        return allElements[i];
      }
    }
    return null;
  };

  // Helper function to find all elements by local name
  const findAllElements = (doc: Document, localName: string): Element[] => {
    const results: Element[] = [];
    const prefixes = ["cfdi:", "tfd:", ""];
    for (const prefix of prefixes) {
      const elements = doc.getElementsByTagName(prefix + localName);
      for (let i = 0; i < elements.length; i++) {
        results.push(elements[i]);
      }
      if (results.length > 0) return results;
    }
    const allElements = doc.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i].localName === localName) {
        results.push(allElements[i]);
      }
    }
    return results;
  };

  const comprobante = findElement(xmlDoc, "Comprobante");

  if (!comprobante) {
    throw new Error("No se encontró el elemento Comprobante en el XML. Verifica que sea un CFDI válido.");
  }

  const folio = comprobante.getAttribute("Folio") || "";
  const serie = comprobante.getAttribute("Serie") || "";
  const fecha = comprobante.getAttribute("Fecha") || "";
  const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
  const total = parseFloat(comprobante.getAttribute("Total") || "0");
  const moneda = comprobante.getAttribute("Moneda") || "MXN";

  if (total === 0 && subtotal === 0) {
    throw new Error("El XML no contiene información de montos válidos");
  }

  const timbre = findElement(xmlDoc, "TimbreFiscalDigital");
  const uuid = timbre?.getAttribute("UUID") || null;

  const emisor = findElement(xmlDoc, "Emisor");
  const emisorNombre = emisor?.getAttribute("Nombre") || "";
  const emisorRfc = emisor?.getAttribute("Rfc") || "";

  const receptor = findElement(xmlDoc, "Receptor");
  const receptorNombre = receptor?.getAttribute("Nombre") || "";
  const receptorRfc = receptor?.getAttribute("Rfc") || "";

  const conceptosElements = findAllElements(xmlDoc, "Concepto");
  const items = conceptosElements.map((concepto) => ({
    clave_prod_serv: concepto.getAttribute("ClaveProdServ") || "",
    clave_unidad: concepto.getAttribute("ClaveUnidad") || "",
    descripcion: concepto.getAttribute("Descripcion") || "",
    cantidad: parseFloat(concepto.getAttribute("Cantidad") || "0"),
    unidad: concepto.getAttribute("Unidad") || "",
    valor_unitario: parseFloat(concepto.getAttribute("ValorUnitario") || "0"),
    importe: parseFloat(concepto.getAttribute("Importe") || "0"),
    descuento: parseFloat(concepto.getAttribute("Descuento") || "0"),
  }));

  const generatedFolio = serie && folio 
    ? `${serie}-${folio}` 
    : folio || uuid?.substring(0, 8) || `SIN-FOLIO-${Date.now()}`;

  return {
    folio: generatedFolio,
    uuid,
    fecha_emision: fecha ? new Date(fecha).toISOString() : null,
    subtotal,
    total: total || subtotal,
    currency: moneda,
    emisor_nombre: emisorNombre,
    emisor_rfc: emisorRfc,
    receptor_nombre: receptorNombre,
    receptor_rfc: receptorRfc,
    items,
  };
};

export const SalesInvoiceUpload = ({ onSuccess }: SalesInvoiceUploadProps) => {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const resetState = () => {
    setXmlFiles([]);
    setUploadResults([]);
    setProgress(0);
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setXmlFiles(files);
    setUploadResults(files.map(f => ({ fileName: f.name, status: "pending" })));
  };

  const processFile = async (file: File, userId: string | undefined): Promise<UploadResult> => {
    try {
      const xmlContent = await file.text();
      const invoiceData = parseXmlContent(xmlContent);

      // Check for duplicate UUID
      if (invoiceData.uuid) {
        const { data: existing } = await supabase
          .from("sales_invoices")
          .select("folio")
          .eq("uuid", invoiceData.uuid)
          .maybeSingle();

        if (existing) {
          return {
            fileName: file.name,
            status: "duplicate",
            message: `Ya existe con folio: ${existing.folio}`,
            folio: invoiceData.folio,
          };
        }
      }

      // Upload XML file
      const xmlFileName = `sales/${Date.now()}-${file.name}`;
      const { error: xmlUploadError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, file);

      if (xmlUploadError) throw xmlUploadError;

      const { data: xmlUrlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(xmlFileName);

      // Insert into database
      const { error: insertError } = await supabase
        .from("sales_invoices")
        .insert({
          ...invoiceData,
          xml_url: xmlUrlData.publicUrl,
          pdf_url: null,
          created_by: userId,
        });

      if (insertError) throw insertError;

      return {
        fileName: file.name,
        status: "success",
        folio: invoiceData.folio,
        message: `Folio: ${invoiceData.folio}`,
      };
    } catch (error: any) {
      return {
        fileName: file.name,
        status: "error",
        message: error.message || "Error desconocido",
      };
    }
  };

  const handleUpload = async () => {
    if (xmlFiles.length === 0) {
      toast.error("Selecciona al menos un archivo XML");
      return;
    }

    setIsUploading(true);
    setProgress(0);

    const { data: { user } } = await supabase.auth.getUser();
    const results: UploadResult[] = [];

    for (let i = 0; i < xmlFiles.length; i++) {
      const file = xmlFiles[i];
      
      // Update status to uploading
      setUploadResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: "uploading" } : r
      ));

      const result = await processFile(file, user?.id);
      results.push(result);

      // Update with result
      setUploadResults(prev => prev.map((r, idx) => 
        idx === i ? result : r
      ));

      setProgress(((i + 1) / xmlFiles.length) * 100);
    }

    setIsUploading(false);

    const successCount = results.filter(r => r.status === "success").length;
    const duplicateCount = results.filter(r => r.status === "duplicate").length;
    const errorCount = results.filter(r => r.status === "error").length;

    if (successCount > 0) {
      toast.success(`${successCount} factura(s) subida(s) correctamente`);
      queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      onSuccess?.();
    }
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount} factura(s) duplicada(s)`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} factura(s) con error`);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetState();
    }
    setOpen(isOpen);
  };

  const getStatusIcon = (status: UploadResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "duplicate":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Subir Facturas de Venta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir Facturas de Venta (XML)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="xml-files">Archivos XML (puedes seleccionar varios)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="xml-files"
                type="file"
                accept=".xml"
                multiple
                onChange={handleFilesChange}
                className="cursor-pointer"
                disabled={isUploading}
              />
            </div>
            {xmlFiles.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {xmlFiles.length} archivo(s) seleccionado(s)
              </p>
            )}
          </div>

          {uploadResults.length > 0 && (
            <div className="space-y-2">
              <Label>Progreso de carga</Label>
              <Progress value={progress} className="h-2" />
              <ScrollArea className="h-48 rounded-md border p-2">
                <div className="space-y-2">
                  {uploadResults.map((result, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted/50"
                    >
                      {getStatusIcon(result.status)}
                      <span className="flex-1 truncate font-medium">
                        {result.fileName}
                      </span>
                      {result.message && (
                        <span className={`text-xs truncate max-w-[150px] ${
                          result.status === "error" ? "text-destructive" :
                          result.status === "duplicate" ? "text-amber-600" :
                          "text-muted-foreground"
                        }`}>
                          {result.message}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={xmlFiles.length === 0 || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando {Math.round(progress)}%...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Subir {xmlFiles.length > 0 ? `${xmlFiles.length} Factura(s)` : "Facturas"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};