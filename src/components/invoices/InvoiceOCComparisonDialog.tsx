import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, FileText, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface InvoiceOCComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
}

export function InvoiceOCComparisonDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
}: InvoiceOCComparisonDialogProps) {
  // Find PO linked to this invoice
  const { data: linkedPO } = useQuery({
    queryKey: ["linked-po-for-invoice", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, amount, currency")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch PO items
  const { data: poItems = [] } = useQuery({
    queryKey: ["po-items-comparison", linkedPO?.id],
    enabled: !!linkedPO?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select("id, quantity_ordered, unit_price, products:product_id(name, sku, brand)")
        .eq("purchase_order_id", linkedPO!.id);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch invoice items
  const { data: invItems = [] } = useQuery({
    queryKey: ["invoice-items-comparison", invoiceId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Matching logic (same as reconciliation)
  const normalizeStr = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  const pharmaStopwords = new Set([
    "sol", "iny", "mg", "ml", "gr", "g", "pieza", "piezas", "h87",
    "tab", "cap", "amp", "fco", "cja", "env", "sobre", "susp",
    "100", "200", "300", "400", "500", "50", "10", "20", "25", "30", "45",
    "04", "06", "4", "1", "2", "3", "5", "6", "8", "16",
  ]);

  const getMeaningfulTokens = (normalized: string): string[] => {
    const tokens = normalized.match(/[a-z]+/g) || [];
    return tokens.filter((t) => t.length > 3 && !pharmaStopwords.has(t));
  };

  const calcNameSimilarity = (normA: string, normB: string): number => {
    if (normB.includes(normA) || normA.includes(normB)) return 1;
    const tokensA = getMeaningfulTokens(normA);
    if (tokensA.length === 0) return 0;
    const matchCount = tokensA.filter((t) => normB.includes(t)).length;
    return matchCount / tokensA.length;
  };

  // Build matches
  const buildMatches = () => {
    if (!poItems.length || !invItems.length) return [];

    const scoreMatrix = poItems.map((poItem: any) => {
      const normProduct = normalizeStr(poItem.products?.name || "");
      const poPrice = poItem.unit_price || 0;
      const poQty = poItem.quantity_ordered;
      const poBrand = poItem.products?.brand || "";
      return invItems.map((ic: any) => {
        const normDesc = normalizeStr(ic.descripcion || "");
        const nameScore = calcNameSimilarity(normProduct, normDesc);
        if (nameScore < 0.4) return -1;
        const icPrice = Number(ic.valor_unitario) || 0;
        const icQty = Number(ic.cantidad) || 0;
        let priceScore = 0;
        if (poPrice > 0 && icPrice > 0) {
          priceScore = Math.min(poPrice, icPrice) / Math.max(poPrice, icPrice);
        }
        let qtyScore = 0;
        if (poQty > 0 && icQty > 0) {
          qtyScore = Math.min(poQty, icQty) / Math.max(poQty, icQty);
        }
        let brandBonus = 0;
        if (poBrand) {
          const normBrand = normalizeStr(poBrand);
          if (normBrand.length > 2 && normDesc.includes(normBrand)) {
            brandBonus = 0.1;
          }
        }
        return Math.min(1, nameScore * 0.4 + priceScore * 0.4 + qtyScore * 0.2 + brandBonus);
      });
    });

    // Greedy assignment
    const allPairs: { po: number; inv: number; score: number }[] = [];
    for (let p = 0; p < poItems.length; p++) {
      for (let i = 0; i < invItems.length; i++) {
        if (scoreMatrix[p][i] >= 0) {
          allPairs.push({ po: p, inv: i, score: scoreMatrix[p][i] });
        }
      }
    }
    allPairs.sort((a, b) => b.score - a.score);

    const assignedPO = new Set<number>();
    const assignedInv = new Set<number>();
    const poToInv = new Map<number, number>();

    for (const pair of allPairs) {
      if (assignedPO.has(pair.po) || assignedInv.has(pair.inv)) continue;
      assignedPO.add(pair.po);
      assignedInv.add(pair.inv);
      poToInv.set(pair.po, pair.inv);
    }

    type MatchLine = {
      poName: string;
      poBrand: string;
      poQty: number;
      poPrice: number;
      invDesc: string;
      invQty: number;
      invPrice: number;
      status: "match" | "warning" | "info" | "missing";
      note?: string;
    };

    const lines: MatchLine[] = [];

    for (let p = 0; p < poItems.length; p++) {
      const poItem = poItems[p] as any;
      const productName = poItem.products?.name || "Sin nombre";
      const brand = poItem.products?.brand || "";
      const poQty = poItem.quantity_ordered;
      const poPrice = poItem.unit_price || 0;
      const matchedIdx = poToInv.get(p);

      if (matchedIdx === undefined) {
        lines.push({
          poName: productName,
          poBrand: brand,
          poQty,
          poPrice,
          invDesc: "—",
          invQty: 0,
          invPrice: 0,
          status: "missing",
          note: "No encontrado en la factura",
        });
      } else {
        const ic = invItems[matchedIdx] as any;
        const icQty = Number(ic.cantidad) || 0;
        const icPrice = Number(ic.valor_unitario) || 0;
        const poTotal = poPrice * poQty;
        const invTotal = icPrice * icQty;
        const totalMatch = Math.abs(poTotal - invTotal) <= 1;
        const qtyMatch = icQty === poQty;
        const priceMatch = Math.abs(poPrice - icPrice) <= 0.01;

        let status: MatchLine["status"] = "match";
        let note: string | undefined;

        if (!qtyMatch || !priceMatch) {
          if (totalMatch) {
            status = "info";
            note = "Importe total equivalente — posible diferencia de presentación o marca";
          } else {
            status = "warning";
            const parts: string[] = [];
            if (!qtyMatch) parts.push(`Cant: OC ${poQty} vs Fact ${icQty}`);
            if (!priceMatch) parts.push(`Precio: OC $${poPrice.toFixed(2)} vs Fact $${icPrice.toFixed(2)}`);
            note = parts.join(" | ");
          }
        }

        lines.push({
          poName: productName,
          poBrand: brand,
          poQty,
          poPrice,
          invDesc: ic.descripcion || "",
          invQty: icQty,
          invPrice: icPrice,
          status,
          note,
        });
      }
    }

    // Unmatched invoice items
    for (let i = 0; i < invItems.length; i++) {
      if (!assignedInv.has(i)) {
        const ic = invItems[i] as any;
        lines.push({
          poName: "—",
          poBrand: "",
          poQty: 0,
          poPrice: 0,
          invDesc: ic.descripcion || "",
          invQty: Number(ic.cantidad) || 0,
          invPrice: Number(ic.valor_unitario) || 0,
          status: "warning",
          note: "No encontrado en la OC",
        });
      }
    }

    return lines;
  };

  const matches = linkedPO ? buildMatches() : [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "match":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
      case "missing":
        return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "match":
        return "bg-emerald-50 dark:bg-emerald-950/20";
      case "info":
        return "bg-blue-50 dark:bg-blue-950/20";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/20";
      case "missing":
        return "bg-destructive/5";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Comparativa OC vs Factura
          </DialogTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Factura: <strong className="text-foreground">{invoiceNumber}</strong></span>
            {linkedPO && (
              <span>OC: <strong className="text-foreground">{linkedPO.order_number}</strong></span>
            )}
          </div>
        </DialogHeader>

        {!linkedPO ? (
          <div className="py-8 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Esta factura no tiene una Orden de Compra vinculada.</p>
            <p className="text-xs mt-1">Vincula una OC desde el módulo de Órdenes de Compra para ver la comparativa.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                <div className="col-span-1"></div>
                <div className="col-span-3">Producto OC</div>
                <div className="col-span-1 text-right">Cant OC</div>
                <div className="col-span-1 text-right">$ OC</div>
                <div className="col-span-3">Concepto Factura</div>
                <div className="col-span-1 text-right">Cant Fact</div>
                <div className="col-span-1 text-right">$ Fact</div>
                <div className="col-span-1 text-right">Subtotal</div>
              </div>

              {matches.map((line, idx) => (
                <div key={idx} className={`rounded-lg border p-3 ${getStatusBg(line.status)}`}>
                  <div className="grid grid-cols-12 gap-2 items-center text-sm">
                    <div className="col-span-1 flex justify-center">
                      {getStatusIcon(line.status)}
                    </div>
                    <div className="col-span-3">
                      <p className="font-medium truncate">{line.poName}</p>
                      {line.poBrand && (
                        <Badge variant="outline" className="text-[10px] mt-0.5">{line.poBrand}</Badge>
                      )}
                    </div>
                    <div className="col-span-1 text-right font-mono text-xs">
                      {line.poQty > 0 ? line.poQty : "—"}
                    </div>
                    <div className="col-span-1 text-right font-mono text-xs">
                      {line.poPrice > 0 ? `$${line.poPrice.toFixed(2)}` : "—"}
                    </div>
                    <div className="col-span-3">
                      <p className="truncate text-xs">{line.invDesc}</p>
                    </div>
                    <div className="col-span-1 text-right font-mono text-xs">
                      {line.invQty > 0 ? line.invQty : "—"}
                    </div>
                    <div className="col-span-1 text-right font-mono text-xs">
                      {line.invPrice > 0 ? `$${line.invPrice.toFixed(2)}` : "—"}
                    </div>
                    <div className="col-span-1 text-right font-mono text-xs font-semibold">
                      {line.invQty > 0 && line.invPrice > 0
                        ? `$${(line.invQty * line.invPrice).toFixed(2)}`
                        : "—"}
                    </div>
                  </div>
                  {line.note && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 ml-10">{line.note}</p>
                  )}
                </div>
              ))}

              {matches.length === 0 && (
                <p className="text-center py-6 text-muted-foreground text-sm">
                  No hay conceptos para comparar.
                </p>
              )}
            </div>

            {/* Summary */}
            {matches.length > 0 && (
              <>
                <Separator className="my-4" />
                <div className="flex gap-4 text-xs text-muted-foreground justify-end px-3">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    {matches.filter(m => m.status === "match").length} coinciden
                  </span>
                  <span className="flex items-center gap-1">
                    <Info className="h-3 w-3 text-blue-500" />
                    {matches.filter(m => m.status === "info").length} info
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    {matches.filter(m => m.status === "warning" || m.status === "missing").length} discrepancias
                  </span>
                </div>
              </>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
