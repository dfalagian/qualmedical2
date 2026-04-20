import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Boxes } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export function ExportBatchesButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const pageSize = 1000;

      // Products (only catalog_only=false)
      let allProducts: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, sku, brand, category, unit, current_stock")
          .eq("catalog_only", false)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allProducts = allProducts.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Batches
      let allBatches: any[] = [];
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("product_batches")
          .select("id, product_id, batch_number, barcode, expiration_date, current_quantity, initial_quantity, is_active, received_at, notes")
          .order("expiration_date", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allBatches = allBatches.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Warehouses
      const { data: warehouses, error: whErr } = await supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("is_active", true);
      if (whErr) throw whErr;
      const whById: Record<string, { name: string; code: string }> = {};
      for (const w of warehouses || []) whById[w.id] = { name: w.name, code: w.code };

      // batch_warehouse_stock
      let allBws: any[] = [];
      from = 0;
      while (true) {
        const { data, error } = await (supabase as any)
          .from("batch_warehouse_stock")
          .select("batch_id, warehouse_id, quantity")
          .gt("quantity", 0)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allBws = allBws.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      const productById: Record<string, any> = {};
      for (const p of allProducts) productById[p.id] = p;

      // Sheet 1: Lotes con distribución resumida
      const sheet1 = allBatches.map((b) => {
        const p = productById[b.product_id] || {};
        const dist = allBws
          .filter((w) => w.batch_id === b.id)
          .map((w) => `${whById[w.warehouse_id]?.name || w.warehouse_id}: ${w.quantity}`)
          .join(" | ");
        return {
          Categoría: p.category || "Sin categoría",
          Producto: p.name || "",
          SKU: p.sku || "",
          Marca: p.brand || "",
          Unidad: p.unit || "",
          "Número de Lote": b.batch_number,
          "Código de Barras": b.barcode,
          "Fecha Caducidad": b.expiration_date ? new Date(b.expiration_date).toLocaleDateString("es-MX") : "",
          "Cantidad Inicial": b.initial_quantity ?? 0,
          "Cantidad Actual": b.current_quantity ?? 0,
          "Distribución por Almacén": dist,
          "Fecha Recepción": b.received_at ? new Date(b.received_at).toLocaleDateString("es-MX") : "",
          Activo: b.is_active ? "Sí" : "No",
          Notas: b.notes || "",
        };
      });

      // Sheet 2: Lotes por Almacén (una fila por (lote, almacén))
      const sheet2: any[] = [];
      for (const w of allBws) {
        const batch = allBatches.find((b) => b.id === w.batch_id);
        if (!batch) continue;
        const p = productById[batch.product_id] || {};
        sheet2.push({
          Almacén: whById[w.warehouse_id]?.name || "",
          "Código Almacén": whById[w.warehouse_id]?.code || "",
          Categoría: p.category || "Sin categoría",
          Producto: p.name || "",
          SKU: p.sku || "",
          Marca: p.brand || "",
          "Número de Lote": batch.batch_number,
          "Código de Barras": batch.barcode,
          "Fecha Caducidad": batch.expiration_date ? new Date(batch.expiration_date).toLocaleDateString("es-MX") : "",
          "Cantidad en Almacén": w.quantity,
          "Cantidad Total Lote": batch.current_quantity ?? 0,
        });
      }
      sheet2.sort((a, b) => {
        const x = a["Almacén"].localeCompare(b["Almacén"]);
        if (x !== 0) return x;
        return String(a["Producto"]).localeCompare(String(b["Producto"]));
      });

      // Sheet 3: Resumen por Almacén
      const resumenMap: Record<string, { lotes: number; unidades: number }> = {};
      for (const w of allBws) {
        const name = whById[w.warehouse_id]?.name || "Sin almacén";
        if (!resumenMap[name]) resumenMap[name] = { lotes: 0, unidades: 0 };
        resumenMap[name].lotes += 1;
        resumenMap[name].unidades += Number(w.quantity || 0);
      }
      const sheet3 = Object.entries(resumenMap)
        .map(([name, v]) => ({ Almacén: name, "Lotes con Stock": v.lotes, "Unidades Totales": v.unidades }))
        .sort((a, b) => a["Almacén"].localeCompare(b["Almacén"]));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet1), "Lotes");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet2), "Lotes por Almacén");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet3), "Resumen por Almacén");

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Inventario_Lotes_QualMedical_${today}.xlsx`);
      toast.success("Inventario por lotes exportado exitosamente");
    } catch (err: any) {
      console.error("Error exporting batches:", err);
      toast.error("Error al exportar inventario por lotes");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
      <Boxes className="h-4 w-4" />
      {exporting ? "Exportando..." : "Exportar Inventario por Lotes"}
    </Button>
  );
}
