// Helpers para exportar el resultado del generador de informes a PDF y Excel
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  format?: "currency" | "number" | "date";
}

export interface PivotMeta {
  row_key: string;
  row_label: string;
  column_keys: string[];
  value_label: string;
}

export interface ReportPayload {
  title: string;
  report_type: string;
  generated_at: string;
  filters_applied: Record<string, any>;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  total_rows: number;
  pivot_meta?: PivotMeta | null;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

const fmtNumber = (n: number) =>
  new Intl.NumberFormat("es-MX").format(Number(n) || 0);

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const formatCell = (val: any, col: ReportColumn): string => {
  if (val == null || val === "") return "";
  switch (col.format) {
    case "currency": return fmtCurrency(Number(val));
    case "number": return fmtNumber(Number(val));
    case "date": return fmtDate(String(val));
    default: return String(val);
  }
};

const filterSummary = (filters: Record<string, any>): string => {
  const parts: string[] = [];
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v == null || v === "" || (typeof v === "object" && !Object.keys(v).length)) return;
    parts.push(`${k}: ${v}`);
  });
  return parts.join(" · ") || "Sin filtros aplicados";
};

// Calcula totales de las columnas numéricas (number/currency). Devuelve fila parcial.
function computeTotalsRow(columns: ReportColumn[], rows: Record<string, any>[]): Record<string, any> {
  const totals: Record<string, any> = {};
  columns.forEach((c, idx) => {
    if (c.format === "currency" || c.format === "number") {
      // No sumar columnas que claramente son ratios/promedios/variaciones
      const lower = c.label.toLowerCase();
      const isRatio = lower.includes("promedio") || lower.includes("variación") || lower.includes("variacion") ||
                      lower.includes("var.") || lower.includes("var ") || lower.includes("%");
      if (isRatio) {
        totals[c.key] = "";
      } else {
        totals[c.key] = rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0);
      }
    } else if (idx === 0) {
      totals[c.key] = "TOTAL";
    } else {
      totals[c.key] = "";
    }
  });
  return totals;
}

