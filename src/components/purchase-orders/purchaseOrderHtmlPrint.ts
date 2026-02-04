/**
 * Genera y abre la Orden de Compra usando HTML nativo + window.print()
 * Este patrón evita bloqueos de Chrome con blob: y data: URIs
 */

export interface PrintOrderItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  hasIva: boolean;
  ivaAmount: number;
  total: number;
}

export interface PrintOrderData {
  orderNumber: string;
  supplierName: string;
  supplierRfc?: string;
  createdAt: Date;
  items: PrintOrderItem[];
  subtotal: number;
  totalIva: number;
  total: number;
  description?: string;
}

export function openPurchaseOrderPrint(orderData: PrintOrderData): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("No se pudo abrir la ventana de impresión");
    return;
  }

  const fecha = orderData.createdAt.toLocaleDateString("es-MX");
  // Logo desde public folder
  const logoUrl = `${window.location.origin}/images/qualmedical-logo-oc.jpg`;

  const itemsHtml = orderData.items
    .map(
      (item, index) => `
      <tr>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${index + 1}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${item.sku}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${item.name}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">-</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.quantity}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">PZAS</td>
        <td style="text-align: right; border: 1px solid #ccc; padding: 6px;">$${item.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right; border: 1px solid #ccc; padding: 6px;">${item.hasIva ? `$${item.ivaAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "$0.00"}</td>
        <td style="text-align: right; border: 1px solid #ccc; padding: 6px;">$${item.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
      </tr>
    `
    )
    .join("");

  const printContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>OC-${orderData.orderNumber}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          color: #000;
          padding: 20px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 15px;
          border-bottom: 3px solid #008069;
          padding-bottom: 10px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo {
          width: 80px;
          height: auto;
        }
        .header-title {
          color: #008069;
        }
        .header-title h1 {
          font-size: 12px;
          font-weight: bold;
          margin-bottom: 2px;
          color: #333;
        }
        .header-title h2 {
          font-size: 20px;
          font-weight: bold;
          color: #008069;
        }
        .header-right {
          text-align: right;
          font-size: 11px;
        }
        .header-right .order-num {
          font-weight: bold;
          font-size: 12px;
        }
        .section {
          margin-bottom: 12px;
        }
        .section-header {
          background-color: #008069;
          color: white;
          padding: 5px 10px;
          font-weight: bold;
          font-size: 11px;
          margin-bottom: 8px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 3px 10px;
          font-size: 10px;
          padding-left: 5px;
        }
        .info-label {
          font-weight: bold;
        }
        .dates-row {
          display: flex;
          gap: 40px;
          margin-top: 5px;
        }
        .dates-row .info-grid {
          display: flex;
          gap: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 9px;
        }
        th {
          background-color: #008069;
          color: white;
          padding: 8px 5px;
          text-align: center;
          font-weight: bold;
          border: 1px solid #006050;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-top: 15px;
        }
        .totals-box {
          width: 220px;
          font-size: 10px;
          border: 1px solid #ccc;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 10px;
          border-bottom: 1px solid #ccc;
        }
        .totals-row:last-child {
          border-bottom: none;
        }
        .totals-row.total {
          font-weight: bold;
          font-size: 11px;
          background-color: #f5f5f5;
        }
        .signatures {
          display: flex;
          justify-content: space-around;
          margin-top: 50px;
          padding: 0 40px;
        }
        .signature-block {
          text-align: center;
          width: 220px;
        }
        .signature-name {
          font-weight: bold;
          font-size: 10px;
          margin-bottom: 25px;
        }
        .signature-line {
          border-top: 1px solid #333;
          margin-bottom: 5px;
        }
        .signature-label {
          font-weight: bold;
          font-size: 10px;
          margin-bottom: 3px;
        }
        .signature-sub {
          font-size: 9px;
          color: #666;
        }
        @media print {
          body {
            margin: 0;
            padding: 15px;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="Qual Medical" class="logo" />
          <div class="header-title">
            <h1>ORDEN DE COMPRA</h1>
            <h2>Qual Medical</h2>
          </div>
        </div>
        <div class="header-right">
          <div class="order-num">No. de Orden: ${orderData.orderNumber}</div>
          <div>Fecha: ${fecha}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">FACTURAR A:</div>
        <div class="info-grid">
          <span class="info-label">RAZON SOCIAL:</span>
          <span>QUAL MEDICAL</span>
          <span class="info-label">RFC:</span>
          <span>QME240321HF3</span>
          <span class="info-label">REGIMEN FISCAL:</span>
          <span>LEY DE PERSONAS MORALES</span>
          <span class="info-label">USO CFDI:</span>
          <span>ADQUISICION DE MERCANCIAS</span>
          <span class="info-label">DIRECCION:</span>
          <span>AV. PERIFERICO SUR 4225 INT. 4, JARDINES EN LA MONTAÑA, TLALPAN, CIUDAD DE MEXICO, C.P. 14210</span>
        </div>
      </div>

      <div class="section">
        <div class="section-header">PROVEEDOR</div>
        <div class="info-grid">
          <span class="info-label">EMPRESA:</span>
          <span>${orderData.supplierName.toUpperCase()}</span>
          ${orderData.supplierRfc ? `
          <span class="info-label">RFC:</span>
          <span>${orderData.supplierRfc}</span>
          ` : ""}
        </div>
        <div class="dates-row" style="margin-top: 8px; padding-left: 5px;">
          <div class="info-grid">
            <span class="info-label">FECHA REQUERIDA:</span>
            <span>${fecha}</span>
          </div>
          <div class="info-grid">
            <span class="info-label">FECHA ENTREGA:</span>
            <span>${fecha}</span>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">REQUISICIÓN</div>
        <table>
          <thead>
            <tr>
              <th style="width: 4%;">No.</th>
              <th style="width: 8%;">CAT</th>
              <th style="width: 32%;">DESCRIPCIÓN DEL PRODUCTO</th>
              <th style="width: 10%;">MARCA</th>
              <th style="width: 6%;">CANT</th>
              <th style="width: 8%;">UNIDAD</th>
              <th style="width: 12%;">PRECIO UNITARIO</th>
              <th style="width: 10%;">IVA</th>
              <th style="width: 10%;">IMPORTE</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <div class="totals-section">
        <div class="totals-box">
          <div class="totals-row">
            <span>SUBTOTAL:</span>
            <span>$${orderData.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row">
            <span>IMPUESTOS:</span>
            <span>$${orderData.totalIva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="totals-row total">
            <span>TOTAL:</span>
            <span>$${orderData.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <div class="signatures">
        <div class="signature-block">
          <div class="signature-name">ENF. ISMAEL REYES PEREZ</div>
          <div class="signature-line"></div>
          <div class="signature-label">SOLICITÓ</div>
          <div class="signature-sub">NOMBRE Y FIRMA</div>
        </div>
        <div class="signature-block">
          <div class="signature-name">LIC. L. FERNANDO SORROZA LOPEZ</div>
          <div class="signature-line"></div>
          <div class="signature-label">AUTORIZÓ</div>
          <div class="signature-sub">NOMBRE Y FIRMA</div>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          window.onafterprint = function() {
            window.close();
          };
        }
      <\/script>
    </body>
    </html>
  `;

  printWindow.document.write(printContent);
  printWindow.document.close();
}
