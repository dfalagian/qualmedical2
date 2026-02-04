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
import { Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface SalesInvoiceUploadProps {
  onSuccess?: () => void;
}

export const SalesInvoiceUpload = ({ onSuccess }: SalesInvoiceUploadProps) => {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const parseXmlContent = (xmlContent: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");

    // Get namespace
    const comprobante = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0] ||
      xmlDoc.getElementsByTagName("Comprobante")[0];

    if (!comprobante) {
      throw new Error("No se encontró el elemento Comprobante en el XML");
    }

    // Extract basic data
    const folio = comprobante.getAttribute("Folio") || "";
    const serie = comprobante.getAttribute("Serie") || "";
    const fecha = comprobante.getAttribute("Fecha") || "";
    const subtotal = parseFloat(comprobante.getAttribute("SubTotal") || "0");
    const total = parseFloat(comprobante.getAttribute("Total") || "0");
    const moneda = comprobante.getAttribute("Moneda") || "MXN";

    // Extract UUID from TimbreFiscalDigital
    const timbre = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] ||
      xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
    const uuid = timbre?.getAttribute("UUID") || null;

    // Extract emisor data
    const emisor = xmlDoc.getElementsByTagName("cfdi:Emisor")[0] ||
      xmlDoc.getElementsByTagName("Emisor")[0];
    const emisorNombre = emisor?.getAttribute("Nombre") || "";
    const emisorRfc = emisor?.getAttribute("Rfc") || "";

    // Extract receptor data
    const receptor = xmlDoc.getElementsByTagName("cfdi:Receptor")[0] ||
      xmlDoc.getElementsByTagName("Receptor")[0];
    const receptorNombre = receptor?.getAttribute("Nombre") || "";
    const receptorRfc = receptor?.getAttribute("Rfc") || "";

    return {
      folio: serie ? `${serie}-${folio}` : folio,
      uuid,
      fecha_emision: fecha ? new Date(fecha).toISOString() : null,
      subtotal,
      total,
      currency: moneda,
      emisor_nombre: emisorNombre,
      emisor_rfc: emisorRfc,
      receptor_nombre: receptorNombre,
      receptor_rfc: receptorRfc,
    };
  };

  const handleUpload = async () => {
    if (!xmlFile) {
      toast.error("Selecciona un archivo XML");
      return;
    }

    setIsUploading(true);

    try {
      // Read XML content
      const xmlContent = await xmlFile.text();
      const invoiceData = parseXmlContent(xmlContent);

      // Check for duplicate UUID
      if (invoiceData.uuid) {
        const { data: existing } = await supabase
          .from("sales_invoices")
          .select("folio")
          .eq("uuid", invoiceData.uuid)
          .maybeSingle();

        if (existing) {
          toast.error(`Esta factura ya existe con folio: ${existing.folio}`);
          setIsUploading(false);
          return;
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Upload XML file
      const xmlFileName = `sales/${Date.now()}-${xmlFile.name}`;
      const { error: xmlUploadError } = await supabase.storage
        .from("invoices")
        .upload(xmlFileName, xmlFile);

      if (xmlUploadError) throw xmlUploadError;

      const { data: xmlUrlData } = supabase.storage
        .from("invoices")
        .getPublicUrl(xmlFileName);

      let pdfUrl = null;

      // Upload PDF if provided
      if (pdfFile) {
        const pdfFileName = `sales/${Date.now()}-${pdfFile.name}`;
        const { error: pdfUploadError } = await supabase.storage
          .from("invoices")
          .upload(pdfFileName, pdfFile);

        if (pdfUploadError) throw pdfUploadError;

        const { data: pdfUrlData } = supabase.storage
          .from("invoices")
          .getPublicUrl(pdfFileName);
        pdfUrl = pdfUrlData.publicUrl;
      }

      // Insert into database
      const { error: insertError } = await supabase
        .from("sales_invoices")
        .insert({
          ...invoiceData,
          xml_url: xmlUrlData.publicUrl,
          pdf_url: pdfUrl,
          created_by: user?.id,
        });

      if (insertError) throw insertError;

      toast.success("Factura de venta subida correctamente");
      queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      setOpen(false);
      setXmlFile(null);
      setPdfFile(null);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error uploading sales invoice:", error);
      toast.error(error.message || "Error al subir la factura");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Subir Factura de Venta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir Factura de Venta (XML)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="xml-file">Archivo XML (obligatorio)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="xml-file"
                type="file"
                accept=".xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              {xmlFile && (
                <FileText className="h-5 w-5 text-green-600 shrink-0" />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf-file">Archivo PDF (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="pdf-file"
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              {pdfFile && (
                <FileText className="h-5 w-5 text-green-600 shrink-0" />
              )}
            </div>
          </div>

          <Button
            onClick={handleUpload}
            disabled={!xmlFile || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Subir Factura
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
