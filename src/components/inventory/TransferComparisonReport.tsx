import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface ComparisonItem {
  product: string;
  excelBatch: string;
  excelExpiry: string;
  excelQty: string;
  systemBatch: string;
  systemExpiry: string;
  systemQty: string;
  match: boolean;
  notes: string;
}

const comparisonData: ComparisonItem[] = [
  { product: "FLUOROURACILO 500 MG / 10 ML SOL. INY.", excelBatch: "4KE013A", excelExpiry: "OCT-2026", excelQty: "40", systemBatch: "4KE013A", systemExpiry: "OCT-2026", systemQty: "40", match: true, notes: "" },
  { product: "CARBOPLATINO 450 MG / 45 ML SOL. INY.", excelBatch: "M2405198", excelExpiry: "MAY-2026", excelQty: "4", systemBatch: "M2404688", systemExpiry: "ABR-2026", systemQty: "4", match: false, notes: "Lote diferente. Excel: M2405198 vs Sistema: M2404688" },
  { product: "PACLITAXEL 300 MG / 50 ML SOL. INY.", excelBatch: "5GE005A", excelExpiry: "JUL-2027", excelQty: "4", systemBatch: "5GE005A", systemExpiry: "JUL-2027", systemQty: "4", match: true, notes: "" },
  { product: "OXALIPLATINO 100 MG / 20 ML SOL. INY. (2 pzas)", excelBatch: "M2407688", excelExpiry: "JUN-2026", excelQty: "2", systemBatch: "M2407688", systemExpiry: "JUN-2026", systemQty: "2", match: true, notes: "" },
  { product: "OXALIPLATINO 100 MG / 20 ML SOL. INY. (1 pza)", excelBatch: "M2503692", excelExpiry: "MAR-2027", excelQty: "1", systemBatch: "M2407688", systemExpiry: "JUN-2026", systemQty: "1", match: false, notes: "El Excel indica lote M2503692 (Mar-27), pero en sistema se registró M2407688 (Jun-26)" },
  { product: "OXALIPLATINO 50 MG / 20 ML SOL. INY.", excelBatch: "M2406294", excelExpiry: "JUN-2026", excelQty: "3", systemBatch: "M2406294", systemExpiry: "JUN-2026", systemQty: "3", match: true, notes: "" },
  { product: "DOXORUBICINA 50 MG SOL. INY.", excelBatch: "2L24103", excelExpiry: "AGO-2026", excelQty: "4", systemBatch: "2L24103", systemExpiry: "AGO-2026", systemQty: "4", match: true, notes: "" },
  { product: "ONDANSETRON 8 MG / 4 ML SOL. INY.", excelBatch: "M2503459", excelExpiry: "MAR-2028", excelQty: "12", systemBatch: "M2503459", systemExpiry: "MAR-2028", systemQty: "12", match: true, notes: "" },
  { product: "DEXAMETASONA 8 MG / 2 ML SOL. INY.", excelBatch: "B25U201", excelExpiry: "JUL-2028", excelQty: "20", systemBatch: "B25J200", systemExpiry: "JUN-2028", systemQty: "20", match: false, notes: "Lote diferente. Excel: B25U201 vs Sistema: B25J200" },
  { product: "AGUJA HIPODÉRMICA 18G (lote 1 - 100 pzas)", excelBatch: "4353224", excelExpiry: "DIC-2029", excelQty: "100", systemBatch: "4149084", systemExpiry: "MAY-2029", systemQty: "100", match: false, notes: "Lote diferente. Excel: 4353224 vs Sistema: 4149084" },
  { product: "AGUJA HIPODÉRMICA 18G (lote 2 - 100 pzas)", excelBatch: "5031731", excelExpiry: "ENE-2030", excelQty: "100", systemBatch: "4149084", systemExpiry: "MAY-2029", systemQty: "100", match: false, notes: "Lote diferente. Excel: 5031731 vs Sistema: 4149084 (mismo lote repetido)" },
  { product: "JERINGA 20 ML S/AGUJA", excelBatch: "25C0304J", excelExpiry: "FEB-2030", excelQty: "50", systemBatch: "25C0304J", systemExpiry: "FEB-2030", systemQty: "50", match: true, notes: "" },
  { product: "CATÉTER INTRAVENOSO 22G", excelBatch: "241116D", excelExpiry: "OCT-2029", excelQty: "50", systemBatch: "240611D", systemExpiry: "MAY-2029", systemQty: "50", match: false, notes: "Lote diferente. Excel: 241116D vs Sistema: 240611D" },
  { product: "CATÉTER INTRAVENOSO 24G", excelBatch: "240918A", excelExpiry: "AGO-2028", excelQty: "50", systemBatch: "230801A", systemExpiry: "JUL-2028", systemQty: "50", match: false, notes: "Lote diferente. Excel: 240918A vs Sistema: 230801A" },
  { product: "GUANTE LATEX MEDIANO ESTÉRIL", excelBatch: "5023165", excelExpiry: "AGO-2030", excelQty: "200", systemBatch: "3023147", systemExpiry: "MAY-2028", systemQty: "200", match: false, notes: "Lote diferente. Excel: 5023165 vs Sistema: 3023147" },
  { product: "GUANTE NITRILO MEDIANO NO ESTÉRIL", excelBatch: "EG077C082", excelExpiry: "S/D", excelQty: "200", systemBatch: "EG006A062", systemExpiry: "FEB-2030", systemQty: "200", match: false, notes: "Lote diferente. Excel: EG077C082 vs Sistema: EG006A062" },
  { product: "TOALLITAS DE ALCOHOL INDIVIDUALES", excelBatch: "2000600038", excelExpiry: "MAY-2030", excelQty: "400", systemBatch: "—", systemExpiry: "—", systemQty: "—", match: false, notes: "Producto en Excel pero NO encontrado en registros de transferencia del sistema" },
  { product: "GASA ESTÉRIL 10x10 CM", excelBatch: "46003", excelExpiry: "NOV-2026", excelQty: "100", systemBatch: "46003", systemExpiry: "NOV-2026", systemQty: "100", match: true, notes: "" },
  { product: "JERINGA 10 ML C/AGUJA 21x32 MM", excelBatch: "25G0310J", excelExpiry: "JUN-2030", excelQty: "100", systemBatch: "25G0310J", systemExpiry: "JUN-2030", systemQty: "100", match: true, notes: "" },
  { product: "VINCRISTINA 1 MG SOL. INY.", excelBatch: "4HE016A", excelExpiry: "JUL-2026", excelQty: "6", systemBatch: "4HE016A", systemExpiry: "JUL-2026", systemQty: "6", match: true, notes: "" },
  { product: "ÁCIDO FOLÍNICO 50 MG / 4 ML SOL. INY.", excelBatch: "C25T119", excelExpiry: "OCT-2027", excelQty: "24", systemBatch: "C24U428", systemExpiry: "JUL-2026", systemQty: "24", match: false, notes: "Lote diferente. Excel: C25T119 (Oct-27) vs Sistema: C24U428 (Jul-26)" },
  { product: "PEGFILGRASTIM 6 MG (NEULAR / AMGEN)", excelBatch: "BI240011", excelExpiry: "AGO-2027", excelQty: "2", systemBatch: "BI240011", systemExpiry: "AGO-2027", systemQty: "2", match: true, notes: "" },
  { product: "PEGFILGRASTIM 6 MG (PEGSTIM / ZYDUS)", excelBatch: "B400182", excelExpiry: "FEB-2027", excelQty: "1", systemBatch: "B400182", systemExpiry: "FEB-2027", systemQty: "1", match: true, notes: "" },
];

