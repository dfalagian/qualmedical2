import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Check, Link2, Unlink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LinkInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    supplier_id: string;
    invoice_id?: string | null;
  } | null;
}

export const LinkInvoiceDialog = ({
  open,
  onOpenChange,
  order,
}: LinkInvoiceDialogProps) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Fetch invoices for this supplier
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices_for_linking", order?.supplier_id],
    queryFn: async () => {
      if (!order?.supplier_id) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, emisor_nombre, fecha_emision, status, currency")
        .eq("supplier_id", order.supplier_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!order?.supplier_id,
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    if (!searchTerm) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(term) ||
        (inv.emisor_nombre || "").toLowerCase().includes(term)
    );
  }, [invoices, searchTerm]);

  const linkMutation = useMutation({
    mutationFn: async (invoiceId: string | null) => {
      if (!order) throw new Error("No hay orden seleccionada");
      const { error } = await supabase
        .from("purchase_orders")
        .update({ invoice_id: invoiceId })
        .eq("id", order.id);
      if (error) throw error;
    },
    onSuccess: (_, invoiceId) => {
      toast.success(invoiceId ? "Factura vinculada correctamente" : "Factura desvinculada");
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al vincular factura");
    },
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pagada":
        return <Badge className="bg-success text-xs">Pagada</Badge>;
      case "rechazada":
        return <Badge variant="destructive" className="text-xs">Rechazada</Badge>;
      case "en_revision":
        return <Badge className="bg-warning text-xs">En Revisión</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Pendiente</Badge>;
    }
  };

  const handleLink = () => {
    if (selectedInvoiceId) {
      linkMutation.mutate(selectedInvoiceId);
    }
  };

  const handleUnlink = () => {
    linkMutation.mutate(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Factura
          </DialogTitle>
          <DialogDescription>
            Selecciona la factura de compra a vincular con la orden{" "}
            <strong>{order?.order_number}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Current linked invoice */}
        {order?.invoice_id && (
          <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-primary" />
              <span className="font-medium">Factura actualmente vinculada</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={linkMutation.isPending}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <Unlink className="h-3 w-3" />
              Desvincular
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de factura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Invoice list */}
        <ScrollArea className="h-[350px] border rounded-lg">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
              Cargando facturas...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8 gap-2">
              <FileText className="h-8 w-8 opacity-50" />
              {invoices?.length === 0
                ? "No hay facturas para este proveedor"
                : "No se encontraron facturas"}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredInvoices.map((invoice) => {
                const isCurrentlyLinked = order?.invoice_id === invoice.id;
                const isSelected = selectedInvoiceId === invoice.id;
                return (
                  <button
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(isSelected ? null : invoice.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isCurrentlyLinked
                        ? "border-primary/40 bg-primary/5"
                        : isSelected
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">
                            {invoice.invoice_number}
                          </span>
                          {isCurrentlyLinked && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Vinculada
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                          {invoice.emisor_nombre || "Sin emisor"} ·{" "}
                          {invoice.fecha_emision
                            ? new Date(invoice.fecha_emision).toLocaleDateString("es-MX")
                            : "Sin fecha"}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="font-semibold text-sm">
                          ${invoice.amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </p>
                        {getStatusBadge(invoice.status)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedInvoiceId || linkMutation.isPending}
            className="gap-2"
          >
            <Link2 className="h-4 w-4" />
            Vincular Factura
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
