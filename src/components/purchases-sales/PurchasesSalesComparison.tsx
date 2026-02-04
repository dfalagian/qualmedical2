import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Scale, Receipt, FileSpreadsheet, DollarSign } from "lucide-react";

export const PurchasesSalesComparison = () => {
  // Obtener facturas (compras)
  const { data: invoices, isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices-comparison"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, amount, status")
        .not("status", "eq", "cancelado");

      if (error) throw error;
      return data;
    },
  });

  // Obtener ventas aprobadas
  const { data: quotes, isLoading: loadingQuotes } = useQuery({
    queryKey: ["quotes-comparison"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, total, status")
        .eq("status", "aprobada");

      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingInvoices || loadingQuotes;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  // Calcular totales
  const totalPurchases = invoices?.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0;
  const totalSales = quotes?.reduce((sum, quote) => sum + (quote.total || 0), 0) || 0;
  const difference = totalSales - totalPurchases;
  const margin = totalPurchases > 0 ? ((difference / totalPurchases) * 100).toFixed(1) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Total Compras
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalPurchases)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {invoices?.length || 0} facturas registradas
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Total Ventas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalSales)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {quotes?.length || 0} ventas aprobadas
            </p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${difference >= 0 ? "border-l-primary" : "border-l-amber-500"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${difference >= 0 ? "text-primary" : "text-amber-600"}`}>
              {formatCurrency(difference)}
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              {difference >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  Margen: +{margin}%
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  Margen: {margin}%
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico visual simple */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Comparativa Visual
          </CardTitle>
          <CardDescription>
            Relación entre compras y ventas registradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Barra de compras */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-red-500" />
                  Compras
                </span>
                <span className="text-red-600 font-semibold">
                  {formatCurrency(totalPurchases)}
                </span>
              </div>
              <div className="h-8 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      (totalPurchases / Math.max(totalPurchases, totalSales)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Barra de ventas */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  Ventas
                </span>
                <span className="text-green-600 font-semibold">
                  {formatCurrency(totalSales)}
                </span>
              </div>
              <div className="h-8 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      (totalSales / Math.max(totalPurchases, totalSales)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Indicador de balance */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-center gap-4">
                <div className={`text-center p-4 rounded-lg ${difference >= 0 ? "bg-green-50" : "bg-amber-50"}`}>
                  <div className={`text-3xl font-bold ${difference >= 0 ? "text-green-600" : "text-amber-600"}`}>
                    {difference >= 0 ? "+" : ""}{margin}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {difference >= 0 ? "Ganancia sobre costo" : "Pérdida sobre costo"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <Card className="bg-muted/50">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Esta comparación muestra la relación entre las facturas de compra 
            registradas por los proveedores y las ventas aprobadas en el sistema. El margen calculado 
            es una estimación basada en los montos totales y puede variar según los productos específicos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
