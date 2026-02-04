import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Trash2, Plus, ChevronsUpDown, Check, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { NewBatchModal } from "./NewBatchModal";
import { QuickTagAssignment } from "./QuickTagAssignment";
interface EntryItem {
  id: string;
  productId: string;
  batchId?: string; // Si es lote existente
  codigo: string;
  producto: string;
  lote: string;
  caducidad: string;
  cantidad: number;
  isExistingBatch: boolean;
  assignedTagsCount?: number; // Contador de tags asignados
}

interface ProductEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductEntryDialog({ open, onOpenChange }: ProductEntryDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "dd/MM/yyyy", { locale: es });

  // Form state para la línea de ingreso
  const [formData, setFormData] = useState({
    selectedProductId: "",
    selectedBatchId: "",
    codigo: "",
    producto: "",
    lote: "",
    caducidad: "",
    cantidad: 1,
    numeroFactura: "",
    proveedor: "",
    almacenId: "",
    isExistingBatch: false
  });

  // Estado para el combobox de productos
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Estado para el combobox de lotes
  const [batchSearchOpen, setBatchSearchOpen] = useState(false);

  // Estado para el modal de nuevo lote
  const [newBatchModalOpen, setNewBatchModalOpen] = useState(false);

  // Estado para el modal de asignación de tag
  const [tagAssignmentOpen, setTagAssignmentOpen] = useState(false);
  const [tagAssignmentItem, setTagAssignmentItem] = useState<EntryItem | null>(null);

  // Lista de items ingresados
  const [items, setItems] = useState<EntryItem[]>([]);

  // Fetch proveedores (profiles con rol proveedor)
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .order("company_name");
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch almacenes
  const { data: almacenes = [] } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data;
    }
  });

  // Set default warehouse to "Almacén Principal" when data loads
  useEffect(() => {
    if (almacenes.length > 0 && !formData.almacenId) {
      const principal = almacenes.find(a => a.name.toLowerCase().includes("principal") || a.code === "PRINCIPAL");
      if (principal) {
        setFormData(prev => ({ ...prev, almacenId: principal.id }));
      } else {
        // If no "principal" found, use first warehouse
        setFormData(prev => ({ ...prev, almacenId: almacenes[0].id }));
      }
    }
  }, [almacenes]);

  // Fetch productos existentes
  const { data: productos = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, barcode")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data;
    }
  });

  // Filtrar productos según búsqueda
  const filteredProducts = useMemo(() => {
    if (!productSearch) return productos;
    const search = productSearch.toLowerCase();
    return productos.filter(p => 
      p.name.toLowerCase().includes(search) ||
      p.sku.toLowerCase().includes(search) ||
      (p.barcode && p.barcode.toLowerCase().includes(search))
    );
  }, [productos, productSearch]);

  // Fetch lotes del producto seleccionado
  const { data: productBatches = [] } = useQuery({
    queryKey: ["product-batches", formData.selectedProductId],
    queryFn: async () => {
      if (!formData.selectedProductId) return [];
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number, expiration_date, current_quantity")
        .eq("product_id", formData.selectedProductId)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!formData.selectedProductId
  });

  // Manejar selección de producto
  const handleSelectProduct = (productId: string) => {
    const product = productos.find(p => p.id === productId);
    if (product) {
      setFormData(prev => ({
        ...prev,
        selectedProductId: product.id,
        selectedBatchId: "",
        codigo: product.barcode || product.sku,
        producto: product.name,
        lote: "",
        caducidad: "",
        isExistingBatch: false
      }));
    }
    setProductSearchOpen(false);
    setProductSearch("");
  };

  // Manejar selección de lote existente
  const handleSelectBatch = (batchId: string) => {
    if (batchId === "new") {
      // Abrir modal para crear nuevo lote
      setBatchSearchOpen(false);
      setNewBatchModalOpen(true);
    } else {
      const batch = productBatches.find(b => b.id === batchId);
      if (batch) {
        setFormData(prev => ({
          ...prev,
          selectedBatchId: batch.id,
          lote: batch.batch_number,
          caducidad: batch.expiration_date,
          isExistingBatch: true
        }));
      }
      setBatchSearchOpen(false);
    }
  };

  // Manejar confirmación del nuevo lote desde el modal
  const handleNewBatchConfirm = (batchNumber: string, expirationDate: string) => {
    setFormData(prev => ({
      ...prev,
      selectedBatchId: "",
      lote: batchNumber,
      caducidad: expirationDate,
      isExistingBatch: false
    }));
  };

  const handleAddItem = () => {
    if (!formData.selectedProductId || !formData.lote || !formData.caducidad || formData.cantidad <= 0) {
      toast({
        title: "Campos incompletos",
        description: "Por favor selecciona un Producto y completa Lote, Caducidad y Cantidad",
        variant: "destructive"
      });
      return;
    }

    const newItem: EntryItem = {
      id: crypto.randomUUID(),
      productId: formData.selectedProductId,
      batchId: formData.isExistingBatch ? formData.selectedBatchId : undefined,
      codigo: formData.codigo,
      producto: formData.producto,
      lote: formData.lote,
      caducidad: formData.caducidad,
      cantidad: formData.cantidad,
      isExistingBatch: formData.isExistingBatch
    };

    setItems([...items, newItem]);

    // Limpiar campos de producto pero mantener factura y proveedor
    setFormData(prev => ({
      ...prev,
      selectedProductId: "",
      selectedBatchId: "",
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1,
      isExistingBatch: false
    }));

    toast({
      title: "Producto agregado",
      description: `${newItem.producto} x${newItem.cantidad} agregado a la lista`
    });
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Mutation para guardar todo el ingreso
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) {
        throw new Error("No hay productos para guardar");
      }

      for (const item of items) {
        if (item.isExistingBatch && item.batchId) {
          // Si es lote existente, solo actualizar cantidad
          const { data: currentBatch } = await supabase
            .from("product_batches")
            .select("current_quantity, initial_quantity")
            .eq("id", item.batchId)
            .single();

          await supabase
            .from("product_batches")
            .update({
              current_quantity: (currentBatch?.current_quantity || 0) + item.cantidad,
              initial_quantity: (currentBatch?.initial_quantity || 0) + item.cantidad
            })
            .eq("id", item.batchId);
        } else {
          // Crear nuevo lote
          const { error: batchError } = await supabase
            .from("product_batches")
            .insert({
              product_id: item.productId,
              batch_number: item.lote,
              barcode: item.codigo,
              expiration_date: item.caducidad,
              initial_quantity: item.cantidad,
              current_quantity: item.cantidad,
              notes: formData.numeroFactura ? `Factura: ${formData.numeroFactura}` : null
            });

          if (batchError) throw batchError;
        }

        // Actualizar stock del producto
        const { data: currentProduct } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", item.productId)
          .single();

        await supabase
          .from("products")
          .update({
            current_stock: (currentProduct?.current_stock || 0) + item.cantidad
          })
          .eq("id", item.productId);
      }
    },
    onSuccess: () => {
      toast({
        title: "Ingreso guardado",
        description: `Se guardaron ${items.length} productos correctamente`
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleClose = () => {
    setFormData({
      selectedProductId: "",
      selectedBatchId: "",
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1,
      numeroFactura: "",
      proveedor: "",
      almacenId: "",
      isExistingBatch: false
    });
    setItems([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-bold">Ingreso Producto</DialogTitle>
          <span className="text-sm text-muted-foreground">Fecha: {today}</span>
        </DialogHeader>

        <div className="space-y-4">
          {/* Primera fila: Producto (combobox), Código (readonly), Lote, Caducidad, Cantidad */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* Selector de Producto con búsqueda */}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Producto</Label>
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productSearchOpen}
                    className="w-full h-9 justify-between font-normal"
                  >
                    {formData.producto || "Buscar producto..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Buscar por nombre, código o SKU..." 
                      value={productSearch}
                      onValueChange={setProductSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No se encontraron productos.</CommandEmpty>
                      <CommandGroup className="max-h-[200px] overflow-auto">
                        {filteredProducts.map((product) => (
                          <CommandItem
                            key={product.id}
                            value={product.id}
                            onSelect={handleSelectProduct}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.selectedProductId === product.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{product.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {product.barcode || product.sku}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Código - solo lectura, se llena automáticamente */}
            <div className="space-y-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={formData.codigo}
                readOnly
                placeholder="Código"
                className="h-9 bg-muted"
              />
            </div>

            {/* Selector de Lote con opción de nuevo o existente */}
            <div className="space-y-1">
              <Label className="text-xs">Lote</Label>
              <Popover open={batchSearchOpen} onOpenChange={setBatchSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={batchSearchOpen}
                    className="w-full h-9 justify-between font-normal"
                    disabled={!formData.selectedProductId}
                  >
                    {formData.lote || "Seleccionar lote..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar lote..." />
                    <CommandList>
                      <CommandEmpty>No se encontraron lotes</CommandEmpty>
                      <CommandGroup heading="Lotes existentes">
                        {productBatches.map((batch) => (
                          <CommandItem
                            key={batch.id}
                            value={batch.id}
                            onSelect={handleSelectBatch}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.selectedBatchId === batch.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col flex-1">
                              <span className="font-medium">{batch.batch_number}</span>
                              <span className="text-xs text-muted-foreground">
                                Cad: {batch.expiration_date} | Stock: {batch.current_quantity}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup>
                        <CommandItem
                          value="new"
                          onSelect={handleSelectBatch}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Crear lote nuevo
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Caducidad</Label>
              <Input
                type="date"
                value={formData.caducidad}
                onChange={(e) => setFormData({ ...formData, caducidad: e.target.value })}
                className="h-9"
                disabled={formData.isExistingBatch}
              />
            </div>
          </div>

          {/* Segunda fila: Cantidad, Nº Factura, Proveedor, botón Ingresar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Cantidad</Label>
              <Input
                type="number"
                min="1"
                value={formData.cantidad}
                onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value) || 1 })}
                className="h-9"
              />
            </div>
          </div>

          {/* Tercera fila: Nº Factura, Proveedor, Almacén, botón Ingresar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Nº Factura</Label>
              <Input
                value={formData.numeroFactura}
                onChange={(e) => setFormData({ ...formData, numeroFactura: e.target.value.toUpperCase() })}
                placeholder="Número de factura"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proveedor</Label>
              <Select
                value={formData.proveedor}
                onValueChange={(value) => setFormData({ ...formData, proveedor: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.company_name || p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Almacén</Label>
              <Select
                value={formData.almacenId}
                onValueChange={(value) => setFormData({ ...formData, almacenId: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar almacén..." />
                </SelectTrigger>
                <SelectContent>
                  {almacenes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={handleAddItem} className="w-full h-9">
                <Plus className="h-4 w-4 mr-1" />
                Ingresar
              </Button>
            </div>
          </div>

          {/* Tabla de productos ingresados */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[100px]">Lote</TableHead>
                  <TableHead className="w-[110px]">Caducidad</TableHead>
                  <TableHead className="w-[80px] text-right">Cantidad</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No hay productos ingresados. Usa el formulario de arriba para agregar.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                      <TableCell>{item.producto}</TableCell>
                      <TableCell className="font-mono text-xs">{item.lote}</TableCell>
                      <TableCell>{item.caducidad}</TableCell>
                      <TableCell className="text-right font-medium">{item.cantidad}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Asignar Tag RFID"
                            onClick={() => {
                              setTagAssignmentItem(item);
                              setTagAssignmentOpen(true);
                            }}
                          >
                            <Link2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Botón Guardar */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              onClick={() => saveMutation.mutate()}
              disabled={items.length === 0 || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Modal para crear nuevo lote */}
      <NewBatchModal
        open={newBatchModalOpen}
        onOpenChange={setNewBatchModalOpen}
        productName={formData.producto}
        onConfirm={handleNewBatchConfirm}
      />

      {/* Modal para asignar tag RFID */}
      {tagAssignmentItem && (
        <QuickTagAssignment
          open={tagAssignmentOpen}
          onOpenChange={(open) => {
            setTagAssignmentOpen(open);
            if (!open) setTagAssignmentItem(null);
          }}
          productId={tagAssignmentItem.productId}
          productName={tagAssignmentItem.producto}
          batchId={tagAssignmentItem.batchId}
          batchNumber={tagAssignmentItem.lote}
          mode="product-entry"
          quantity={tagAssignmentItem.cantidad}
        />
      )}
    </Dialog>
  );
}
