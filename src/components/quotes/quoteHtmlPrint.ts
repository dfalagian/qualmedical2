import { format } from "date-fns";
import { es } from "date-fns/locale";

interface QuoteItem {
  nombre_producto: string;
  marca: string;
  lote: string;
  fecha_caducidad: Date | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  categoria: string | null;
  is_sub_product?: boolean;
  parent_item_id?: string | null;
}

interface Client {
  nombre_cliente: string;
  razon_social: string | null;
  rfc: string | null;
  cfdi: string | null;
}

interface QuotePrintData {
  folio: string;
  concepto: string;
  fechaCotizacion: Date;
  fechaEntrega?: Date;
  facturaAnterior?: string;
  fechaFacturaAnterior?: Date;
  montoFacturaAnterior?: number;
  client: Client;
  items: QuoteItem[];
  subtotal: number;
  total: number;
  isRemision?: boolean;
}

export const printQuoteHtml = (data: QuotePrintData) => {
  const formatDate = (date: Date | undefined) => {
    if (!date) return "S/D";
    return format(date, "dd/MM/yyyy", { locale: es });
  };

  const formatDateLong = (date: Date | undefined) => {
    if (!date) return "S/D";
    return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  // Categories exempt from IVA (medications in Mexico)
  const EXEMPT_CATEGORIES = ["medicamentos", "inmunoterapia", "oncologicos"];
  
  // Check if an item is exempt from IVA
  const isExemptFromIva = (categoria: string | null): boolean => {
    if (!categoria) return false;
    return EXEMPT_CATEGORIES.includes(categoria.toLowerCase());
  };

  // Calculate IVA only for non-exempt items (16% for items that apply)
  const itemsWithIva = data.items.map(item => ({
    ...item,
    exempt: isExemptFromIva(item.categoria),
    ivaAmount: isExemptFromIva(item.categoria) ? 0 : item.importe * 0.16,
  }));

  const subtotalExento = itemsWithIva.filter(i => i.exempt).reduce((sum, i) => sum + i.importe, 0);
  const subtotalGravado = itemsWithIva.filter(i => !i.exempt).reduce((sum, i) => sum + i.importe, 0);
  const iva = subtotalGravado * 0.16;
  const totalConIva = data.subtotal + iva;

  // Group items by category (simplified - using just one category for now)
  const itemsHtml = itemsWithIva.map(item => {
    const isSubProduct = item.is_sub_product === true;
    const namePrefix = isSubProduct ? "↳ " : "";
    const nameStyle = isSubProduct
      ? "padding-left: 24px; color: #6b7280; font-style: italic;"
      : "";
    const rowStyle = isSubProduct
      ? "background-color: #f9fafb;"
      : "";

    return `
    <tr style="${rowStyle}">
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; ${nameStyle}">${namePrefix}${item.nombre_producto}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.marca || "-"}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.lote || "-"}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.fecha_caducidad ? format(item.fecha_caducidad, "MMM-yy", { locale: es }) : "-"}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.cantidad}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.precio_unitario)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.exempt ? "Exento" : formatCurrency(item.ivaAmount)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">${formatCurrency(item.importe + item.ivaAmount)}</td>
    </tr>
  `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cotización ${data.folio}</title>
      <style>
        @page { 
          size: letter; 
          margin: 15mm 10mm; 
        }
        body { 
          font-family: Arial, sans-serif; 
          font-size: 11px; 
          line-height: 1.4; 
          color: #1f2937; 
          margin: 0; 
          padding: 0;
        }
        .header { 
          display: flex; 
          justify-content: space-between; 
          align-items: flex-start; 
          margin-bottom: 10px;
          border-bottom: 3px solid #008069;
          padding-bottom: 10px;
        }
        .logo-section { 
          text-align: left; 
        }
        .logo-section h1 { 
          color: #008069; 
          font-size: 28px; 
          margin: 0; 
          font-weight: bold; 
        }
        .logo-section .rfc { 
          color: #008069; 
          font-size: 14px; 
          font-weight: bold; 
          margin-top: 2px;
        }
        .logo-img { 
          width: 120px; 
          height: auto; 
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 20px;
          margin-bottom: 15px;
          padding: 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
        }
        .info-item {
          font-size: 10px;
        }
        .info-label {
          font-weight: bold;
          color: #374151;
        }
        .products-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        .products-table th {
          background: #008069;
          color: white;
          padding: 8px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
        }
        .products-table th:nth-child(n+5) {
          text-align: center;
        }
        .products-table th:nth-child(n+6) {
          text-align: right;
        }
        .category-header {
          background: #d1d5db;
          font-weight: bold;
          padding: 4px 8px;
          font-size: 10px;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 20px;
        }
        .totals-box {
          text-align: right;
          min-width: 200px;
        }
        .totals-box .row {
          display: flex;
          justify-content: space-between;
          padding: 3px 0;
          font-size: 11px;
        }
        .totals-box .total-row {
          font-weight: bold;
          font-size: 13px;
          border-top: 2px solid #008069;
          padding-top: 5px;
          margin-top: 5px;
        }
        .footer-notes {
          font-size: 9px;
          color: #4b5563;
          border-top: 1px solid #e5e7eb;
          padding-top: 10px;
          line-height: 1.5;
        }
        .bank-info {
          margin-top: 10px;
          font-size: 9px;
        }
        .bank-info strong {
          color: #008069;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      ${data.isRemision ? `
      <div style="background: #f97316; color: white; text-align: center; padding: 10px; font-size: 18px; font-weight: bold; letter-spacing: 2px; margin-bottom: 10px;">
        REMISIÓN
      </div>
      ` : ''}
      <div class="header">
        <div class="logo-section">
          <h1>QUAL MEDICAL</h1>
          <div class="rfc">QME240321HF3</div>
        </div>
        <img src="/images/qualmedical-logo-oc.jpg" alt="Qual Medical" class="logo-img" />
      </div>

      <div class="info-grid">
        <div class="info-item"><span class="info-label">EMPRESA:</span> ${data.client.nombre_cliente}</div>
        <div class="info-item"><span class="info-label">FOLIO:</span> ${data.folio}</div>
        <div class="info-item"><span class="info-label">RAZON SOCIAL:</span> ${data.client.razon_social || "S/D"}</div>
        <div class="info-item"><span class="info-label">FECHA COTIZACION:</span> ${formatDate(data.fechaCotizacion)}</div>
        <div class="info-item"><span class="info-label">RFC:</span> ${data.client.rfc || "S/D"}</div>
        <div class="info-item"><span class="info-label">FACTURA ANTERIOR:</span> ${data.facturaAnterior || "S/D"}</div>
        <div class="info-item"><span class="info-label">CFDI:</span> ${data.client.cfdi || "S/D"}</div>
        <div class="info-item"><span class="info-label">FECHA ULTIMA FACTURA:</span> ${formatDate(data.fechaFacturaAnterior)}</div>
        <div class="info-item"><span class="info-label">CONCEPTO:</span> ${data.concepto || "S/D"}</div>
        <div class="info-item"><span class="info-label">MONTO ULTIMA FACTURA:</span> ${data.montoFacturaAnterior ? formatCurrency(data.montoFacturaAnterior) : "S/D"}</div>
        <div class="info-item"><span class="info-label">FECHA DE ENTREGA:</span> ${formatDateLong(data.fechaEntrega)}</div>
        <div class="info-item"></div>
      </div>

      <table class="products-table">
        <thead>
          <tr>
            <th style="width: 35%;">DESCRIPCION</th>
            <th style="width: 10%;">UNIDAD</th>
            <th style="width: 10%;">LOTE</th>
            <th style="width: 8%;">CAD.</th>
            <th style="width: 7%; text-align: center;">CANT.</th>
            <th style="width: 10%; text-align: right;">PRECIO UNITARIO</th>
            <th style="width: 8%; text-align: right;">IVA</th>
            <th style="width: 12%; text-align: right;">PRECIO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="8" class="category-header">INSUMOS</td>
          </tr>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="totals-box">
          <div class="row">
            <span>SUB TOTAL:</span>
            <span>${formatCurrency(data.subtotal)}</span>
          </div>
          <div class="row">
            <span>IMPUESTOS:</span>
            <span>${formatCurrency(iva)}</span>
          </div>
          <div class="row total-row">
            <span>TOTAL:</span>
            <span>${formatCurrency(totalConIva)}</span>
          </div>
        </div>
      </div>

      <div class="footer-notes">
        <p>Los precios ya incluyen IVA en los rubros de servicios e insumos médicos, los medicamentos están gravados a la tasa de 0% de dicho impuesto.</p>
        <p>La cotización incluye honorarios médicos, preparación, suministro y aplicación de infusión.</p>
        <div class="bank-info">
          <p>Los métodos de pago son: pago con terminal y transferencia electrónica:</p>
          <p><strong>BANCOMER:</strong></p>
          <p>QUAL MEDICAL</p>
          <p>CLABE: 012180001240306808</p>
          <p>CUENTA: 0124030680</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
};
