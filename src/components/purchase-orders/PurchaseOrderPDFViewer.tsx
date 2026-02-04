import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

export const generateAndOpenPDF = (orderData: OrderData, targetWindow?: Window | null) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header with green background (QualMedical brand color)
  doc.setFillColor(0, 128, 105);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEN DE COMPRA", 14, 15);
  
  doc.setFontSize(16);
  doc.text("Qual Medical", 14, 26);
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("FARMA", 14, 33);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`No. de Orden: ${orderData.orderNumber}`, pageWidth - 14, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${orderData.createdAt.toLocaleDateString("es-MX")}`, pageWidth - 14, 28, { align: "right" });

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

  const finalY = (doc as any).lastAutoTable.finalY + 5;
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

  // Nota: `blob:` puede dar ERR_BLOCKED_BY_CLIENT (extensiones/filtros). Usamos Data URI.
  const dataUri = doc.output("datauristring") as unknown as string;

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OC-${orderData.orderNumber}</title>
    <style>
      html, body { height: 100%; margin: 0; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe src="${dataUri}" title="OC-${orderData.orderNumber}"></iframe>
  </body>
</html>`;

  const writeToWindow = (w: Window) => {
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      return true;
    } catch {
      return false;
    }
  };

  if (targetWindow && !targetWindow.closed) {
    if (writeToWindow(targetWindow)) return;
  }

  const w = window.open("about:blank", "_blank");
  if (w) {
    if (writeToWindow(w)) return;
  }

  // Último recurso: descargar
  doc.save(`OC-${orderData.orderNumber}.pdf`);
};

// Función para descargar el PDF
export const generateAndDownloadPDF = (orderData: OrderData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ... (misma lógica de generación)
  doc.setFillColor(0, 128, 105);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEN DE COMPRA", 14, 15);
  doc.setFontSize(16);
  doc.text("Qual Medical", 14, 26);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("FARMA", 14, 33);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`No. de Orden: ${orderData.orderNumber}`, pageWidth - 14, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${orderData.createdAt.toLocaleDateString("es-MX")}`, pageWidth - 14, 28, { align: "right" });
  doc.setTextColor(0, 0, 0);

  let currentY = 50;
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

  doc.setFillColor(0, 128, 105);
  doc.rect(14, currentY, pageWidth - 28, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("REQUISICIÓN", 16, currentY + 5);
  doc.setTextColor(0, 0, 0);
  currentY += 10;

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
    headStyles: { fillColor: [0, 128, 105], textColor: [255, 255, 255], fontSize: 7, fontStyle: "bold", halign: "center", valign: "middle" },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
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

  const finalY = (doc as any).lastAutoTable.finalY + 5;
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

  // Descargar directamente
  doc.save(`OC-${orderData.orderNumber}.pdf`);
};
