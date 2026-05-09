import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { toCanonicalCategory } from "@/lib/formatters";

interface CreateProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const initialForm = {
  sku: "",
  name: "",
  brand: "",
  description: "",
  category: "",
  unit: "pieza",
  barcode: "",
  minimum_stock: 0,
  price_type_1: "" as number | "",
  tax_rate: 16,
  warehouse_id: "",
};

export function CreateProductModal({ open, onOpenChange }: CreateProductModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.sku.trim() || !form.name.trim()) throw new Error("SKU y Nombre son obligatorios");

      let warehouseId = form.warehouse_id || null;
      if (!warehouseId) {
        const { data: wh } = await supabase
          .from("warehouses")
          .select("id")
          .or("name.ilike.%principal%,code.eq.PRINCIPAL")
          .limit(1);
        warehouseId = wh?.[0]?.id || null;
      }

      const { error } = await supabase.from("products").insert({
        sku: form.sku.trim().toUpperCase(),
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        category: toCanonicalCategory(form.category) || null,
        unit: form.unit,
        barcode: form.barcode.trim() || null,
        minimum_stock: form.minimum_stock || 0,
        current_stock: 0,
        price_type_1: form.price_type_1 !== "" ? Number(form.price_type_1) : null,
        tax_rate: form.tax_rate ?? 16,
        warehouse_id: warehouseId,
        is_active: true,
        catalog_only: false,
        rfid_required: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["products-list-batch-modal"] });
      logActivity({
        section: "inventario",
        action: "crear",
        entityType: "Producto",
        entityName: form.name,
        details: { note: "Producto creado manualmente", sku: form.sku },
      });
      toast.success(`Producto "${form.name}" creado correctamente`);
      setForm(initialForm);
      onOpenChange(false);
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("products_sku_key")
        ? "Ya existe un producto con ese SKU"
        : error?.message || "Error al crear el producto";
      toast.error(msg);
    },
  });

  const handleCancel = () => {
    setForm(initialForm);
    onOpenChange(false);
  };

  const isDisabled = !form.sku.trim() || !form.name.trim() || createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Producto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Fila 1: SKU + Nombre */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cp-sku" className="text-xs">
                SKU <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cp-sku"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                placeholder="Ej: QM-001"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-name" className="text-xs">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cp-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del producto"
                className="h-9"
              />
            </div>
          </div>

          {/* Fila 2: Marca + Código de barras */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cp-brand" className="text-xs">Marca</Label>
              <Input
                id="cp-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Marca o laboratorio"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-barcode" className="text-xs">Código de Barras</Label>
              <Input
                id="cp-barcode"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Código de barras"
                className="h-9"
              />
            </div>
          </div>

          {/* Fila 3: Categoría + Unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cp-category" className="text-xs">Categoría</Label>
              <Input
                id="cp-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ej: Medicamentos"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unidad</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pieza">Pieza</SelectItem>
                  <SelectItem value="caja">Caja</SelectItem>
                  <SelectItem value="frasco">Frasco</SelectItem>
                  <SelectItem value="ampolleta">Ampolleta</SelectItem>
                  <SelectItem value="sobre">Sobre</SelectItem>
                  <SelectItem value="ml">ML</SelectItem>
                  <SelectItem value="mg">MG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fila 4: Precio + IVA + Stock mínimo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cp-price" className="text-xs">Precio de Venta</Label>
              <Input
                id="cp-price"
                type="text"
                inputMode="decimal"
                value={form.price_type_1}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({ ...form, price_type_1: val === "" ? "" : Number(val) });
                }}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-tax" className="text-xs">IVA %</Label>
              <Input
                id="cp-tax"
                type="text"
                inputMode="decimal"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) || 0 })}
                placeholder="16"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp-min-stock" className="text-xs">Stock Mínimo</Label>
              <Input
                id="cp-min-stock"
                type="text"
                inputMode="numeric"
                value={form.minimum_stock}
                onChange={(e) => setForm({ ...form, minimum_stock: Number(e.target.value) || 0 })}
                placeholder="0"
                className="h-9"
              />
            </div>
          </div>

          {/* Fila 5: Almacén */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Almacén</Label>
              <Select
                value={form.warehouse_id || "none"}
                onValueChange={(v) => setForm({ ...form, warehouse_id: v === "none" ? "" : v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar almacén..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar (usa Principal)</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <Label htmlFor="cp-description" className="text-xs">Descripción</Label>
            <Textarea
              id="cp-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción del producto (opcional)"
              className="min-h-[64px] resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={isDisabled}>
            {createMutation.isPending ? "Guardando..." : "Crear Producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
