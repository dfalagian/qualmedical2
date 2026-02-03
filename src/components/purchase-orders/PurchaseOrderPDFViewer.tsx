import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (open && orderData) {
      generatePDF();
    }
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [open, orderData]);

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(0, 82, 147);
    doc.rect(0, 0, pageWidth, 35, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("QUAL MEDICAL", 14, 18);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("FARMA", 14, 26);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ORDEN DE COMPRA", pageWidth - 14, 18, { align: "right" });
    doc.setFontSize(12);
    doc.text(orderData.orderNumber, pageWidth - 14, 26, { align: "right" });

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Supplier info box
    doc.setFillColor(245, 245, 245);
    doc.rect(14, 42, pageWidth - 28, 30, "F");
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PROVEEDOR:", 18, 52);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.supplierName, 50, 52);

    if (orderData.supplierRfc) {
      doc.setFont("helvetica", "bold");
      doc.text("RFC:", 18, 60);
      doc.setFont("helvetica", "normal");
      doc.text(orderData.supplierRfc, 32, 60);
    }

    doc.setFont("helvetica", "bold");
    doc.text("FECHA:", 120, 52);
    doc.setFont("helvetica", "normal");
    doc.text(orderData.createdAt.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }), 140, 52);

    // Table
    const tableData = orderData.items.map((item) => [
      item.name,
      item.sku,
      item.quantity.toString(),
      `$${item.unitPrice.toFixed(2)}`,
      item.hasIva ? `$${item.ivaAmount.toFixed(2)}` : "$0.00",
      `$${item.total.toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: 80,
      head: [["DESCRIPCIÓN", "SKU", "CANT.", "P. UNIT.", "IVA", "TOTAL"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [0, 82, 147],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: "bold",
      },
      bodyStyles: {
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 30 },
        2: { cellWidth: 15, halign: "center" },
        3: { cellWidth: 25, halign: "right" },
        4: { cellWidth: 20, halign: "right" },
        5: { cellWidth: 25, halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    // Get the final Y position after table
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Totals box
    const totalsX = pageWidth - 80;
    doc.setFillColor(245, 245, 245);
    doc.rect(totalsX, finalY, 66, 35, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("SUBTOTAL:", totalsX + 5, finalY + 10);
    doc.text(`$${orderData.subtotal.toFixed(2)}`, totalsX + 61, finalY + 10, { align: "right" });

    doc.text("IVA (16%):", totalsX + 5, finalY + 18);
    doc.text(`$${orderData.totalIva.toFixed(2)}`, totalsX + 61, finalY + 18, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL:", totalsX + 5, finalY + 28);
    doc.text(`$${orderData.total.toFixed(2)}`, totalsX + 61, finalY + 28, { align: "right" });

    // Notes
    if (orderData.description) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("NOTAS:", 14, finalY + 10);
      doc.setFont("helvetica", "normal");
      doc.text(orderData.description, 14, finalY + 16, { maxWidth: 90 });
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Los precios de medicamentos están gravados a la tasa de 0% de IVA.", 14, footerY);
    doc.text("Los insumos médicos incluyen IVA del 16%.", 14, footerY + 5);

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
    if (pdfUrl) {
      const printWindow = window.open(pdfUrl);
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Orden de Compra: {orderData.orderNumber}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
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
              src={pdfUrl}
              className="w-full h-[70vh] border-0"
              title="Vista previa del PDF"
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
