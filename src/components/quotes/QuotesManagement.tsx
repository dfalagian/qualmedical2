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
  DollarSign,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuoteActions } from "@/hooks/useQuoteActions";
import { printQuoteHtml } from "./quoteHtmlPrint";
import { QuoteBatchSelector } from "./QuoteBatchSelector";

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
  category: string | null;
  grupo_sat: string | null;
  price_type_1: number | null;
  price_type_2: number | null;
  price_type_3: number | null;
  price_type_4: number | null;
  price_type_5: number | null;
}

type PriceType = "1" | "2" | "3" | "4" | "5" | "manual";

const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  "1": "Tipo 1 - Público",
  "2": "Tipo 2 - Mayoreo",
  "3": "Tipo 3 - Distribuidor",
  "4": "Tipo 4 - Especial",
  "5": "Tipo 5 - VIP",
  "manual": "Precio Manual",
};

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
  tipo_precio: PriceType;
  categoria: string | null;
  // Store all prices for easy switching in grid
  precios_disponibles: {
    price_type_1: number;
    price_type_2: number;
    price_type_3: number;
    price_type_4: number;
    price_type_5: number;
  };
}

interface QuoteToEdit {
  id: string;
  folio: string;
  concepto: string | null;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  factura_anterior: string | null;
  fecha_factura_anterior: string | null;
  monto_factura_anterior: number | null;
  client_id: string;
  client: Client;
  items: Array<{
    id: string;
    product_id: string | null;
    batch_id: string | null;
    nombre_producto: string;
    marca: string | null;
    lote: string | null;
    fecha_caducidad: string | null;
    cantidad: number;
    precio_unitario: number;
    importe: number;
    tipo_precio: string | null;
  }>;
}

interface QuotesManagementProps {
  quoteToEdit?: QuoteToEdit | null;
  onEditComplete?: () => void;
}

