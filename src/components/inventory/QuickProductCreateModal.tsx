import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toCanonicalCategory } from "@/lib/formatters";

interface QuickProductCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated: (product: { id: string; name: string; sku: string; category: string | null; current_stock: number | null }) => void;
}

const CATEGORIES = ["Medicamentos", "Oncológicos", "Inmunoterapia", "Insumos", "Servicio"];

export function QuickProductCreateModal({ open, onOpenChange, onProductCreated }: QuickProductCreateModalProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName("");
    setSku("");
    setBrand("");
    setCategory("");
  };

  const handleConfirm = async () => {
    if (!name.trim() || !sku.trim()) {
      toast.error("Nombre y SKU son obligatorios");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .insert({
          name: name.trim(),
          sku: sku.trim().toUpperCase(),
          brand: brand.trim() || null,
          category: toCanonicalCategory(category),
          is_active: true,
          current_stock: 0,
          catalog_only: false,
        })
        .select("id, name, sku, category, current_stock")
        .single();

      if (error) {
        if (error.code === "23505") {
          toast.error("Ya existe un producto con ese SKU");
        } else {
          throw error;
        }
        return;
      }

      toast.success(`Producto "${data.name}" creado exitosamente`);
      onProductCreated(data);
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al crear producto");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Producto Rápido</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="qp-name">Nombre *</Label>
            <Input
              id="qp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Dexametasona 8mg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-sku">SKU *</Label>
            <Input
              id="qp-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="Ej: DEX-8MG-001"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qp-brand">Marca</Label>
            <Input
              id="qp-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Ej: PiSA"
            />
          </div>

          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !name.trim() || !sku.trim()}>
            {saving ? "Creando..." : "Crear Producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
