// Generador de Informes — configurador visual + asistente IA + plantillas
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Sparkles, FileText, FileSpreadsheet, Save, Trash2, Play, Loader2,
  Package, CalendarClock, DollarSign, ShoppingCart, ArrowLeftRight,
  Snowflake, Trophy, Filter, BookmarkPlus, Receipt, Truck, Boxes, Users, Tags,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { exportReportToPDF, exportReportToXLSX, type ReportPayload } from "./reports/reportExporters";

const REPORT_TYPES = [
  { value: "stock", label: "Stock actual", icon: Package, desc: "Existencias por producto" },
  { value: "caducidades", label: "Caducidades", icon: CalendarClock, desc: "Lotes próximos a vencer" },
  { value: "valor_inventario", label: "Valor de inventario", icon: DollarSign, desc: "Stock × precio (venta y costo)" },
  { value: "costos_compra", label: "Costos de compra", icon: Receipt, desc: "Último costo por proveedor" },
  { value: "ventas", label: "Ventas (detalle)", icon: ShoppingCart, desc: "Cotizaciones aprobadas" },
  { value: "movimientos", label: "Movimientos", icon: ArrowLeftRight, desc: "Entradas / salidas / transferencias" },
  { value: "sin_movimiento", label: "Sin movimiento", icon: Snowflake, desc: "Productos sin ventas en N días" },
  { value: "top_productos", label: "Top productos", icon: Trophy, desc: "Más / menos vendidos" },
  { value: "compras_por_proveedor", label: "Compras por proveedor", icon: Truck, desc: "Total comprado por proveedor" },
  { value: "compras_por_articulo", label: "Compras por artículo", icon: Boxes, desc: "Cantidad y costo por producto" },
  { value: "ventas_por_cliente", label: "Ventas por cliente", icon: Users, desc: "Total vendido por cliente" },
  { value: "ventas_por_articulo", label: "Ventas por artículo", icon: Tags, desc: "Cantidad y precio por producto" },
] as const;

type ReportTypeValue = (typeof REPORT_TYPES)[number]["value"];

interface ReportConfig {
  report_type: ReportTypeValue;
  title: string;
  filters: {
    warehouse_id?: string;
    warehouse_name?: string;
    category?: string;
    supplier_name?: string;
    client_name?: string;
    product_name?: string;
    date_from?: string;
    date_to?: string;
    min_stock?: number;
    max_stock?: number;
    expiry_days?: number;
    top_n?: number;
    order?: "asc" | "desc";
    incluir_iva?: boolean;
    solo_con_movimiento?: boolean;
    comparar_periodo_anterior?: boolean;
    pivot?: boolean;
  };
  group_by?: string;
  format: "pdf" | "xlsx";
}

const defaultConfig: ReportConfig = {
  report_type: "stock",
  title: "Stock actual",
  filters: {},
  group_by: "none",
  format: "pdf",
};

const GROUP_BY_OPTIONS: Record<string, { value: string; label: string }[]> = {
  compras_por_proveedor: [
    { value: "none", label: "Sin agrupar" },
    { value: "month", label: "Por mes" },
    { value: "week", label: "Por semana" },
    { value: "product", label: "Por artículo" },
  ],
  compras_por_articulo: [
    { value: "none", label: "Sin agrupar" },
    { value: "month", label: "Por mes" },
    { value: "week", label: "Por semana" },
    { value: "supplier", label: "Por proveedor" },
  ],
  ventas_por_cliente: [
    { value: "none", label: "Sin agrupar" },
    { value: "month", label: "Por mes" },
    { value: "week", label: "Por semana" },
    { value: "product", label: "Por artículo" },
  ],
  ventas_por_articulo: [
    { value: "none", label: "Sin agrupar" },
    { value: "month", label: "Por mes" },
    { value: "week", label: "Por semana" },
    { value: "client", label: "Por cliente" },
  ],
};

const TYPES_WITH_DATES: ReportTypeValue[] = [
  "ventas", "movimientos", "top_productos",
  "compras_por_proveedor", "compras_por_articulo",
  "ventas_por_cliente", "ventas_por_articulo",
];
const TYPES_WITH_CATEGORY: ReportTypeValue[] = [
  "stock", "caducidades", "valor_inventario", "sin_movimiento", "costos_compra",
  "compras_por_articulo", "ventas_por_articulo",
];
const TYPES_WITH_SUPPLIER: ReportTypeValue[] = ["compras_por_proveedor"];
const TYPES_WITH_CLIENT: ReportTypeValue[] = ["ventas_por_cliente"];
const TYPES_WITH_PRODUCT: ReportTypeValue[] = ["compras_por_articulo", "ventas_por_articulo"];
const TYPES_WITH_TOPN: ReportTypeValue[] = [
  "top_productos",
  "compras_por_proveedor", "compras_por_articulo",
  "ventas_por_cliente", "ventas_por_articulo",
];
const TYPES_WITH_IVA: ReportTypeValue[] = [
  "compras_por_proveedor", "ventas_por_cliente",
];
const TYPES_WITH_AGG_OPTIONS: ReportTypeValue[] = [
  "compras_por_proveedor", "compras_por_articulo",
  "ventas_por_cliente", "ventas_por_articulo",
];