export function exportReportToPDF(payload: ReportPayload, fileName?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(payload.title, 40, 40);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(`Generado: ${new Date(payload.generated_at).toLocaleString("es-MX")}`, 40, 58);
  doc.text(`Filtros: ${filterSummary(payload.filters_applied)}`, 40, 72);
  doc.text(`Total de registros: ${payload.total_rows}`, 40, 86);

  const head = [payload.columns.map(c => c.label)];
  const body = payload.rows.map(r => payload.columns.map(c => formatCell(r[c.key], c)));

  // Fila de totales (solo si hay al menos una columna numérica y filas)
  const totals = payload.rows.length > 0 ? computeTotalsRow(payload.columns, payload.rows) : null;
  const foot = totals
    ? [payload.columns.map(c => {
        const v = totals[c.key];
        if (v === "TOTAL") return "TOTAL";
        if (v === "" || v == null) return "";
        return formatCell(v, c);
      })]
    : undefined;

  autoTable(doc, {
    head, body, foot, startY: 100,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [33, 37, 41], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [230, 230, 235], textColor: 20, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: payload.columns.reduce((acc, c, i) => {
      acc[i] = { halign: c.align ?? "left" };
      return acc;
    }, {} as Record<number, any>),
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`QualMedical · Página ${data.pageNumber} de ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    },
  });

  doc.save(fileName ?? `${payload.report_type}_${Date.now()}.pdf`);
}

// Excel estándar (no pivote): usa SheetJS, añade fila de totales al final.
function exportStandardXLSX(payload: ReportPayload, fileName?: string) {
  const headerRow = payload.columns.map(c => c.label);
  const dataRows = payload.rows.map(r =>
    payload.columns.map(c => {
      const v = r[c.key];
      if (v == null) return "";
      if (c.format === "currency" || c.format === "number") return Number(v) || 0;
      if (c.format === "date" && v) return new Date(v);
      return v;
    })
  );

  const totals = payload.rows.length > 0 ? computeTotalsRow(payload.columns, payload.rows) : null;
  const totalsRow = totals
    ? payload.columns.map(c => {
        const v = totals[c.key];
        if (v === "" || v == null) return "";
        if (v === "TOTAL") return "TOTAL";
        return Number(v) || 0;
      })
    : null;

  const meta = [
    [payload.title],
    [`Generado: ${new Date(payload.generated_at).toLocaleString("es-MX")}`],
    [`Filtros: ${filterSummary(payload.filters_applied)}`],
    [`Total de registros: ${payload.total_rows}`],
    [],
  ];

  const aoa = [...meta, headerRow, ...dataRows, ...(totalsRow ? [totalsRow] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = payload.columns.map(c => ({
    wch: Math.max(c.label.length + 2, 14),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Informe");
  XLSX.writeFile(wb, fileName ?? `${payload.report_type}_${Date.now()}.xlsx`);
}

// Convierte un valor 0..1 a color hex en escala blanco -> azul fuerte (heatmap suave).
function heatmapColor(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  // Blanco (255,255,255) -> azul (33,82,189)
  const R = Math.round(255 + (33 - 255) * r);
  const G = Math.round(255 + (82 - 255) * r);
  const B = Math.round(255 + (189 - 255) * r);
  const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `FF${toHex(R)}${toHex(G)}${toHex(B)}`;
}

// Excel pivote: usa ExcelJS, aplica heatmap en celdas de valores y fila de totales.
async function exportPivotXLSX(payload: ReportPayload, fileName?: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "QualMedical";
  wb.created = new Date();
  const ws = wb.addWorksheet("Informe", { views: [{ state: "frozen", ySplit: 6, xSplit: 2 }] });

  // Metadatos
  ws.addRow([payload.title]);
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.addRow([`Generado: ${new Date(payload.generated_at).toLocaleString("es-MX")}`]);
  ws.addRow([`Filtros: ${filterSummary(payload.filters_applied)}`]);
  ws.addRow([`Total de registros: ${payload.total_rows}`]);
  ws.addRow([]);

  // Cabecera
  const headerLabels = payload.columns.map(c => c.label);
  const headerRow = ws.addRow(headerLabels);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF212529" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });

  // Identificar columnas de valores del pivote (entre row keys y __total)
  const pivotKeys = new Set(payload.pivot_meta?.column_keys ?? []);
  // Calcular max global para escalar el heatmap
  let maxVal = 0;
  payload.rows.forEach(r => {
    pivotKeys.forEach(k => {
      const v = Number(r[k]) || 0;
      if (v > maxVal) maxVal = v;
    });
  });

  // Filas de datos
  payload.rows.forEach(r => {
    const values = payload.columns.map(c => {
      const v = r[c.key];
      if (v == null || v === "") return "";
      if (c.format === "currency" || c.format === "number") return Number(v) || 0;
      if (c.format === "date" && v) return new Date(v);
      return v;
    });
    const row = ws.addRow(values);
    row.eachCell((cell, colNumber) => {
      const col = payload.columns[colNumber - 1];
      if (!col) return;
      cell.alignment = { horizontal: col.align ?? "left", vertical: "middle" };
      if (col.format === "currency") cell.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
      else if (col.format === "number") cell.numFmt = "#,##0.##";
      else if (col.format === "date") cell.numFmt = "dd/mm/yyyy";
      // Heatmap solo en celdas pivote (no en __total ni en row keys)
      if (pivotKeys.has(col.key) && maxVal > 0) {
        const v = Number(cell.value) || 0;
        if (v > 0) {
          cell.fill = {
            type: "pattern", pattern: "solid",
            fgColor: { argb: heatmapColor(v / maxVal) },
          };
        }
      }
    });
  });

  // Fila de totales
  if (payload.rows.length > 0) {
    const totals = computeTotalsRow(payload.columns, payload.rows);
    const totalsValues = payload.columns.map(c => {
      const v = totals[c.key];
      if (v === "" || v == null) return "";
      if (v === "TOTAL") return "TOTAL";
      return Number(v) || 0;
    });
    const totalsRow = ws.addRow(totalsValues);
    totalsRow.eachCell((cell, colNumber) => {
      const col = payload.columns[colNumber - 1];
      if (!col) return;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6EB" } };
      cell.alignment = { horizontal: col.align ?? "left", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
      if (col.format === "currency") cell.numFmt = '"$"#,##0.00';
      else if (col.format === "number") cell.numFmt = "#,##0.##";
    });
  }

  // Anchos
  ws.columns = payload.columns.map(c => ({
    width: Math.max(c.label.length + 2, 14),
  }));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName ?? `${payload.report_type}_pivote_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportReportToXLSX(payload: ReportPayload, fileName?: string) {
  if (payload.pivot_meta && payload.pivot_meta.column_keys?.length) {
    // Export asíncrono pero el caller no necesita awaitarlo
    void exportPivotXLSX(payload, fileName);
  } else {
    exportStandardXLSX(payload, fileName);
  }
}
