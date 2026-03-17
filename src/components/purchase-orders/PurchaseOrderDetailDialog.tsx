import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ShoppingCart, 
  Package, 
  DollarSign, 
  Calendar, 
  User, 
  FileText, 
  Edit2, 
  Check, 
  X,
  History,
  TrendingUp,
  TrendingDown,
  Scale,
  Link2
} from "lucide-react";
import { formatSupplierName } from "@/lib/formatters";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import { OrderReconciliation } from "./OrderReconciliation";
import { LinkOrphanMovements } from "./LinkOrphanMovements";

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number | null;
  unit_price: number | null;
  original_price?: number | null;
  notes?: string | null;
  units_per_box?: number | null;
  products?: {
    id: string;
    name: string;
    sku: string;
  } | null;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
  supplier_id: string;
  profiles?: {
    full_name: string;
    company_name: string | null;
  } | null;
  purchase_order_items?: PurchaseOrderItem[];
}

interface PurchaseOrderDetailDialogProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseOrderDetailDialog({
  order,
  open,
  onOpenChange,
}: PurchaseOrderDetailDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<string>("");
  const [priceHistoryItem, setPriceHistoryItem] = useState<{
    productId: string;
    supplierId: string;
    productName: string;
  } | null>(null);

  const updatePriceMutation = useMutation({
    mutationFn: async ({
      itemId,
      productId,
      supplierId,
      purchaseOrderId,
      price,
      previousPrice,
    }: {
      itemId: string;
      productId: string;
      supplierId: string;
      purchaseOrderId: string;
      price: number;
      previousPrice: number | null;
    }) => {
      const priceChangePercentage =
        previousPrice && previousPrice > 0
          ? ((price - previousPrice) / previousPrice) * 100
          : null;

      // 1. Actualizar el precio en purchase_order_items
      const { error: updateError } = await supabase
        .from("purchase_order_items")
        .update({
          unit_price: price,
          original_price: previousPrice ?? undefined,
          price_updated_at: new Date().toISOString(),
          price_updated_by: user?.id,
        })
        .eq("id", itemId);

      if (updateError) throw updateError;

      // 2. Insertar registro en el histórico de precios
      const { error: historyError } = await supabase
        .from("product_price_history")
        .insert({
          product_id: productId,
          supplier_id: supplierId,
          purchase_order_id: purchaseOrderId,
          price: price,
          previous_price: previousPrice,
          created_by: user?.id,
          notes: "Actualización manual en detalle de OC",
        } as any);

      if (historyError) throw historyError;

      // 3. Recalcular el monto total de la orden
      const { data: items, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("quantity_ordered, unit_price")
        .eq("purchase_order_id", purchaseOrderId);

      if (itemsError) throw itemsError;

      const newTotal = items.reduce(
        (sum, item) => sum + (item.quantity_ordered * (item.unit_price || 0)),
        0
      );

      const { error: orderError } = await supabase
        .from("purchase_orders")
        .update({ amount: newTotal })
        .eq("id", purchaseOrderId);

      if (orderError) throw orderError;

      return { newTotal };
    },
    onSuccess: () => {
      toast.success("Precio actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      setEditingItemId(null);
      setNewPrice("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar el precio");
    },
  });

  if (!order) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completada":
        return <Badge className="bg-success">Completada</Badge>;
      case "cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      case "en_proceso":
        return <Badge className="bg-warning">En Proceso</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  };

  const totalOrdered = order.purchase_order_items?.reduce(
    (sum, item) => sum + item.quantity_ordered,
    0
  ) || 0;

  const totalReceived = order.purchase_order_items?.reduce(
    (sum, item) => sum + (item.quantity_received || 0),
    0
  ) || 0;

  const progressPercentage = totalOrdered > 0 
    ? Math.round((totalReceived / totalOrdered) * 100) 
    : 0;

  const handleEditPrice = (item: PurchaseOrderItem) => {
    setEditingItemId(item.id);
    setNewPrice(item.unit_price?.toString() || "0");
  };

  const handleSavePrice = (item: PurchaseOrderItem) => {
    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      toast.error("Ingresa un precio válido");
      return;
    }

    updatePriceMutation.mutate({
      itemId: item.id,
      productId: item.product_id,
      supplierId: order.supplier_id,
      purchaseOrderId: order.id,
      price: priceValue,
      previousPrice: item.unit_price,
    });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setNewPrice("");
  };

  const getPriceChange = (currentPrice: number | null, originalPrice: number | null) => {
    if (!originalPrice || !currentPrice || originalPrice === currentPrice) return null;
    const change = ((currentPrice - originalPrice) / originalPrice) * 100;
    return change;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Orden de Compra: {order.order_number}
            </DialogTitle>
            <DialogDescription>
              Detalle completo de la orden de compra
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="detail" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="shrink-0">
              <TabsTrigger value="detail" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Detalle
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className="gap-1.5">
                <Scale className="h-3.5 w-3.5" />
                Conciliación
              </TabsTrigger>
              <TabsTrigger value="link-movements" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Vincular Ingresos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detail" className="flex-1 overflow-y-auto pr-2 mt-4" style={{ maxHeight: 'calc(90vh - 180px)' }}>
              <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Proveedor
                    </div>
                    <p className="font-medium">{formatSupplierName(order.profiles)}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Fecha de Creación
                    </div>
                    <p className="font-medium">
                      {new Date(order.created_at).toLocaleDateString('es-MX', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DollarSign className="h-4 w-4" />
                      Monto Total
                    </div>
                    <p className="text-xl font-bold text-primary">
                      ${order.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {order.currency}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Estado</div>
                    <div>{getStatusBadge(order.status)}</div>
                  </div>
                </div>

                {order.description && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        Descripción
                      </div>
                      <p className="text-sm">{order.description}</p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Progress */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Progreso de Recepción</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {totalReceived} / {totalOrdered} unidades ({progressPercentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                <Separator />

                {/* Items List */}
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Productos ({order.purchase_order_items?.length || 0})
                  </h4>
                  
                  {order.purchase_order_items && order.purchase_order_items.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-3 font-medium">Producto</th>
                            <th className="text-center p-3 font-medium w-24">Presentación</th>
                            <th className="text-right p-3 font-medium w-44">Precio Unit.</th>
                            <th className="text-center p-3 font-medium w-32">Cantidad</th>
                            <th className="text-right p-3 font-medium w-28">Subtotal</th>
                            <th className="text-center p-3 font-medium w-24">Progreso</th>
                            <th className="text-center p-3 font-medium w-20">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {order.purchase_order_items.map((item) => {
                            const itemProgress = item.quantity_ordered > 0
                              ? Math.round(((item.quantity_received || 0) / item.quantity_ordered) * 100)
                              : 0;
                            const subtotal = (item.unit_price || 0) * item.quantity_ordered;
                            const priceChange = getPriceChange(item.unit_price, item.original_price);
                            const isEditing = editingItemId === item.id;

                            return (
                              <tr key={item.id} className="hover:bg-muted/20">
                                <td className="p-3">
                                  <p className="font-medium">
                                    {item.products?.name || 'Producto no encontrado'}
                                  </p>
                                  {item.products?.sku && (
                                    <p className="text-xs text-muted-foreground">
                                      SKU: {item.products.sku}
                                    </p>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <Badge variant="outline" className="text-xs">
                                    {item.notes || "Pieza"}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right">
                                  {isEditing ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <span className="text-muted-foreground">$</span>
                                      <Input
                                        type="number"
                                        value={newPrice}
                                        onChange={(e) => setNewPrice(e.target.value)}
                                        className="w-24 h-8 text-right"
                                        step="0.01"
                                        min="0"
                                        autoFocus
                                      />
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-end gap-2">
                                        <span className="font-medium">
                                          ${(item.unit_price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </span>
                                        {priceChange !== null && (
                                          <Badge 
                                            variant={priceChange > 0 ? "destructive" : "default"}
                                            className={`text-xs ${priceChange < 0 ? 'bg-success' : ''}`}
                                          >
                                            {priceChange > 0 ? (
                                              <TrendingUp className="h-3 w-3 mr-1" />
                                            ) : (
                                              <TrendingDown className="h-3 w-3 mr-1" />
                                            )}
                                            {priceChange > 0 ? '+' : ''}{priceChange.toFixed(1)}%
                                          </Badge>
                                        )}
                                      </div>
                                      {item.original_price && item.original_price !== item.unit_price && (
                                        <p className="text-xs text-muted-foreground line-through">
                                          Original: ${item.original_price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-muted-foreground">
                                    {item.quantity_received || 0}
                                  </span>
                                  <span className="mx-1">/</span>
                                  <span className="font-medium">{item.quantity_ordered}</span>
                                </td>
                                <td className="p-3 text-right font-medium">
                                  ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-12">
                                      <div 
                                        className={`h-full transition-all duration-300 ${
                                          itemProgress === 100 ? 'bg-success' : 
                                          itemProgress > 0 ? 'bg-warning' : 'bg-muted-foreground/30'
                                        }`}
                                        style={{ width: `${itemProgress}%` }}
                                      />
                                    </div>
                                    <Badge 
                                      variant={itemProgress === 100 ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {itemProgress}%
                                    </Badge>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-1">
                                    {isEditing ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-success hover:text-success"
                                          onClick={() => handleSavePrice(item)}
                                          disabled={updatePriceMutation.isPending}
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          onClick={handleCancelEdit}
                                          disabled={updatePriceMutation.isPending}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => handleEditPrice(item)}
                                          title="Editar precio"
                                        >
                                          <Edit2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() => setPriceHistoryItem({
                                            productId: item.product_id,
                                            supplierId: order.supplier_id,
                                            productName: item.products?.name || 'Producto',
                                          })}
                                          title="Ver histórico de precios"
                                        >
                                          <History className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay productos en esta orden
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="reconciliation" className="flex-1 overflow-y-auto pr-2 mt-4" style={{ maxHeight: 'calc(90vh - 180px)' }}>
              <OrderReconciliation order={order} />
            </TabsContent>

            <TabsContent value="link-movements" className="flex-1 overflow-y-auto pr-2 mt-4" style={{ maxHeight: 'calc(90vh - 180px)' }}>
              <LinkOrphanMovements order={order} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Price History Dialog */}
      {priceHistoryItem && (
        <PriceHistoryDialog
          productId={priceHistoryItem.productId}
          supplierId={priceHistoryItem.supplierId}
          productName={priceHistoryItem.productName}
          open={!!priceHistoryItem}
          onOpenChange={(open) => !open && setPriceHistoryItem(null)}
        />
      )}
    </>
  );
}