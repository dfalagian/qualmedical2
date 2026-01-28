import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface EntryItem {
  id: string;
  codigo: string;
  producto: string;
  lote: string;
  caducidad: string;
  cantidad: number;
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
    codigo: "",
    producto: "",
    lote: "",
    caducidad: "",
    cantidad: 1,
    numeroFactura: "",
    proveedor: ""
  });

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

  const handleAddItem = () => {
    if (!formData.codigo || !formData.producto || !formData.lote || !formData.caducidad || formData.cantidad <= 0) {
      toast({
        title: "Campos incompletos",
        description: "Por favor completa Código, Producto, Lote, Caducidad y Cantidad",
        variant: "destructive"
      });
      return;
    }

    const newItem: EntryItem = {
      id: crypto.randomUUID(),
      codigo: formData.codigo,
      producto: formData.producto,
      lote: formData.lote,
      caducidad: formData.caducidad,
      cantidad: formData.cantidad
    };

    setItems([...items, newItem]);

    // Limpiar campos de producto pero mantener factura y proveedor
    setFormData(prev => ({
      ...prev,
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1
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

      // Por cada item, crear o actualizar el lote correspondiente
      for (const item of items) {
        // Buscar producto por código/barcode
        const { data: existingProduct } = await supabase
          .from("products")
          .select("id")
          .or(`barcode.eq.${item.codigo},sku.eq.${item.codigo}`)
          .single();

        let productId = existingProduct?.id;

        // Si no existe el producto, crearlo
        if (!productId) {
          const { data: newProduct, error: productError } = await supabase
            .from("products")
            .insert({
              sku: item.codigo,
              name: item.producto,
              barcode: item.codigo,
              current_stock: item.cantidad,
              supplier_id: formData.proveedor || null
            })
            .select("id")
            .single();

          if (productError) throw productError;
          productId = newProduct.id;
        }

        // Crear el lote
        const { error: batchError } = await supabase
          .from("product_batches")
          .insert({
            product_id: productId,
            batch_number: item.lote,
            barcode: item.codigo,
            expiration_date: item.caducidad,
            initial_quantity: item.cantidad,
            current_quantity: item.cantidad,
            notes: formData.numeroFactura ? `Factura: ${formData.numeroFactura}` : null
          });

        if (batchError) throw batchError;

        // Actualizar stock del producto
        const { data: currentProduct } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", productId)
          .single();

        await supabase
          .from("products")
          .update({
            current_stock: (currentProduct?.current_stock || 0) + item.cantidad
          })
          .eq("id", productId);
      }
    },
    onSuccess: () => {
      toast({
        title: "Ingreso guardado",
        description: `Se guardaron ${items.length} productos correctamente`
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
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
      codigo: "",
      producto: "",
      lote: "",
      caducidad: "",
      cantidad: 1,
      numeroFactura: "",
      proveedor: ""
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
          {/* Primera fila: Código, Producto, Lote, Caducidad, Cantidad */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                placeholder="Código"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Producto</Label>
              <Input
                value={formData.producto}
                onChange={(e) => setFormData({ ...formData, producto: e.target.value })}
                placeholder="Nombre producto"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Lote</Label>
              <Input
                value={formData.lote}
                onChange={(e) => setFormData({ ...formData, lote: e.target.value.toUpperCase() })}
                placeholder="Nº Lote"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Caducidad</Label>
              <Input
                type="date"
                value={formData.caducidad}
                onChange={(e) => setFormData({ ...formData, caducidad: e.target.value })}
                className="h-9"
              />
            </div>
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

          {/* Segunda fila: Nº Factura, Proveedor, botón Ingresar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
    </Dialog>
  );
}
