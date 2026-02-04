import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ChevronDown, ChevronRight, Building2, Receipt, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface InvoiceWithSupplier {
  id: string;
  invoice_number: string;
  amount: number;
  subtotal: number | null;
  total_impuestos: number | null;
  fecha_emision: string | null;
  status: string | null;
  emisor_nombre: string | null;
  emisor_rfc: string | null;
  supplier_id: string;
  supplier: {
    id: string;
    full_name: string;
    company_name: string | null;
    rfc: string | null;
  };
}

interface GroupedInvoices {
  supplier: {
    id: string;
    full_name: string;
    company_name: string | null;
    rfc: string | null;
  };
  invoices: InvoiceWithSupplier[];
  totalAmount: number;
  invoiceCount: number;
}

export const PurchasesBySupplier = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices-by-supplier"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          amount,
          subtotal,
          total_impuestos,
          fecha_emision,
          status,
          emisor_nombre,
          emisor_rfc,
          supplier_id,
          supplier:profiles!invoices_supplier_id_fkey (
            id,
            full_name,
            company_name,
            rfc
          )
        `)
        .order("fecha_emision", { ascending: false });

      if (error) throw error;
      return data as unknown as InvoiceWithSupplier[];
    },
  });

  // Agrupar facturas por proveedor
  const groupedInvoices: GroupedInvoices[] = invoices
    ? Object.values(
        invoices.reduce((acc, invoice) => {
          const supplierId = invoice.supplier_id;
          if (!acc[supplierId]) {
            acc[supplierId] = {
              supplier: invoice.supplier,
              invoices: [],
              totalAmount: 0,
              invoiceCount: 0,
            };
          }
          acc[supplierId].invoices.push(invoice);
          acc[supplierId].totalAmount += invoice.amount || 0;
          acc[supplierId].invoiceCount += 1;
          return acc;
        }, {} as Record<string, GroupedInvoices>)
      )
    : [];

  // Filtrar por término de búsqueda
  const filteredGroups = groupedInvoices.filter((group) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSupplier =
      group.supplier.full_name?.toLowerCase().includes(searchLower) ||
      group.supplier.company_name?.toLowerCase().includes(searchLower) ||
      group.supplier.rfc?.toLowerCase().includes(searchLower);
    const matchesInvoice = group.invoices.some(
      (inv) =>
        inv.invoice_number?.toLowerCase().includes(searchLower) ||
        inv.emisor_nombre?.toLowerCase().includes(searchLower)
    );
    return matchesSupplier || matchesInvoice;
  });

  const toggleSupplier = (supplierId: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "pagado":
        return <Badge className="bg-green-100 text-green-800">Pagado</Badge>;
      case "pendiente":
        return <Badge className="bg-amber-100 text-amber-800">Pendiente</Badge>;
      case "parcial":
        return <Badge className="bg-blue-100 text-blue-800">Parcial</Badge>;
      case "cancelado":
        return <Badge variant="destructive">Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status || "Sin estado"}</Badge>;
    }
  };

  // Calcular totales
  const totals = filteredGroups.reduce(
    (acc, group) => ({
      suppliers: acc.suppliers + 1,
      invoices: acc.invoices + group.invoiceCount,
      amount: acc.amount + group.totalAmount,
    }),
    { suppliers: 0, invoices: 0, amount: 0 }
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Proveedores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.suppliers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Facturas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.invoices}</div>
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
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar proveedor o factura..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lista de proveedores con facturas */}
      <div className="space-y-3">
        {filteredGroups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No se encontraron facturas
            </CardContent>
          </Card>
        ) : (
          filteredGroups.map((group) => (
            <Card key={group.supplier.id}>
              <Collapsible
                open={expandedSuppliers.has(group.supplier.id)}
                onOpenChange={() => toggleSupplier(group.supplier.id)}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {expandedSuppliers.has(group.supplier.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <CardTitle className="text-base">
                            {group.supplier.company_name || group.supplier.full_name}
                          </CardTitle>
                          {group.supplier.rfc && (
                            <p className="text-sm text-muted-foreground">
                              RFC: {group.supplier.rfc}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Receipt className="h-4 w-4" />
                            {group.invoiceCount} facturas
                          </div>
                          <div className="font-semibold text-primary">
                            {formatCurrency(group.totalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Folio</TableHead>
                          <TableHead>Emisor</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.invoices.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              {invoice.invoice_number}
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium text-sm">
                                  {invoice.emisor_nombre || "-"}
                                </div>
                                {invoice.emisor_rfc && (
                                  <div className="text-xs text-muted-foreground">
                                    {invoice.emisor_rfc}
                                  </div>
                                )}
                              </div>
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
                              ) : (
                                "-"
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(invoice.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
