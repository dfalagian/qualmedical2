import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_price: number | null;
  current_stock: number | null;
  price_type_1?: number | null;
  brand?: string | null;
}

interface ProductComboboxProps {
  products: Product[];
  onAddProduct: (
    product: Product,
    quantity: number,
    savedPrice: number,
    manualPrice: number | null
  ) => void;
}

// Helper to get the best available price
const getProductPrice = (product: Product): number => {
  // Priority: unit_price > price_type_1 > 0
  if (product.unit_price != null && product.unit_price > 0) {
    return product.unit_price;
  }
  if (product.price_type_1 != null && product.price_type_1 > 0) {
    return product.price_type_1;
  }
  return 0;
};

export const ProductCombobox = ({ products, onAddProduct }: ProductComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [manualPrice, setManualPrice] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

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

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setManualPrice("");
    setOpen(false);
  };

  const handleAddProduct = () => {
    if (!selectedProduct) return;
    const savedPrice = getProductPrice(selectedProduct);
    const parsedManual = manualPrice.trim() !== "" ? parseFloat(manualPrice) || 0 : null;
    onAddProduct(selectedProduct, quantity, savedPrice, parsedManual);
    // Reset form
    setSelectedProduct(null);
    setQuantity(1);
    setManualPrice("");
    setSearchTerm("");
    setSearchTerm("");
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <Label className="text-sm font-semibold">Agregar Producto</Label>
      
      <div className="space-y-3">
        {/* Product Combobox */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between h-10 text-left font-normal"
            >
              {selectedProduct ? (
                <span className="truncate">{selectedProduct.name}</span>
              ) : (
                <span className="text-muted-foreground">Buscar y seleccionar producto...</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput 
                placeholder="Buscar por nombre o SKU..." 
                value={searchTerm}
                onValueChange={setSearchTerm}
              />
              <CommandList>
                <CommandEmpty>No se encontraron productos.</CommandEmpty>
                <CommandGroup>
                  {filteredProducts.slice(0, 50).map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => handleSelectProduct(product)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU: {product.sku}{product.brand ? ` · Marca: ${product.brand}` : ''} · Stock: {product.current_stock || 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          ${getProductPrice(product).toFixed(2)}
                        </span>
                        <Check
                          className={cn(
                            "h-4 w-4",
                            selectedProduct?.id === product.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Quantity, Price and IVA Row */}
        {selectedProduct && (
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Precio Guardado</Label>
              <div className="h-9 px-3 flex items-center bg-muted rounded-md text-sm font-medium">
                ${getProductPrice(selectedProduct).toFixed(2)}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Precio Manual</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder="Opcional"
                className="w-28 h-9"
              />
            </div>
            <Button
              onClick={handleAddProduct}
              size="sm"
              className="h-9 gap-1"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
