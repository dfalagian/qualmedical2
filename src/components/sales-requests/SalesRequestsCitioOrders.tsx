import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, AlertCircle, ShoppingCart, ChevronDown, ChevronUp, FileText, User, Package, ArrowRightCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExternalOrderItem {
  id: string;
  medication_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  medications?: {
    brand?: string;
    precio_type_1?: number;
    [key: string]: any;
  };
}

interface ExternalOrder {
  id: string;
  order_number: string;
  supplier_name?: string;
  total_amount: number;
  subtotal?: number;
  iva?: number;
  status?: string;
  created_at: string;
  order_date?: string;
  notes?: string;
  items?: ExternalOrderItem[];
  patients?: { first_name?: string; first_lastname?: string; second_lastname?: string; second_name?: string };
  quotations?: { folio?: string; cycle?: number; application_date?: string };
  profiles?: { full_name?: string; company_name?: string };
  suppliers?: { id: string; name: string; rfc?: string };
}

export function SalesRequestsCitioOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading, error } = useQuery({
    queryKey: ["sales-requests-citio-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-external-purchase-orders");
      if (error) throw error;
      const result = data?.data;
      if (result?.orders && Array.isArray(result.orders)) return result.orders as ExternalOrder[];
      if (result?.purchase_orders && Array.isArray(result.purchase_orders)) return result.purchase_orders as ExternalOrder[];
      if (Array.isArray(result)) return result as ExternalOrder[];
      return [] as ExternalOrder[];
    },
  });

  const qualmedicalOrders = useMemo(() => {
    return orders.filter((order) => {
      const supplier = (
        order.suppliers?.name || order.supplier_name || order.profiles?.company_name || order.profiles?.full_name || ""
      ).toLowerCase();
      return supplier.includes("qualmedical") || supplier.includes("qual medical");
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return qualmedicalOrders;
    const term = searchTerm.toLowerCase();
    return qualmedicalOrders.filter(
      (o) =>
        o.order_number?.toLowerCase().includes(term) ||
        o.status?.toLowerCase().includes(term) ||
        getPatientName(o)?.toLowerCase().includes(term)
    );
  }, [qualmedicalOrders, searchTerm]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("es-MX"); } catch { return d; }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

  const getPatientName = (order: ExternalOrder) => {
    if (!order.patients) return null;
    const p = order.patients;
    return [p.first_name, p.second_name, p.first_lastname, p.second_lastname].filter(Boolean).join(" ");
  };

  const statusLabels: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    completed: "Completada",
    cancelled: "Cancelada",
  };

  const toggleExpand = (id: string) => {
    setExpandedOrderId(prev => prev === id ? null : id);
  };

  const handleConvertToQuote = async (order: ExternalOrder) => {
    setConvertingId(order.id);
    try {
      // Generate folio
      const { data: folio, error: folioError } = await supabase.rpc("generate_quote_folio");
      if (folioError) throw folioError;

      // We need a client. Let's check if a client matching the patient exists or use the first available
      // For now, we'll look for a client or ask user to pick one
      const { data: clients } = await supabase
        .from("clients")
        .select("id, nombre_cliente")
        .eq("is_active", true)
        .limit(1);

      if (!clients || clients.length === 0) {
        toast.error("No hay clientes registrados. Crea un cliente primero en la sección de Cotizaciones.");
        return;
      }

      const patientName = getPatientName(order);
      
      // Try to find a client matching the patient name or CITIO supplier
      let clientId = clients[0].id;
      if (patientName) {
        const { data: matchingClients } = await supabase
          .from("clients")
          .select("id")
          .eq("is_active", true)
          .ilike("nombre_cliente", `%${patientName.split(" ")[0]}%`)
          .limit(1);
        if (matchingClients && matchingClients.length > 0) {
          clientId = matchingClients[0].id;
        }
      }

      // Create quote
      const { data: { user } } = await supabase.auth.getUser();
      const quoteData = {
        folio,
        client_id: clientId,
        fecha_cotizacion: order.order_date || new Date().toISOString().split("T")[0],
        concepto: `Orden CITIO ${order.order_number}${patientName ? ` - Paciente: ${patientName}` : ""}${order.quotations?.folio ? ` - Cotización: ${order.quotations.folio}` : ""}`,
        subtotal: order.subtotal || order.total_amount || 0,
        total: order.total_amount || 0,
        status: "borrador",
        created_by: user?.id,
        notes: order.notes || null,
      };

      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert(quoteData)
        .select("id")
        .single();

      if (quoteError) throw quoteError;

      // Insert items
      if (order.items && order.items.length > 0) {
        const quoteItems = order.items.map(item => ({
          quote_id: newQuote.id,
          nombre_producto: item.medication_name,
          marca: item.medications?.brand || null,
          cantidad: item.quantity,
          precio_unitario: item.unit_price || 0,
          importe: item.subtotal || (item.unit_price * item.quantity) || 0,
          tipo_precio: "1",
        }));

        const { error: itemsError } = await supabase
          .from("quote_items")
          .insert(quoteItems);

        if (itemsError) throw itemsError;
      }

      toast.success(`Cotización ${folio} creada exitosamente`);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      
      // Navigate to quotes page
      navigate("/dashboard/quotes");
    } catch (err: any) {
      console.error("Error converting to quote:", err);
      toast.error(err.message || "Error al convertir en cotización");
    } finally {
      setConvertingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Órdenes de Compra CITIO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, paciente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Solo se muestran órdenes de compra con proveedor QualMedical</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive text-center py-4">Error al cargar órdenes</p>
        ) : filteredOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se encontraron órdenes de compra
          </p>
        ) : (
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-2">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const patientName = getPatientName(order);

                return (
                  <div
                    key={order.id}
                    className="rounded-lg border overflow-hidden transition-colors"
                  >
                    {/* Header - clickable */}
                    <div
                      className="flex items-center justify-between p-3 hover:bg-accent/10 cursor-pointer"
                      onClick={() => toggleExpand(order.id)}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{order.order_number}</p>
                          {order.quotations?.folio && (
                            <Badge variant="outline" className="text-xs">
                              {order.quotations.folio}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {order.suppliers?.name || order.supplier_name || "QualMedical"} • {formatDate(order.order_date || order.created_at)}
                          {patientName && ` • ${patientName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-semibold">{formatCurrency(order.total_amount)}</span>
                        {order.status && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {statusLabels[order.status] || order.status}
                          </Badge>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-4 space-y-4">
                        {/* Summary info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Subtotal</p>
                            <p className="font-medium">{formatCurrency(order.subtotal || 0)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">IVA</p>
                            <p className="font-medium">{formatCurrency(order.iva || 0)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Total</p>
                            <p className="font-semibold">{formatCurrency(order.total_amount)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Fecha</p>
                            <p className="font-medium">{formatDate(order.order_date || order.created_at)}</p>
                          </div>
                        </div>

                        {/* Patient */}
                        {patientName && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Paciente:</span>
                            <span className="font-medium">{patientName}</span>
                          </div>
                        )}

                        {/* Quotation reference */}
                        {order.quotations && (
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Cotización CITIO:</span>
                            <span className="font-medium">{order.quotations.folio}</span>
                            {order.quotations.cycle && (
                              <Badge variant="secondary" className="text-xs">Ciclo {order.quotations.cycle}</Badge>
                            )}
                          </div>
                        )}

                        {order.notes && (
                          <p className="text-sm text-muted-foreground italic">{order.notes}</p>
                        )}

                        {/* Items table */}
                        {order.items && order.items.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{order.items.length} producto(s)</span>
                            </div>
                            <div className="rounded border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left p-2 font-medium">Producto</th>
                                    <th className="text-left p-2 font-medium">Marca</th>
                                    <th className="text-right p-2 font-medium">Cant.</th>
                                    <th className="text-right p-2 font-medium">P. Unit.</th>
                                    <th className="text-right p-2 font-medium">Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item) => (
                                    <tr key={item.id} className="border-t">
                                      <td className="p-2">{item.medication_name}</td>
                                      <td className="p-2 text-muted-foreground">{item.medications?.brand || "—"}</td>
                                      <td className="p-2 text-right">{item.quantity}</td>
                                      <td className="p-2 text-right">{formatCurrency(item.unit_price)}</td>
                                      <td className="p-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Convert to Quote button */}
                        <div className="flex justify-end pt-2">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConvertToQuote(order);
                            }}
                            disabled={convertingId === order.id}
                            className="gap-2"
                          >
                            {convertingId === order.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowRightCircle className="h-4 w-4" />
                            )}
                            Convertir en Cotización
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
