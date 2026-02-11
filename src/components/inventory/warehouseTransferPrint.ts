import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface TransferPrintItem {
  index: number;
  productName: string;
  brand: string;
  batchNumber: string;
  expirationDate: string;
  quantity: number;
  unit: string;
  epc?: string;
  type: "rfid" | "manual";
}

export interface TransferPrintData {
  transferDate: Date;
  fromWarehouse: string;
  toWarehouse: string;
  items: TransferPrintItem[];
  notes?: string;
}

export function openWarehouseTransferPrint(data: TransferPrintData): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    console.error("No se pudo abrir la ventana de impresión");
    return;
  }

  const logoUrl = `${window.location.origin}/images/qualmedical-logo-oc.jpg`;
  const fecha = format(data.transferDate, "dd 'de' MMMM 'de' yyyy", { locale: es });
  const fechaCorta = format(data.transferDate, "dd/MM/yyyy");

  const totalItems = data.items.reduce((sum, i) => sum + i.quantity, 0);

  const itemsHtml = data.items
    .map(
      (item, idx) => `
      <tr>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${idx + 1}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${item.productName}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.brand || "—"}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.batchNumber || "—"}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.expirationDate || "—"}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.quantity}</td>
        <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${item.unit}</td>
        ${item.epc ? `<td style="text-align: center; border: 1px solid #ccc; padding: 6px; font-family: monospace; font-size: 9px;">${item.epc}</td>` : ""}
      </tr>`
    )
    .join("");

  const hasEpc = data.items.some((i) => i.epc);

  const printContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Transferencia entre Almacenes - ${fechaCorta}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          color: #333;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #0071a3;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        .logo {
          width: 120px;
          height: auto;
        }
        .header-title h1 {
          font-size: 16px;
          color: #0071a3;
          margin-bottom: 2px;
        }
        .header-title h2 {
          font-size: 12px;
          color: #666;
          font-weight: normal;
        }
        .header-right {
          text-align: right;
          font-size: 11px;
        }
        .header-right .date {
          font-size: 13px;
          font-weight: bold;
          color: #0071a3;
        }
        .warehouse-section {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }
        .warehouse-box {
          flex: 1;
          border: 1px solid #ccc;
          border-radius: 6px;
          padding: 12px 16px;
          background: #f9fafb;
        }
        .warehouse-box .label {
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .warehouse-box .name {
          font-size: 14px;
          font-weight: bold;
          color: #333;
        }
        .arrow-box {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #0071a3;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
        }
        th {
          background-color: #0071a3;
          color: white;
          padding: 8px 6px;
          text-align: center;
          font-size: 10px;
          text-transform: uppercase;
          border: 1px solid #005f8a;
        }
        td {
          font-size: 10px;
        }
        .section-title {
          font-size: 12px;
          font-weight: bold;
          color: #0071a3;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #ddd;
        }
        .summary-box {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 20px;
        }
        .summary-inner {
          border: 1px solid #ccc;
          border-radius: 6px;
          padding: 10px 20px;
          background: #f0f7fb;
          text-align: right;
        }
        .summary-inner .total-label {
          font-size: 10px;
          color: #666;
        }
        .summary-inner .total-value {
          font-size: 16px;
          font-weight: bold;
          color: #0071a3;
        }
        .notes-section {
          margin-bottom: 30px;
          padding: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: #fafafa;
          font-size: 10px;
          color: #555;
        }
        .notes-section .notes-label {
          font-weight: bold;
          margin-bottom: 4px;
        }
        .signatures {
          display: flex;
          justify-content: space-around;
          margin-top: 60px;
          padding-top: 10px;
        }
        .signature-block {
          text-align: center;
          width: 220px;
        }
        .signature-name {
          font-weight: bold;
          font-size: 11px;
          margin-bottom: 40px;
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
          body { margin: 0; padding: 15px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="Qual Medical" class="logo" />
          <div class="header-title">
            <h1>TRANSFERENCIA ENTRE ALMACENES</h1>
            <h2>Qual Medical</h2>
          </div>
        </div>
        <div class="header-right">
          <div class="date">${fechaCorta}</div>
          <div>${fecha}</div>
        </div>
      </div>

      <div class="warehouse-section">
        <div class="warehouse-box">
          <div class="label">Almacén Origen</div>
          <div class="name">${data.fromWarehouse}</div>
        </div>
        <div class="arrow-box">→</div>
        <div class="warehouse-box">
          <div class="label">Almacén Destino</div>
          <div class="name">${data.toWarehouse}</div>
        </div>
      </div>

      <div class="section-title">DETALLE DE PRODUCTOS TRANSFERIDOS</div>
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">No.</th>
            <th style="width: ${hasEpc ? '25%' : '35%'};">DESCRIPCIÓN</th>
            <th style="width: 12%;">MARCA</th>
            <th style="width: 12%;">LOTE</th>
            <th style="width: 12%;">CADUCIDAD</th>
            <th style="width: 8%;">CANT</th>
            <th style="width: 8%;">UNIDAD</th>
            ${hasEpc ? '<th style="width: 18%;">EPC</th>' : ""}
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="summary-box">
        <div class="summary-inner">
          <div class="total-label">Total de unidades transferidas</div>
          <div class="total-value">${totalItems}</div>
        </div>
      </div>

      ${data.notes ? `
      <div class="notes-section">
        <div class="notes-label">Observaciones:</div>
        <div>${data.notes}</div>
      </div>
      ` : ""}

      <div class="signatures">
        <div class="signature-block">
          <div class="signature-name">&nbsp;</div>
          <div class="signature-line"></div>
          <div class="signature-label">EMITE / ENTREGA</div>
          <div class="signature-sub">NOMBRE Y FIRMA</div>
        </div>
        <div class="signature-block">
          <div class="signature-name">&nbsp;</div>
          <div class="signature-line"></div>
          <div class="signature-label">RECIBE</div>
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
