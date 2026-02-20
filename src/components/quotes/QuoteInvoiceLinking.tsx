import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Link2, Unlink, FileText, Receipt, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface InvoiceItem {
  descripcion?: string;
  cantidad?: number;
  valor_unitario?: number;
  importe?: number;
}

export function QuoteInvoiceLinking() {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch approved quotes
  const { data: quotes, isLoading: loadingQuotes } = useQuery({
    queryKey: ["quotes-for-linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          id,
          folio,
          fecha_cotizacion,
          total,
          status,
          is_remision,
          client:clients(nombre_cliente)
        `)
        .eq("status", "aprobada")
        .order("fecha_cotizacion", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch unlinked sales invoices
  const { data: unlinkedInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["unlinked-sales-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("*")
        .is("quote_id", null)
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch linked invoices
  const { data: linkedInvoices, isLoading: loadingLinked } = useQuery({
    queryKey: ["linked-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select(`
          *,
          quote:quotes(folio, total, client:clients(nombre_cliente))
        `)
        .not("quote_id", "is", null)
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ quoteId, invoiceId }: { quoteId: string; invoiceId: string }) => {
      const { error } = await supabase
        .from("sales_invoices")
        .update({ quote_id: quoteId })
        .eq("id", invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Vinculación exitosa",
        description: "La cotización ha sido vinculada a la factura correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["quotes-for-linking"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["linked-invoices"] });
      setSelectedQuoteId(null);
      setSelectedInvoiceId(null);
    },
    onError: (error) => {
      toast({
        title: "Error al vincular",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from("sales_invoices")
        .update({ quote_id: null })
        .eq("id", invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Desvinculación exitosa",
        description: "La factura ha sido desvinculada de la cotización.",
      });
      queryClient.invalidateQueries({ queryKey: ["quotes-for-linking"] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["linked-invoices"] });
    },
    onError: (error) => {
      toast({
        title: "Error al desvincular",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  const handleLink = () => {
    if (!selectedQuoteId || !selectedInvoiceId) {
      toast({
        title: "Selección incompleta",
        description: "Por favor selecciona una cotización y una factura.",
        variant: "destructive",
      });
      return;
    }
    linkMutation.mutate({ quoteId: selectedQuoteId, invoiceId: selectedInvoiceId });
  };

  const selectedQuote = quotes?.find((q) => q.id === selectedQuoteId);
  const selectedInvoice = unlinkedInvoices?.find((i) => i.id === selectedInvoiceId);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cotizaciones Aprobadas</CardDescription>
            <CardTitle className="text-2xl">{quotes?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Facturas Sin Vincular</CardDescription>
            <CardTitle className="text-2xl">{unlinkedInvoices?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vinculaciones Activas</CardDescription>
            <CardTitle className="text-2xl text-primary">{linkedInvoices?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Two Column Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column - Quotes */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Cotizaciones Aprobadas
            </CardTitle>
            <CardDescription>Selecciona una cotización para vincular</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
              {loadingQuotes ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : quotes?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No hay cotizaciones aprobadas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {quotes?.map((quote) => (
                    <div
                      key={quote.id}
                      onClick={() => setSelectedQuoteId(quote.id === selectedQuoteId ? null : quote.id)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all",
                        "hover:border-primary/50 hover:bg-accent/50",
                        selectedQuoteId === quote.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-border"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {quote.folio}
                            </Badge>
                            {quote.is_remision && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-400 text-orange-600 bg-orange-50">
                                RE
                              </Badge>
                            )}
                            {selectedQuoteId === quote.id && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1 truncate">
                            {quote.client?.nombre_cliente || "Sin cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(quote.fecha_cotizacion), "dd MMM yyyy", { locale: es })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">
                            {formatCurrency(quote.total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Right Column - Invoices */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Facturas de Venta XML
            </CardTitle>
            <CardDescription>Selecciona una factura para vincular</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
              {loadingInvoices ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : unlinkedInvoices?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No hay facturas sin vincular</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unlinkedInvoices?.map((invoice) => {
                    const items = Array.isArray(invoice.items) ? (invoice.items as InvoiceItem[]) : [];
                    const isExpanded = expandedInvoiceId === invoice.id;
                    return (
                      <Collapsible key={invoice.id} open={isExpanded}>
                        <div
                          onClick={() => setSelectedInvoiceId(invoice.id === selectedInvoiceId ? null : invoice.id)}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            "hover:border-primary/50 hover:bg-accent/50",
                            selectedInvoiceId === invoice.id
                              ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                              : "border-border",
                            isExpanded && "rounded-b-none"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">
                                  {invoice.folio}
                                </Badge>
                                {selectedInvoiceId === invoice.id && (
                                  <Check className="h-4 w-4 text-primary" />
                                )}
                              </div>
                              <p className="text-sm font-medium mt-1 truncate">
                                {invoice.receptor_nombre || "Sin receptor"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {invoice.fecha_emision
                                  ? format(new Date(invoice.fecha_emision), "dd MMM yyyy", { locale: es })
                                  : "Sin fecha"}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <p className="font-semibold text-sm">
                                {formatCurrency(invoice.total)}
                              </p>
                              {items.length > 0 && (
                                <CollapsibleTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs gap-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedInvoiceId(isExpanded ? null : invoice.id);
                                    }}
                                  >
                                    {isExpanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    {isExpanded ? "Ocultar" : "Ver"}
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                            </div>
                          </div>
                        </div>
                        <CollapsibleContent>
                          <div className={cn(
                            "border border-t-0 rounded-b-lg p-3 bg-muted/30 space-y-1",
                            selectedInvoiceId === invoice.id
                              ? "border-primary"
                              : "border-border"
                          )}>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Conceptos ({items.length})</p>
                            {items.map((item, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                                <div className="flex-1 min-w-0">
                                  <p className="truncate">{item.descripcion || "—"}</p>
                                  <p className="text-muted-foreground">
                                    Cant: {item.cantidad ?? 0} × {formatCurrency(item.valor_unitario ?? 0)}
                                  </p>
                                </div>
                                <p className="font-medium shrink-0">{formatCurrency(item.importe ?? 0)}</p>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* Link Action Bar */}
      {(selectedQuoteId || selectedInvoiceId) && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-wrap justify-center">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Cotización</p>
                  {selectedQuote ? (
                    <Badge variant="secondary" className="font-mono">
                      {selectedQuote.folio}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sin seleccionar
                    </Badge>
                  )}
                </div>
                <Link2 className="h-5 w-5 text-primary" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Factura</p>
                  {selectedInvoice ? (
                    <Badge variant="secondary" className="font-mono">
                      {selectedInvoice.folio}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sin seleccionar
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                onClick={handleLink}
                disabled={!selectedQuoteId || !selectedInvoiceId || linkMutation.isPending}
                className="gap-2"
              >
                {linkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Vincular Selección
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Linked Invoices History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vinculaciones Realizadas</CardTitle>
          <CardDescription>
            Historial de cotizaciones vinculadas con sus facturas de venta
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLinked ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : linkedInvoices?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay vinculaciones registradas</p>
              <p className="text-sm">Selecciona una cotización y una factura para comenzar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedInvoices?.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <p className="text-xs text-muted-foreground">Cotización</p>
                      <Badge variant="secondary" className="font-mono">
                        {invoice.quote?.folio || "—"}
                      </Badge>
                    </div>
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Factura</p>
                      <Badge variant="outline" className="font-mono">
                        {invoice.folio}
                      </Badge>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="text-sm">{invoice.quote?.client?.nombre_cliente || "—"}</p>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-medium">{formatCurrency(invoice.total)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unlinkMutation.mutate(invoice.id)}
                    disabled={unlinkMutation.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {unlinkMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
