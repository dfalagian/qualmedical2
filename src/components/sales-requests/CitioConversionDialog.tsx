import { useMemo } from "react";
import { cn } from "@/lib/utils";
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

interface CitioOrderItem {
  id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  is_sub_product?: boolean;
  medication_id?: string;
  medications?: { brand?: string; [key: string]: any };
  _linked_product_id?: string | null;
  _linked_product_name?: string | null;
  _linked_brand?: string | null;
}

interface LocalProduct {
  id: string;
  name: string;
  citio_id: string | null;
  brand: string | null;
}

interface CitioConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  items: CitioOrderItem[];
  localProducts: LocalProduct[];
  onConfirm: () => void;
  converting: boolean;
}

interface ItemAnalysis {
  id: string;
  name: string;
  brand: string | null;
  isSub: boolean;
  status: "linked" | "auto_linked" | "unlinked";
  matchedName: string | null;
}

export function CitioConversionDialog({
  open,
  onOpenChange,
  orderNumber,
  items,
  localProducts,
  onConfirm,
  converting,
}: CitioConversionDialogProps) {
  const analysis = useMemo(() => {
    const citioMap = new Map<string, LocalProduct>();
    for (const p of localProducts) {
      if (p.citio_id) citioMap.set(p.citio_id, p);
    }

    const results: ItemAnalysis[] = items.map((item) => {
      // Manually linked by user
      if (item._linked_product_id) {
        return {
          id: item.id,
          name: item.medication_name,
          brand: item._linked_brand || item.medications?.brand || null,
          isSub: !!item.is_sub_product,
          status: "linked" as const,
          matchedName: item._linked_product_name || null,
        };
      }

      // Auto-linked via citio_id
      if (item.medication_id && citioMap.has(item.medication_id)) {
        const match = citioMap.get(item.medication_id)!;
        return {
          id: item.id,
          name: item.medication_name,
          brand: item.medications?.brand || null,
          isSub: !!item.is_sub_product,
          status: "auto_linked" as const,
          matchedName: match.name,
        };
      }

      return {
        id: item.id,
        name: item.medication_name,
        brand: item.medications?.brand || null,
        isSub: !!item.is_sub_product,
        status: "unlinked" as const,
        matchedName: null,
      };
    });

    const linked = results.filter((r) => r.status === "linked").length;
    const autoLinked = results.filter((r) => r.status === "auto_linked").length;
    const unlinked = results.filter((r) => r.status === "unlinked").length;

    return { items: results, stats: { linked, autoLinked, unlinked } };
  }, [items, localProducts]);

  const { stats } = analysis;
  const hasWarnings = stats.autoLinked > 0 || stats.unlinked > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasWarnings && <AlertTriangle className="h-5 w-5 text-amber-500" />}
            Confirmar conversión a cotización
          </DialogTitle>
          <DialogDescription>
            Orden CITIO <strong>{orderNumber}</strong> — Revise el estado de vinculación de los productos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-green-50 border border-green-200 p-2">
              <div className="text-lg font-bold text-green-700">{stats.linked}</div>
              <div className="text-[10px] text-green-600">Vinculados manualmente</div>
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2">
              <div className="text-lg font-bold text-blue-700">{stats.autoLinked}</div>
              <div className="text-[10px] text-blue-600">Auto-vinculados (CITIO ID)</div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-2">
              <div className="text-lg font-bold text-red-700">{stats.unlinked}</div>
              <div className="text-[10px] text-red-600">Sin vincular</div>
            </div>
          </div>

          {/* Warnings */}
          {stats.unlinked > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs">
              <div className="flex items-center gap-1 font-medium text-red-800 mb-1">
                <Link2Off className="h-3.5 w-3.5" />
                Productos sin vincular
              </div>
              <p className="text-red-700">
                {stats.unlinked} producto(s) no tienen correspondencia en el catálogo.
                Se crearán en la cotización <strong>sin control de inventario</strong>.
              </p>
              <ul className="mt-1.5 space-y-0.5 text-red-700 list-disc list-inside">
                {analysis.items
                  .filter((i) => i.status === "unlinked")
                  .map((i) => (
                    <li key={i.id} className="truncate">
                      {i.isSub && "↳ "}{i.name}{i.brand ? ` (${i.brand})` : ""}
                    </li>
                  ))}
              </ul>
              <p className="text-red-700 mt-1.5 font-medium">
                Se recomienda vincularlos manualmente antes de convertir.
              </p>
            </div>
          )}

          {/* Item list */}
          <ScrollArea className="max-h-[350px]">
            <div className="space-y-1">
              {analysis.items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 text-xs p-1.5 rounded border",
                    item.isSub && "ml-4"
                  )}
                >
                  {item.status === "linked" && (
                    <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  )}
                  {item.status === "auto_linked" && (
                    <Search className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  )}
                  {item.status === "unlinked" && (
                    <Link2Off className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">
                      {item.isSub && "↳ "}{item.name}
                    </span>
                    {item.status === "auto_linked" && item.matchedName && (
                      <span className="text-[10px] text-blue-600">
                        → Vinculado por CITIO ID: {item.matchedName}
                      </span>
                    )}
                    {item.status === "linked" && item.matchedName && (
                      <span className="text-[10px] text-green-600">
                        ✓ {item.matchedName}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      item.status === "linked"
                        ? "border-green-300 text-green-700 text-[10px]"
                        : item.status === "auto_linked"
                        ? "border-blue-300 text-blue-700 text-[10px]"
                        : "border-red-300 text-red-700 text-[10px]"
                    }
                  >
                    {item.status === "linked"
                      ? "Manual"
                      : item.status === "auto_linked"
                      ? "Auto"
                      : "Sin vincular"}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={converting}>
            {hasWarnings ? "Volver y vincular" : "Cancelar"}
          </Button>
          <Button onClick={onConfirm} disabled={converting}>
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
