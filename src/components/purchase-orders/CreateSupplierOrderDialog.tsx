import { useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Package, Plus, Minus } from "lucide-react";

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
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
  const [orderNumber, setOrderNumber] = useState("");
  const [description, setDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_order_dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch products from inventory (these come from CITIO)
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

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const totalAmount = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) => sum + p.quantity * p.unit_price,
      0
    );
  }, [selectedProducts]);

  const toggleProduct = (product: any) => {
    const exists = selectedProducts.find((p) => p.id === product.id);
    if (exists) {
      setSelectedProducts(selectedProducts.filter((p) => p.id !== product.id));
    } else {
      setSelectedProducts([
        ...selectedProducts,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unit_price: product.unit_price || 0,
        },
      ]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          const newQty = Math.max(1, p.quantity + delta);
          return { ...p, quantity: newQty };
        }
        return p;
      })
    );
  };

  const updatePrice = (productId: string, price: number) => {
    setSelectedProducts(
      selectedProducts.map((p) => {
        if (p.id === productId) {
          return { ...p, unit_price: price };
        }
        return p;
      })
    );
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
          amount: totalAmount,
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
        unit_price: p.unit_price,
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
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la orden");
    },
  });

  const resetForm = () => {
    setSelectedSupplier("");
    setOrderNumber("");
    setDescription("");
    setSearchTerm("");
    setSelectedProducts([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Nueva Orden de Compra a Proveedor
          </DialogTitle>
          <DialogDescription>
            Crea una orden de compra seleccionando productos del inventario
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Supplier and Order Number */}
          <div className="grid grid-cols-2 gap-4">
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
                placeholder="OC-2024-001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>

          {/* Product Search */}
          <div className="space-y-2">
            <Label>Buscar Productos</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
                className="pl-10"
              />
            </div>
          </div>

          {/* Product List */}
          <ScrollArea className="flex-1 border rounded-md">
            <div className="p-2 space-y-1">
              {filteredProducts.map((product) => {
                const isSelected = selectedProducts.some(
                  (p) => p.id === product.id
                );
                return (
                  <div
                    key={product.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${
                      isSelected ? "bg-primary/10" : ""
                    }`}
                    onClick={() => toggleProduct(product)}
                  >
                    <Checkbox checked={isSelected} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {product.sku} | Stock: {product.current_stock || 0}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      ${(product.unit_price || 0).toFixed(2)}
                    </p>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="text-center py-4 text-muted-foreground">
                  No se encontraron productos
                </p>
              )}
            </div>
          </ScrollArea>

          {/* Selected Products Summary */}
          {selectedProducts.length > 0 && (
            <div className="border rounded-md p-3 bg-muted/30 space-y-2">
              <p className="font-medium text-sm">
                Productos seleccionados ({selectedProducts.length})
              </p>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {selectedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 truncate">{product.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(product.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center">{product.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => updateQuantity(product.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      value={product.unit_price}
                      onChange={(e) =>
                        updatePrice(product.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-20 h-6 text-sm"
                    />
                    <span className="w-20 text-right font-medium">
                      ${(product.quantity * product.unit_price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t font-medium">
                <span>Total:</span>
                <span>${totalAmount.toFixed(2)} MXN</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => createOrderMutation.mutate()}
            disabled={createOrderMutation.isPending}
          >
            {createOrderMutation.isPending ? "Creando..." : "Crear Orden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
