import { useState, useMemo } from "react";
import { format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, ChevronsUpDown, Check, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface NewBatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName?: string;
  productId?: string;
  onConfirm: (batchNumber: string, expirationDate: string, selectedProductId?: string, selectedProductName?: string) => void;
}

export function NewBatchModal({ open, onOpenChange, productName, productId, onConfirm }: NewBatchModalProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(undefined);
  const [dateInputValue, setDateInputValue] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Product search state
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(productId);
  const [selectedProductName, setSelectedProductName] = useState<string>(productName || "");

  const showProductSearch = !productName;

  // Fetch products only when search is needed
  const { data: productos = [] } = useQuery({
    queryKey: ["products-list-batch-modal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, brand, barcode")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open && showProductSearch
  });

  const filteredProducts = useMemo(() => {
    if (!productSearch) return productos;
    const search = productSearch.toLowerCase();
    return productos.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search) ||
      (p.brand && p.brand.toLowerCase().includes(search)) ||
      (p.barcode && p.barcode.toLowerCase().includes(search))
    );
  }, [productos, productSearch]);

  const handleSelectProduct = (id: string) => {
    const product = productos.find(p => p.id === id);
    if (product) {
      setSelectedProductId(product.id);
      setSelectedProductName(product.name);
    }
    setProductSearchOpen(false);
    setProductSearch("");
  };

  const handleConfirm = () => {
    const finalProductName = showProductSearch ? selectedProductName : productName;
    if (!batchNumber.trim() || !expirationDate || (showProductSearch && !selectedProductId)) return;

    const formattedDate = format(expirationDate, "yyyy-MM-dd");
    onConfirm(batchNumber.toUpperCase().trim(), formattedDate, selectedProductId, finalProductName);

    resetForm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setBatchNumber("");
    setExpirationDate(undefined);
    setDateInputValue("");
    if (showProductSearch) {
      setSelectedProductId(undefined);
      setSelectedProductName("");
    }
  };

  const handleDateInputChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    let formatted = '';
    if (digits.length > 0) formatted = digits.substring(0, 2);
    if (digits.length > 2) formatted += '/' + digits.substring(2, 4);
    if (digits.length > 4) formatted += '/' + digits.substring(4, 8);

    setDateInputValue(formatted);

    if (formatted.length === 10) {
      const parsedDate = parse(formatted, "dd/MM/yyyy", new Date());
      if (isValid(parsedDate) && parsedDate >= new Date(new Date().setHours(0, 0, 0, 0))) {
        setExpirationDate(parsedDate);
      }
    } else {
      setExpirationDate(undefined);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    setExpirationDate(date);
    if (date) setDateInputValue(format(date, "dd/MM/yyyy"));
    setCalendarOpen(false);
  };

  const isConfirmDisabled = !batchNumber.trim() || !expirationDate || (showProductSearch && !selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Lote</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product: show search or static name */}
          <div className="space-y-2">
            <Label>Producto</Label>
            {showProductSearch ? (
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productSearchOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedProductName || "Buscar producto..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0 z-[9999]" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nombre, SKU o marca..."
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron productos</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {filteredProducts.map(product => (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={handleSelectProduct}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedProductId === product.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{product.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {product.sku}{product.brand ? ` • ${product.brand}` : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="font-medium">{productName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="batchNumber">Número de Lote</Label>
            <Input
              id="batchNumber"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
              placeholder="Ej: LOT-2024-001"
              autoFocus={!showProductSearch}
            />
          </div>

          <div className="space-y-2">
            <Label>Fecha de Caducidad</Label>
            <div className="flex gap-2">
              <Input
                value={dateInputValue}
                onChange={(e) => handleDateInputChange(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="flex-1"
                maxLength={10}
              />
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={expirationDate}
                    onSelect={handleCalendarSelect}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato: dd/mm/aaaa (ej: 15/12/2025)
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirmDisabled}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
