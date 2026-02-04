import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, FileSpreadsheet, Calendar, Package, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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

export const SalesSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: quotes, isLoading } = useQuery({
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
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Salida completada
          </Badge>
        );
      case "partial":
        return (
          <Badge className="bg-amber-100 text-amber-800">
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

  // Calcular totales
  const totals = filteredQuotes?.reduce(
    (acc, quote) => ({
      sales: acc.sales + 1,
      items: acc.items + (quote.items?.length || 0),
      amount: acc.amount + quote.total,
      completedExits:
        acc.completedExits + (quote.inventory_exit_status === "completed" ? 1 : 0),
    }),
    { sales: 0, items: 0, amount: 0, completedExits: 0 }
  ) || { sales: 0, items: 0, amount: 0, completedExits: 0 };

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
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.sales}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Productos Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.items}</div>
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
              {formatCurrency(totals.amount)}
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
              {totals.completedExits} / {totals.sales}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar venta, cliente o producto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabla de ventas */}
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
    </div>
  );
};
