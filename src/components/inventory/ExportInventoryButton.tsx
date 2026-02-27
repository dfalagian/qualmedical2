import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export function ExportInventoryButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Fetch products
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, name, sku, brand, category, current_stock, minimum_stock, unit, barcode, price_with_tax, price_without_tax, unit_price, tax_rate, is_active, created_at, updated_at")
        .order("category")
        .order("name");
      if (pErr) throw pErr;

      // Fetch batches
      const { data: batches, error: bErr } = await supabase
        .from("product_batches")
        .select("product_id, batch_number, barcode, expiration_date, current_quantity, initial_quantity, is_active, received_at")
        .eq("is_active", true);
      if (bErr) throw bErr;

      // Fetch warehouse stock
      const { data: whStock, error: wErr } = await supabase
        .from("warehouse_stock")
        .select("product_id, warehouse_id, current_stock, warehouses:warehouse_id(name, code)")
        .gt("current_stock", 0);
      if (wErr) throw wErr;

      // Build batches map
      const batchMap: Record<string, typeof batches> = {};
      for (const b of batches || []) {
        if (!batchMap[b.product_id]) batchMap[b.product_id] = [];
        batchMap[b.product_id].push(b);
      }

      // Build warehouse map
      const whMap: Record<string, string[]> = {};
      for (const ws of (whStock || []) as any[]) {
        const whName = ws.warehouses?.name || ws.warehouse_id;
        const entry = `${whName}: ${ws.current_stock}`;
        if (!whMap[ws.product_id]) whMap[ws.product_id] = [];
        whMap[ws.product_id].push(entry);
      }

      // Sheet 1: Inventario General
      const generalRows = (products || []).map((p) => ({
        Categoría: p.category || "Sin categoría",
        Producto: p.name,
        SKU: p.sku,
        Marca: p.brand || "",
        "Código de Barras": p.barcode || "",
        Unidad: p.unit || "",
        "Stock Actual": p.current_stock ?? 0,
        "Stock Mínimo": p.minimum_stock ?? 0,
        Estado: (p.current_stock ?? 0) <= 0 ? "Agotado" : (p.current_stock ?? 0) <= (p.minimum_stock ?? 0) ? "Bajo" : "OK",
        "Precio sin IVA": p.price_without_tax ?? p.unit_price ?? "",
        "Precio con IVA": p.price_with_tax ?? "",
        "Tasa IVA": p.tax_rate != null ? `${p.tax_rate}%` : "",
        "Distribución Almacenes": whMap[p.id]?.join(" | ") || "",
        Activo: p.is_active ? "Sí" : "No",
        "Fecha Creación": p.created_at ? new Date(p.created_at).toLocaleDateString("es-MX") : "",
        "Última Actualización": p.updated_at ? new Date(p.updated_at).toLocaleDateString("es-MX") : "",
      }));

      // Sheet 2: Lotes
      const batchRows: any[] = [];
      for (const p of products || []) {
        const pBatches = batchMap[p.id] || [];
        for (const b of pBatches) {
          batchRows.push({
            Producto: p.name,
            SKU: p.sku,
            Marca: p.brand || "",
            Categoría: p.category || "",
            "Número de Lote": b.batch_number,
            "Código de Barras Lote": b.barcode,
            "Fecha Caducidad": b.expiration_date ? new Date(b.expiration_date).toLocaleDateString("es-MX") : "",
            "Cantidad Inicial": b.initial_quantity,
            "Cantidad Actual": b.current_quantity,
            "Fecha Recepción": b.received_at ? new Date(b.received_at).toLocaleDateString("es-MX") : "",
          });
        }
      }

      // Sheet 3: Stock por Almacén
      const whRows: any[] = [];
      for (const ws of (whStock || []) as any[]) {
        const product = (products || []).find((p) => p.id === ws.product_id);
        if (!product) continue;
        whRows.push({
          Almacén: ws.warehouses?.name || "",
          "Código Almacén": ws.warehouses?.code || "",
          Producto: product.name,
          SKU: product.sku,
          Marca: product.brand || "",
          Categoría: product.category || "",
          "Stock en Almacén": ws.current_stock,
          "Stock Global": product.current_stock ?? 0,
        });
      }

      // Create workbook
      const wb = XLSX.utils.book_new();

      const ws1 = XLSX.utils.json_to_sheet(generalRows);
      XLSX.utils.book_append_sheet(wb, ws1, "Inventario General");

      if (batchRows.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(batchRows);
        XLSX.utils.book_append_sheet(wb, ws2, "Lotes");
      }

      if (whRows.length > 0) {
        const ws3 = XLSX.utils.json_to_sheet(whRows);
        XLSX.utils.book_append_sheet(wb, ws3, "Stock por Almacén");
      }

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Inventario_QualMedical_${today}.xlsx`);
      toast.success("Inventario exportado exitosamente");
    } catch (err: any) {
      console.error("Error exporting inventory:", err);
      toast.error("Error al exportar inventario");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
      <FileSpreadsheet className="h-4 w-4" />
      {exporting ? "Exportando..." : "Exportar Inventario"}
    </Button>
  );
}
