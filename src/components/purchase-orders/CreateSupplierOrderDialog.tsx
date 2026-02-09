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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Trash2, FileText, History, Building2, User } from "lucide-react";
import { ProductCombobox } from "./ProductCombobox";
import { openPurchaseOrderPrint } from "./purchaseOrderHtmlPrint";
import { Badge } from "@/components/ui/badge";

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  savedPrice: number;
  manualPrice: number | null;
  total: number;
}

interface CreateSupplierOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateSupplierOrderDialog = ({
  open,
  onOpenChange,
}: CreateSupplierOrderDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [supplierType, setSupplierType] = useState<"registered" | "general" | "">("");
  const [orderNumber, setOrderNumber] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);

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

  // Fetch registered suppliers (profiles)
  const { data: registeredSuppliers } = useQuery({
    queryKey: ["suppliers_for_order_dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, rfc");
      if (error) throw error;
      return data;
    },
  });

  // Fetch general suppliers
  const { data: generalSuppliers } = useQuery({
    queryKey: ["general_suppliers_for_order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_suppliers")
        .select("id, rfc, razon_social, nombre_comercial")
        .eq("is_active", true)
        .order("razon_social");
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
        .select("id, name, sku, unit_price, current_stock, price_type_1, brand")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleAddProduct = (
    product: { id: string; name: string; sku: string; unit_price: number | null },
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

  const total = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      const effectivePrice = p.manualPrice ?? p.savedPrice;
      return sum + effectivePrice * p.quantity;
    }, 0);
  }, [selectedProducts]);

  const selectedSupplierData = useMemo(() => {
    if (supplierType === "registered") {
      const supplier = registeredSuppliers?.find((s) => s.id === selectedSupplier);
      return supplier ? {
        name: supplier.company_name || supplier.full_name,
        rfc: supplier.rfc
      } : null;
    } else if (supplierType === "general") {
      const supplier = generalSuppliers?.find((s) => s.id === selectedSupplier);
      return supplier ? {
        name: supplier.nombre_comercial || supplier.razon_social,
        rfc: supplier.rfc
      } : null;
    }
    return null;
  }, [registeredSuppliers, generalSuppliers, selectedSupplier, supplierType]);

  const handleSupplierChange = (value: string) => {
    // Check if it's a registered or general supplier
    const isRegistered = registeredSuppliers?.some((s) => s.id === value);
    const isGeneral = generalSuppliers?.some((s) => s.id === value);
    
    setSelectedSupplier(value);
    if (isRegistered) {
      setSupplierType("registered");
    } else if (isGeneral) {
      setSupplierType("general");
    }
  };

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
          supplier_type: supplierType || "registered",
          amount: total,
          description: description || null,
          created_by: user.id,
          status: "pendiente",
        } as any)
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Create order items
      const items = selectedProducts.map((p) => ({
        purchase_order_id: order.id,
        product_id: p.id,
        quantity_ordered: p.quantity,
        unit_price: p.unitPrice,
        original_price: p.savedPrice,
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

      // Registrar histórico SOLO cuando el usuario capturó un precio manual y es proveedor registrado
      // (Los proveedores generales no tienen perfil en profiles, así que no pueden registrar histórico)
      const manualPriceItems = selectedProducts.filter((p) => p.manualPrice !== null);
      if (manualPriceItems.length > 0 && supplierType === "registered") {
        await Promise.all(
          manualPriceItems.map(async (p) => {
            const { data: lastRows, error: lastError } = await supabase
              .from("product_price_history")
              .select("price")
              .eq("product_id", p.id)
              .eq("supplier_id", selectedSupplier)
              .order("created_at", { ascending: false })
              .limit(1);

            if (lastError) throw lastError;

            const previousPrice = lastRows?.[0]?.price ?? null;
            const priceChangePercentage =
              previousPrice && previousPrice > 0
                ? ((p.unitPrice - previousPrice) / previousPrice) * 100
                : null;

            const { error: historyError } = await supabase
              .from("product_price_history")
              .insert({
                product_id: p.id,
                supplier_id: selectedSupplier,
                purchase_order_id: order.id,
                price: p.unitPrice,
                previous_price: previousPrice,
                price_change_percentage: priceChangePercentage,
                created_by: user.id,
                notes: `Precio manual en OC ${orderNumber}`,
              });

            if (historyError) throw historyError;
          })
        );
      }

      return order;
    },
    onSuccess: () => {
      toast.success("Orden de compra creada correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["next_qual_order_number"] });

      // Abrir PDF con el patrón HTML nativo + window.print()
      openPurchaseOrderPrint({
        orderNumber,
        supplierName: selectedSupplierData?.name || "",
        supplierRfc: selectedSupplierData?.rfc ?? undefined,
        createdAt: new Date(),
        items: selectedProducts,
        total,
        description,
      });

      handleClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la orden");
    },
  });

  const handleCreateAndViewPdf = () => {
    createOrderMutation.mutate();
  };

  const resetForm = () => {
    setSelectedSupplier("");
    setSupplierType("");
    setOrderNumber("");
    setDescription("");
    setSelectedProducts([]);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Nueva Orden de Compra a Proveedor
            </DialogTitle>
            <DialogDescription>
              Selecciona productos y genera la orden de compra
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto flex flex-col gap-4">
            {/* Top row - Supplier and Order Info */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Proveedor *</Label>
                <Select value={selectedSupplier} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Registered Suppliers */}
                    {registeredSuppliers && registeredSuppliers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Proveedores Registrados
                        </div>
                        {registeredSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              {s.company_name || s.full_name}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    
                    {/* General Suppliers */}
                    {generalSuppliers && generalSuppliers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1 mt-2 border-t pt-2">
                          <Building2 className="h-3 w-3" />
                          Proveedores Oficiales
                        </div>
                        {generalSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              {s.nombre_comercial || s.razon_social}
                              <Badge variant="outline" className="text-xs ml-1">General</Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
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
                    <p className="text-sm">No hay productos agregados</p>
                    <p className="text-xs">Usa el buscador para agregar productos</p>
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            {selectedProducts.length > 0 && (
              <div className="flex justify-end">
                <div className="w-64 bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between font-bold text-lg">
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
                onClick={handleCreateAndViewPdf}
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

    </>
  );
};
