import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Lock, Loader2 } from "lucide-react";
import { useQuoteActions } from "@/hooks/useQuoteActions";
import { isIvaExempt } from "@/lib/formatters";

interface AdminEditItem {
  id: string;
  nombre_producto: string;
  marca: string | null;
  lote: string | null;
  fecha_caducidad: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  categoria: string | null;
  is_sub_product?: boolean;
}

interface AdminEditQuote {
  id: string;
  folio: string;
  concepto: string | null;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  notes: string | null;
  client_id: string;
  client: { id: string; nombre_cliente: string };
  subtotal: number;
  total: number;
  items: AdminEditItem[];
}

interface EditApprovedQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: AdminEditQuote | null;
  onSuccess: () => void;
}

export function EditApprovedQuoteDialog({
  open,
  onOpenChange,
  quote,
  onSuccess,
}: EditApprovedQuoteDialogProps) {
  const { updateApprovedQuote, isUpdatingApproved } = useQuoteActions();

  const [clientId, setClientId] = useState("");
  const [folio, setFolio] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fechaCotizacion, setFechaCotizacion] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notes, setNotes] = useState("");
  const [motivo, setMotivo] = useState("");
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});

  // Reset state when a new quote is loaded
  useEffect(() => {
    if (quote && open) {
      setClientId(quote.client_id);
      setFolio(quote.folio);
      setConcepto(quote.concepto || "");
      setFechaCotizacion(quote.fecha_cotizacion);
      setFechaEntrega(quote.fecha_entrega || "");
      setNotes(quote.notes || "");
      setMotivo("");
      setItemPrices(
        Object.fromEntries(quote.items.map((i) => [i.id, i.precio_unitario]))
      );
    }
  }, [quote?.id, open]);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-edit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, nombre_cliente")
        .order("nombre_cliente");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Recalculate totals when prices change
  const { subtotal, iva, total } = useMemo(() => {
    if (!quote) return { subtotal: 0, iva: 0, total: 0 };
    let sub = 0;
    let ivaAmt = 0;
    for (const item of quote.items) {
      const precio = itemPrices[item.id] ?? item.precio_unitario;
      const importe = precio * item.cantidad;
      sub += importe;
      if (!isIvaExempt(item.categoria)) {
        ivaAmt += importe * 0.16;
      }
    }
    return { subtotal: sub, iva: ivaAmt, total: sub + ivaAmt };
  }, [quote, itemPrices]);

  const handleSave = async () => {
    if (!quote) return;
    if (!motivo.trim()) return;

    const items = quote.items.map((item) => {
      const precio = itemPrices[item.id] ?? item.precio_unitario;
      return {
        id: item.id,
        precio_unitario: precio,
        importe: precio * item.cantidad,
      };
    });

    await updateApprovedQuote({
      quoteId: quote.id,
      clientId,
      folio,
      concepto,
      fechaCotizacion,
      fechaEntrega: fechaEntrega || null,
      notes: notes || null,
      subtotal,
      total,
      motivoCorreccion: motivo.trim(),
      items,
    });

    onSuccess();
    onOpenChange(false);
  };

  if (!quote) return null;

  const canSave = motivo.trim().length > 0 && !isUpdatingApproved;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Corrección de cotización aprobada
          </DialogTitle>
        </DialogHeader>

        {/* Warning banner */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Modo corrección de administrador</p>
            <p>
              Esta cotización ya fue aprobada. Solo se pueden corregir datos administrativos
              (cliente, folio, concepto, fechas, notas y precios). El stock y los lotes
              no se modifican.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_cliente}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Folio</Label>
              <Input value={folio} onChange={(e) => setFolio(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Concepto</Label>
              <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha cotización</Label>
              <Input
                type="date"
                value={fechaCotizacion}
                onChange={(e) => setFechaCotizacion(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha entrega</Label>
              <Input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Items table */}
          <div>
            <p className="text-sm font-medium mb-2">Partidas</p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium">Producto</th>
                    <th className="text-left p-3 font-medium w-28">Lote</th>
                    <th className="text-center p-3 font-medium w-20">Cant.</th>
                    <th className="text-right p-3 font-medium w-32">Precio Unit.</th>
                    <th className="text-right p-3 font-medium w-28">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {quote.items.map((item) => {
                    const precio = itemPrices[item.id] ?? item.precio_unitario;
                    const importe = precio * item.cantidad;
                    return (
                      <tr
                        key={item.id}
                        className={item.is_sub_product ? "bg-muted/20" : ""}
                      >
                        <td className="p-3">
                          <p className={`font-medium text-xs ${item.is_sub_product ? "pl-3 text-muted-foreground" : ""}`}>
                            {item.nombre_producto}
                          </p>
                          {item.marca && (
                            <p className="text-xs text-muted-foreground">{item.marca}</p>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3 shrink-0" />
                            {item.lote || "—"}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-muted-foreground">
                            <Lock className="h-3 w-3 shrink-0" />
                            {item.cantidad}
                          </div>
                        </td>
                        <td className="p-3">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="text-right h-8 text-xs"
                            value={precio}
                            onChange={(e) =>
                              setItemPrices((prev) => ({
                                ...prev,
                                [item.id]: parseFloat(e.target.value) || 0,
                              }))
                            }
                          />
                        </td>
                        <td className="p-3 text-right text-xs font-medium">
                          ${importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-2 flex justify-end">
              <div className="text-sm space-y-1 text-right min-w-48">
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span>${subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">IVA (16% insumos):</span>
                  <span>${iva.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between gap-8 font-semibold text-base border-t pt-1">
                  <span>Total:</span>
                  <span>${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Required reason field */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              Motivo de la corrección
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Describe brevemente el motivo de esta corrección..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className={!motivo.trim() ? "border-amber-400 focus-visible:ring-amber-400" : ""}
            />
            {!motivo.trim() && (
              <p className="text-xs text-amber-700">Campo obligatorio para guardar la corrección.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdatingApproved}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            {isUpdatingApproved ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            Guardar corrección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
