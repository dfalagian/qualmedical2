import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Check, Link2Off, Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

interface CipiConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: any;
  onConfirm: () => void;
  converting: boolean;
}

interface MatchAnalysis {
  itemId: string;
  descripcion: string;
  marca: string | null;
  productId: string | null;
  matchedProductName: string | null;
  catalogProductName: string | null;
  status: "linked" | "auto_matchable" | "unlinked";
}

export function CipiConversionDialog({
  open,
  onOpenChange,
  request,
  onConfirm,
  converting,
}: CipiConversionDialogProps) {
  const { data: analysis, isLoading } = useQuery({
    queryKey: ["cipi-conversion-analysis", request?.id],
    enabled: open && !!request?.id,
    queryFn: async () => {
      // Fetch items for this request
      const { data: items, error } = await supabase
        .from("cipi_request_items")
        .select("id, descripcion, marca, product_id, matched_product_name, products(id, name, brand)")
        .eq("cipi_request_id", request.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!items || items.length === 0) return { items: [] as MatchAnalysis[], stats: { linked: 0, autoMatchable: 0, unlinked: 0 } };

      // Fetch catalog for unmatched items
      const unmatched = items.filter((i: any) => !i.product_id);
      let catalog: Array<{ id: string; name: string; brand: string | null }> = [];
      if (unmatched.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, brand")
          .eq("is_active", true);
        catalog = prods || [];
      }

      const normalize = (str: string) =>
        str.toLowerCase().replace(/\s+/g, "").replace(/\./g, "").replace(/\//g, "").trim();

      const analysisItems: MatchAnalysis[] = items.map((item: any) => {
        if (item.product_id) {
          return {
            itemId: item.id,
            descripcion: item.descripcion,
            marca: item.marca,
            productId: item.product_id,
            matchedProductName: item.matched_product_name || (item.products as any)?.name,
            catalogProductName: (item.products as any)?.name || null,
            status: "linked" as const,
          };
        }

        const itemName = item.matched_product_name || item.descripcion;
        const normalizedName = normalize(itemName);
        const matches = catalog.filter((p) => normalize(p.name) === normalizedName);

        let autoMatch: { id: string; name: string } | null = null;
        if (matches.length === 1) {
          autoMatch = matches[0];
        } else if (matches.length > 1 && item.marca) {
          const brandMatch = matches.find(
            (p) => p.brand && p.brand.toLowerCase().trim() === item.marca.toLowerCase().trim()
          );
          if (brandMatch) autoMatch = brandMatch;
        }

        return {
          itemId: item.id,
          descripcion: item.descripcion,
          marca: item.marca,
          productId: null,
          matchedProductName: item.matched_product_name,
          catalogProductName: autoMatch?.name || null,
          status: autoMatch ? ("auto_matchable" as const) : ("unlinked" as const),
        };
      });

      return {
        items: analysisItems,
        stats: {
          linked: analysisItems.filter((i) => i.status === "linked").length,
          autoMatchable: analysisItems.filter((i) => i.status === "auto_matchable").length,
          unlinked: analysisItems.filter((i) => i.status === "unlinked").length,
        },
      };
    },
  });

  const stats = analysis?.stats;
  const items = analysis?.items || [];
  const hasWarnings = (stats?.autoMatchable || 0) > 0 || (stats?.unlinked || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasWarnings && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            Confirmar conversión a cotización
          </DialogTitle>
          <DialogDescription>
            Revise el estado de vinculación de los productos antes de convertir.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-green-50 border border-green-200 p-2">
                <div className="text-lg font-bold text-green-700">{stats?.linked || 0}</div>
                <div className="text-[10px] text-green-600">Vinculados al catálogo</div>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                <div className="text-lg font-bold text-amber-700">{stats?.autoMatchable || 0}</div>
                <div className="text-[10px] text-amber-600">Auto-vinculables</div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-2">
                <div className="text-lg font-bold text-red-700">{stats?.unlinked || 0}</div>
                <div className="text-[10px] text-red-600">Sin control inventario</div>
              </div>
            </div>

            {/* Warnings */}
            {(stats?.autoMatchable || 0) > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs">
                <div className="flex items-center gap-1 font-medium text-amber-800 mb-1">
                  <Search className="h-3.5 w-3.5" />
                  Vinculación automática
                </div>
                <p className="text-amber-700">
                  {stats?.autoMatchable} producto(s) no fueron seleccionados manualmente pero el sistema encontró
                  una coincidencia única en el catálogo. Se vincularán automáticamente.
                </p>
              </div>
            )}
            {(stats?.unlinked || 0) > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs">
                <div className="flex items-center gap-1 font-medium text-red-800 mb-1">
                  <Link2Off className="h-3.5 w-3.5" />
                  Productos sin vincular
                </div>
                <p className="text-red-700">
                  {stats?.unlinked} producto(s) no tienen correspondencia en el catálogo.
                  Se crearán en la cotización <strong>sin control de inventario</strong> (no se deducirá stock al aprobar la venta).
                </p>
                <p className="text-red-700 mt-1 font-medium">
                  Se recomienda vincularlos manualmente antes de convertir.
                </p>
              </div>
            )}

            {/* Item list */}
            <ScrollArea className="max-h-[240px]">
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.itemId}
                    className="flex items-center gap-2 text-xs p-1.5 rounded border"
                  >
                    {item.status === "linked" && (
                      <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    )}
                    {item.status === "auto_matchable" && (
                      <Search className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    )}
                    {item.status === "unlinked" && (
                      <Link2Off className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{item.descripcion}</span>
                      {item.status === "auto_matchable" && item.catalogProductName && (
                        <span className="text-[10px] text-amber-600">
                          → Se vinculará a: {item.catalogProductName}
                        </span>
                      )}
                      {item.status === "linked" && item.catalogProductName && (
                        <span className="text-[10px] text-green-600">
                          ✓ {item.catalogProductName}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        item.status === "linked"
                          ? "border-green-300 text-green-700 text-[10px]"
                          : item.status === "auto_matchable"
                          ? "border-amber-300 text-amber-700 text-[10px]"
                          : "border-red-300 text-red-700 text-[10px]"
                      }
                    >
                      {item.status === "linked"
                        ? "Vinculado"
                        : item.status === "auto_matchable"
                        ? "Auto"
                        : "Sin vincular"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
            {hasWarnings ? "Volver y vincular manualmente" : "Cancelar"}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={converting || isLoading}
          >
            {converting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Convirtiendo...
              </>
            ) : (
              "Confirmar conversión"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
