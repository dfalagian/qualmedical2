import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Pencil, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FixCitioSkusDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [skus, setSkus] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-citio-sku-fix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand")
        .like("sku", "CITIO-%")
        .eq("is_active", true)
        .eq("catalog_only", false)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string; sku: string; brand: string | null }>;
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const modifiedCount = Object.values(skus).filter((v) => v.trim()).length;

  const handleSave = async () => {
    const toSave = Object.entries(skus).filter(([, v]) => v.trim());
    if (toSave.length === 0) return;

    setSaving(true);
    let successCount = 0;
    const errors: string[] = [];

    for (const [id, newSku] of toSave) {
      const { error } = await supabase
        .from("products")
        .update({ sku: newSku.trim().toUpperCase() })
        .eq("id", id);
      if (error) {
        const product = products.find((p) => p.id === id);
        const label = product?.name || id;
        if (error.code === "23505") {
          errors.push(`${label} (SKU duplicado: ${newSku.trim()})`);
        } else {
          errors.push(label);
        }
      } else {
        successCount++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-citio-sku-fix"] });
    queryClient.invalidateQueries({ queryKey: ["products-citio-sku-count"] });

    if (successCount > 0) toast.success(`${successCount} SKU(s) actualizados correctamente`);
    if (errors.length > 0) toast.error(`No se pudo guardar: ${errors.join(" | ")}`);

    // Clear saved entries, keep failed ones so user can retry
    const failedIds = new Set(errors.map((e) => {
      const found = toSave.find(([id]) => {
        const p = products.find((pr) => pr.id === id);
        return errors.some((err) => err.startsWith(p?.name || ""));
      });
      return found?.[0];
    }).filter(Boolean));

    setSkus((prev) => {
      const next: Record<string, string> = {};
      for (const [id, v] of Object.entries(prev)) {
        if (failedIds.has(id)) next[id] = v;
      }
      return next;
    });

    setSaving(false);
    if (errors.length === 0) onOpenChange(false);
  };

  const handleClose = () => {
    setSkus({});
    setSearchTerm("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Corregir SKUs auto-generados
            {!isLoading && products.length > 0 && (
              <Badge variant="secondary" className="text-orange-700 bg-orange-100 border-orange-200">
                {products.length} productos
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Estos productos fueron importados desde CITIO sin código de medicamento. Ingresa el SKU
            correcto para cada uno. Solo se guardan los que tengan valor en el campo nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        <ScrollArea className="flex-1 border rounded-md min-h-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <p className="text-sm">No hay productos con SKU auto-generado. ¡Todo correcto!</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sin resultados para "{searchTerm}"
            </div>
          ) : (
            <div className="divide-y">
              {/* Header */}
              <div className="flex items-center gap-3 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span className="flex-1">Producto</span>
                <span className="w-32 text-right">SKU actual</span>
                <span className="w-36">Nuevo SKU</span>
              </div>
              {filtered.map((product) => (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                    skus[product.id]?.trim() ? "bg-green-50/50" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.name}</p>
                    {product.brand && (
                      <p className="text-xs text-muted-foreground truncate">{product.brand}</p>
                    )}
                  </div>
                  <code className="w-32 text-right text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded font-mono truncate shrink-0">
                    {product.sku}
                  </code>
                  <Input
                    value={skus[product.id] ?? ""}
                    onChange={(e) =>
                      setSkus((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
                    placeholder="Ingresa SKU"
                    className="h-8 w-36 text-xs shrink-0"
                  />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {products.length > 0 && (
          <p className="text-xs text-muted-foreground shrink-0">
            {modifiedCount > 0
              ? `${modifiedCount} de ${products.length} productos con nuevo SKU listo para guardar`
              : `${products.length} productos pendientes — llena el campo "Nuevo SKU" para cada uno`}
          </p>
        )}

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={modifiedCount === 0 || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : modifiedCount > 0 ? (
              `Guardar (${modifiedCount})`
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
