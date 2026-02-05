import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, FileSpreadsheet, Calendar, Package, CheckCircle, Receipt, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SalesInvoiceUpload } from "./SalesInvoiceUpload";
import { SalesInvoiceViewer } from "./SalesInvoiceViewer";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface QuoteWithClient {
  id: string;
  folio: string;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  subtotal: number;
  total: number;
  status: string;
  inventory_exit_status: string | null;
  client: {
    id: string;
    nombre_cliente: string;
    razon_social: string | null;
  };
  items: Array<{
    id: string;
    nombre_producto: string;
    cantidad: number;
    precio_unitario: number;
    importe: number;
  }>;
}

interface InvoiceItem {
  clave_prod_serv?: string;
  clave_unidad?: string;
  descripcion: string;
  cantidad: number;
  unidad?: string;
  valor_unitario: number;
  importe: number;
  descuento?: number;
}

interface SalesInvoice {
  id: string;
  folio: string;
  uuid: string | null;
  fecha_emision: string | null;
  subtotal: number | null;
  total: number;
  currency: string | null;
  emisor_nombre: string | null;
  emisor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_rfc: string | null;
  xml_url: string;
  pdf_url: string | null;
  created_at: string;
  items: InvoiceItem[] | null;
}

export const SalesSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubTab, setActiveSubTab] = useState("quotes");
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { data: quotes, isLoading: isLoadingQuotes } = useQuery({
    queryKey: ["approved-quotes-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          id,
          folio,
          fecha_cotizacion,
          fecha_entrega,
          subtotal,
          total,
          status,
          inventory_exit_status,
          client:clients!quotes_client_id_fkey (
            id,
            nombre_cliente,
            razon_social
          ),
          items:quote_items (
            id,
            nombre_producto,
            cantidad,
            precio_unitario,
            importe
          )
        `)
        .eq("status", "aprobada")
        .order("fecha_cotizacion", { ascending: false });

      if (error) throw error;
      return data as unknown as QuoteWithClient[];
    },
  });

  const { data: salesInvoices, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useQuery({
    queryKey: ["sales-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("*")
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      // Parse items from JSON to proper array type
      return (data || []).map(invoice => ({
        ...invoice,
        items: Array.isArray(invoice.items) ? invoice.items as unknown as InvoiceItem[] : null
      })) as SalesInvoice[];
    },
  });

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta factura?")) return;
    
    const { error } = await supabase
      .from("sales_invoices")
      .delete()
      .eq("id", id);
      
    if (error) {
      toast.error("Error al eliminar la factura");
    } else {
      toast.success("Factura eliminada");
      refetchInvoices();
    }
  };

  const filteredQuotes = quotes?.filter((quote) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      quote.folio?.toLowerCase().includes(searchLower) ||
      quote.client?.nombre_cliente?.toLowerCase().includes(searchLower) ||
      quote.client?.razon_social?.toLowerCase().includes(searchLower) ||
      quote.items?.some((item) =>
        item.nombre_producto?.toLowerCase().includes(searchLower)
      )
    );
  });

  const filteredInvoices = salesInvoices?.filter((invoice) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      invoice.folio?.toLowerCase().includes(searchLower) ||
      invoice.receptor_nombre?.toLowerCase().includes(searchLower) ||
      invoice.receptor_rfc?.toLowerCase().includes(searchLower)
    );
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  const getExitStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Salida completada
          </Badge>
        );
      case "partial":
        return (
          <Badge variant="secondary" className="bg-amber-500 text-white">
            <Package className="h-3 w-3 mr-1" />
            Salida parcial
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Package className="h-3 w-3 mr-1" />
            Pendiente salida
          </Badge>
        );
    }
  };

  // Calculate totals for quotes
  const quoteTotals = filteredQuotes?.reduce(
    (acc, quote) => ({
      sales: acc.sales + 1,
      items: acc.items + (quote.items?.length || 0),
      amount: acc.amount + quote.total,
      completedExits:
        acc.completedExits + (quote.inventory_exit_status === "completed" ? 1 : 0),
    }),
    { sales: 0, items: 0, amount: 0, completedExits: 0 }
  ) || { sales: 0, items: 0, amount: 0, completedExits: 0 };

  // Calculate totals for invoices
  const invoiceTotals = filteredInvoices?.reduce(
    (acc, invoice) => ({
      count: acc.count + 1,
      amount: acc.amount + invoice.total,
    }),
    { count: 0, amount: 0 }
  ) || { count: 0, amount: 0 };

  const isLoading = isLoadingQuotes || isLoadingInvoices;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs for Quotes vs Invoices */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="quotes" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Cotizaciones Aprobadas
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Facturas de Venta
            </TabsTrigger>
          </TabsList>

          {activeSubTab === "invoices" && <SalesInvoiceUpload />}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          {activeSubTab === "quotes" ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Ventas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{quoteTotals.sales}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Productos Vendidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{quoteTotals.items}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Monto Total
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(quoteTotals.amount)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Salidas Completadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {quoteTotals.completedExits} / {quoteTotals.sales}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Facturas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{invoiceTotals.count}</div>
                </CardContent>
              </Card>
              <Card className="md:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Monto Total Facturado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">
                    {formatCurrency(invoiceTotals.amount)}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-sm mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeSubTab === "quotes" 
              ? "Buscar venta, cliente o producto..." 
              : "Buscar factura, cliente o RFC..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Quotes Tab Content */}
        <TabsContent value="quotes" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha Venta</TableHead>
                    <TableHead>Productos</TableHead>
                    <TableHead>Estado Salida</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotes?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No se encontraron ventas aprobadas
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredQuotes?.map((quote) => (
                      <TableRow key={quote.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{quote.folio}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {quote.client?.nombre_cliente}
                            </div>
                            {quote.client?.razon_social && (
                              <div className="text-xs text-muted-foreground">
                                {quote.client.razon_social}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {format(
                              new Date(quote.fecha_cotizacion),
                              "dd MMM yyyy",
                              { locale: es }
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {quote.items?.length || 0} productos
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getExitStatusBadge(quote.inventory_exit_status)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(quote.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices Tab Content */}
        <TabsContent value="invoices" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>RFC Cliente</TableHead>
                    <TableHead>Fecha Emisión</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay facturas de venta registradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices?.map((invoice) => (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                        setSelectedInvoice(invoice);
                        setViewerOpen(true);
                      }}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{invoice.folio}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {invoice.receptor_nombre || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {invoice.receptor_rfc || "-"}
                        </TableCell>
                        <TableCell>
                          {invoice.fecha_emision ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3" />
                              {format(
                                new Date(invoice.fecha_emision),
                                "dd MMM yyyy",
                                { locale: es }
                              )}
                            </div>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInvoice(invoice);
                                setViewerOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteInvoice(invoice.id);
                              }}
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Viewer Dialog */}
      <SalesInvoiceViewer
        invoice={selectedInvoice}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
      />
    </div>
  );
};
