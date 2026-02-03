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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Trash2, FileText } from "lucide-react";
import { ProductCombobox } from "./ProductCombobox";
import { PurchaseOrderPDFViewer } from "./PurchaseOrderPDFViewer";

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  hasIva: boolean;
  ivaAmount: number;
  total: number;
}

interface CreateSupplierOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const IVA_RATE = 0.16;

export const CreateSupplierOrderDialog = ({
  open,
  onOpenChange,
}: CreateSupplierOrderDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [createdOrderData, setCreatedOrderData] = useState<any>(null);

  // Generate next order number automatically
  const { data: nextOrderNumber } = useQuery({
    queryKey: ["next_qual_order_number"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("order_number")
        .ilike("order_number", "QUAL%")
        .order("order_number", { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        return "QUAL2026-001";
      }
      
      // Extract the number from the last order (e.g., QUAL2026-005 -> 5)
      const lastOrder = data[0].order_number;
      const match = lastOrder.match(/QUAL(\d{4})-(\d+)/);
      
      if (match) {
        const year = match[1];
        const lastNum = parseInt(match[2], 10);
        const nextNum = String(lastNum + 1).padStart(3, "0");
        return `QUAL${year}-${nextNum}`;
      }
      
      return "QUAL2026-001";
    },
    enabled: open,
  });

  // Set order number when dialog opens or next number is fetched
  useEffect(() => {
    if (open && nextOrderNumber && !orderNumber) {
      setOrderNumber(nextOrderNumber);
    }
  }, [open, nextOrderNumber]);

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_order_dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, rfc");
      if (error) throw error;
      return data;
    },
  });

  // Fetch products from inventory
  const { data: products } = useQuery({
    queryKey: ["products_for_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, current_stock")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleAddProduct = (
    product: { id: string; name: string; sku: string; unit_price: number | null },
    quantity: number,
    unitPrice: number,
    hasIva: boolean
  ) => {
    const ivaAmount = hasIva ? unitPrice * quantity * IVA_RATE : 0;
    const total = unitPrice * quantity + ivaAmount;

    setSelectedProducts((prev) => {
      // Debug: verificar que la lista se acumula correctamente
      console.debug("[CreateSupplierOrderDialog] addProduct", {
        adding: { id: product.id, sku: product.sku, name: product.name },
        prevLen: prev.length,
        prevIds: prev.map((p) => p.id),
      });

      // Check if product already exists
      const exists = prev.find((p) => p.id === product.id);
      if (exists) {
        toast.error("Este producto ya está en la lista");
        return prev;
      }

      const next = [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantity,
          unitPrice,
          hasIva,
          ivaAmount,
          total,
        },
      ];

      console.debug("[CreateSupplierOrderDialog] addProduct result", {
        nextLen: next.length,
        nextIds: next.map((p) => p.id),
      });

      return next;
    });
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const ivaAmount = p.hasIva ? p.unitPrice * quantity * IVA_RATE : 0;
          const total = p.unitPrice * quantity + ivaAmount;
          return { ...p, quantity, ivaAmount, total };
        }
        return p;
      })
    );
  };

  const { subtotal, totalIva, total } = useMemo(() => {
    const subtotal = selectedProducts.reduce(
      (sum, p) => sum + p.unitPrice * p.quantity,
      0
    );
    const totalIva = selectedProducts.reduce((sum, p) => sum + p.ivaAmount, 0);
    const total = subtotal + totalIva;
    return { subtotal, totalIva, total };
  }, [selectedProducts]);

  const selectedSupplierData = useMemo(() => {
    return suppliers?.find((s) => s.id === selectedSupplier);
  }, [suppliers, selectedSupplier]);

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuario no autenticado");
      if (!selectedSupplier) throw new Error("Selecciona un proveedor");
      if (!orderNumber) throw new Error("Ingresa el número de orden");
      if (selectedProducts.length === 0)
        throw new Error("Selecciona al menos un producto");

      // Create the order
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          amount: total,
          description: description || null,
          created_by: user.id,
          status: "pendiente",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Create order items
      const items = selectedProducts.map((p) => ({
        purchase_order_id: order.id,
        product_id: p.id,
        quantity_ordered: p.quantity,
        unit_price: p.unitPrice,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      toast.success("Orden de compra creada correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["next_qual_order_number"] });
      // Prepare data for PDF viewer
      const orderData = {
        orderNumber,
        supplierName: selectedSupplierData?.company_name || selectedSupplierData?.full_name || "",
        supplierRfc: selectedSupplierData?.rfc,
        createdAt: new Date(),
        items: selectedProducts,
        subtotal,
        totalIva,
        total,
        description,
      };
      setCreatedOrderData(orderData);
      setShowPdfViewer(true);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la orden");
    },
  });

  const resetForm = () => {
    setSelectedSupplier("");
    setOrderNumber("");
    setDescription("");
    setSelectedProducts([]);
  };

  const handleClose = () => {
    resetForm();
    setShowPdfViewer(false);
    setCreatedOrderData(null);
    onOpenChange(false);
  };

  const handlePdfClose = () => {
    setShowPdfViewer(false);
    handleClose();
  };

  return (
    <>
      <Dialog open={open && !showPdfViewer} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Nueva Orden de Compra a Proveedor
            </DialogTitle>
            <DialogDescription>
              Selecciona productos y genera la orden de compra
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            {/* Top row - Supplier and Order Info */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Proveedor *</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.company_name || s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Número de Orden *</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="OC-2026-001"
                />
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            {/* Product Combobox */}
            <ProductCombobox
              products={products || []}
              onAddProduct={handleAddProduct}
            />

            {/* Products Table */}
            <div className="border rounded-lg overflow-hidden bg-background">
              {selectedProducts.length > 0 ? (
                <div className="h-[280px] overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b bg-background">
                      <tr>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[40%]">
                          Producto
                        </th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-[10%]">
                          Cant.
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[15%]">
                          P. Unit.
                        </th>
                        <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-[10%]">
                          IVA
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[15%]">
                          Importe
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[10%]" />
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {selectedProducts.map((product, idx) => (
                        <tr
                          key={`${product.id}-${product.sku}-${idx}`}
                          className="border-b transition-colors hover:bg-muted/50"
                        >
                          <td className="p-4 align-middle">
                            <div>
                              <p className="font-medium text-sm">{product.name}</p>
                              <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                            </div>
                          </td>
                          <td className="p-4 align-middle text-center">
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
                          </td>
                          <td className="p-4 align-middle text-right">${product.unitPrice.toFixed(2)}</td>
                          <td className="p-4 align-middle text-center">
                            {product.hasIva ? (
                              <span className="text-xs text-primary font-medium">${product.ivaAmount.toFixed(2)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">0%</span>
                            )}
                          </td>
                          <td className="p-4 align-middle text-right font-semibold">${product.total.toFixed(2)}</td>
                          <td className="p-4 align-middle">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeProduct(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No hay productos agregados</p>
                  <p className="text-xs">Usa el buscador para agregar productos</p>
                </div>
              )}
            </div>

            {/* Totals */}
            {selectedProducts.length > 0 && (
              <div className="flex justify-end">
                <div className="w-64 bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>IVA (16%):</span>
                    <span>${totalIva.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-primary">${total.toFixed(2)} MXN</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-4 border-t mt-4">
            <div className="text-sm text-muted-foreground">
              {selectedProducts.length} producto(s) agregado(s)
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending || selectedProducts.length === 0}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                {createOrderMutation.isPending ? "Creando..." : "Crear y Ver PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Viewer */}
      {showPdfViewer && createdOrderData && (
        <PurchaseOrderPDFViewer
          open={showPdfViewer}
          onOpenChange={handlePdfClose}
          orderData={createdOrderData}
        />
      )}
    </>
  );
};
