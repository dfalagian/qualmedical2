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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, FileText } from "lucide-react";
import { ProductCombobox } from "./ProductCombobox";
import { PurchaseOrderPDFViewer } from "./PurchaseOrderPDFViewer";
import { SelectedProductsTable } from "./SelectedProductsTable";
import { PurchaseOrderTotalsCard } from "./PurchaseOrderTotalsCard";

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

          {/*
            Importante: este contenedor DEBE scrollear.
            Si usamos overflow-hidden aquí, al seleccionar un producto (y expandir el bloque de captura)
            la tabla queda fuera del viewport del modal y “parece” que desaparece.
          */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
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

            {/* Rebuild: layout en 2 columnas para que la tabla no “desaparezca” al expandirse el selector */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
              <div className="lg:col-span-2 space-y-4">
                <ProductCombobox products={products || []} onAddProduct={handleAddProduct} />
              </div>

              <div className="lg:col-span-3 space-y-4">
                <SelectedProductsTable
                  products={selectedProducts}
                  onRemove={removeProduct}
                  onQuantityChange={updateProductQuantity}
                  maxHeight={340}
                />

                {selectedProducts.length > 0 && (
                  <PurchaseOrderTotalsCard subtotal={subtotal} totalIva={totalIva} total={total} />
                )}
              </div>
            </div>
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
