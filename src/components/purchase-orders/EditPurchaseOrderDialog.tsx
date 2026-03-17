import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Trash2, Save, History, CalendarIcon } from "lucide-react";
import { ProductCombobox } from "./ProductCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  savedPrice: number;
  manualPrice: number | null;
  total: number;
  category: string | null;
  notes: string;
}

const IVA_RATE = 0.16;
const IVA_EXEMPT_CATEGORIES = ["medicamentos", "inmunoterapia", "oncologicos"];

interface EditPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export const EditPurchaseOrderDialog = ({
  open,
  onOpenChange,
  order,
}: EditPurchaseOrderDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);

  // Fetch products from inventory
  const { data: products } = useQuery({
    queryKey: ["products_for_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, current_stock, price_type_1, brand, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Initialize form with existing order data
  useEffect(() => {
    if (open && order && !initialized) {
      setDescription(order.description || "");
      setDeliveryDate(order.delivery_date ? new Date(order.delivery_date + "T12:00:00") : undefined);

      const items: SelectedProduct[] = (order.purchase_order_items || []).map((item: any) => {
        const savedPrice = item.original_price ?? item.unit_price ?? 0;
        const currentPrice = item.unit_price ?? 0;
        const isManual = item.original_price != null && item.original_price !== currentPrice;
        const quantity = item.quantity_ordered || 1;
        const effectivePrice = currentPrice;
        const total = effectivePrice * quantity;
        const productData = products?.find((p: any) => p.id === item.product_id);

        return {
          id: item.product_id,
          name: item.products?.name || "Producto",
          sku: item.products?.sku || "-",
          quantity,
          unitPrice: effectivePrice,
          savedPrice,
          manualPrice: isManual ? currentPrice : null,
          total,
          category: productData?.category || item.products?.category || null,
          notes: item.notes || "Pieza",
        };
      });

      setSelectedProducts(items);
      setInitialized(true);
    }

    if (!open) {
      setInitialized(false);
    }
  }, [open, order, initialized, products]);

  const handleAddProduct = (
    product: { id: string; name: string; sku: string; unit_price: number | null; category?: string | null },
    quantity: number,
    savedPrice: number,
    manualPrice: number | null
  ) => {
    const exists = selectedProducts.find((p) => p.id === product.id);
    if (exists) {
      toast.error("Este producto ya está en la lista");
      return;
    }

    const effectivePrice = manualPrice ?? savedPrice;
    const total = effectivePrice * quantity;

    setSelectedProducts([
      ...selectedProducts,
      {
        id: product.id,
        name: product.name,
        sku: product.sku,
        quantity,
        unitPrice: effectivePrice,
        savedPrice,
        manualPrice,
        total,
        category: product.category || null,
        notes: "Pieza",
      },
    ]);
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId));
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          const effectivePrice = p.manualPrice ?? p.savedPrice;
          const total = effectivePrice * quantity;
          return { ...p, quantity, total };
        }
        return p;
      })
    );
  };

  const updateProductManualPrice = (productId: string, manualPriceStr: string) => {
    const manualPrice = manualPriceStr.trim() === "" ? null : parseFloat(manualPriceStr) || 0;
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          const effectivePrice = manualPrice ?? p.savedPrice;
          const total = effectivePrice * p.quantity;
          return { ...p, manualPrice, unitPrice: effectivePrice, total };
        }
        return p;
      })
    );
  };

  const updateProductNotes = (productId: string, notes: string) => {
    setSelectedProducts(
      selectedProducts.map((p) => p.id === productId ? { ...p, notes } : p)
    );
  };

  const subtotal = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      const effectivePrice = p.manualPrice ?? p.savedPrice;
      return sum + effectivePrice * p.quantity;
    }, 0);
  }, [selectedProducts]);

  const ivaTotal = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      const cat = (p.category || "").toLowerCase();
      if (IVA_EXEMPT_CATEGORIES.includes(cat)) return sum;
      const effectivePrice = p.manualPrice ?? p.savedPrice;
      return sum + effectivePrice * p.quantity * IVA_RATE;
    }, 0);
  }, [selectedProducts]);

  const total = subtotal + ivaTotal;

  const updateOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user || !order) throw new Error("Datos insuficientes");
      if (selectedProducts.length === 0) throw new Error("Agrega al menos un producto");

      // 1. Update the order
      const { error: orderError } = await supabase
        .from("purchase_orders")
        .update({
          amount: total,
          description: description || null,
          delivery_date: deliveryDate ? format(deliveryDate, "yyyy-MM-dd") : null,
        })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // 2. Delete existing items
      const { error: deleteError } = await supabase
        .from("purchase_order_items")
        .delete()
        .eq("purchase_order_id", order.id);

      if (deleteError) throw deleteError;

      // 3. Insert new items
      const items = selectedProducts.map((p) => ({
        purchase_order_id: order.id,
        product_id: p.id,
        quantity_ordered: p.quantity,
        unit_price: p.manualPrice ?? p.savedPrice,
        original_price: p.savedPrice,
        notes: p.notes || null,
        price_updated_at:
          p.manualPrice !== null && p.manualPrice !== p.savedPrice
            ? new Date().toISOString()
            : null,
        price_updated_by:
          p.manualPrice !== null && p.manualPrice !== p.savedPrice ? user.id : null,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items);

      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      toast.success("Orden actualizada correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al actualizar la orden");
    },
  });

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Editar Orden: {order.order_number}
          </DialogTitle>
          <DialogDescription>
            Modifica productos, cantidades y precios de la orden de compra
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4">
          {/* Description and Delivery Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notas adicionales..."
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de Entrega</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !deliveryDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deliveryDate ? format(deliveryDate, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={setDeliveryDate}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Product Combobox */}
          <ProductCombobox
            products={products || []}
            onAddProduct={handleAddProduct}
          />

          {/* Products Table */}
          <div className="border rounded-lg bg-background">
            <div className="h-[280px] overflow-auto">
              {selectedProducts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Producto</TableHead>
                      <TableHead className="w-[12%] text-center">Cant.</TableHead>
                      <TableHead className="w-[15%] text-right">P. Guardado</TableHead>
                      <TableHead className="w-[15%] text-center">P. Manual</TableHead>
                      <TableHead className="w-[18%] text-right">Importe</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{product.name}</p>
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={1}
                            value={product.quantity}
                            onChange={(e) =>
                              updateProductQuantity(
                                product.id,
                                Math.max(1, parseInt(e.target.value) || 1)
                              )
                            }
                            className="w-16 h-8 text-center mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <History className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              ${(product.savedPrice ?? product.unitPrice ?? 0).toFixed(2)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={product.manualPrice ?? ""}
                            onChange={(e) =>
                              updateProductManualPrice(product.id, e.target.value)
                            }
                            placeholder="—"
                            className="w-24 h-8 text-center mx-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ${product.total.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No hay productos en la orden</p>
                  <p className="text-xs">Usa el buscador para agregar productos</p>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          {selectedProducts.length > 0 && (
            <div className="flex justify-end">
              <div className="w-72 bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {ivaTotal > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>IVA (16%):</span>
                    <span>${ivaTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary">${total.toFixed(2)} MXN</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 pt-4 border-t mt-4">
          <div className="text-sm text-muted-foreground">
            {selectedProducts.length} producto(s)
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => updateOrderMutation.mutate()}
              disabled={updateOrderMutation.isPending || selectedProducts.length === 0}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {updateOrderMutation.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
