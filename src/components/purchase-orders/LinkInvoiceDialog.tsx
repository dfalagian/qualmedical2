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
import { Search, FileText, Check, Link2, Unlink, Building2, User, ChevronDown, ChevronRight, Package } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LinkInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    supplier_id: string;
    supplier_type?: string | null;
    invoice_id?: string | null;
    general_supplier_invoice_id?: string | null;
  } | null;
}

type UnifiedInvoice = {
  id: string;
  invoice_number: string;
  amount: number;
  emisor_nombre: string | null;
  fecha_emision: string | null;
  currency: string | null;
  status?: string | null;
  source: "registered" | "official";
};

export const LinkInvoiceDialog = ({
  open,
  onOpenChange,
  order,
}: LinkInvoiceDialogProps) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<UnifiedInvoice | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  // Fetch items for expanded registered invoice
  const { data: invoiceItems = [] } = useQuery({
    queryKey: ["invoice_items_for_linking", expandedInvoiceId],
    queryFn: async () => {
      if (!expandedInvoiceId) return [];
      const { data, error } = await supabase
        .from("invoice_items")
        .select("descripcion, cantidad, valor_unitario, importe")
        .eq("invoice_id", expandedInvoiceId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!expandedInvoiceId,
  });

  // Fetch invoices from registered suppliers
  const { data: registeredInvoices = [], isLoading: loadingRegistered } = useQuery({
    queryKey: ["invoices_for_linking_registered", order?.supplier_id],
    queryFn: async () => {
      if (!order?.supplier_id) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, amount, emisor_nombre, fecha_emision, status, currency")
        .eq("supplier_id", order.supplier_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((inv) => ({
        ...inv,
        source: "registered" as const,
      }));
    },
    enabled: open && !!order?.supplier_id,
  });

  // Fetch invoices from official (general) suppliers
  const { data: officialInvoices = [], isLoading: loadingOfficial } = useQuery({
    queryKey: ["invoices_for_linking_official", order?.supplier_id],
    queryFn: async () => {
      // For official supplier orders, query by general_supplier_id matching supplier_id
      // For registered supplier orders, also show all official invoices
      const { data, error } = await supabase
        .from("general_supplier_invoices")
        .select("id, invoice_number, amount, emisor_nombre, fecha_emision, currency")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((inv) => ({
        ...inv,
        status: null,
        source: "official" as const,
      }));
    },
    enabled: open,
  });

  const isLoading = loadingRegistered || loadingOfficial;

  // Merge both lists
  const allInvoices = useMemo(() => {
    return [...registeredInvoices, ...officialInvoices];
  }, [registeredInvoices, officialInvoices]);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm) return allInvoices;
    const term = searchTerm.toLowerCase();
    return allInvoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(term) ||
        (inv.emisor_nombre || "").toLowerCase().includes(term)
    );
  }, [allInvoices, searchTerm]);

  const linkMutation = useMutation({
    mutationFn: async (invoice: UnifiedInvoice | null) => {
      if (!order) throw new Error("No hay orden seleccionada");

      if (!invoice) {
        // Unlink both
        const { error } = await supabase
          .from("purchase_orders")
          .update({ invoice_id: null, general_supplier_invoice_id: null })
          .eq("id", order.id);
        if (error) throw error;
      } else if (invoice.source === "registered") {
        const { error } = await supabase
          .from("purchase_orders")
          .update({ invoice_id: invoice.id, general_supplier_invoice_id: null })
          .eq("id", order.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("purchase_orders")
          .update({ invoice_id: null, general_supplier_invoice_id: invoice.id })
          .eq("id", order.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, invoice) => {
      toast.success(invoice ? "Factura vinculada correctamente" : "Factura desvinculada");
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
    if (selectedInvoice) {
      linkMutation.mutate(selectedInvoice);
    }
  };

  const handleUnlink = () => {
    linkMutation.mutate(null);
  };

  const isLinked = order?.invoice_id || order?.general_supplier_invoice_id;

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
        {isLinked && (
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
            placeholder="Buscar por número de factura o emisor..."
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
              {allInvoices.length === 0
                ? "No hay facturas disponibles"
                : "No se encontraron facturas"}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredInvoices.map((invoice) => {
                const isCurrentlyLinked =
                  (invoice.source === "registered" && order?.invoice_id === invoice.id) ||
                  (invoice.source === "official" && order?.general_supplier_invoice_id === invoice.id);
                const isSelected = selectedInvoice?.id === invoice.id;
                return (
                  <div
                    key={`${invoice.source}-${invoice.id}`}
                    className={`rounded-lg border transition-colors ${
                      isCurrentlyLinked
                        ? "border-primary/40 bg-primary/5"
                        : isSelected
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <button
                      onClick={() => setSelectedInvoice(isSelected ? null : invoice)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {invoice.source === "registered" ? (
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium text-sm truncate">
                              {invoice.invoice_number}
                            </span>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {invoice.source === "registered" ? "Proveedor" : "Oficial"}
                            </Badge>
                            {isCurrentlyLinked && (
                              <Badge variant="outline" className="text-xs shrink-0 border-primary/40 text-primary">
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
                          {invoice.source === "registered" && getStatusBadge(invoice.status || null)}
                        </div>
                      </div>
                    </button>
                    {invoice.source === "registered" && (
                      <Collapsible
                        open={expandedInvoiceId === invoice.id}
                        onOpenChange={(open) => setExpandedInvoiceId(open ? invoice.id : null)}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-3 pb-2 transition-colors">
                            {expandedInvoiceId === invoice.id ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            <Package className="h-3 w-3" />
                            Ver conceptos
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3">
                            <div className="bg-muted/30 rounded-md p-2 space-y-1 max-h-32 overflow-y-auto text-xs">
                              {expandedInvoiceId === invoice.id && invoiceItems.length > 0 ? (
                                invoiceItems.map((item, idx) => (
                                  <div key={idx} className="flex justify-between gap-2">
                                    <span className="truncate text-muted-foreground flex-1">
                                      {item.descripcion}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                      {item.cantidad} × ${Number(item.valor_unitario).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="shrink-0 font-medium">
                                      ${Number(item.importe).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                ))
                              ) : expandedInvoiceId === invoice.id ? (
                                <p className="text-muted-foreground italic">Sin conceptos disponibles</p>
                              ) : null}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
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
            disabled={!selectedInvoice || linkMutation.isPending}
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
