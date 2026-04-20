import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Trash2, Minus, Plus, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { POSClientSelector } from "./POSClientSelector";
import { isIvaExempt } from "@/lib/formatters";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  tipo_precio: string;
  current_stock: number;
}

interface POSCartProps {
  items: CartItem[];
  setItems: (items: CartItem[]) => void;
  priceType: string;
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
  onClose?: () => void;
}

export const POSCart = ({
  items,
  setItems,
  priceType,
  selectedClientId,
  setSelectedClientId,
  onClose,
}: POSCartProps) => {
  const { user } = useAuth();
  const { notifyRecipientsByEvent } = useNotifications();
  const queryClient = useQueryClient();

  const updateQuantity = (productId: string, delta: number) => {
    setItems(
      items
        .map((item) => {
          if (item.product_id !== productId) return item;
          const newQty = item.cantidad + delta;
          if (newQty <= 0) return null;
          if (newQty > item.current_stock) return item;
          return { ...item, cantidad: newQty, importe: newQty * item.precio_unitario };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((i) => i.product_id !== productId));
  };

  // Calculate totals with IVA logic
  const subtotalExento = items
    .filter((i) => isIvaExempt(i.category))
    .reduce((sum, i) => sum + i.importe, 0);
  
  const subtotalGravado = items
    .filter((i) => !isIvaExempt(i.category))
    .reduce((sum, i) => sum + i.importe, 0);

  const iva = subtotalGravado * 0.16;
  const subtotal = subtotalExento + subtotalGravado;
  const total = subtotal + iva;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error("El carrito está vacío");

      // Generate folio
      const { data: folioData, error: folioError } = await supabase.rpc("generate_budget_folio");
      if (folioError) throw folioError;

      // Use selected client or create a generic "Mostrador" client
      let clientId = selectedClientId;
      if (!clientId) {
        // Look for existing "Mostrador" client
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("nombre_cliente", "Venta Mostrador")
          .single();
        
        if (existing) {
          clientId = existing.id;
        } else {
          const { data: newClient, error: clientErr } = await supabase
            .from("clients")
            .insert({ nombre_cliente: "Venta Mostrador" })
            .select("id")
            .single();
          if (clientErr) throw clientErr;
          clientId = newClient.id;
        }
      }

      // Create quote
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          folio: folioData,
          client_id: clientId,
          created_by: user?.id,
          fecha_cotizacion: new Date().toISOString().split("T")[0],
          subtotal,
          total,
          status: "presupuesto",
          concepto: "Venta POS",
        })
        .select("id")
        .single();

      if (quoteError) throw quoteError;

      // Insert items
      const quoteItems = items.map((item) => ({
        quote_id: quote.id,
        product_id: item.product_id,
        nombre_producto: item.name,
        marca: item.brand,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        importe: item.importe,
        tipo_precio: item.tipo_precio,
      }));

      const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems);
      if (itemsError) throw itemsError;

      return { folio: folioData, id: quote.id };
    },
    onSuccess: (data) => {
      toast.success(`Presupuesto ${data.folio} creado exitosamente`);

      // Notify managers about new POS sale
      const clientName = items.length > 0 ? "" : "Mostrador";
      const detalle = items
        .map((i) => `• ${i.name} x${i.cantidad} = $${i.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`)
        .join("\n");

      // Fetch client name for notification
      const sendNotification = async () => {
        let cName = "Venta Mostrador";
        if (selectedClientId) {
          const { data: client } = await supabase
            .from("clients")
            .select("nombre_cliente")
            .eq("id", selectedClientId)
            .single();
          if (client) cName = client.nombre_cliente;
        }

        await notifyRecipientsByEvent("pos_sale", "pos_sale", {
          folio: data.folio,
          vendedor: user?.email || "N/A",
          cliente: cName,
          productos: `${items.length} producto(s)`,
          total: total.toLocaleString("es-MX", { minimumFractionDigits: 2 }),
          detalle,
        });
      };
      sendNotification().catch(console.error);

      setItems([]);
      setSelectedClientId("");
      queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      onClose?.();
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al guardar presupuesto");
    },
  });

  return (
    <div className="rounded-xl border-2 border-border bg-card flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-lg">Carrito</h3>
        <span className="text-sm text-muted-foreground ml-auto">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </span>
      </div>

      {/* Client Selector */}
      <div className="p-4 border-b">
        <POSClientSelector
          selectedClientId={selectedClientId}
          setSelectedClientId={setSelectedClientId}
        />
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto max-h-[40vh] lg:max-h-[35vh]">
        {items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Agrega productos desde el catálogo</p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.product_id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ${item.precio_unitario.toLocaleString("es-MX", { minimumFractionDigits: 2 })} c/u
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => updateQuantity(item.product_id, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-bold text-sm">{item.cantidad}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => updateQuantity(item.product_id, 1)}
                    disabled={item.cantidad >= item.current_stock}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-right shrink-0 w-20">
                  <p className="font-semibold text-sm">
                    ${item.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive shrink-0"
                  onClick={() => removeItem(item.product_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="p-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal exento</span>
            <span>${subtotalExento.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          {subtotalGravado > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal gravado</span>
                <span>${subtotalGravado.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IVA (16%)</span>
                <span>${iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
              </div>
            </>
          )}
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary">${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>

          <Button
            size="lg"
            className="w-full h-14 text-lg font-bold mt-3 rounded-xl"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || items.length === 0}
          >
            <Save className="h-5 w-5 mr-2" />
            {saveMutation.isPending ? "Guardando..." : "Guardar Presupuesto"}
          </Button>
        </div>
      )}
    </div>
  );
};
