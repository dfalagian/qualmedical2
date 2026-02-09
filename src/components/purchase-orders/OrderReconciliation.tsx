import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart,
  FileText,
  PackageCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { calculateInvoiceTotal } from "@/lib/invoiceTotals";

interface OrderReconciliationProps {
  order: {
    id: string;
    order_number: string;
    amount: number;
    currency: string;
    supplier_id: string;
    invoice_id?: string | null;
    general_supplier_invoice_id?: string | null;
    purchase_order_items?: Array<{
      id: string;
      product_id: string;
      quantity_ordered: number;
      quantity_received: number | null;
      unit_price: number | null;
      products?: { id: string; name: string; sku: string } | null;
    }>;
  };
}

type ReconciliationLine = {
  productName: string;
  sku: string;
  productId: string;
  ordered: number;
  orderedPrice: number;
  orderedSubtotal: number;
  invoiced: number;
  invoicedPrice: number;
  invoicedSubtotal: number;
  received: number;
};

export function OrderReconciliation({ order }: OrderReconciliationProps) {
  // Fetch linked invoice (registered)
  const { data: registeredInvoice } = useQuery({
    queryKey: ["reconciliation-invoice", order.invoice_id],
    queryFn: async () => {
      if (!order.invoice_id) return null;
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("id", order.invoice_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!order.invoice_id,
  });

  // Fetch linked general supplier invoice
  const { data: generalInvoice } = useQuery({
    queryKey: ["reconciliation-general-invoice", order.general_supplier_invoice_id],
    queryFn: async () => {
      if (!order.general_supplier_invoice_id) return null;
      const { data, error } = await supabase
        .from("general_supplier_invoices")
        .select("*")
        .eq("id", order.general_supplier_invoice_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!order.general_supplier_invoice_id,
  });

  // Fetch medicine counts linked to this order
  const { data: medicineCounts = [] } = useQuery({
    queryKey: ["reconciliation-counts", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicine_counts")
        .select("product_id, count")
        .eq("purchase_order_id", order.id);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch inventory movements linked to this order
  const { data: inventoryMovements = [] } = useQuery({
    queryKey: ["reconciliation-movements", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, quantity, movement_type")
        .eq("reference_id", order.id)
        .eq("reference_type", "purchase_order");
      if (error) throw error;
      return data || [];
    },
  });

  // Determine invoice data
  const invoice = registeredInvoice || generalInvoice;
  const invoiceItems = registeredInvoice?.invoice_items || [];
  const hasInvoice = !!invoice;
  const invoiceTotal = invoice
    ? registeredInvoice
      ? calculateInvoiceTotal(registeredInvoice)
      : (generalInvoice?.amount || 0)
    : 0;

  // Build received map by product_id
  const receivedByProduct = new Map<string, number>();
  for (const mc of medicineCounts) {
    if (mc.product_id) {
      receivedByProduct.set(
        mc.product_id,
        (receivedByProduct.get(mc.product_id) || 0) + mc.count
      );
    }
  }
  for (const mv of inventoryMovements) {
    if (mv.product_id && mv.movement_type === "entrada") {
      receivedByProduct.set(
        mv.product_id,
        (receivedByProduct.get(mv.product_id) || 0) + mv.quantity
      );
    }
  }

  // Normalize text for fuzzy matching
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

  // Build reconciliation lines
  const matchedInvoiceIds = new Set<string>();
  const lines: ReconciliationLine[] = (order.purchase_order_items || []).map((item) => {
    const productName = item.products?.name || "Producto";
    const normProduct = normalize(productName);

    // Try to match invoice items: exact includes first, then token overlap
    const matchedInvoiceItem = invoiceItems.find((ii: any) => {
      if (matchedInvoiceIds.has(ii.id)) return false;
      const normDesc = normalize(ii.descripcion || "");
      // Direct substring match
      if (normDesc.includes(normProduct) || normProduct.includes(normDesc)) return true;
      // Token overlap: if >50% of product tokens appear in description
      const productTokens = normProduct.match(/[a-z0-9]+/g) || [];
      const matchCount = productTokens.filter((t) => t.length > 2 && normDesc.includes(t)).length;
      return productTokens.length > 0 && matchCount / productTokens.length > 0.4;
    });

    if (matchedInvoiceItem) matchedInvoiceIds.add(matchedInvoiceItem.id);

    return {
      productName,
      sku: item.products?.sku || "",
      productId: item.product_id,
      ordered: item.quantity_ordered,
      orderedPrice: item.unit_price || 0,
      orderedSubtotal: (item.unit_price || 0) * item.quantity_ordered,
      invoiced: matchedInvoiceItem ? Number(matchedInvoiceItem.cantidad) : 0,
      invoicedPrice: matchedInvoiceItem ? Number(matchedInvoiceItem.valor_unitario) : 0,
      invoicedSubtotal: matchedInvoiceItem ? Number(matchedInvoiceItem.importe) : 0,
      received: receivedByProduct.get(item.product_id) || (item.quantity_received || 0),
    };
  });

  // If only 1 order item and 1 invoice item and no match was found, force-match them
  if (lines.length === 1 && invoiceItems.length === 1 && matchedInvoiceIds.size === 0) {
    const ii = invoiceItems[0] as any;
    lines[0].invoiced = Number(ii.cantidad);
    lines[0].invoicedPrice = Number(ii.valor_unitario);
    lines[0].invoicedSubtotal = Number(ii.importe);
  }

  // Totals
  const totalOrdered = lines.reduce((s, l) => s + l.ordered, 0);
  const totalInvoiced = lines.reduce((s, l) => s + l.invoiced, 0);
  const totalReceived = lines.reduce((s, l) => s + l.received, 0);
  const totalOrderedAmount = order.amount;
  const totalInvoicedAmount = invoiceTotal;
  const totalReceivedAmount = lines.reduce(
    (s, l) => s + l.received * l.orderedPrice,
    0
  );

  const fmt = (n: number) =>
    "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2 });

  const getDiffBadge = (ordered: number, actual: number) => {
    if (actual === 0 && ordered === 0) return null;
    if (actual === 0)
      return (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          Sin datos
        </Badge>
      );
    if (actual === ordered)
      return (
        <Badge className="bg-success text-xs gap-1">
          <CheckCircle2 className="h-3 w-3" /> OK
        </Badge>
      );
    if (actual < ordered)
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertTriangle className="h-3 w-3" /> -{ordered - actual}
        </Badge>
      );
    return (
      <Badge className="bg-warning text-xs gap-1">
        <AlertTriangle className="h-3 w-3" /> +{actual - ordered}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* OC */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShoppingCart className="h-4 w-4" />
            Orden de Compra
          </div>
          <p className="text-xl font-bold">{fmt(totalOrderedAmount)}</p>
          <p className="text-xs text-muted-foreground">
            {totalOrdered} unidades · {order.purchase_order_items?.length || 0}{" "}
            productos
          </p>
        </div>

      {/* Factura */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            Factura
          </div>
          {hasInvoice ? (
            <>
              <p className="text-xl font-bold">{fmt(totalInvoicedAmount)}</p>
              <p className="text-xs text-muted-foreground">
                {invoiceItems.length > 0
                  ? `${totalInvoiced} unidades · ${invoiceItems.length} conceptos`
                  : `Folio: ${(invoice as any)?.invoice_number || (invoice as any)?.folio || "—"}`}
              </p>
              {invoiceItems.length === 0 && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Sin desglose de conceptos
                </Badge>
              )}
              {totalInvoicedAmount !== totalOrderedAmount && (
                <Badge
                  variant={
                    totalInvoicedAmount > totalOrderedAmount
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  Dif: {fmt(totalInvoicedAmount - totalOrderedAmount)}
                </Badge>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">Sin factura vinculada</span>
            </div>
          )}
        </div>

        {/* Recibido */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PackageCheck className="h-4 w-4" />
            Recibido
          </div>
          <p className="text-xl font-bold">{fmt(totalReceivedAmount)}</p>
          <p className="text-xs text-muted-foreground">
            {totalReceived} unidades
          </p>
          {totalReceived !== totalOrdered && totalReceived > 0 && (
            <Badge
              variant={
                totalReceived < totalOrdered ? "destructive" : "secondary"
              }
              className="text-xs"
            >
              Dif: {totalReceived - totalOrdered} uds
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Detail Table */}
      <div className="space-y-3">
        <h4 className="font-medium text-sm">Desglose por Producto</h4>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Producto</th>
                  <th className="text-center p-3 font-medium" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <ShoppingCart className="h-3 w-3" /> OC
                    </div>
                  </th>
                  <th className="text-center p-3 font-medium" colSpan={2}>
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3" /> Factura
                    </div>
                  </th>
                  <th className="text-center p-3 font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <PackageCheck className="h-3 w-3" /> Recibido
                    </div>
                  </th>
                  <th className="text-center p-3 font-medium">Estado</th>
                </tr>
                <tr className="bg-muted/30 text-xs text-muted-foreground">
                  <th className="p-2"></th>
                  <th className="p-2 text-center">Cant.</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-center">Cant.</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-center">Cant.</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, idx) => {
                  const allMatch =
                    line.ordered === line.received &&
                    (line.invoiced === 0 || line.invoiced === line.ordered);

                  return (
                    <tr
                      key={idx}
                      className={
                        allMatch ? "bg-success/5" : line.received < line.ordered ? "bg-destructive/5" : ""
                      }
                    >
                      <td className="p-3">
                        <p className="font-medium text-xs">{line.productName}</p>
                        {line.sku && (
                          <p className="text-[10px] text-muted-foreground">
                            {line.sku}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-center font-medium">
                        {line.ordered}
                      </td>
                      <td className="p-3 text-right text-xs">
                        {fmt(line.orderedSubtotal)}
                      </td>
                      <td className="p-3 text-center">
                        {line.invoiced > 0 ? line.invoiced : "—"}
                      </td>
                      <td className="p-3 text-right text-xs">
                        {line.invoicedSubtotal > 0
                          ? fmt(line.invoicedSubtotal)
                          : "—"}
                      </td>
                      <td className="p-3 text-center font-medium">
                        {line.received > 0 ? line.received : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {getDiffBadge(line.ordered, line.received)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 font-medium">
                <tr>
                  <td className="p-3 text-xs">TOTALES</td>
                  <td className="p-3 text-center">{totalOrdered}</td>
                  <td className="p-3 text-right text-xs">
                    {fmt(totalOrderedAmount)}
                  </td>
                  <td className="p-3 text-center">
                    {totalInvoiced > 0 ? totalInvoiced : "—"}
                  </td>
                  <td className="p-3 text-right text-xs">
                    {totalInvoicedAmount > 0 ? fmt(totalInvoicedAmount) : "—"}
                  </td>
                  <td className="p-3 text-center">{totalReceived}</td>
                  <td className="p-3 text-center">
                    {getDiffBadge(totalOrdered, totalReceived)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
