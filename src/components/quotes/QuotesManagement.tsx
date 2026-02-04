import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  FileText, 
  Plus, 
  Trash2, 
  ChevronsUpDown,
  Check,
  Calendar,
  Save,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuoteActions } from "@/hooks/useQuoteActions";
import { printQuoteHtml } from "./quoteHtmlPrint";

interface Client {
  id: string;
  nombre_cliente: string;
  razon_social: string | null;
  rfc: string | null;
  cfdi: string | null;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_price: number | null;
  current_stock: number | null;
  brand: string | null;
}

interface Batch {
  id: string;
  batch_number: string;
  expiration_date: string;
  current_quantity: number;
}

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  nombre_producto: string;
  marca: string;
  lote: string;
  fecha_caducidad: Date | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
}

export const QuotesManagement = () => {
  // Quote actions hook
  const { saveQuote, isSaving } = useQuoteActions();
  
  // Saved quote state
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);
  
  // Client selection state
  const [clientOpen, setClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Quote data
  const [folio, setFolio] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fechaCotizacion, setFechaCotizacion] = useState<Date>(new Date());
  const [fechaEntrega, setFechaEntrega] = useState<Date | undefined>(undefined);
  const [facturaAnterior, setFacturaAnterior] = useState("");
  const [fechaFacturaAnterior, setFechaFacturaAnterior] = useState<Date | undefined>(undefined);
  const [montoFacturaAnterior, setMontoFacturaAnterior] = useState("");

  // Product selection state
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Batch selection state
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  
  const [productPrecio, setProductPrecio] = useState("");

  // Quote items
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, nombre_cliente, razon_social, rfc, cfdi")
        .eq("is_active", true)
        .order("nombre_cliente");
      if (error) throw error;
      return data as Client[];
    },
  });

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, current_stock, brand")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  // Fetch batches for selected product
  const { data: productBatches = [] } = useQuery({
    queryKey: ["product-batches-quote", selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", selectedProduct.id)
        .eq("is_active", true)
        .gt("current_quantity", 0)
        .order("expiration_date", { ascending: true });
      if (error) throw error;
      return data as Batch[];
    },
    enabled: !!selectedProduct,
  });

  // Generate folio on mount
  useEffect(() => {
    const generateFolio = async () => {
      const { data, error } = await supabase.rpc("generate_quote_folio");
      if (!error && data) {
        setFolio(data);
      }
    };
    generateFolio();
  }, []);

  // Filter clients
  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const term = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        c.nombre_cliente.toLowerCase().includes(term) ||
        c.razon_social?.toLowerCase().includes(term) ||
        c.rfc?.toLowerCase().includes(term)
    );
  }, [clients, clientSearch]);

  // Filter products
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const term = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
    );
  }, [products, productSearch]);

  // Handle client selection
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientOpen(false);
    setClientSearch("");
  };

  // Handle product selection
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedBatch(null); // Reset batch when product changes
    setProductPrecio(product.unit_price?.toString() || "0");
    setProductOpen(false);
    setProductSearch("");
  };

  // Handle batch selection
  const handleSelectBatch = (batch: Batch) => {
    setSelectedBatch(batch);
    setBatchOpen(false);
  };

  // Add product to quote
  const handleAddProduct = () => {
    if (!selectedProduct) {
      toast.error("Seleccione un producto");
      return;
    }
    if (!selectedBatch) {
      toast.error("Seleccione un lote");
      return;
    }

    const precio = parseFloat(productPrecio) || 0;
    const cantidad = 1; // Default quantity, editable in grid
    const importe = precio * cantidad;

    // Check if this product already exists in the quote with a different batch
    const existingWithDifferentBatch = quoteItems.find(
      item => item.product_id === selectedProduct.id && item.batch_id !== selectedBatch.id
    );
    
    if (existingWithDifferentBatch) {
      toast.warning(
        `"${selectedProduct.name}" ya tiene otro lote (${existingWithDifferentBatch.lote}) en la cotización. Se está agregando con el lote ${selectedBatch.batch_number}.`,
        { duration: 5000 }
      );
    }

    // Warn if batch stock is low
    if (selectedBatch.current_quantity < cantidad) {
      toast.warning(
        `El lote ${selectedBatch.batch_number} tiene solo ${selectedBatch.current_quantity} unidades disponibles.`,
        { duration: 4000 }
      );
    }

    const newItem: QuoteItem = {
      id: crypto.randomUUID(),
      product_id: selectedProduct.id,
      batch_id: selectedBatch.id,
      nombre_producto: selectedProduct.name,
      marca: selectedProduct.brand || "",
      lote: selectedBatch.batch_number,
      fecha_caducidad: new Date(selectedBatch.expiration_date),
      cantidad: cantidad,
      precio_unitario: precio,
      importe: importe,
    };

    setQuoteItems([...quoteItems, newItem]);

    // Reset product form
    setSelectedProduct(null);
    setSelectedBatch(null);
    setProductPrecio("");
  };

  // Remove item from quote
  const handleRemoveItem = (id: string) => {
    setQuoteItems(quoteItems.filter((item) => item.id !== id));
  };

  // Update item quantity
  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    setQuoteItems(quoteItems.map(item => {
      if (item.id === id) {
        const cantidad = Math.max(1, newQuantity);
        return {
          ...item,
          cantidad,
          importe: item.precio_unitario * cantidad
        };
      }
      return item;
    }));
  };

  // Calculate totals
  const subtotal = useMemo(() => {
    return quoteItems.reduce((sum, item) => sum + item.importe, 0);
  }, [quoteItems]);

  const total = subtotal; // Por ahora igual al subtotal, se puede agregar IVA después

  // Detect products with multiple batches in the quote
  const productsWithMultipleBatches = useMemo(() => {
    const productBatchMap = new Map<string, Set<string>>();
    
    quoteItems.forEach(item => {
      if (item.product_id && item.batch_id) {
        if (!productBatchMap.has(item.product_id)) {
          productBatchMap.set(item.product_id, new Set());
        }
        productBatchMap.get(item.product_id)!.add(item.batch_id);
      }
    });

    // Return product IDs that have more than one batch
    const multiLoteProducts: string[] = [];
    productBatchMap.forEach((batches, productId) => {
      if (batches.size > 1) {
        multiLoteProducts.push(productId);
      }
    });
    return multiLoteProducts;
  }, [quoteItems]);

  // Get summary of multi-batch products for display
  const multiBatchSummary = useMemo(() => {
    if (productsWithMultipleBatches.length === 0) return [];
    
    return productsWithMultipleBatches.map(productId => {
      const items = quoteItems.filter(item => item.product_id === productId);
      const totalQuantity = items.reduce((sum, item) => sum + item.cantidad, 0);
      const batches = items.map(item => item.lote).join(", ");
      return {
        productName: items[0].nombre_producto,
        totalQuantity,
        batchCount: items.length,
        batches
      };
    });
  }, [quoteItems, productsWithMultipleBatches]);

  // Date picker popover states
  const [fechaCotizacionOpen, setFechaCotizacionOpen] = useState(false);
  const [fechaEntregaOpen, setFechaEntregaOpen] = useState(false);
  const [fechaFacturaAntOpen, setFechaFacturaAntOpen] = useState(false);

  // Handle save quote as draft
  const handleSaveQuote = async () => {
    if (!selectedClient) {
      toast.error("Seleccione un cliente");
      return;
    }
    if (quoteItems.length === 0) {
      toast.error("Agregue al menos un producto");
      return;
    }

    try {
      const quote = await saveQuote({
        clientId: selectedClient.id,
        folio,
        concepto,
        fechaCotizacion,
        fechaEntrega,
        facturaAnterior,
        fechaFacturaAnterior,
        montoFacturaAnterior: montoFacturaAnterior ? parseFloat(montoFacturaAnterior) : undefined,
        subtotal,
        total,
        items: quoteItems,
      });
      setSavedQuoteId(quote.id);
    } catch (error) {
      // Error already handled by hook
    }
  };

  // Handle print quote
  const handlePrintQuote = () => {
    if (!selectedClient) {
      toast.error("Seleccione un cliente");
      return;
    }
    if (quoteItems.length === 0) {
      toast.error("Agregue al menos un producto");
      return;
    }

    printQuoteHtml({
      folio,
      concepto,
      fechaCotizacion,
      fechaEntrega,
      facturaAnterior,
      fechaFacturaAnterior,
      montoFacturaAnterior: montoFacturaAnterior ? parseFloat(montoFacturaAnterior) : undefined,
      client: selectedClient,
      items: quoteItems,
      subtotal,
      total,
    });
  };

  // Reset form after save or approve
  const resetForm = () => {
    setSelectedClient(null);
    setFolio("");
    setConcepto("");
    setFechaCotizacion(new Date());
    setFechaEntrega(undefined);
    setFacturaAnterior("");
    setFechaFacturaAnterior(undefined);
    setMontoFacturaAnterior("");
    setQuoteItems([]);
    setSavedQuoteId(null);
    // Generate new folio
    const generateNewFolio = async () => {
      const { data, error } = await supabase.rpc("generate_quote_folio");
      if (!error && data) {
        setFolio(data);
      }
    };
    generateNewFolio();
  };

  return (
    <div className="space-y-4">
      {/* Client Search Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nueva Cotización
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client Selector */}
          <div className="space-y-2">
            <Label>Buscar Cliente</Label>
            <Popover open={clientOpen} onOpenChange={setClientOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={clientOpen}
                  className="w-full justify-between h-10 text-left font-normal"
                >
                  {selectedClient ? (
                    <span className="truncate">{selectedClient.nombre_cliente}</span>
                  ) : (
                    <span className="text-muted-foreground">Buscar cliente...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nombre, razón social o RFC..."
                    value={clientSearch}
                    onValueChange={setClientSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                    <CommandGroup>
                      {filteredClients.slice(0, 50).map((client) => (
                        <CommandItem
                          key={client.id}
                          value={client.id}
                          onSelect={() => handleSelectClient(client)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {client.nombre_cliente}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {client.rfc || "Sin RFC"} · {client.razon_social || "Sin razón social"}
                            </p>
                          </div>
                          <Check
                            className={cn(
                              "h-4 w-4",
                              selectedClient?.id === client.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Client Data (auto-filled) */}
          {selectedClient && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nombre Cliente</Label>
                <p className="text-sm font-medium">{selectedClient.nombre_cliente}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">RFC</Label>
                <p className="text-sm font-medium">{selectedClient.rfc || "-"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Razón Social</Label>
                <p className="text-sm font-medium">{selectedClient.razon_social || "-"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">CFDI</Label>
                <p className="text-sm font-medium">{selectedClient.cfdi || "-"}</p>
              </div>
            </div>
          )}

          {/* Quote Info Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Número cotización / Paciente"
              />
            </div>

            <div className="space-y-2">
              <Label>Folio Cotización</Label>
              <Input value={folio} readOnly className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label>Fecha Cotización</Label>
              <Popover open={fechaCotizacionOpen} onOpenChange={setFechaCotizacionOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(fechaCotizacion, "PPP", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaCotizacion}
                    onSelect={(date) => {
                      if (date) setFechaCotizacion(date);
                      setFechaCotizacionOpen(false);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Fecha Entrega</Label>
              <Popover open={fechaEntregaOpen} onOpenChange={setFechaEntregaOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fechaEntrega && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {fechaEntrega ? format(fechaEntrega, "PPP", { locale: es }) : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaEntrega}
                    onSelect={(date) => {
                      setFechaEntrega(date);
                      setFechaEntregaOpen(false);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Factura Anterior</Label>
              <Input
                value={facturaAnterior}
                onChange={(e) => setFacturaAnterior(e.target.value)}
                placeholder="Número de factura"
              />
            </div>

            <div className="space-y-2">
              <Label>Fecha Factura Anterior</Label>
              <Popover open={fechaFacturaAntOpen} onOpenChange={setFechaFacturaAntOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fechaFacturaAnterior && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {fechaFacturaAnterior 
                      ? format(fechaFacturaAnterior, "PPP", { locale: es }) 
                      : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaFacturaAnterior}
                    onSelect={(date) => {
                      setFechaFacturaAnterior(date);
                      setFechaFacturaAntOpen(false);
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Monto Factura Anterior</Label>
              <Input
                type="number"
                value={montoFacturaAnterior}
                onChange={(e) => setMontoFacturaAnterior(e.target.value)}
                placeholder="$0.00"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Selector Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Agregar Productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Product Selector */}
            <div className="space-y-2">
              <Label>Producto</Label>
              <Popover open={productOpen} onOpenChange={setProductOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productOpen}
                    className="w-full justify-between h-10 text-left font-normal"
                  >
                    {selectedProduct ? (
                      <span className="truncate">{selectedProduct.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Buscar producto...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nombre o SKU..."
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron productos.</CommandEmpty>
                      <CommandGroup>
                        {filteredProducts.slice(0, 50).map((product) => {
                          const stockLevel = product.current_stock || 0;
                          const isLowStock = stockLevel <= 0;
                          const isWarningStock = stockLevel > 0 && stockLevel <= 10;
                          
                          return (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={() => handleSelectProduct(product)}
                              className="flex items-center justify-between"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  SKU: {product.sku} · {product.brand || "Sin marca"}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {/* Stock badge - prominently displayed */}
                                <span className={cn(
                                  "text-xs font-bold px-2 py-1 rounded-md min-w-[60px] text-center",
                                  isLowStock && "bg-destructive/15 text-destructive",
                                  isWarningStock && "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
                                  !isLowStock && !isWarningStock && "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                                )}>
                                  {stockLevel} uds
                                </span>
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
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Batch Selector */}
            <div className="space-y-2">
              <Label>Lote</Label>
              <Popover open={batchOpen} onOpenChange={setBatchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={batchOpen}
                    className="w-full justify-between h-10 text-left font-normal"
                    disabled={!selectedProduct}
                  >
                    {selectedBatch ? (
                      <span className="truncate">{selectedBatch.batch_number}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {selectedProduct ? "Seleccionar lote..." : "Primero seleccione producto"}
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar lote..." />
                    <CommandList>
                      <CommandEmpty>No hay lotes disponibles.</CommandEmpty>
                      <CommandGroup>
                        {productBatches.map((batch) => (
                          <CommandItem
                            key={batch.id}
                            value={batch.id}
                            onSelect={() => handleSelectBatch(batch)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{batch.batch_number}</p>
                              <p className="text-xs text-muted-foreground">
                                Cad: {format(new Date(batch.expiration_date), "dd/MM/yyyy")} · Stock: {batch.current_quantity}
                              </p>
                            </div>
                            <Check
                              className={cn(
                                "h-4 w-4",
                                selectedBatch?.id === batch.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Precio Unitario</Label>
              <Input
                type="number"
                step="0.01"
                value={productPrecio}
                onChange={(e) => setProductPrecio(e.target.value)}
                placeholder="$0.00"
              />
            </div>

            <div className="flex items-end">
              <Button onClick={handleAddProduct} className="w-full h-10" disabled={!selectedProduct || !selectedBatch}>
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </div>
          </div>

          {/* Auto-filled batch info */}
          {selectedBatch && selectedProduct && (
            <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg text-sm">
              <div>
                <span className="text-muted-foreground">Marca: </span>
                <span className="font-medium">{selectedProduct.brand || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Lote: </span>
                <span className="font-medium">{selectedBatch.batch_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Caducidad: </span>
                <span className="font-medium">{format(new Date(selectedBatch.expiration_date), "dd/MM/yyyy")}</span>
              </div>
            </div>
          )}

          {/* Products Table */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>F. Caducidad</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">P. Unitario</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No hay productos agregados
                      </TableCell>
                    </TableRow>
                  ) : (
                    quoteItems.map((item) => {
                      const isMultiBatch = item.product_id && productsWithMultipleBatches.includes(item.product_id);
                      return (
                        <TableRow key={item.id} className={isMultiBatch ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {item.nombre_producto}
                              {isMultiBatch && (
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="h-3 w-3" />
                                  Multi-lote
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.marca || "-"}</TableCell>
                          <TableCell>{item.lote || "-"}</TableCell>
                          <TableCell>
                            {item.fecha_caducidad 
                              ? format(item.fecha_caducidad, "dd/MM/yyyy") 
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={1}
                              value={item.cantidad}
                              onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-20 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            ${item.precio_unitario.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${item.importe.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Multi-batch warning banner */}
          {multiBatchSummary.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Atención: Productos con múltiples lotes
                  </p>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
                    {multiBatchSummary.map((item, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{item.productName}</span>: {item.totalQuantity} unidades en {item.batchCount} lotes ({item.batches})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-between items-end pt-4">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sub-Total:</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleSaveQuote}
                disabled={!selectedClient || quoteItems.length === 0 || isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Guardando..." : "Guardar Cotización"}
              </Button>
              <Button
                variant="secondary"
                onClick={handlePrintQuote}
                disabled={!selectedClient || quoteItems.length === 0}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
