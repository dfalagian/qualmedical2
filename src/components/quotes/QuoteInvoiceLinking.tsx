import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Link2, Unlink, FileText, Receipt, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function QuoteInvoiceLinking() {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
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
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[400px] px-4 pb-4">
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
            </ScrollArea>
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
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[400px] px-4 pb-4">
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
                  {unlinkedInvoices?.map((invoice) => (
                    <div
                      key={invoice.id}
                      onClick={() => setSelectedInvoiceId(invoice.id === selectedInvoiceId ? null : invoice.id)}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-all",
                        "hover:border-primary/50 hover:bg-accent/50",
                        selectedInvoiceId === invoice.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-border"
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
                        <div className="text-right">
                          <p className="font-semibold text-sm">
                            {formatCurrency(invoice.total)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
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
