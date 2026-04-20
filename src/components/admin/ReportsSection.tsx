import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, TrendingUp, Wallet, Package, CalendarDays, Users, BarChart3 } from "lucide-react";
import { ExportInventoryButton } from "@/components/inventory/ExportInventoryButton";
import { ExportBatchesButton } from "@/components/inventory/ExportBatchesButton";

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ─── Purchase Report ─────────────────────────────────────────────
function PurchaseReport() {
  const [view, setView] = useState<"year" | "month" | "supplier" | "product">("year");
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));

  const { data: orders, isLoading } = useQuery({
    queryKey: ["report-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, amount, currency, created_at, status, supplier_id, supplier_type, purchase_order_items(quantity_ordered, unit_price, product_id, products(name, sku, brand))")
        .in("status", ["aprobada", "parcial", "completada"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["report-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, company_name");
      return data || [];
    },
  });

  const { data: generalSuppliers } = useQuery({
    queryKey: ["report-general-suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("general_suppliers").select("id, razon_social, nombre_comercial");
      return data || [];
    },
  });

  const getSupplierName = (supplierId: string, supplierType?: string | null) => {
    if (supplierType === "general") {
      const gs = generalSuppliers?.find((s) => s.id === supplierId);
      return gs?.nombre_comercial || gs?.razon_social || "Proveedor oficial";
    }
    const p = profiles?.find((pr) => pr.id === supplierId);
    return p?.company_name || p?.full_name || "Proveedor";
  };

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const y = new Date(o.created_at!).getFullYear();
      return String(y) === selectedYear;
    });
  }, [orders, selectedYear]);

  const byYear = useMemo(() => {
    if (!orders) return [];
    const map: Record<number, { count: number; total: number }> = {};
    orders.forEach((o) => {
      const y = new Date(o.created_at!).getFullYear();
      if (!map[y]) map[y] = { count: 0, total: 0 };
      map[y].count++;
      map[y].total += Number(o.amount);
    });
    return Object.entries(map)
      .map(([year, v]) => ({ year: Number(year), ...v }))
      .sort((a, b) => b.year - a.year);
  }, [orders]);

  const byMonth = useMemo(() => {
    const map: Record<number, { count: number; total: number }> = {};
    filtered.forEach((o) => {
      const m = new Date(o.created_at!).getMonth();
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count++;
      map[m].total += Number(o.amount);
    });
    return Array.from({ length: 12 }, (_, i) => ({
      month: i,
      label: MONTHS[i],
      count: map[i]?.count || 0,
      total: map[i]?.total || 0,
    })).filter((r) => r.count > 0);
  }, [filtered]);

  const bySupplier = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {};
    filtered.forEach((o) => {
      const sid = o.supplier_id;
      if (!map[sid]) map[sid] = { name: getSupplierName(sid, o.supplier_type), count: 0, total: 0 };
      map[sid].count++;
      map[sid].total += Number(o.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, profiles, generalSuppliers]);

  const byProduct = useMemo(() => {
    const map: Record<string, { name: string; sku: string; brand: string; qty: number; total: number }> = {};
    filtered.forEach((o) => {
      (o.purchase_order_items || []).forEach((item: any) => {
        const pid = item.product_id;
        const pName = item.products?.name || "Producto";
        const pSku = item.products?.sku || "";
        const pBrand = item.products?.brand || "";
        if (!map[pid]) map[pid] = { name: pName, sku: pSku, brand: pBrand, qty: 0, total: 0 };
        map[pid].qty += Number(item.quantity_ordered || 0);
        map[pid].total += Number(item.quantity_ordered || 0) * Number(item.unit_price || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const grandTotal = filtered.reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="year">Por Año</SelectItem>
            <SelectItem value="month">Por Mes</SelectItem>
            <SelectItem value="supplier">Por Proveedor</SelectItem>
            <SelectItem value="product">Por Producto</SelectItem>
          </SelectContent>
        </Select>
        {view !== "year" && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {view !== "year" && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            Total {selectedYear}: {formatCurrency(grandTotal)}
          </Badge>
        )}
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {view === "year" && <><TableHead>Año</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Total</TableHead></>}
              {view === "month" && <><TableHead>Mes</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Total</TableHead></>}
              {view === "supplier" && <><TableHead>Proveedor</TableHead><TableHead className="text-right">Órdenes</TableHead><TableHead className="text-right">Total</TableHead></>}
              {view === "product" && <><TableHead>Producto</TableHead><TableHead>SKU</TableHead><TableHead>Marca</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Total</TableHead></>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view === "year" && byYear.map((r) => (
              <TableRow key={r.year}>
                <TableCell className="font-medium">{r.year}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {view === "month" && byMonth.map((r) => (
              <TableRow key={r.month}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {view === "supplier" && bySupplier.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {view === "product" && byProduct.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono text-xs">{r.sku}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.brand}</TableCell>
                <TableCell className="text-right">{r.qty}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {((view === "year" && byYear.length === 0) ||
              (view === "month" && byMonth.length === 0) ||
              (view === "supplier" && bySupplier.length === 0) ||
              (view === "product" && byProduct.length === 0)) && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin datos para el período seleccionado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Sales Report ─────────────────────────────────────────────────
function SalesReport() {
  const [view, setView] = useState<"month" | "week" | "day" | "client" | "product">("month");
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["report-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, folio, total, created_at, client_id, status, clients(nombre_cliente), quote_items(cantidad, importe, nombre_producto, product_id, products(name, sku, brand))")
        .in("status", ["aprobada", "facturada", "entregada"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!quotes) return [];
    return quotes.filter((q) => String(new Date(q.created_at!).getFullYear()) === selectedYear);
  }, [quotes, selectedYear]);

  const byMonth = useMemo(() => {
    const map: Record<number, { count: number; total: number }> = {};
    filtered.forEach((q) => {
      const m = new Date(q.created_at!).getMonth();
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count++;
      map[m].total += Number(q.total || 0);
    });
    return Array.from({ length: 12 }, (_, i) => ({
      month: i, label: MONTHS[i], count: map[i]?.count || 0, total: map[i]?.total || 0,
    })).filter((r) => r.count > 0);
  }, [filtered]);

  const byWeek = useMemo(() => {
    const map: Record<string, { label: string; count: number; total: number }> = {};
    filtered.forEach((q) => {
      const d = new Date(q.created_at!);
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
      const key = `S${weekNum}`;
      if (!map[key]) map[key] = { label: `Semana ${weekNum}`, count: 0, total: 0 };
      map[key].count++;
      map[key].total += Number(q.total || 0);
    });
    return Object.values(map).sort((a, b) => {
      const nA = parseInt(a.label.replace("Semana ", ""));
      const nB = parseInt(b.label.replace("Semana ", ""));
      return nA - nB;
    });
  }, [filtered]);

  const byDay = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filtered.forEach((q) => {
      const d = new Date(q.created_at!).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
      if (!map[d]) map[d] = { count: 0, total: 0 };
      map[d].count++;
      map[d].total += Number(q.total || 0);
    });
    return Object.entries(map)
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => new Date(b.day).getTime() - new Date(a.day).getTime());
  }, [filtered]);

  const byClient = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number }> = {};
    filtered.forEach((q) => {
      const cid = q.client_id || "sin-cliente";
      const cname = (q.clients as any)?.nombre_cliente || "Sin cliente";
      if (!map[cid]) map[cid] = { name: cname, count: 0, total: 0 };
      map[cid].count++;
      map[cid].total += Number(q.total || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const byProduct = useMemo(() => {
    const map: Record<string, { name: string; sku: string; brand: string; qty: number; total: number }> = {};
    filtered.forEach((q) => {
      (q.quote_items || []).forEach((item: any) => {
        const pid = item.product_id || item.nombre_producto;
        const pName = item.products?.name || item.nombre_producto || "Producto";
        const pSku = item.products?.sku || "";
        const pBrand = item.products?.brand || "";
        if (!map[pid]) map[pid] = { name: pName, sku: pSku, brand: pBrand, qty: 0, total: 0 };
        map[pid].qty += Number(item.cantidad || 0);
        map[pid].total += Number(item.importe || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const grandTotal = filtered.reduce((s, q) => s + Number(q.total || 0), 0);

  const rows =
    view === "month" ? byMonth :
    view === "week" ? byWeek :
    view === "day" ? byDay :
    view === "client" ? byClient :
    byProduct;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Por Mes</SelectItem>
            <SelectItem value="week">Por Semana</SelectItem>
            <SelectItem value="day">Por Día</SelectItem>
            <SelectItem value="client">Por Cliente</SelectItem>
            <SelectItem value="product">Por Producto</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          Total {selectedYear}: {formatCurrency(grandTotal)}
        </Badge>
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {(view === "month" || view === "week" || view === "day") && (
                <><TableHead>{view === "month" ? "Mes" : view === "week" ? "Semana" : "Día"}</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">Total</TableHead></>
              )}
              {view === "client" && <><TableHead>Cliente</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">Total</TableHead></>}
              {view === "product" && <><TableHead>Producto</TableHead><TableHead>SKU</TableHead><TableHead>Marca</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Total</TableHead></>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(view === "month") && byMonth.map((r) => (
              <TableRow key={r.month}><TableCell className="font-medium">{r.label}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell></TableRow>
            ))}
            {(view === "week") && byWeek.map((r, i) => (
              <TableRow key={i}><TableCell className="font-medium">{r.label}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell></TableRow>
            ))}
            {(view === "day") && byDay.map((r, i) => (
              <TableRow key={i}><TableCell className="font-medium">{r.day}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell></TableRow>
            ))}
            {view === "client" && byClient.map((r, i) => (
              <TableRow key={i}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell></TableRow>
            ))}
            {view === "product" && byProduct.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono text-xs">{r.sku}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.brand}</TableCell>
                <TableCell className="text-right">{r.qty}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(r.total)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin datos para el período seleccionado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Inventory Value Report ────────────────────────────────────────
function InventoryValueReport() {
  const [view, setView] = useState<"total" | "product">("total");

  const { data: products, isLoading } = useQuery({
    queryKey: ["report-inventory-value"],
    queryFn: async () => {
      const all: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, sku, brand, category, current_stock, unit_price, price_with_tax")
          .eq("is_active", true)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  });

  const productRows = useMemo(() => {
    if (!products) return [];
    return products
      .map((p) => {
        const stock = Number(p.current_stock || 0);
        const price = Number(p.unit_price || p.price_with_tax || 0);
        return { ...p, stock, price, value: stock * price };
      })
      .filter((p) => p.stock > 0)
      .sort((a, b) => b.value - a.value);
  }, [products]);

  const totalValue = useMemo(() => productRows.reduce((s, p) => s + p.value, 0), [productRows]);
  const totalUnits = useMemo(() => productRows.reduce((s, p) => s + p.stock, 0), [productRows]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={view} onValueChange={(v: any) => setView(v)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="total">Resumen Total</SelectItem>
            <SelectItem value="product">Por Producto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "total" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total en Inventario</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-accent/50">
                  <Package className="h-6 w-6 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Productos con Stock</p>
                  <p className="text-2xl font-bold">{productRows.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-secondary">
                  <BarChart3 className="h-6 w-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unidades Totales</p>
                  <p className="text-2xl font-bold">{totalUnits.toLocaleString("es-MX")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productRows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline" className="font-mono text-xs">{p.sku}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.brand || "—"}</TableCell>
                  <TableCell className="text-xs">{p.category || "—"}</TableCell>
                  <TableCell className="text-right">{p.stock}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.price)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(p.value)}</TableCell>
                </TableRow>
              ))}
              {productRows.length > 0 && (
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={4}>TOTAL</TableCell>
                  <TableCell className="text-right">{totalUnits.toLocaleString("es-MX")}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatCurrency(totalValue)}</TableCell>
                </TableRow>
              )}
              {productRows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay productos con stock</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports Section ──────────────────────────────────────────
export function ReportsSection() {
  return (
    <div className="space-y-4">
      {/* Export tools */}
      <Card className="shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />
            Exportaciones
          </CardTitle>
          <CardDescription>Exporta información del sistema en diferentes formatos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <ExportInventoryButton />
            <ExportBatchesButton />
          </div>
        </CardContent>
      </Card>

      {/* Reports tabs */}
      <Tabs defaultValue="purchases" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="purchases" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Compras</span>
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Ventas</span>
          </TabsTrigger>
          <TabsTrigger value="inventory-value" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Valor Inventario</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Informe de Compras
              </CardTitle>
              <CardDescription>Analiza las compras por año, mes, proveedor o producto</CardDescription>
            </CardHeader>
            <CardContent>
              <PurchaseReport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Informe de Ventas
              </CardTitle>
              <CardDescription>Analiza las ventas por mes, semana, día, cliente o producto</CardDescription>
            </CardHeader>
            <CardContent>
              <SalesReport />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory-value" className="mt-4">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Valor Monetario en Inventario
              </CardTitle>
              <CardDescription>Conoce cuánto dinero tienes invertido en inventario</CardDescription>
            </CardHeader>
            <CardContent>
              <InventoryValueReport />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
