import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react";
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
}

interface ProductComboboxProps {
  products: Product[];
  onAddProduct: (product: Product, quantity: number, unitPrice: number, hasIva: boolean) => void;
}

export const ProductCombobox = ({ products, onAddProduct }: ProductComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [hasIva, setHasIva] = useState(false);
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
    setUnitPrice(product.unit_price || 0);
    setOpen(false);
  };

  const handleAddProduct = () => {
    if (!selectedProduct) return;
    onAddProduct(selectedProduct, quantity, unitPrice, hasIva);
    // Reset form
    setSelectedProduct(null);
    setQuantity(1);
    setUnitPrice(0);
    setHasIva(false);
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
                          SKU: {product.sku} · Stock: {product.current_stock || 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          ${(product.unit_price || 0).toFixed(2)}
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
              <Label className="text-xs">Precio Unit.</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-24 h-9"
              />
            </div>
            <div className="flex items-center gap-2 h-9">
              <input
                type="checkbox"
                id="has-iva"
                checked={hasIva}
                onChange={(e) => setHasIva(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="has-iva" className="text-xs cursor-pointer">
                +IVA (16%)
              </Label>
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
