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

  const itemsHtml = orderData.items
    .map(
      (item, index) => `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td>${item.sku}</td>
        <td>${item.name}</td>
        <td style="text-align: center;">-</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: center;">PZA</td>
        <td style="text-align: right;">$${item.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
        <td style="text-align: right;">${item.hasIva ? `$${item.ivaAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}` : "$0.00"}</td>
        <td style="text-align: right;">$${item.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
        <td>${orderData.description || ""}</td>
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
          font-family: Helvetica, Arial, sans-serif;
          font-size: 9px;
          color: #000;
          padding: 10px 14px;
          line-height: 1.3;
        }
        .header {
          background-color: #008069;
          color: white;
          padding: 12px 14px;
          margin: -10px -14px 15px -14px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .header-left h1 {
          font-size: 11px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .header-left h2 {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .header-left p {
          font-size: 9px;
        }
        .header-right {
          text-align: right;
          font-size: 10px;
        }
        .header-right .order-num {
          font-weight: bold;
        }
        .section-header {
          background-color: #008069;
          color: white;
          padding: 4px 8px;
          font-weight: bold;
          font-size: 10px;
          margin: 10px 0 6px 0;
        }
        .info-row {
          display: flex;
          gap: 4px;
          margin-bottom: 3px;
          font-size: 9px;
        }
        .info-row strong {
          min-width: 100px;
        }
        .dates-row {
          display: flex;
          gap: 30px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 6px;
          font-size: 7px;
        }
        th {
          background-color: #008069;
          color: white;
          padding: 4px 3px;
          text-align: center;
          font-weight: bold;
          border: 1px solid #006050;
        }
        td {
          border: 1px solid #ddd;
          padding: 3px;
          vertical-align: top;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }
        .totals-box {
          width: 200px;
          font-size: 9px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
        }
        .totals-row.total {
          font-weight: bold;
          font-size: 10px;
          border-top: 1px solid #333;
          padding-top: 4px;
          margin-top: 4px;
        }
        .signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 40px;
          padding: 0 20px;
        }
        .signature-block {
          text-align: center;
          width: 200px;
        }
        .signature-line {
          border-top: 1px solid #333;
          margin-bottom: 4px;
        }
        .signature-label {
          font-weight: bold;
          font-size: 9px;
        }
        .signature-sub {
          font-size: 8px;
          color: #666;
        }
        @media print {
          body {
            margin: 0;
            padding: 10px 14px;
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
          <h1>ORDEN DE COMPRA</h1>
          <h2>Qual Medical</h2>
          <p>FARMA</p>
        </div>
        <div class="header-right">
          <div class="order-num">No. de Orden: ${orderData.orderNumber}</div>
          <div>Fecha: ${fecha}</div>
        </div>
      </div>

      <div class="section-header">FACTURAR A:</div>
      <div class="info-row"><strong>RAZON SOCIAL:</strong> QUAL MEDICAL FARMA S.A. DE C.V.</div>
      <div class="info-row"><strong>RFC:</strong> QME240321HF3</div>
      <div class="info-row"><strong>REGIMEN FISCAL:</strong> LEY DE PERSONAS MORALES</div>
      <div class="info-row"><strong>USO CFDI:</strong> ADQUISICION DE MERCANCIAS</div>

      <div class="section-header">PROVEEDOR</div>
      <div class="info-row"><strong>EMPRESA:</strong> ${orderData.supplierName.toUpperCase()}</div>
      ${orderData.supplierRfc ? `<div class="info-row"><strong>RFC:</strong> ${orderData.supplierRfc}</div>` : ""}
      <div class="dates-row">
        <div class="info-row"><strong>FECHA REQUERIDA:</strong> ${fecha}</div>
        <div class="info-row"><strong>FECHA ENTREGA:</strong> ${fecha}</div>
      </div>

      <div class="section-header">REQUISICIÓN</div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">No.</th>
            <th style="width: 10%;">CAT</th>
            <th style="width: 25%;">DESCRIPCIÓN DEL PRODUCTO</th>
            <th style="width: 8%;">MARCA</th>
            <th style="width: 6%;">CANT</th>
            <th style="width: 8%;">UNIDAD</th>
            <th style="width: 12%;">PRECIO UNITARIO</th>
            <th style="width: 8%;">IVA</th>
            <th style="width: 10%;">IMPORTE</th>
            <th style="width: 8%;">OBSERVACIONES</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

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
          <div class="signature-line"></div>
          <div class="signature-label">SOLICITÓ</div>
          <div class="signature-sub">NOMBRE Y FIRMA</div>
        </div>
        <div class="signature-block">
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
