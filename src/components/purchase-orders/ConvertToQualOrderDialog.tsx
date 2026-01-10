import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Package } from "lucide-react";

interface ConvertToQualOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  citioOrder: any;
}

export const ConvertToQualOrderDialog = ({
  open,
  onOpenChange,
  citioOrder,
}: ConvertToQualOrderDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [newOrderNumber, setNewOrderNumber] = useState("");

  // Fetch suppliers
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers_for_convert"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name");
      if (error) throw error;
      return data;
    },
  });

  const convertOrderMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Usuario no autenticado");
      if (!selectedSupplier) throw new Error("Selecciona un proveedor");
      if (!newOrderNumber) throw new Error("Ingresa el número de orden");
      if (!citioOrder) throw new Error("No hay orden para convertir");

      // Create the new QualMedical order
      const { data: order, error: orderError } = await supabase
        .from("purchase_orders")
        .insert({
          order_number: newOrderNumber,
          supplier_id: selectedSupplier,
          amount: citioOrder.amount,
          description: `Convertida desde orden CITIO: ${citioOrder.order_number}`,
          created_by: user.id,
          status: "pendiente",
          currency: citioOrder.currency || "MXN",
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Copy order items if they exist
      if (citioOrder.purchase_order_items && citioOrder.purchase_order_items.length > 0) {
        const items = citioOrder.purchase_order_items.map((item: any) => ({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity_ordered: item.quantity_ordered,
          unit_price: item.unit_price,
        }));

        const { error: itemsError } = await supabase
          .from("purchase_order_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return order;
    },
    onSuccess: () => {
      toast.success("Orden convertida a QualMedical correctamente");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al convertir la orden");
    },
  });

  const resetForm = () => {
    setSelectedSupplier("");
    setNewOrderNumber("");
  };

  // Generate suggested order number
  const suggestOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `QM-${year}${month}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg z-50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-green-600" />
            Convertir a Orden QualMedical
          </DialogTitle>
          <DialogDescription>
            Crea una orden de compra QualMedical basada en la orden CITIO
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source order info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs font-semibold text-blue-600 mb-1">Orden CITIO origen</p>
            <p className="font-semibold text-base">{citioOrder?.order_number}</p>
            <p className="text-sm text-muted-foreground">
              Monto: ${citioOrder?.amount?.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {citioOrder?.currency || 'MXN'}
            </p>
          </div>

          {/* Products preview */}
          {citioOrder?.purchase_order_items && citioOrder.purchase_order_items.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Package className="h-4 w-4" />
                Productos a incluir ({citioOrder.purchase_order_items.length})
              </Label>
              <div className="border rounded-lg bg-muted/30 overflow-hidden">
                <ScrollArea className="max-h-32">
                  <div className="divide-y divide-border">
                    {citioOrder.purchase_order_items.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between text-sm py-2.5 px-3 hover:bg-muted/50">
                        <span className="truncate flex-1 pr-3">{item.products?.name || 'Producto'}</span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {item.quantity_ordered} uds
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* New order details */}
          <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg space-y-4">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Nueva Orden QualMedical</p>
            
            <div className="space-y-2">
              <Label htmlFor="supplier-select">Proveedor destino *</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger id="supplier-select" className="bg-background">
                  <SelectValue placeholder="Selecciona el proveedor" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.company_name || s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-number">Número de Orden *</Label>
              <div className="flex gap-2">
                <Input
                  id="order-number"
                  value={newOrderNumber}
                  onChange={(e) => setNewOrderNumber(e.target.value)}
                  placeholder="QM-2024-001"
                  className="flex-1 bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewOrderNumber(suggestOrderNumber())}
                >
                  Generar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => convertOrderMutation.mutate()}
            disabled={convertOrderMutation.isPending || !selectedSupplier || !newOrderNumber}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {convertOrderMutation.isPending ? "Convirtiendo..." : "Convertir Orden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