export const QuotesManagement = ({ quoteToEdit, onEditComplete }: QuotesManagementProps) => {
  // Quote actions hook
  const { saveQuote, updateQuote, isSaving, isUpdating } = useQuoteActions();
  
  // Edit mode
  const isEditMode = !!quoteToEdit;
  
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
  
  // Batch selector dialog state (for showing multiple batches)
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);
  const [pendingProductForBatch, setPendingProductForBatch] = useState<Product | null>(null);
  
  // Price type selection
  const [selectedPriceType, setSelectedPriceType] = useState<PriceType>("1");
  const [productPrecio, setProductPrecio] = useState("");
  const [isManualPrice, setIsManualPrice] = useState(false);

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

  // Fetch products with all price types
  const { data: products = [] } = useQuery({
    queryKey: ["products-active-with-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, current_stock, brand, category, grupo_sat, price_type_1, price_type_2, price_type_3, price_type_4, price_type_5")
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

  // Load quote data when editing
  useEffect(() => {
    if (quoteToEdit && products.length > 0) {
      setFolio(quoteToEdit.folio);
      setConcepto(quoteToEdit.concepto || "");
      setFechaCotizacion(new Date(quoteToEdit.fecha_cotizacion));
      setFechaEntrega(quoteToEdit.fecha_entrega ? new Date(quoteToEdit.fecha_entrega) : undefined);
      setFacturaAnterior(quoteToEdit.factura_anterior || "");
      setFechaFacturaAnterior(quoteToEdit.fecha_factura_anterior ? new Date(quoteToEdit.fecha_factura_anterior) : undefined);
      setMontoFacturaAnterior(quoteToEdit.monto_factura_anterior?.toString() || "");
      setSelectedClient(quoteToEdit.client);
      setSavedQuoteId(quoteToEdit.id);
      
      // Convert items to QuoteItem format
      const editItems: QuoteItem[] = quoteToEdit.items.map(item => {
        // Find product to get available prices
        const product = products.find(p => p.id === item.product_id);
        
        return {
          id: item.id,
          product_id: item.product_id,
          batch_id: item.batch_id,
          nombre_producto: item.nombre_producto,
          marca: item.marca || "",
          lote: item.lote || "",
          fecha_caducidad: item.fecha_caducidad ? new Date(item.fecha_caducidad) : null,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          importe: item.importe,
          tipo_precio: (item.tipo_precio as PriceType) || "1",
          categoria: product?.category || null,
          precios_disponibles: {
            price_type_1: product?.price_type_1 || 0,
            price_type_2: product?.price_type_2 || 0,
            price_type_3: product?.price_type_3 || 0,
            price_type_4: product?.price_type_4 || 0,
            price_type_5: product?.price_type_5 || 0,
          },
        };
      });
      setQuoteItems(editItems);
    }
  }, [quoteToEdit, products]);

  // Generate folio on mount (only for new quotes)
  useEffect(() => {
    if (!isEditMode) {
      const generateFolio = async () => {
        const { data, error } = await supabase.rpc("generate_quote_folio");
        if (!error && data) {
          setFolio(data);
        }
      };
      generateFolio();
    }
  }, [isEditMode]);

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
        p.sku.toLowerCase().includes(term) ||
        p.brand?.toLowerCase().includes(term) ||
        p.grupo_sat?.toLowerCase().includes(term)
    );
  }, [products, productSearch]);

  // Handle client selection
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setClientOpen(false);
    setClientSearch("");
  };

  // Get price by type for a product
  const getProductPrice = (product: Product, priceType: PriceType): number => {
    if (priceType === "manual") return 0;
    const priceMap: Record<string, number | null> = {
      "1": product.price_type_1,
      "2": product.price_type_2,
      "3": product.price_type_3,
      "4": product.price_type_4,
      "5": product.price_type_5,
    };
    return priceMap[priceType] ?? product.unit_price ?? 0;
  };

  // Handle product selection - now opens batch selector
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedBatch(null); // Reset batch when product changes
    // Set price based on selected price type
    const price = getProductPrice(product, selectedPriceType);
    setProductPrecio(price.toString());
    setIsManualPrice(selectedPriceType === "manual");
    setProductOpen(false);
    setProductSearch("");
    
    // Open batch selector dialog
    setPendingProductForBatch(product);
    setBatchSelectorOpen(true);
  };

  // Handle batch selection from dialog
  const handleBatchSelected = (batchInfo: { batchId: string; batchNumber: string; expirationDate: string; availableQuantity: number } | null) => {
    if (batchInfo && pendingProductForBatch) {
      setSelectedBatch({
        id: batchInfo.batchId,
        batch_number: batchInfo.batchNumber,
        expiration_date: batchInfo.expirationDate,
        current_quantity: batchInfo.availableQuantity,
      });
      
      // Immediately add product with batch
      addProductToQuote(pendingProductForBatch, batchInfo);
    } else if (pendingProductForBatch) {
      // Add product without batch (user chose to skip)
      addProductToQuote(pendingProductForBatch, null);
    }
    
    setPendingProductForBatch(null);
    setBatchSelectorOpen(false);
  };
  
  // Helper function to add product to quote
  const addProductToQuote = (
    product: Product, 
    batchInfo: { batchId: string; batchNumber: string; expirationDate: string; availableQuantity: number } | null
  ) => {
    const precio = parseFloat(productPrecio) || getProductPrice(product, selectedPriceType);
    const cantidad = 1; // Default quantity, editable in grid
    const importe = precio * cantidad;

    // Check if this product already exists in the quote
    const existingProduct = quoteItems.find(
      item => item.product_id === product.id
    );
    
    if (existingProduct) {
      toast.warning(
        `"${product.name}" ya está en la cotización. Puede modificar la cantidad directamente en la grilla.`,
        { duration: 4000 }
      );
      return;
    }

    const newItem: QuoteItem = {
      id: crypto.randomUUID(),
      product_id: product.id,
      batch_id: batchInfo?.batchId || null,
      nombre_producto: product.name,
      marca: product.brand || "",
      lote: batchInfo?.batchNumber || "",
      fecha_caducidad: batchInfo?.expirationDate ? new Date(batchInfo.expirationDate) : null,
      cantidad: cantidad,
      precio_unitario: precio,
      importe: importe,
      tipo_precio: selectedPriceType,
      categoria: product.category,
      precios_disponibles: {
        price_type_1: product.price_type_1 || 0,
        price_type_2: product.price_type_2 || 0,
        price_type_3: product.price_type_3 || 0,
        price_type_4: product.price_type_4 || 0,
        price_type_5: product.price_type_5 || 0,
      },
    };

    setQuoteItems([...quoteItems, newItem]);

    // Reset product form
    setSelectedProduct(null);
    setSelectedBatch(null);
    setProductPrecio("");
  };

  // Handle price type change
  const handlePriceTypeChange = (priceType: PriceType) => {
    setSelectedPriceType(priceType);
    setIsManualPrice(priceType === "manual");
    
    if (selectedProduct) {
      if (priceType === "manual") {
        setProductPrecio(""); // Clear for manual entry
      } else {
        const price = getProductPrice(selectedProduct, priceType);
        setProductPrecio(price.toString());
      }
    }
  };

  // Handle batch selection
  const handleSelectBatch = (batch: Batch) => {
    setSelectedBatch(batch);
    setBatchOpen(false);
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

  // Update item price type
  const handleUpdatePriceType = (id: string, newPriceType: PriceType) => {
    setQuoteItems(quoteItems.map(item => {
      if (item.id === id) {
        let newPrice = item.precio_unitario;
        
        if (newPriceType !== "manual") {
          const priceMap: Record<string, number> = {
            "1": item.precios_disponibles.price_type_1,
            "2": item.precios_disponibles.price_type_2,
            "3": item.precios_disponibles.price_type_3,
            "4": item.precios_disponibles.price_type_4,
            "5": item.precios_disponibles.price_type_5,
          };
          newPrice = priceMap[newPriceType] || 0;
        }
        
        return {
          ...item,
          tipo_precio: newPriceType,
          precio_unitario: newPrice,
          importe: newPrice * item.cantidad
        };
      }
      return item;
    }));
  };

  // Update item manual price
  const handleUpdateManualPrice = (id: string, newPrice: number) => {
    setQuoteItems(quoteItems.map(item => {
      if (item.id === id) {
        const precio = Math.max(0, newPrice);
        return {
          ...item,
          precio_unitario: precio,
          importe: precio * item.cantidad
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

  // Handle save quote as draft (or update existing)
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
      if (isEditMode && quoteToEdit) {
        // Update existing quote
        await updateQuote({
          quoteId: quoteToEdit.id,
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
        onEditComplete?.();
      } else {
        // Create new quote
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
      }
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
    // Reset product selection state
    setSelectedProduct(null);
    setSelectedBatch(null);
    setSelectedPriceType("1");
    setProductPrecio("");
    setIsManualPrice(false);
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
            {isEditMode ? `Editar Cotización - ${folio}` : "Nueva Cotización"}
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
                <PopoverContent className="w-[550px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar por nombre, SKU, marca o grupo SAT..."
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
                              className="flex items-center justify-between py-2"
                            >
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <p className="text-sm font-medium truncate">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  SKU: {product.sku} · <span className="font-medium">{product.brand || "Sin marca"}</span>
                                </p>
                                {product.grupo_sat && (
                                  <p className="text-xs text-muted-foreground/80 truncate max-w-[350px]" title={product.grupo_sat}>
                                    {product.grupo_sat}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Stock badge - prominently displayed */}
                                <span className={cn(
                                  "text-xs font-bold px-2 py-1 rounded-md min-w-[50px] text-center",
                                  isLowStock && "bg-destructive/15 text-destructive",
                                  isWarningStock && "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
                                  !isLowStock && !isWarningStock && "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                                )}>
                                  {stockLevel}
                                </span>
                                <span className="text-sm font-semibold text-primary min-w-[70px] text-right">
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

            {/* Info: product will be added after selecting batch */}
          </div>

          {/* Price types info when product is selected */}
          {selectedProduct && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Precios disponibles para <span className="font-medium text-foreground">{selectedProduct.name}</span>:</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <div className="p-2 rounded border bg-background">
                  <span className="text-muted-foreground block">T1 - Público</span>
                  <span className="font-semibold">${(selectedProduct.price_type_1 || 0).toFixed(2)}</span>
                </div>
                <div className="p-2 rounded border bg-background">
                  <span className="text-muted-foreground block">T2 - Mayoreo</span>
                  <span className="font-semibold">${(selectedProduct.price_type_2 || 0).toFixed(2)}</span>
                </div>
                <div className="p-2 rounded border bg-background">
                  <span className="text-muted-foreground block">T3 - Distribuidor</span>
                  <span className="font-semibold">${(selectedProduct.price_type_3 || 0).toFixed(2)}</span>
                </div>
                <div className="p-2 rounded border bg-background">
                  <span className="text-muted-foreground block">T4 - Especial</span>
                  <span className="font-semibold">${(selectedProduct.price_type_4 || 0).toFixed(2)}</span>
                </div>
                <div className="p-2 rounded border bg-background">
                  <span className="text-muted-foreground block">T5 - VIP</span>
                  <span className="font-semibold">${(selectedProduct.price_type_5 || 0).toFixed(2)}</span>
                </div>
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
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead>Tipo Precio</TableHead>
                    <TableHead className="text-right">P. Unitario</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No hay productos agregados
                      </TableCell>
                    </TableRow>
                  ) : (
                    quoteItems.map((item) => {
                      const isMultiBatch = item.product_id && productsWithMultipleBatches.includes(item.product_id);
                      const isManual = item.tipo_precio === "manual";
                      return (
                        <TableRow key={item.id} className={isMultiBatch ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[180px]">{item.nombre_producto}</span>
                                {isMultiBatch && (
                                  <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                    <AlertTriangle className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground">{item.marca || ""}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{item.lote || "-"}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.fecha_caducidad ? format(item.fecha_caducidad, "dd/MM/yy") : ""}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={item.cantidad}
                              onChange={(e) => handleUpdateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-16 h-8 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={item.tipo_precio} 
                              onValueChange={(v) => handleUpdatePriceType(item.id, v as PriceType)}
                            >
                              <SelectTrigger className="w-[130px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">T1 - Público</SelectItem>
                                <SelectItem value="2">T2 - Mayoreo</SelectItem>
                                <SelectItem value="3">T3 - Distrib.</SelectItem>
                                <SelectItem value="4">T4 - Especial</SelectItem>
                                <SelectItem value="manual">Manual</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            {isManual ? (
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                value={item.precio_unitario}
                                onChange={(e) => handleUpdateManualPrice(item.id, parseFloat(e.target.value) || 0)}
                                className="w-24 h-8 text-right"
                              />
                            ) : (
                              <span className="font-medium">${item.precio_unitario.toFixed(2)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            ${item.importe.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
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
              {isEditMode && (
                <Button
                  variant="ghost"
                  onClick={onEditComplete}
                >
                  Cancelar
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSaveQuote}
                disabled={!selectedClient || quoteItems.length === 0 || isSaving || isUpdating}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving || isUpdating ? "Guardando..." : isEditMode ? "Actualizar Cotización" : "Guardar Cotización"}
              </Button>
              {isEditMode && (
                <Button
                  variant="secondary"
                  onClick={handlePrintQuote}
                  disabled={!selectedClient || quoteItems.length === 0}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir PDF
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Batch Selector Dialog */}
      {pendingProductForBatch && (
        <QuoteBatchSelector
          open={batchSelectorOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPendingProductForBatch(null);
            }
            setBatchSelectorOpen(open);
          }}
          productId={pendingProductForBatch.id}
          productName={pendingProductForBatch.name}
          onSelect={handleBatchSelected}
        />
      )}
    </div>
  );
};
