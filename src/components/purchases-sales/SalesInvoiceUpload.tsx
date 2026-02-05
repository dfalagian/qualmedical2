import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface SalesInvoiceUploadProps {
  onSuccess?: () => void;
}

interface UploadResult {
  fileName: string;
  status: "pending" | "uploading" | "success" | "error" | "duplicate";
  message?: string;
  folio?: string;
  errorDetail?: string;
}

const parseXmlContent = (xmlContent: string, fileName: string) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

  // Check for XML parsing errors
  const parseError = xmlDoc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    throw new Error(`XML mal formado - no se puede parsear`);
  }

  // Helper function to find elements by local name (ignoring namespace prefix)
  const findElement = (doc: Document, localName: string): Element | null => {
    const prefixes = ["cfdi:", "tfd:", "pago20:", "pago10:", ""];
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
    throw new Error(`No contiene elemento 'Comprobante' - no es un CFDI válido`);
  }

  // Check if it's a payment complement (tipo P)
  const tipoComprobante = comprobante.getAttribute("TipoDeComprobante");
  if (tipoComprobante === "P") {
    throw new Error(`Es un Complemento de Pago (tipo P), no una factura de ingreso`);
  }

  const folio = comprobante.getAttribute("Folio") || "";
  const serie = comprobante.getAttribute("Serie") || "";
  const fecha = comprobante.getAttribute("Fecha") || "";
  const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
  const total = parseFloat(comprobante.getAttribute("Total") || "0");
  const moneda = comprobante.getAttribute("Moneda") || "MXN";

  if (total === 0 && subtotal === 0) {
    throw new Error(`No tiene montos válidos (Total y SubTotal son 0)`);
  }

  const timbre = findElement(xmlDoc, "TimbreFiscalDigital");
  const uuid = timbre?.getAttribute("UUID") || null;

  if (!uuid) {
    throw new Error(`No tiene UUID (TimbreFiscalDigital) - factura no timbrada`);
  }

  const emisor = findElement(xmlDoc, "Emisor");
  const emisorNombre = emisor?.getAttribute("Nombre") || "";
  const emisorRfc = emisor?.getAttribute("Rfc") || "";

  if (!emisorRfc) {
    throw new Error(`No tiene RFC del emisor`);
  }

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
  const [showResults, setShowResults] = useState(false);
  const queryClient = useQueryClient();

  const resetState = () => {
    setXmlFiles([]);
    setUploadResults([]);
    setProgress(0);
    setShowResults(false);
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setXmlFiles(files);
    setUploadResults(files.map(f => ({ fileName: f.name, status: "pending" })));
    setShowResults(false);
  };

  const processFile = async (file: File, userId: string | undefined): Promise<UploadResult> => {
    try {
      const xmlContent = await file.text();
      const invoiceData = parseXmlContent(xmlContent, file.name);

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
            message: `Duplicada`,
            folio: invoiceData.folio,
            errorDetail: `Ya existe una factura con este UUID. Folio existente: ${existing.folio}`,
          };
        }
      }

      // Upload XML file
      const xmlFileName = `sales/${Date.now()}-${file.name}`;
      const { error: xmlUploadError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, file);

      if (xmlUploadError) {
        throw new Error(`Error al subir archivo: ${xmlUploadError.message}`);
      }

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

      if (insertError) {
        throw new Error(`Error en base de datos: ${insertError.message}`);
      }

      return {
        fileName: file.name,
        status: "success",
        folio: invoiceData.folio,
        message: invoiceData.folio,
      };
    } catch (error: any) {
      return {
        fileName: file.name,
        status: "error",
        message: "Error",
        errorDetail: error.message || "Error desconocido al procesar el archivo",
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
    setShowResults(false);

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
    setShowResults(true);

    const successCount = results.filter(r => r.status === "success").length;
    const duplicateCount = results.filter(r => r.status === "duplicate").length;
    const errorCount = results.filter(r => r.status === "error").length;

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      onSuccess?.();
    }

    if (successCount === results.length) {
      toast.success(`✓ ${successCount} facturas subidas correctamente`);
    } else {
      toast.info(`Procesadas: ${successCount} OK, ${duplicateCount} duplicadas, ${errorCount} con error`);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen && !isUploading) {
      resetState();
    }
    setOpen(isOpen);
  };

  const retryFailed = () => {
    const failedFiles = xmlFiles.filter((_, idx) => 
      uploadResults[idx]?.status === "error"
    );
    setXmlFiles(failedFiles);
    setUploadResults(failedFiles.map(f => ({ fileName: f.name, status: "pending" })));
    setShowResults(false);
    setProgress(0);
  };

  const getStatusIcon = (status: UploadResult["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "duplicate":
        return <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />;
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  const successResults = uploadResults.filter(r => r.status === "success");
  const errorResults = uploadResults.filter(r => r.status === "error");
  const duplicateResults = uploadResults.filter(r => r.status === "duplicate");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Subir Facturas de Venta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Subir Facturas de Venta (XML)</DialogTitle>
          <DialogDescription>
            Selecciona uno o varios archivos XML de facturas CFDI para cargar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label htmlFor="xml-files">Archivos XML</Label>
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
            {xmlFiles.length > 0 && !showResults && (
              <p className="text-sm text-muted-foreground">
                {xmlFiles.length} archivo(s) seleccionado(s)
              </p>
            )}
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Procesando archivos...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {showResults && uploadResults.length > 0 && (
            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
              {/* Summary badges */}
              <div className="flex gap-2 flex-wrap">
                {successResults.length > 0 && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {successResults.length} exitosas
                  </Badge>
                )}
                {errorResults.length > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    <XCircle className="h-3 w-3 mr-1" />
                    {errorResults.length} con error
                  </Badge>
                )}
                {duplicateResults.length > 0 && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {duplicateResults.length} duplicadas
                  </Badge>
                )}
              </div>

              {/* Detailed results */}
              <ScrollArea className="flex-1 rounded-md border">
                <Accordion type="multiple" className="w-full" defaultValue={["errors", "duplicates"]}>
                  {/* Errors section */}
                  {errorResults.length > 0 && (
                    <AccordionItem value="errors">
                      <AccordionTrigger className="px-3 py-2 hover:no-underline bg-red-50">
                        <div className="flex items-center gap-2 text-red-700">
                          <XCircle className="h-4 w-4" />
                          <span className="font-medium">{errorResults.length} archivos con error</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 py-2">
                        <div className="space-y-2">
                          {errorResults.map((result, idx) => (
                            <div key={idx} className="text-sm p-2 rounded bg-red-50/50 border border-red-100">
                              <div className="font-medium text-red-800 truncate">{result.fileName}</div>
                              <div className="text-red-600 text-xs mt-1">{result.errorDetail}</div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Duplicates section */}
                  {duplicateResults.length > 0 && (
                    <AccordionItem value="duplicates">
                      <AccordionTrigger className="px-3 py-2 hover:no-underline bg-amber-50">
                        <div className="flex items-center gap-2 text-amber-700">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium">{duplicateResults.length} facturas duplicadas</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 py-2">
                        <div className="space-y-2">
                          {duplicateResults.map((result, idx) => (
                            <div key={idx} className="text-sm p-2 rounded bg-amber-50/50 border border-amber-100">
                              <div className="font-medium text-amber-800 truncate">{result.fileName}</div>
                              <div className="text-amber-600 text-xs mt-1">{result.errorDetail}</div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Success section */}
                  {successResults.length > 0 && (
                    <AccordionItem value="success">
                      <AccordionTrigger className="px-3 py-2 hover:no-underline bg-green-50">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="font-medium">{successResults.length} facturas subidas</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 py-2">
                        <div className="space-y-1">
                          {successResults.map((result, idx) => (
                            <div key={idx} className="text-sm p-2 rounded bg-green-50/50 border border-green-100 flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              <span className="truncate text-green-800">{result.fileName}</span>
                              <span className="text-green-600 text-xs ml-auto">Folio: {result.folio}</span>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </ScrollArea>
            </div>
          )}

          <div className="flex gap-2">
            {showResults && errorResults.length > 0 && (
              <Button
                variant="outline"
                onClick={retryFailed}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar {errorResults.length} fallidas
              </Button>
            )}
            <Button
              onClick={handleUpload}
              disabled={xmlFiles.length === 0 || isUploading}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : showResults ? (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir más facturas
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Subir {xmlFiles.length > 0 ? `${xmlFiles.length} Factura(s)` : "Facturas"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