export function ReportGenerator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ReportConfig>(defaultConfig);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<ReportPayload | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");

  // Cargar almacenes para el selector
  const { data: warehouses } = useQuery({
    queryKey: ["report-gen-warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Cargar plantillas guardadas
  const { data: templates } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_templates")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Sincronizar título cuando cambia el tipo
  useEffect(() => {
    const t = REPORT_TYPES.find(r => r.value === config.report_type);
    if (t && (!config.title || REPORT_TYPES.some(r => r.label === config.title))) {
      setConfig(c => ({ ...c, title: t.label }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.report_type]);

  const updateFilter = <K extends keyof ReportConfig["filters"]>(key: K, value: ReportConfig["filters"][K]) => {
    setConfig(c => ({ ...c, filters: { ...c.filters, [key]: value } }));
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Escribe qué informe necesitas");
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-report-request", {
        body: { prompt: aiPrompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const aiCfg = data.config as Partial<ReportConfig>;
      setConfig(c => ({
        ...c,
        ...aiCfg,
        filters: { ...c.filters, ...(aiCfg.filters ?? {}) },
      } as ReportConfig));
      toast.success("Configuración generada por IA. Revisa y pulsa 'Generar informe'.");
    } catch (e: any) {
      toast.error(e.message ?? "Error al interpretar la petición");
    } finally {
      setAiLoading(false);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { config },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreview(data as ReportPayload);
      toast.success(`Informe generado: ${data.total_rows} registros`);
    } catch (e: any) {
      toast.error(e.message ?? "Error al generar el informe");
    } finally {
      setRunning(false);
    }
  };

  const handleExport = (format: "pdf" | "xlsx") => {
    if (!preview) return;
    if (format === "pdf") exportReportToPDF(preview);
    else exportReportToXLSX(preview);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !user) return;
    const { error } = await supabase.from("report_templates").insert({
      name: templateName,
      description: templateDesc || null,
      report_type: config.report_type,
      config: config as any,
      created_by: user.id,
    });
    if (error) {
      toast.error("No se pudo guardar la plantilla");
      return;
    }
    toast.success("Plantilla guardada");
    setSaveDialogOpen(false);
    setTemplateName("");
    setTemplateDesc("");
    queryClient.invalidateQueries({ queryKey: ["report-templates"] });
  };

  const handleLoadTemplate = (tpl: any) => {
    setConfig(tpl.config as ReportConfig);
    toast.success(`Plantilla "${tpl.name}" cargada`);
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from("report_templates").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    toast.success("Plantilla eliminada");
    queryClient.invalidateQueries({ queryKey: ["report-templates"] });
  };

  const previewRows = useMemo(() => preview?.rows.slice(0, 50) ?? [], [preview]);

  const fmt = (val: any, col: { format?: string }) => {
    if (val == null || val === "") return "—";
    if (col.format === "currency")
      return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(val));
    if (col.format === "number") return new Intl.NumberFormat("es-MX").format(Number(val));
    if (col.format === "date") {
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("es-MX");
    }
    return String(val);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="builder" className="w-full">
        <TabsList>
          <TabsTrigger value="builder" className="gap-1.5">
            <Filter className="h-4 w-4" /> Configurador
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-4 w-4" /> Asistente IA
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <BookmarkPlus className="h-4 w-4" /> Plantillas
            {templates && templates.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{templates.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Configurador visual ────────────────────────── */}
        <TabsContent value="builder" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configura tu informe</CardTitle>
              <CardDescription>Selecciona el tipo y aplica los filtros que necesites.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tipo de informe */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {REPORT_TYPES.map(t => {
                  const Icon = t.icon;
                  const active = config.report_type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, report_type: t.value, title: t.label }))}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.desc}</span>
                    </button>
                  );
                })}
              </div>

              <Separator />

              {/* Título y formato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Título del informe</Label>
                  <Input value={config.title} onChange={e => setConfig(c => ({ ...c, title: e.target.value }))} />
                </div>
                <div>
                  <Label>Formato de salida</Label>
                  <Select value={config.format} onValueChange={(v: "pdf" | "xlsx") => setConfig(c => ({ ...c, format: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Filtros dinámicos */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(["stock", "valor_inventario", "movimientos"].includes(config.report_type)) && (
                  <div>
                    <Label>Almacén</Label>
                    <Select
                      value={config.filters.warehouse_id ?? "all"}
                      onValueChange={v => updateFilter("warehouse_id", v === "all" ? undefined : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los almacenes</SelectItem>
                        {warehouses?.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {TYPES_WITH_CATEGORY.includes(config.report_type) && (
                  <div>
                    <Label>Categoría (contiene)</Label>
                    <Input placeholder="Ej: Antibióticos" value={config.filters.category ?? ""}
                      onChange={e => updateFilter("category", e.target.value || undefined)} />
                  </div>
                )}

                {TYPES_WITH_SUPPLIER.includes(config.report_type) && (
                  <div>
                    <Label>Proveedor (contiene)</Label>
                    <Input placeholder="Ej: Farmacéutica X" value={config.filters.supplier_name ?? ""}
                      onChange={e => updateFilter("supplier_name", e.target.value || undefined)} />
                  </div>
                )}

                {TYPES_WITH_CLIENT.includes(config.report_type) && (
                  <div>
                    <Label>Cliente (contiene)</Label>
                    <Input placeholder="Ej: Hospital Y" value={config.filters.client_name ?? ""}
                      onChange={e => updateFilter("client_name", e.target.value || undefined)} />
                  </div>
                )}

                {TYPES_WITH_PRODUCT.includes(config.report_type) && (
                  <div>
                    <Label>Producto (contiene)</Label>
                    <Input placeholder="Ej: Paracetamol" value={config.filters.product_name ?? ""}
                      onChange={e => updateFilter("product_name", e.target.value || undefined)} />
                  </div>
                )}

                {TYPES_WITH_DATES.includes(config.report_type) && (
                  <>
                    <div>
                      <Label>Desde</Label>
                      <Input type="date" value={config.filters.date_from ?? ""}
                        onChange={e => updateFilter("date_from", e.target.value || undefined)} />
                    </div>
                    <div>
                      <Label>Hasta</Label>
                      <Input type="date" value={config.filters.date_to ?? ""}
                        onChange={e => updateFilter("date_to", e.target.value || undefined)} />
                    </div>
                  </>
                )}

                {config.report_type === "stock" && (
                  <>
                    <div>
                      <Label>Stock mínimo</Label>
                      <Input type="number" placeholder="0" value={config.filters.min_stock ?? ""}
                        onChange={e => updateFilter("min_stock", e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                    <div>
                      <Label>Stock máximo</Label>
                      <Input type="number" placeholder="∞" value={config.filters.max_stock ?? ""}
                        onChange={e => updateFilter("max_stock", e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                  </>
                )}

                {config.report_type === "caducidades" && (
                  <div>
                    <Label>Días de alerta</Label>
                    <Input type="number" placeholder="60" value={config.filters.expiry_days ?? ""}
                      onChange={e => updateFilter("expiry_days", e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                )}
                {config.report_type === "sin_movimiento" && (
                  <div>
                    <Label>Días sin venta</Label>
                    <Input type="number" placeholder="90" value={config.filters.expiry_days ?? ""}
                      onChange={e => updateFilter("expiry_days", e.target.value ? Number(e.target.value) : undefined)} />
                  </div>
                )}

                {TYPES_WITH_TOPN.includes(config.report_type) && (
                  <>
                    <div>
                      <Label>Top N (cantidad)</Label>
                      <Input type="number" placeholder="20" value={config.filters.top_n ?? ""}
                        onChange={e => updateFilter("top_n", e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                    <div>
                      <Label>Orden</Label>
                      <Select value={config.filters.order ?? "desc"}
                        onValueChange={(v: "asc" | "desc") => updateFilter("order", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">Mayores primero</SelectItem>
                          <SelectItem value="asc">Menores primero</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              {TYPES_WITH_AGG_OPTIONS.includes(config.report_type) && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Opciones avanzadas</Label>

                    {/* Agrupación + pivote */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Agrupar por</Label>
                        <Select
                          value={config.group_by ?? "none"}
                          onValueChange={v => setConfig(c => ({ ...c, group_by: v }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(GROUP_BY_OPTIONS[config.report_type] ?? [{ value: "none", label: "Sin agrupar" }])
                              .map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Switch
                          checked={config.filters.pivot ?? false}
                          disabled={!config.group_by || config.group_by === "none"}
                          onCheckedChange={v => {
                            updateFilter("pivot", v);
                            if (v) setConfig(c => ({ ...c, format: "xlsx" }));
                          }}
                        />
                        <div className="space-y-0.5">
                          <Label className="text-sm">Vista pivote (Excel)</Label>
                          <p className="text-xs text-muted-foreground">
                            Filas = entidad, columnas = valores agrupados. Requiere agrupación y fuerza Excel.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {TYPES_WITH_IVA.includes(config.report_type) && (
                        <div className="flex items-start gap-3 rounded-lg border p-3">
                          <Switch checked={config.filters.incluir_iva ?? true}
                            onCheckedChange={v => updateFilter("incluir_iva", v)} />
                          <div className="space-y-0.5">
                            <Label className="text-sm">Incluir IVA</Label>
                            <p className="text-xs text-muted-foreground">Si está apagado, muestra subtotal.</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Switch checked={config.filters.solo_con_movimiento ?? true}
                          onCheckedChange={v => updateFilter("solo_con_movimiento", v)} />
                        <div className="space-y-0.5">
                          <Label className="text-sm">Solo con movimiento</Label>
                          <p className="text-xs text-muted-foreground">Ocultar registros con cantidad/total = 0.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Switch checked={config.filters.comparar_periodo_anterior ?? false}
                          onCheckedChange={v => updateFilter("comparar_periodo_anterior", v)} />
                        <div className="space-y-0.5">
                          <Label className="text-sm">Comparar periodo anterior</Label>
                          <p className="text-xs text-muted-foreground">Añade columnas vs periodo previo (requiere fechas).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleRun} disabled={running} className="gap-1.5">
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Generar informe
                </Button>
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-1.5">
                      <Save className="h-4 w-4" /> Guardar como plantilla
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Guardar plantilla</DialogTitle>
                      <DialogDescription>
                        Guarda esta configuración para reutilizarla luego con un clic.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div>
                        <Label>Nombre *</Label>
                        <Input value={templateName} onChange={e => setTemplateName(e.target.value)}
                          placeholder="Ej: Stock semanal Almacén Principal" />
                      </div>
                      <div>
                        <Label>Descripción</Label>
                        <Textarea value={templateDesc} onChange={e => setTemplateDesc(e.target.value)}
                          placeholder="Opcional" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>Guardar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Asistente IA ───────────────────────────────── */}
        <TabsContent value="ai" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Pide tu informe en lenguaje natural
              </CardTitle>
              <CardDescription>
                Describe lo que quieres y la IA configura los filtros por ti.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                rows={3}
                placeholder='Ej: "Dame el stock del Almacén Principal de productos con caducidad en los próximos 60 días, en Excel"'
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleAIGenerate} disabled={aiLoading} className="gap-1.5">
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Interpretar con IA
                </Button>
                <Button variant="outline" onClick={handleRun} disabled={running || aiLoading}>
                  Generar directamente
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Sugerencias rápidas:{" "}
                {[
                  "Top 10 productos más vendidos este mes",
                  "Lotes que caducan en 30 días",
                  "Valor total del inventario por categoría",
                  "Productos sin movimiento en 90 días",
                ].map(s => (
                  <button key={s} type="button"
                    onClick={() => setAiPrompt(s)}
                    className="mr-2 inline-block underline hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Plantillas ─────────────────────────────────── */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mis plantillas</CardTitle>
              <CardDescription>Carga una plantilla guardada para ejecutarla al instante.</CardDescription>
            </CardHeader>
            <CardContent>
              {!templates || templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Aún no tienes plantillas. Configura un informe y pulsa "Guardar como plantilla".
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map((tpl: any) => (
                    <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{tpl.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {REPORT_TYPES.find(r => r.value === tpl.report_type)?.label ?? tpl.report_type}
                          </Badge>
                        </div>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleLoadTemplate(tpl)}>
                          Cargar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminar plantilla</AlertDialogTitle>
                              <AlertDialogDescription>
                                ¿Seguro que deseas eliminar "{tpl.name}"? Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteTemplate(tpl.id)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Vista previa + exportación ─────────────────────────── */}
      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-lg">{preview.title}</CardTitle>
                <CardDescription>
                  {preview.total_rows} registros · Generado {new Date(preview.generated_at).toLocaleString("es-MX")}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} className="gap-1.5">
                  <FileText className="h-4 w-4" /> Descargar PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} className="gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" /> Descargar Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {preview.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No se encontraron registros con los filtros aplicados.
              </p>
            ) : (
              <ScrollArea className="h-[400px] rounded border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      {preview.columns.map(c => (
                        <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {preview.columns.map(c => (
                          <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                            {fmt(row[c.key], c)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.rows.length > 50 && (
                  <p className="text-xs text-muted-foreground p-3 text-center border-t">
                    Mostrando primeros 50 de {preview.rows.length} registros. Descarga el archivo para verlos todos.
                  </p>
                )}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
