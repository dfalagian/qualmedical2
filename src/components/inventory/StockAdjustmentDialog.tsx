import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, ScanBarcode, Package } from "lucide-react";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  current_stock: number;
  minimum_stock: number;
}

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  mode?: "increment" | "decrement";
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  product: initialProduct,
  mode: initialMode = "increment",
}: StockAdjustmentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  const [product, setProduct] = useState<Product | null>(initialProduct || null);
  const [mode, setMode] = useState<"increment" | "decrement">(initialMode);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Reset state when dialog opens/closes or product changes
  useEffect(() => {
    if (open) {
      setProduct(initialProduct || null);
      setMode(initialMode);
      setQuantity(1);
      setNotes("");
      setBarcodeSearch("");
      // Focus barcode input if no product provided
      if (!initialProduct) {
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      }
    }
  }, [open, initialProduct, initialMode]);

  // Search product by barcode
  const searchByBarcode = async (barcode: string) => {
    if (!barcode.trim()) return;
    
    setIsSearching(true);
    try {
      const cleanBarcode = barcode.trim();
      
      // Search by barcode or SKU
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, barcode, name, current_stock, minimum_stock")
        .or(`barcode.eq.${cleanBarcode},sku.ilike.%${cleanBarcode}%`)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProduct(data);
        setBarcodeSearch("");
        toast({
          title: "Producto encontrado",
          description: data.name,
        });
      } else {
        toast({
          title: "Producto no encontrado",
          description: `No se encontró producto con código "${cleanBarcode}"`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error searching product:", error);
      toast({
        title: "Error",
        description: "Error al buscar el producto",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle barcode input - detect Enter key from scanner
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchByBarcode(barcodeSearch);
    }
  };

  // Stock adjustment mutation
  const adjustStockMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No hay producto seleccionado");

      const newStock = mode === "increment" 
        ? product.current_stock + quantity
        : Math.max(0, product.current_stock - quantity);

      // Update product stock
      const { error: productError } = await supabase
        .from("products")
        .update({ current_stock: newStock })
        .eq("id", product.id);

      if (productError) throw productError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Register movement
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          product_id: product.id,
          movement_type: mode === "increment" ? "entrada" : "salida",
          quantity: mode === "increment" ? quantity : -quantity,
          previous_stock: product.current_stock,
          new_stock: newStock,
          notes: notes || `Ajuste manual de stock (${mode === "increment" ? "+" : "-"}${quantity})`,
          location: "Ajuste Manual",
          created_by: user?.id || null,
        });

      if (movementError) throw movementError;

      return { newStock, productName: product.name };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      onOpenChange(false);
      toast({
        title: mode === "increment" ? "Stock incrementado" : "Stock decrementado",
        description: `${result.productName}: nuevo stock = ${result.newStock}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al ajustar stock",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "increment" ? (
              <Plus className="h-5 w-5 text-green-600" />
            ) : (
              <Minus className="h-5 w-5 text-red-600" />
            )}
            {mode === "increment" ? "Entrada de Stock" : "Salida de Stock"}
          </DialogTitle>
          <DialogDescription>
            Ajuste manual de inventario sin RFID
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode scanner input - only show if no product selected */}
          {!product && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ScanBarcode className="h-4 w-4" />
                Escanear Código de Barras
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={barcodeInputRef}
                  placeholder="Escanee o escriba el código..."
                  value={barcodeSearch}
                  onChange={(e) => setBarcodeSearch(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  autoFocus
                />
                <Button
                  variant="outline"
                  onClick={() => searchByBarcode(barcodeSearch)}
                  disabled={isSearching || !barcodeSearch.trim()}
                >
                  {isSearching ? "..." : "Buscar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Escanee el código de barras del producto o escriba el SKU
              </p>
            </div>
          )}

          {/* Selected product info */}
          {product && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      SKU: {product.sku}
                      {product.barcode && ` | CB: ${product.barcode}`}
                    </p>
                  </div>
                </div>
                {!initialProduct && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProduct(null);
                      setTimeout(() => barcodeInputRef.current?.focus(), 100);
                    }}
                  >
                    Cambiar
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Stock actual:</span>
                <Badge
                  variant={product.current_stock <= product.minimum_stock ? "destructive" : "default"}
                >
                  {product.current_stock}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  (mínimo: {product.minimum_stock})
                </span>
              </div>
            </div>
          )}

          {/* Mode toggle */}
          {product && (
            <div className="flex gap-2">
              <Button
                variant={mode === "increment" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setMode("increment")}
              >
                <Plus className="h-4 w-4" />
                Entrada
              </Button>
              <Button
                variant={mode === "decrement" ? "destructive" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setMode("decrement")}
              >
                <Minus className="h-4 w-4" />
                Salida
              </Button>
            </div>
          )}

          {/* Quantity input */}
          {product && (
            <div className="space-y-2">
              <Label>Cantidad</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="text-center w-24"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {mode === "decrement" && quantity > product.current_stock && (
                <p className="text-xs text-destructive">
                  La cantidad excede el stock actual
                </p>
              )}
            </div>
          )}

          {/* Notes */}
          {product && (
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                placeholder="Motivo del ajuste..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {/* Preview */}
          {product && (
            <div className="p-3 border rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Resultado:</p>
              <p className="text-lg">
                {product.current_stock}{" "}
                <span className={mode === "increment" ? "text-green-600" : "text-red-600"}>
                  {mode === "increment" ? `+ ${quantity}` : `- ${quantity}`}
                </span>{" "}
                = {mode === "increment" 
                    ? product.current_stock + quantity 
                    : Math.max(0, product.current_stock - quantity)}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => adjustStockMutation.mutate()}
            disabled={
              !product || 
              adjustStockMutation.isPending ||
              (mode === "decrement" && quantity > product.current_stock)
            }
            variant={mode === "increment" ? "default" : "destructive"}
          >
            {adjustStockMutation.isPending
              ? "Guardando..."
              : mode === "increment"
              ? `Agregar ${quantity}`
              : `Retirar ${quantity}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
