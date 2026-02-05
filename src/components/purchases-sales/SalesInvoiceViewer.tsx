import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, ExternalLink, Calendar, Building2, Receipt } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PdfInlineViewer } from "@/components/pdf/PdfInlineViewer";

interface SalesInvoice {
  id: string;
  folio: string;
  uuid: string | null;
  fecha_emision: string | null;
  subtotal: number | null;
  total: number;
  currency: string | null;
  emisor_nombre: string | null;
  emisor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_rfc: string | null;
  xml_url: string;
  pdf_url: string | null;
  created_at: string;
}

interface SalesInvoiceViewerProps {
  invoice: SalesInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SalesInvoiceViewer = ({
  invoice,
  open,
  onOpenChange,
}: SalesInvoiceViewerProps) => {
  const [activeTab, setActiveTab] = useState<"details" | "pdf" | "xml">("details");

  if (!invoice) return null;

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: invoice.currency || "MXN",
    }).format(amount);
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Factura de Venta: {invoice.folio}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="pdf" disabled={!invoice.pdf_url}>
              PDF
            </TabsTrigger>
            <TabsTrigger value="xml">XML</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto mt-4">
            <div className="space-y-6">
              {/* UUID */}
              {invoice.uuid && (
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">UUID Fiscal</p>
                  <p className="font-mono text-sm break-all">{invoice.uuid}</p>
                </div>
              )}

              {/* Emisor y Receptor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-primary" />
                    <h4 className="font-semibold">Emisor (Nosotros)</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nombre: </span>
                      <span className="font-medium">{invoice.emisor_nombre || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">RFC: </span>
                      <span className="font-mono">{invoice.emisor_rfc || "-"}</span>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-green-600" />
                    <h4 className="font-semibold">Receptor (Cliente)</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nombre: </span>
                      <span className="font-medium">{invoice.receptor_nombre || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">RFC: </span>
                      <span className="font-mono">{invoice.receptor_rfc || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3">Montos</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="text-lg font-semibold">{formatCurrency(invoice.subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(invoice.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Moneda</p>
                    <Badge variant="outline">{invoice.currency || "MXN"}</Badge>
                  </div>
                </div>
              </div>

              {/* Fechas */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3">Fechas</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha de Emisión</p>
                      <p className="font-medium">
                        {invoice.fecha_emision
                          ? format(new Date(invoice.fecha_emision), "dd MMMM yyyy", { locale: es })
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Fecha de Registro</p>
                      <p className="font-medium">
                        {format(new Date(invoice.created_at), "dd MMMM yyyy", { locale: es })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(invoice.xml_url, `${invoice.folio}.xml`)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Descargar XML
                </Button>
                {invoice.pdf_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(invoice.pdf_url!, `${invoice.folio}.pdf`)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descargar PDF
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(invoice.xml_url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir XML
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pdf" className="flex-1 overflow-hidden mt-4">
            {invoice.pdf_url ? (
              <div className="h-[60vh] border rounded-lg overflow-hidden">
                <PdfInlineViewer url={invoice.pdf_url} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p>No hay PDF disponible para esta factura</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="xml" className="flex-1 overflow-hidden mt-4">
            <div className="h-[60vh] border rounded-lg overflow-hidden">
              <iframe
                src={invoice.xml_url}
                className="w-full h-full"
                title="XML Viewer"
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
