import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDownCircle, ArrowUpCircle, Search, RefreshCw } from "lucide-react";

interface MovementType {
  code: string;
  label: string;
  direction: "E" | "S";
}

interface MovementRecord {
  id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number | null;
  new_stock: number | null;
  reference_type: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  product_id: string;
  batch_id: string | null;
}

const PAGE_SIZE = 50;

export function InventoryMovementsHistory() {
  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState<"all" | "E" | "S">("all");
  const [filterCode, setFilterCode] = useState("all");
  const [page, setPage] = useState(0);

  // Catálogo de tipos
  const { data: movementTypes = [] } = useQuery<MovementType[]>({
    queryKey: ["inventory-movement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movement_types")
        .select("code, label, direction")
        .eq("is_active", true)
        .order("direction")
        .order("label");
      if (error) throw error;
      return data as MovementType[];
    },
  });

  const typeMap = useMemo(() => {
    const m = new Map<string, MovementType>();
    movementTypes.forEach((t) => m.set(t.code, t));
    return m;
  }, [movementTypes]);

  const knownCodes = useMemo(() => movementTypes.map((t) => t.code), [movementTypes]);

  // Movimientos históricos
  const {
    data: movements = [],
    isLoading,
    refetch,
  } = useQuery<MovementRecord[]>({
    queryKey: ["inventory-movements-history", page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("id, movement_type, quantity, previous_stock, new_stock, reference_type, location, notes, created_at, product_id, batch_id")
        .in("reference_type", knownCodes.length > 0 ? knownCodes : ["__none__"])
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data as MovementRecord[];
    },
    enabled: knownCodes.length > 0,
  });

  // Productos indexados
  const productIds = useMemo(() => [...new Set(movements.map((m) => m.product_id))], [movements]);
  const { data: productsMap = {} } = useQuery<Record<string, { name: string; sku: string }>>({
    queryKey: ["products-map-history", productIds],
    queryFn: async () => {
      if (productIds.length === 0) return {};
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .in("id", productIds);
      if (error) throw error;
      const map: Record<string, { name: string; sku: string }> = {};
      data?.forEach((p) => { map[p.id] = { name: p.name, sku: p.sku }; });
      return map;
    },
    enabled: productIds.length > 0,
  });

  // Lotes indexados
  const batchIds = useMemo(
    () => [...new Set(movements.map((m) => m.batch_id).filter(Boolean))] as string[],
    [movements]
  );
  const { data: batchesMap = {} } = useQuery<Record<string, { batch_number: string }>>({
    queryKey: ["batches-map-history", batchIds],
    queryFn: async () => {
      if (batchIds.length === 0) return {};
      const { data, error } = await supabase
        .from("product_batches")
        .select("id, batch_number")
        .in("id", batchIds);
      if (error) throw error;
      const map: Record<string, { batch_number: string }> = {};
      data?.forEach((b) => { map[b.id] = { batch_number: b.batch_number }; });
      return map;
    },
    enabled: batchIds.length > 0,
  });

  // Almacenes indexados
  const warehouseIds = useMemo(
    () => [...new Set(movements.map((m) => m.location).filter(Boolean))] as string[],
    [movements]
  );
  const { data: warehousesMap = {} } = useQuery<Record<string, { name: string }>>({
    queryKey: ["warehouses-map-history", warehouseIds],
    queryFn: async () => {
      if (warehouseIds.length === 0) return {};
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .in("id", warehouseIds);
      if (error) throw error;
      const map: Record<string, { name: string }> = {};
      data?.forEach((w) => { map[w.id] = { name: w.name }; });
      return map;
    },
    enabled: warehouseIds.length > 0,
  });

  // Filtros en cliente
  const filtered = useMemo(() => {
    let rows = movements;

    if (filterDirection !== "all") {
      rows = rows.filter((m) => {
        const t = m.reference_type ? typeMap.get(m.reference_type) : undefined;
        return t?.direction === filterDirection;
      });
    }

    if (filterCode !== "all") {
      rows = rows.filter((m) => m.reference_type === filterCode);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((m) => {
        const product = productsMap[m.product_id];
        const batch = m.batch_id ? batchesMap[m.batch_id] : undefined;
        const movType = m.reference_type ? typeMap.get(m.reference_type) : undefined;
        return (
          product?.name.toLowerCase().includes(q) ||
          product?.sku.toLowerCase().includes(q) ||
          batch?.batch_number.toLowerCase().includes(q) ||
          movType?.label.toLowerCase().includes(q) ||
          m.notes?.toLowerCase().includes(q)
        );
      });
    }

    return rows;
  }, [movements, filterDirection, filterCode, search, productsMap, batchesMap, typeMap]);

  const entryCodes = movementTypes.filter((t) => t.direction === "E");
  const exitCodes = movementTypes.filter((t) => t.direction === "S");
  const visibleCodes =
    filterDirection === "E" ? entryCodes : filterDirection === "S" ? exitCodes : movementTypes;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Producto, lote, tipo, notas..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="space-y-1 w-full sm:w-36">
          <Label className="text-xs">Dirección</Label>
          <Select value={filterDirection} onValueChange={(v: "all" | "E" | "S") => { setFilterDirection(v); setFilterCode("all"); setPage(0); }}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="E">Entradas</SelectItem>
              <SelectItem value="S">Salidas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 w-full sm:w-56">
          <Label className="text-xs">Tipo de movimiento</Label>
          <Select value={filterCode} onValueChange={(v) => { setFilterCode(v); setPage(0); }}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {visibleCodes.map((t) => (
                <SelectItem key={t.code} value={t.code}>
                  <span className="font-mono text-xs mr-1">[{t.code}]</span> {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No se encontraron movimientos con los filtros aplicados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center w-24">Cantidad</TableHead>
                <TableHead className="text-center w-32">Stock ant. → nuevo</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const product = productsMap[m.product_id];
                const batch = m.batch_id ? batchesMap[m.batch_id] : undefined;
                const warehouse = m.location ? warehousesMap[m.location] : undefined;
                const movType = m.reference_type ? typeMap.get(m.reference_type) : undefined;
                const isEntry = movType?.direction === "E";

                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium leading-tight">
                        {product?.name ?? m.product_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground">{product?.sku}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {batch?.batch_number ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {warehouse?.name ?? "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isEntry ? (
                          <ArrowDownCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        ) : (
                          <ArrowUpCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        )}
                        <div>
                          <Badge
                            variant="outline"
                            className={`text-xs font-mono ${isEntry ? "border-green-500 text-green-700" : "border-red-400 text-red-700"}`}
                          >
                            {m.reference_type}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {movType?.label ?? m.reference_type}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`font-semibold text-sm ${isEntry ? "text-green-600" : "text-destructive"}`}
                      >
                        {isEntry ? "+" : "-"}{m.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground whitespace-nowrap">
                      {m.previous_stock ?? "—"} → {m.new_stock ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={m.notes ?? ""}>
                      {m.notes || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginación */}
      {!isLoading && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Mostrando {filtered.length} de {movements.length} movimientos en esta página
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={movements.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
