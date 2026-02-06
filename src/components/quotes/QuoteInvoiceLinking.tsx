import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Link2, Unlink, FileText, Receipt, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function QuoteInvoiceLinking() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
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

  // Fetch sales invoices (unlinked ones for selection, all for display)
  const { data: salesInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["sales-invoices-for-linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("*")
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch linked invoices with quote details
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
      queryClient.invalidateQueries({ queryKey: ["sales-invoices-for-linking"] });
      queryClient.invalidateQueries({ queryKey: ["linked-invoices"] });
      setIsDialogOpen(false);
      setSelectedQuoteId("");
      setSelectedInvoiceId("");
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
      queryClient.invalidateQueries({ queryKey: ["sales-invoices-for-linking"] });
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

  const unlinkedInvoices = salesInvoices?.filter((inv) => !inv.quote_id) || [];

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

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Vinculación Cotización - Factura</h3>
          <p className="text-sm text-muted-foreground">
            Vincula las cotizaciones aprobadas con sus facturas de venta correspondientes
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Link2 className="h-4 w-4" />
              Nueva Vinculación
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Vincular Cotización con Factura
              </DialogTitle>
              <DialogDescription>
                Selecciona una cotización aprobada y una factura de venta XML para vincularlas.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              {/* Quote Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Cotización Aprobada
                </label>
                <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cotización..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingQuotes ? (
                      <div className="p-2 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </div>
                    ) : quotes?.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        No hay cotizaciones aprobadas disponibles
                      </div>
                    ) : (
                      quotes?.map((quote) => (
                        <SelectItem key={quote.id} value={quote.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{quote.folio}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{quote.client?.nombre_cliente}</span>
                            <span className="text-muted-foreground">
                              ({formatCurrency(quote.total)})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Invoice Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Factura de Venta XML
                </label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar factura..." />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingInvoices ? (
                      <div className="p-2 text-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </div>
                    ) : unlinkedInvoices.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        No hay facturas sin vincular disponibles
                      </div>
                    ) : (
                      unlinkedInvoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{invoice.folio}</span>
                            <span className="text-muted-foreground">-</span>
                            <span>{invoice.receptor_nombre || "Sin receptor"}</span>
                            <span className="text-muted-foreground">
                              ({formatCurrency(invoice.total)})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview of selection */}
              {selectedQuoteId && selectedInvoiceId && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-center gap-4">
                      <div className="text-center">
                        <Badge variant="outline" className="mb-2">Cotización</Badge>
                        <p className="font-medium">
                          {quotes?.find((q) => q.id === selectedQuoteId)?.folio}
                        </p>
                      </div>
                      <Link2 className="h-6 w-6 text-primary" />
                      <div className="text-center">
                        <Badge variant="outline" className="mb-2">Factura</Badge>
                        <p className="font-medium">
                          {unlinkedInvoices.find((i) => i.id === selectedInvoiceId)?.folio}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleLink} 
                disabled={!selectedQuoteId || !selectedInvoiceId || linkMutation.isPending}
                className="gap-2"
              >
                {linkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Vincular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
            <CardTitle className="text-2xl">{unlinkedInvoices.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vinculaciones Activas</CardDescription>
            <CardTitle className="text-2xl text-primary">{linkedInvoices?.length || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Linked Invoices Table */}
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
              <p className="text-sm">Usa el botón "Nueva Vinculación" para comenzar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cotización</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Fecha Factura</TableHead>
                    <TableHead className="text-right">Total Factura</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedInvoices?.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {invoice.quote?.folio || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.quote?.client?.nombre_cliente || "—"}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{invoice.folio}</span>
                      </TableCell>
                      <TableCell>
                        {invoice.fecha_emision
                          ? format(new Date(invoice.fecha_emision), "dd MMM yyyy", { locale: es })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className="text-center">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