function openComparisonReport() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const logoUrl = `${window.location.origin}/images/qualmedical-logo-oc.jpg`;
  const totalItems = comparisonData.length;
  const matchCount = comparisonData.filter(i => i.match).length;
  const mismatchCount = totalItems - matchCount;

  const rowsHtml = comparisonData.map((item, idx) => `
    <tr style="background: ${item.match ? '#f0fdf4' : '#fef2f2'};">
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px;">${idx + 1}</td>
      <td style="border:1px solid #ccc; padding:6px; font-size:10px; font-weight:bold;">${item.product}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px; font-family:monospace;">${item.excelBatch}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px;">${item.excelExpiry}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px;">${item.excelQty}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px; font-family:monospace; ${!item.match ? 'color:#dc2626; font-weight:bold;' : ''}">${item.systemBatch}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px; ${!item.match ? 'color:#dc2626;' : ''}">${item.systemExpiry}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:10px;">${item.systemQty}</td>
      <td style="text-align:center; border:1px solid #ccc; padding:6px; font-size:16px;">${item.match ? '✅' : '❌'}</td>
      <td style="border:1px solid #ccc; padding:6px; font-size:9px; color:#666; max-width:180px;">${item.notes}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Comparativo Transferencia 11-Feb-2026</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size:11px; color:#333; padding:20px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:10px; border-bottom:3px solid #0071a3; }
    .header-left { display:flex; align-items:center; gap:15px; }
    .logo { width:100px; height:auto; }
    .header-title h1 { font-size:14px; color:#0071a3; margin-bottom:2px; }
    .header-title h2 { font-size:11px; color:#666; font-weight:normal; }
    .header-right { text-align:right; }
    .header-right .date { font-size:13px; font-weight:bold; color:#0071a3; }
    .summary { display:flex; gap:15px; margin-bottom:20px; }
    .summary-card { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:12px; text-align:center; }
    .summary-card.ok { background:#f0fdf4; border-color:#86efac; }
    .summary-card.error { background:#fef2f2; border-color:#fca5a5; }
    .summary-card.info { background:#eff6ff; border-color:#93c5fd; }
    .summary-card .num { font-size:24px; font-weight:bold; }
    .summary-card.ok .num { color:#16a34a; }
    .summary-card.error .num { color:#dc2626; }
    .summary-card.info .num { color:#2563eb; }
    .summary-card .label { font-size:10px; color:#666; margin-top:2px; }
    .section-title { font-size:12px; font-weight:bold; color:#0071a3; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #ddd; }
    table { width:100%; border-collapse:collapse; margin-bottom:15px; }
    th { background-color:#0071a3; color:white; padding:7px 4px; text-align:center; font-size:9px; text-transform:uppercase; border:1px solid #005f8a; }
    .legend { margin-bottom:20px; padding:10px; border:1px solid #e5e7eb; border-radius:6px; background:#fafafa; font-size:10px; }
    .legend-title { font-weight:bold; margin-bottom:6px; }
    .legend-item { margin-bottom:3px; }
    .mismatch-detail { margin-bottom:20px; }
    .mismatch-detail h3 { font-size:11px; color:#dc2626; margin-bottom:8px; }
    .mismatch-item { padding:8px 12px; border-left:3px solid #dc2626; background:#fef2f2; margin-bottom:6px; border-radius:0 6px 6px 0; }
    .mismatch-item .product-name { font-weight:bold; font-size:10px; margin-bottom:3px; }
    .mismatch-item .detail { font-size:9px; color:#555; }
    .mismatch-item .detail span { font-family:monospace; font-weight:bold; }
    .signatures { display:flex; justify-content:space-around; margin-top:50px; }
    .signature-block { text-align:center; width:200px; }
    .signature-line { border-top:1px solid #333; margin-bottom:5px; margin-top:40px; }
    .signature-label { font-weight:bold; font-size:10px; }
    .signature-sub { font-size:9px; color:#666; }
    @media print { body { margin:0; padding:15px; } .no-print { display:none; } }
  </style>
</head>
<body>
  <h1 style="font-size:14px; color:#0071a3; margin-bottom:4px;">REPORTE COMPARATIVO DE TRANSFERENCIA</h1>
  <div style="font-size:11px; color:#666; margin-bottom:4px;">Remisión CITIO vs Registro en Sistema — 11/02/2026 — Almacén Principal → Almacén CITIO</div>
  <div style="font-size:9px; color:#888; margin-bottom:15px;">Generado: ${new Date().toLocaleDateString("es-MX")} ${new Date().toLocaleTimeString("es-MX", { hour: '2-digit', minute: '2-digit' })}</div>

  <div class="section-title">TABLA COMPARATIVA DETALLADA</div>
  <table>
    <thead>
      <tr>
        <th style="width:3%;">No.</th>
        <th style="width:18%;">PRODUCTO</th>
        <th colspan="3" style="background:#1e6f8e;">REMISIÓN (EXCEL)</th>
        <th colspan="3" style="background:#8b5e3c;">SISTEMA</th>
        <th style="width:4%;">OK</th>
        <th style="width:16%;">OBSERVACIONES</th>
      </tr>
      <tr>
        <th></th>
        <th></th>
        <th style="background:#1e6f8e;">LOTE</th>
        <th style="background:#1e6f8e;">CADUCIDAD</th>
        <th style="background:#1e6f8e;">CANT</th>
        <th style="background:#8b5e3c;">LOTE</th>
        <th style="background:#8b5e3c;">CADUCIDAD</th>
        <th style="background:#8b5e3c;">CANT</th>
        <th></th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="mismatch-detail">
    <h3>⚠️ DETALLE DE DISCREPANCIAS (${mismatchCount} partidas)</h3>
    ${comparisonData.filter(i => !i.match).map((item, idx) => `
      <div class="mismatch-item">
        <div class="product-name">${idx + 1}. ${item.product}</div>
        <div class="detail">
          Remisión: Lote <span>${item.excelBatch}</span> — Cad: ${item.excelExpiry} — Cant: ${item.excelQty}
        </div>
        <div class="detail">
          Sistema: Lote <span style="color:#dc2626;">${item.systemBatch}</span> — Cad: ${item.systemExpiry} — Cant: ${item.systemQty}
        </div>
        <div class="detail" style="margin-top:3px; font-style:italic; color:#888;">${item.notes}</div>
      </div>
    `).join("")}
  </div>


  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    }
  <\/script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

export default function TransferComparisonReportButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={openComparisonReport}
      className="gap-2"
    >
      <FileText className="h-4 w-4" />
      Comparativo Transferencia 11-Feb
    </Button>
  );
}
