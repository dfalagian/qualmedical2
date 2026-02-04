import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

interface OrderItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  hasIva: boolean;
  ivaAmount: number;
  total: number;
}

interface OrderData {
  orderNumber: string;
  supplierName: string;
  supplierRfc?: string;
  createdAt: Date;
  items: OrderItem[];
  subtotal: number;
  totalIva: number;
  total: number;
  description?: string;
}

interface PurchaseOrderPDFViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderData: OrderData;
}

export const PurchaseOrderPDFViewer = ({
  open,
  onOpenChange,
  orderData,
}: PurchaseOrderPDFViewerProps) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (open && orderData) {
      setPdfLoaded(false);
      generatePDF();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, orderData, pdfUrl]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header with green background (QualMedical brand color)
    doc.setFillColor(0, 128, 105); // Teal/dark green from logo
    doc.rect(0, 0, pageWidth, 40, "F");

    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("ORDEN DE COMPRA", 14, 15);
    
    doc.setFontSize(16);
    doc.text("Qual Medical", 14, 26);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("FARMA", 14, 33);

    // Order number and date on the right
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`No. de Orden: ${orderData.orderNumber}`, pageWidth - 14, 20, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${orderData.createdAt.toLocaleDateString("es-MX")}`, pageWidth - 14, 28, { align: "right" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    let currentY = 50;

    // FACTURAR A section
    doc.setFillColor(0, 128, 105);
    doc.rect(14, currentY, pageWidth - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("FACTURAR A:", 16, currentY + 5);
    doc.setTextColor(0, 0, 0);
    
    currentY += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("RAZON SOCIAL:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text("QUAL MEDICAL FARMA S.A. DE C.V.", 50, currentY);
    
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("RFC:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text("QME240321HF3", 26, currentY);
    
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("REGIMEN FISCAL:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text("LEY DE PERSONAS MORALES", 50, currentY);
    
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("USO CFDI:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text("ADQUISICION DE MERCANCIAS", 38, currentY);

    currentY += 10;

    // PROVEEDOR section
    doc.setFillColor(0, 128, 105);
    doc.rect(14, currentY, pageWidth - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PROVEEDOR", 16, currentY + 5);
    doc.setTextColor(0, 0, 0);
    
    currentY += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("EMPRESA:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.supplierName.toUpperCase(), 38, currentY);
    
    if (orderData.supplierRfc) {
      currentY += 5;
      doc.setFont("helvetica", "bold");
      doc.text("RFC:", 14, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(orderData.supplierRfc, 26, currentY);
    }
    
    currentY += 5;
    doc.setFont("helvetica", "bold");
    doc.text("FECHA REQUERIDA:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.createdAt.toLocaleDateString("es-MX"), 55, currentY);
    
    doc.setFont("helvetica", "bold");
    doc.text("FECHA ENTREGA:", 100, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.createdAt.toLocaleDateString("es-MX"), 135, currentY);

    currentY += 12;

    // REQUISICION section
    doc.setFillColor(0, 128, 105);
    doc.rect(14, currentY, pageWidth - 28, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("REQUISICIÓN", 16, currentY + 5);
    doc.setTextColor(0, 0, 0);

    currentY += 10;

    // Table
    const tableData = orderData.items.map((item, index) => [
      (index + 1).toString(),
      item.sku,
      item.name,
      "-",
      item.quantity.toString(),
      "PZA",
      `$${item.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
      item.hasIva ? `$${item.ivaAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "$0.00",
      `$${item.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`,
      orderData.description || "",
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["No.", "CAT", "DESCRIPCIÓN DEL PRODUCTO", "MARCA", "CANT", "UNIDAD", "PRECIO UNITARIO", "IVA", "IMPORTE", "OBSERVACIONES"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: [0, 128, 105],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 20 },
        2: { cellWidth: 45 },
        3: { cellWidth: 15, halign: "center" },
        4: { cellWidth: 12, halign: "center" },
        5: { cellWidth: 15, halign: "center" },
        6: { cellWidth: 25, halign: "right" },
        7: { cellWidth: 18, halign: "right" },
        8: { cellWidth: 22, halign: "right" },
        9: { cellWidth: 20 },
      },
      margin: { left: 14, right: 14 },
    });

    // Get the final Y position after table
    const finalY = (doc as any).lastAutoTable.finalY + 5;

    // Totals aligned right
    const totalsX = pageWidth - 70;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("SUBTOTAL:", totalsX, finalY);
    doc.setFont("helvetica", "normal");
    doc.text(`$${orderData.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text("IMPUESTOS:", totalsX, finalY + 6);
    doc.setFont("helvetica", "normal");
    doc.text(`$${orderData.totalIva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 6, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL:", totalsX, finalY + 14);
    doc.text(`$${orderData.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, pageWidth - 14, finalY + 14, { align: "right" });

    // Signature section
    const sigY = finalY + 35;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("SOLICITÓ", 40, sigY, { align: "center" });
    doc.line(14, sigY + 2, 66, sigY + 2);
    
    doc.text("AUTORIZÓ", pageWidth - 40, sigY, { align: "center" });
    doc.line(pageWidth - 66, sigY + 2, pageWidth - 14, sigY + 2);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("NOMBRE Y FIRMA", 40, sigY + 8, { align: "center" });
    doc.text("NOMBRE Y FIRMA", pageWidth - 40, sigY + 8, { align: "center" });

    // Generate blob URL
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = `OC-${orderData.orderNumber}.pdf`;
      link.click();
    }
  };

  const handlePrint = () => {
    if (!pdfUrl || !pdfLoaded) return;

    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    // Importante: imprimir desde un iframe ya cargado mantiene el “user gesture”
    // y evita bloqueos por popups.
    win.focus();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Orden de Compra: {orderData.orderNumber}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={!pdfUrl || !pdfLoaded}>
                <Printer className="h-4 w-4 mr-1" />
                Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" />
                Descargar
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted rounded-lg">
          {pdfUrl ? (
            <iframe
              key={pdfUrl}
              ref={iframeRef}
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="Vista previa del PDF"
              onLoad={() => setPdfLoaded(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Generando PDF...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
