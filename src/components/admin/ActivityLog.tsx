import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Search,
  CalendarIcon,
  ClipboardList,
  X,
  Package,
  FileText,
  ShoppingCart,
  ArrowLeftRight,
  BookOpen,
  User,
} from "lucide-react";

const SECTION_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  inventario: { label: "Inventario", icon: Package, color: "bg-blue-500" },
  cotizaciones: { label: "Cotizaciones", icon: FileText, color: "bg-green-500" },
  compras_ventas: { label: "Compras-Ventas", icon: ArrowLeftRight, color: "bg-purple-500" },
  catalogo: { label: "Catálogo", icon: BookOpen, color: "bg-orange-500" },
  ordenes_compra: { label: "Órdenes de Compra", icon: ShoppingCart, color: "bg-red-500" },
};

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  crear: { label: "Creó", variant: "default" },
  editar: { label: "Editó", variant: "secondary" },
  eliminar: { label: "Eliminó", variant: "destructive" },
  importar: { label: "Importó", variant: "outline" },
  vincular: { label: "Vinculó", variant: "default" },
  desvincular: { label: "Desvinculó", variant: "secondary" },
  estado: { label: "Cambió estado", variant: "secondary" },
  cargar: { label: "Cargó", variant: "default" },
  aprobar: { label: "Aprobó", variant: "default" },
  cancelar: { label: "Canceló", variant: "destructive" },
  ingreso: { label: "Ingresó", variant: "default" },
  salida: { label: "Salida", variant: "secondary" },
  transferencia: { label: "Transfirió", variant: "outline" },
};

export function ActivityLog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity_log", sectionFilter, dateFilter, page],
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (sectionFilter && sectionFilter !== "all") {
        query = query.eq("section", sectionFilter);
      }

      if (dateFilter) {
        const start = new Date(dateFilter);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateFilter);
        end.setHours(23, 59, 59, 999);
        query = query.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(
      (log: any) =>
        log.user_name?.toLowerCase().includes(term) ||
        log.user_email?.toLowerCase().includes(term) ||
        log.entity_name?.toLowerCase().includes(term) ||
        log.entity_type?.toLowerCase().includes(term) ||
        log.action?.toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  const clearFilters = () => {
    setSearchTerm("");
    setSectionFilter("all");
    setDateFilter(undefined);
    setPage(0);
  };

  const hasActiveFilters = searchTerm || sectionFilter !== "all" || dateFilter;

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Bitácora de Actividad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuario, entidad..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sectionFilter} onValueChange={(v) => { setSectionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas las secciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las secciones</SelectItem>
              {Object.entries(SECTION_LABELS).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 w-[180px] justify-start">
                <CalendarIcon className="h-4 w-4" />
                {dateFilter ? format(dateFilter, "dd/MM/yyyy") : "Fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dateFilter}
                onSelect={(d) => { setDateFilter(d); setPage(0); }}
                locale={es}
              />
            </PopoverContent>
          </Popover>
          {hasActiveFilters && (
            <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpiar filtros">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Log entries */}
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Cargando bitácora...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <ClipboardList className="h-8 w-8 opacity-50" />
              No hay registros de actividad
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log: any) => {
                const sectionInfo = SECTION_LABELS[log.section] || { label: log.section, icon: Package, color: "bg-muted" };
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, variant: "secondary" as const };
                const SectionIcon = sectionInfo.icon;
                const details = log.details || {};

                return (
                  <div
                    key={log.id}
                    className="p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-1.5 rounded-md ${sectionInfo.color} text-white shrink-0 mt-0.5`}>
                          <SectionIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{log.user_name}</span>
                            <Badge variant={actionInfo.variant} className="text-xs">
                              {actionInfo.label}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {log.entity_type}
                            </span>
                          </div>
                          {log.entity_name && (
                            <p className="text-sm mt-0.5 truncate">
                              <span className="font-medium">{log.entity_name}</span>
                              {log.entity_id && (
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({log.entity_id.slice(0, 8)}...)
                                </span>
                              )}
                            </p>
                          )}
                          {/* Show detail fields */}
                          {Object.keys(details).length > 0 && (
                            <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5">
                              {details.previous_value !== undefined && (
                                <p>
                                  Anterior: <span className="line-through">{String(details.previous_value)}</span>
                                  {details.new_value !== undefined && (
                                    <> → Nuevo: <span className="font-medium text-foreground">{String(details.new_value)}</span></>
                                  )}
                                </p>
                              )}
                              {details.amount !== undefined && (
                                <p>Monto: ${Number(details.amount).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                              )}
                              {details.items_count !== undefined && (
                                <p>Productos: {details.items_count}</p>
                              )}
                              {details.status && (
                                <p>Estado: {details.status}</p>
                              )}
                              {details.note && (
                                <p>{details.note}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 text-right">
                        <p>
                          {new Date(log.created_at).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        <p>
                          {new Date(log.created_at).toLocaleTimeString("es-MX", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {filteredLogs.length} registros (página {page + 1})
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={logs.length < pageSize}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
