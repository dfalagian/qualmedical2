import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CatalogOnlyNoticeProps {
  searchTerm: string;
  warehouseFilter: string;
}

export function CatalogOnlyNotice({ searchTerm, warehouseFilter }: CatalogOnlyNoticeProps) {
  const queryClient = useQueryClient();
  const [enablingId, setEnablingId] = useState<string | null>(null);

  // Only search catalog_only products when there's a search term and no results in main list
  const { data: catalogOnlyMatches = [] } = useQuery({
    queryKey: ["catalog_only_products", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const term = `%${searchTerm}%`;
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, barcode, category")
        .eq("catalog_only", true)
        .eq("is_active", true)
        .or(`name.ilike.${term},sku.ilike.${term},brand.ilike.${term},barcode.ilike.${term}`)
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2,
  });

  const handleEnable = async (productId: string) => {
    setEnablingId(productId);
    try {
      const { error } = await supabase
        .from("products")
        .update({ catalog_only: false })
        .eq("id", productId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["catalog_only_products"] });
      toast.success("Producto habilitado en inventario");
    } catch (err: any) {
      toast.error("Error al habilitar producto: " + err.message);
    } finally {
      setEnablingId(null);
    }
  };

  // Show warehouse-specific message
  if (warehouseFilter !== "all" && !searchTerm) {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-2">
        <Package className="h-8 w-8 mx-auto opacity-50" />
        <p>No hay productos con stock en este almacén</p>
        <p className="text-xs">Prueba seleccionando "Todos los almacenes" para ver el catálogo completo</p>
      </div>
    );
  }

  // Show catalog_only matches if found
  if (catalogOnlyMatches.length > 0) {
    return (
      <div className="py-8 px-4 space-y-4">
        <div className="text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto opacity-50 mb-2" />
          <p>No se encontró en inventario activo</p>
        </div>
        <div className="max-w-md mx-auto rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Se encontró en el catálogo externo (solo-catálogo):
          </p>
          {catalogOnlyMatches.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU: {p.sku}{p.brand ? ` · ${p.brand}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1 border-amber-300 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30"
                onClick={() => handleEnable(p.id)}
                disabled={enablingId === p.id}
              >
                {enablingId === p.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Habilitar
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: no results
  return (
    <div className="text-center py-8 text-muted-foreground">
      {warehouseFilter !== "all" ? (
        <div className="space-y-2">
          <Package className="h-8 w-8 mx-auto opacity-50" />
          <p>No hay productos con stock en este almacén</p>
          <p className="text-xs">Prueba seleccionando "Todos los almacenes" para ver el catálogo completo</p>
        </div>
      ) : (
        "No hay productos registrados"
      )}
    </div>
  );
}
