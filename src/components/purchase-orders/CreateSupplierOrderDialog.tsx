import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, ShoppingCart, Plus, Minus, Loader2 } from "lucide-react";
import { formatSupplierName } from "@/lib/formatters";

interface CreateSupplierOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SelectedProduct {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
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

  // Fetch suppliers (proveedores externos)
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_external_orders"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email");

      if (error) throw error;
      return data;
    },
  });

  // Fetch products from inventory (productos que vienen de CITIO)
  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["inventory_products_for_order"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, citio_id, unit_price, current_stock, category")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!searchTerm) return products;
    
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.sku?.toLowerCase().includes(term) ||
        p.citio_id?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) => sum + p.quantity * p.unit_price,
      0
    );
  }, [selectedProducts]);

  // Toggle product selection
  const toggleProduct = (product: any) => {
    const exists = selectedProducts.find((p) => p.product_id === product.id);
    
    if (exists) {
      setSelectedProducts((prev) =>
        prev.filter((p) => p.product_id !== product.id)
      );
    } else {
      setSelectedProducts((prev) => [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unit_price: product.unit_price || 0,
        },
      ]);
    }
  };

  // Update quantity
  const updateQuantity = (productId: string, delta: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) => {
        if (p.product_id === productId) {
          const newQty = Math.max(1, p.quantity + delta);
          return { ...p, quantity: newQty };
        }
        return p;
      })
    );
  };

  // Update unit price
  const updatePrice = (productId: string, price: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) => {
        if (p.product_id === productId) {
          return { ...p, unit_price: price };
        }
        return p;
      })
    );
  };

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuario no autenticado");
      if (!selectedSupplier) throw new Error("Selecciona un proveedor");
      if (!orderNumber) throw new Error("Ingresa un número de orden");
      if (selectedProducts.length === 0) throw new Error("Selecciona al menos un producto");

      // Create the purchase order
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: orderNumber,
          supplier_id: selectedSupplier,
          amount: totalAmount,
          description: description || `Orden QualMedical a proveedor externo`,
          created_by: user.id,
          status: "pendiente",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const items = selectedProducts.map((p) => ({
        purchase_order_id: order.id,
        product_id: p.product_id,
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
      handleClose();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al crear la orden");
    },
  });

  const handleClose = () => {
    setSelectedSupplier("");
    setOrderNumber("");
    setDescription("");
    setSearchTerm("");
    setSelectedProducts([]);
    onOpenChange(false);
  };

  const isProductSelected = (productId: string) => {
    return selectedProducts.some((p) => p.product_id === productId);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Nueva Orden a Proveedor Externo
          </DialogTitle>
          <DialogDescription>
            Crea una orden de compra desde QualMedical hacia un proveedor externo
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier">Proveedor Destino *</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {formatSupplierName(supplier)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orderNumber">Número de Orden *</Label>
              <Input
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="QM-OC-001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>

          {/* Product Selection */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">Productos del Inventario</Label>
              <Badge variant="outline">
                {selectedProducts.length} seleccionado(s)
              </Badge>
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, SKU o ID CITIO..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex-1 border rounded-md overflow-hidden">
              <ScrollArea className="h-[200px]">
                {loadingProducts ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No se encontraron productos
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredProducts.map((product) => {
                      const isSelected = isProductSelected(product.id);
                      const selectedData = selectedProducts.find(
                        (p) => p.product_id === product.id
                      );

                      return (
                        <div
                          key={product.id}
                          className={`p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                            isSelected ? "bg-primary/5" : ""
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleProduct(product)}
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{product.name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              <span>{product.sku}</span>
                              {product.citio_id && (
                                <Badge variant="outline" className="text-xs">
                                  CITIO
                                </Badge>
                              )}
                              <span>Stock: {product.current_stock || 0}</span>
                            </div>
                          </div>

                          {isSelected && selectedData && (
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateQuantity(product.id, -1)}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={selectedData.quantity}
                                  onChange={(e) => {
                                    const qty = parseInt(e.target.value) || 1;
                                    setSelectedProducts((prev) =>
                                      prev.map((p) =>
                                        p.product_id === product.id
                                          ? { ...p, quantity: Math.max(1, qty) }
                                          : p
                                      )
                                    );
                                  }}
                                  className="w-16 h-7 text-center"
                                  min={1}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => updateQuantity(product.id, 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={selectedData.unit_price}
                                  onChange={(e) =>
                                    updatePrice(product.id, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-24 h-7"
                                  placeholder="Precio"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Summary */}
          {selectedProducts.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">Resumen de la Orden</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Productos:</span>
                <span className="text-right">{selectedProducts.length}</span>
                <span className="text-muted-foreground">Unidades totales:</span>
                <span className="text-right">
                  {selectedProducts.reduce((sum, p) => sum + p.quantity, 0)}
                </span>
                <span className="text-muted-foreground font-medium">Monto Total:</span>
                <span className="text-right font-bold text-primary">
                  ${totalAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => createOrderMutation.mutate()}
            disabled={
              createOrderMutation.isPending ||
              !selectedSupplier ||
              !orderNumber ||
              selectedProducts.length === 0
            }
          >
            {createOrderMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Crear Orden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
