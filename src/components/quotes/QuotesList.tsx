import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  Eye, 
  Printer, 
  CheckCircle2, 
  XCircle,
  Search,
  ListFilter,
  FileText,
  Pencil,
  Radio,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { printQuoteHtml } from "./quoteHtmlPrint";
import { useQuoteActions } from "@/hooks/useQuoteActions";
import { BatchSelectionDialog } from "./BatchSelectionDialog";
import { InventoryExitScanDialog } from "./InventoryExitScanDialog";

interface Quote {
  id: string;
  folio: string;
  concepto: string | null;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  factura_anterior?: string | null;
  fecha_factura_anterior?: string | null;
  monto_factura_anterior?: number | null;
  status: string;
  inventory_exit_status: string | null;
  subtotal: number;
  total: number;
  created_at: string;
  client: {
    id: string;
    nombre_cliente: string;
    razon_social: string | null;
    rfc: string | null;
    cfdi: string | null;
  };
}

interface QuoteItem {
  id: string;
  product_id: string | null;
  batch_id: string | null;
  nombre_producto: string;
  marca: string | null;
  lote: string | null;
  fecha_caducidad: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  tipo_precio?: string | null;
  categoria?: string | null;
}

interface QuoteToEdit {
  id: string;
  folio: string;
  concepto: string | null;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  factura_anterior: string | null;
  fecha_factura_anterior: string | null;
  monto_factura_anterior: number | null;
  client_id: string;
  client: {
    id: string;
    nombre_cliente: string;
    razon_social: string | null;
    rfc: string | null;
    cfdi: string | null;
  };
  items: Array<{
    id: string;
    product_id: string | null;
    batch_id: string | null;
    nombre_producto: string;
    marca: string | null;
    lote: string | null;
    fecha_caducidad: string | null;
    cantidad: number;
    precio_unitario: number;
    importe: number;
    tipo_precio: string | null;
  }>;
}

interface QuotesListProps {
  onEditQuote?: (quote: QuoteToEdit) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  borrador: { label: "Borrador", variant: "outline" },
  aprobada: { label: "Aprobada", variant: "default", className: "bg-emerald-500 hover:bg-emerald-600" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

export const QuotesList = ({ onEditQuote }: QuotesListProps) => {
  const queryClient = useQueryClient();
  const { approveQuote, cancelQuote, isApproving, isCancelling } = useQuoteActions();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Quote detail dialog
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Batch selection dialog for approval
  const [batchSelectionOpen, setBatchSelectionOpen] = useState(false);
  const [quoteToApprove, setQuoteToApprove] = useState<Quote | null>(null);
  
  // Inventory exit scan dialog (post-approval)
  const [exitScanOpen, setExitScanOpen] = useState(false);
  const [approvedQuoteId, setApprovedQuoteId] = useState<string | null>(null);
  const [approvedItems, setApprovedItems] = useState<Array<{
    id: string;
    product_id: string;
    batch_id: string;
    nombre_producto: string;
    cantidad: number;
    rfid_required: boolean;
  }>>([]);
  
  // Cancel confirmation
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [quoteToCancel, setQuoteToCancel] = useState<Quote | null>(null);
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch quotes
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          id,
          folio,
          concepto,
          fecha_cotizacion,
          fecha_entrega,
          factura_anterior,
          fecha_factura_anterior,
          monto_factura_anterior,
          status,
          inventory_exit_status,
          subtotal,
          total,
          created_at,
          client:clients!quotes_client_id_fkey (
            id,
            nombre_cliente,
            razon_social,
            rfc,
            cfdi
          )
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Quote[];
    },
  });

  // Filter quotes
  const filteredQuotes = quotes.filter((quote) => {
    const matchesSearch = 
      quote.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.client?.nombre_cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.concepto?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Fetch quote items for detail view (with product category)
  const fetchQuoteItems = async (quoteId: string) => {
    const { data, error } = await supabase
      .from("quote_items")
      .select(`
        *,
        products:product_id (category)
      `)
      .eq("quote_id", quoteId)
      .order("created_at");
    
    if (error) throw error;
    
    // Map to include category from joined product
    return (data || []).map(item => ({
      ...item,
      categoria: item.products?.category || null,
      products: undefined, // Remove the nested object
    })) as QuoteItem[];
  };

  // View quote details
  const handleViewQuote = async (quote: Quote) => {
    setSelectedQuote(quote);
    try {
      const items = await fetchQuoteItems(quote.id);
      setQuoteItems(items);
      setDetailOpen(true);
    } catch (error) {
      toast.error("Error al cargar los detalles de la cotización");
    }
  };

  // Edit quote
  const handleEditQuote = async (quote: Quote) => {
    if (!onEditQuote) return;
    
    try {
      const items = await fetchQuoteItems(quote.id);
      
      onEditQuote({
        id: quote.id,
        folio: quote.folio,
        concepto: quote.concepto,
        fecha_cotizacion: quote.fecha_cotizacion,
        fecha_entrega: quote.fecha_entrega,
        factura_anterior: quote.factura_anterior || null,
        fecha_factura_anterior: quote.fecha_factura_anterior || null,
        monto_factura_anterior: quote.monto_factura_anterior || null,
        client_id: quote.client.id,
        client: quote.client,
        items: items.map(item => ({
          ...item,
          tipo_precio: item.tipo_precio || "1",
        })),
      });
    } catch (error) {
      toast.error("Error al cargar la cotización para editar");
    }
  };

  // Print quote
  const handlePrintQuote = async (quote: Quote) => {
    try {
      const items = await fetchQuoteItems(quote.id);
      
      printQuoteHtml({
        folio: quote.folio,
        concepto: quote.concepto || "",
        fechaCotizacion: new Date(quote.fecha_cotizacion),
        fechaEntrega: quote.fecha_entrega ? new Date(quote.fecha_entrega) : undefined,
        client: quote.client,
        items: items.map(item => ({
          ...item,
          id: item.id,
          marca: item.marca || "",
          lote: item.lote || "",
          fecha_caducidad: item.fecha_caducidad ? new Date(item.fecha_caducidad) : null,
          categoria: item.categoria || null,
        })),
        subtotal: quote.subtotal,
        total: quote.total,
      });
    } catch (error) {
      toast.error("Error al generar el PDF");
    }
  };

  // Start approve process - open batch selection dialog
  const handleStartApprove = async (quote: Quote) => {
    setQuoteToApprove(quote);
    
    try {
      const items = await fetchQuoteItems(quote.id);
      setQuoteItems(items);
      setBatchSelectionOpen(true);
    } catch (error) {
      toast.error("Error al cargar los productos de la cotización");
    }
  };

  // Handle batch selection confirmation and approve
  const handleBatchSelectionConfirm = async (selections: Array<{
    itemId: string;
    productId: string;
    batchId: string | null;
    batchNumber: string | null;
    expirationDate: string | null;
    availableQuantity: number;
    requestedQuantity: number;
  }>) => {
    if (!quoteToApprove) return;
    
    try {
      // Fetch rfid_required for all products
      const productIds = [...new Set(selections.map(s => s.productId))];
      const { data: productsData } = await supabase
        .from("products")
        .select("id, rfid_required")
        .in("id", productIds);
      
      const rfidMap = new Map(productsData?.map(p => [p.id, p.rfid_required]) || []);

      // Map selections to the format expected by approveQuote
      const itemsWithBatches = selections
        .filter(sel => sel.batchId)
        .map(sel => {
          const originalItem = quoteItems.find(i => i.id === sel.itemId);
          return {
            product_id: sel.productId,
            batch_id: sel.batchId!,
            cantidad: sel.requestedQuantity,
            nombre_producto: originalItem?.nombre_producto || "",
          };
        });

      // Check if any have insufficient stock
      const hasStockWarnings = selections.some(sel => 
        sel.batchId && sel.availableQuantity < sel.requestedQuantity
      );

      await approveQuote({
        quoteId: quoteToApprove.id,
        items: itemsWithBatches,
        forceApprove: hasStockWarnings,
      });
      
      // Prepare items for exit scan dialog
      const itemsForScan = selections
        .filter(sel => sel.batchId)
        .map(sel => {
          const originalItem = quoteItems.find(i => i.id === sel.itemId);
          return {
            id: sel.itemId,
            product_id: sel.productId,
            batch_id: sel.batchId!,
            nombre_producto: originalItem?.nombre_producto || "",
            cantidad: sel.requestedQuantity,
            rfid_required: rfidMap.get(sel.productId) || false,
          };
        });
      
      // Check if any product requires RFID scan
      const hasRfidProducts = itemsForScan.some(item => item.rfid_required);
      
      setBatchSelectionOpen(false);
      setQuoteToApprove(null);
      setQuoteItems([]);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      
      // Open exit scan dialog if there are products to process
      if (itemsForScan.length > 0 && hasRfidProducts) {
        setApprovedQuoteId(quoteToApprove.id);
        setApprovedItems(itemsForScan);
        setExitScanOpen(true);
      }
    } catch (error: any) {
      toast.error("Error al aprobar: " + error.message);
    }
  };

  // Start exit scan for already approved quote
  const handleStartExitScan = async (quote: Quote) => {
    try {
      const items = await fetchQuoteItems(quote.id);
      
      // Fetch rfid_required for all products
      const productIds = [...new Set(items.filter(i => i.product_id).map(i => i.product_id as string))];
      const { data: productsData } = await supabase
        .from("products")
        .select("id, rfid_required")
        .in("id", productIds);
      
      const rfidMap = new Map(productsData?.map(p => [p.id, p.rfid_required]) || []);
      
      // Get batch_id from quote_items (they should have been set during approval)
      const itemsForScan = items
        .filter(item => item.product_id && item.batch_id)
        .map(item => ({
          id: item.id,
          product_id: item.product_id!,
          batch_id: item.batch_id!,
          nombre_producto: item.nombre_producto,
          cantidad: item.cantidad,
          rfid_required: rfidMap.get(item.product_id!) || false,
        }));
      
      if (itemsForScan.length > 0) {
        setApprovedQuoteId(quote.id);
        setApprovedItems(itemsForScan);
        setExitScanOpen(true);
      } else {
        toast.error("No hay productos con lotes asignados para escanear");
      }
    } catch (error) {
      toast.error("Error al cargar los productos");
    }
  };

  // Start cancel process
  const handleStartCancel = (quote: Quote) => {
    setQuoteToCancel(quote);
    setCancelDialogOpen(true);
  };

  // Confirm cancel
  const handleConfirmCancel = async () => {
    if (!quoteToCancel) return;
    
    try {
      await cancelQuote(quoteToCancel.id);
      setCancelDialogOpen(false);
      setQuoteToCancel(null);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    } catch (error: any) {
      toast.error("Error al cancelar: " + error.message);
    }
  };

  // Start delete process
  const handleStartDelete = (quote: Quote) => {
    setQuoteToDelete(quote);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!quoteToDelete) return;
    
    setIsDeleting(true);
    try {
      // First delete quote items
      const { error: itemsError } = await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", quoteToDelete.id);
      
      if (itemsError) throw itemsError;
      
      // Then delete the quote
      const { error: quoteError } = await supabase
        .from("quotes")
        .delete()
        .eq("id", quoteToDelete.id);
      
      if (quoteError) throw quoteError;
      
      toast.success(`Cotización ${quoteToDelete.folio} eliminada`);
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    } catch (error: any) {
      toast.error("Error al eliminar: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Cotizaciones Guardadas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por folio, cliente o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <ListFilter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="aprobada">Aprobada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quotes Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Cargando cotizaciones...
                    </TableCell>
                  </TableRow>
                ) : filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron cotizaciones
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQuotes.map((quote) => {
                    const config = statusConfig[quote.status] || statusConfig.borrador;
                    return (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">{quote.folio}</TableCell>
                        <TableCell>{quote.client?.nombre_cliente || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {quote.concepto || "-"}
                        </TableCell>
                        <TableCell>
                          {format(new Date(quote.fecha_cotizacion), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${quote.total.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={config.variant}
                              className={config.className}
                            >
                              {config.label}
                            </Badge>
                            {/* Alert for pending inventory exit */}
                            {quote.status === "aprobada" && quote.inventory_exit_status !== "completed" && (
                              <Badge 
                                variant="outline" 
                                className="text-amber-600 border-amber-400 bg-amber-50 animate-pulse"
                                title="Salida de inventario pendiente"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Salida pendiente
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewQuote(quote)}
                              title="Ver detalles"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {quote.status === "borrador" && onEditQuote && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditQuote(quote)}
                                title="Editar cotización"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintQuote(quote)}
                              title="Imprimir PDF"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {quote.status === "borrador" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartApprove(quote)}
                                title="Aprobar venta"
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {quote.status === "aprobada" && quote.inventory_exit_status !== "completed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartExitScan(quote)}
                                title="Registrar salida de inventario"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              >
                                <Radio className="h-4 w-4" />
                              </Button>
                            )}
                            {quote.status === "aprobada" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartCancel(quote)}
                                title="Cancelar venta"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {quote.status === "borrador" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartDelete(quote)}
                                title="Eliminar cotización"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Quote Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Cotización {selectedQuote?.folio}
            </DialogTitle>
            <DialogDescription>
              {selectedQuote?.client?.nombre_cliente} - {format(new Date(selectedQuote?.fecha_cotizacion || new Date()), "PPP", { locale: es })}
            </DialogDescription>
          </DialogHeader>
          
          {selectedQuote && (
            <div className="space-y-4">
              {/* Client info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="font-medium">{selectedQuote.client?.nombre_cliente}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">RFC</p>
                  <p className="font-medium">{selectedQuote.client?.rfc || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Concepto</p>
                  <p className="font-medium">{selectedQuote.concepto || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Estado</p>
                  <Badge 
                    variant={statusConfig[selectedQuote.status]?.variant || "outline"}
                    className={statusConfig[selectedQuote.status]?.className}
                  >
                    {statusConfig[selectedQuote.status]?.label || selectedQuote.status}
                  </Badge>
                </div>
              </div>

              {/* Items table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead>Caducidad</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoteItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nombre_producto}</TableCell>
                        <TableCell>{item.marca || "-"}</TableCell>
                        <TableCell>{item.lote || "-"}</TableCell>
                        <TableCell>
                          {item.fecha_caducidad 
                            ? format(new Date(item.fecha_caducidad), "dd/MM/yyyy") 
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">{item.cantidad}</TableCell>
                        <TableCell className="text-right">${item.precio_unitario.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">${item.importe.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>${selectedQuote.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">${selectedQuote.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Cerrar
            </Button>
            {selectedQuote && (
              <Button variant="secondary" onClick={() => handlePrintQuote(selectedQuote)}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir PDF
              </Button>
            )}
            {selectedQuote?.status === "borrador" && (
              <Button 
                onClick={() => {
                  setDetailOpen(false);
                  handleStartApprove(selectedQuote);
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aprobar Venta
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Selection Dialog for Approval */}
      {quoteToApprove && (
        <BatchSelectionDialog
          open={batchSelectionOpen}
          onOpenChange={(open) => {
            setBatchSelectionOpen(open);
            if (!open) {
              setQuoteToApprove(null);
              setQuoteItems([]);
            }
          }}
          quoteId={quoteToApprove.id}
          quoteItems={quoteItems}
          onConfirm={handleBatchSelectionConfirm}
          isApproving={isApproving}
        />
      )}

      {/* Inventory Exit Scan Dialog */}
      {approvedQuoteId && (
        <InventoryExitScanDialog
          open={exitScanOpen}
          onOpenChange={(open) => {
            setExitScanOpen(open);
            if (!open) {
              setApprovedQuoteId(null);
              setApprovedItems([]);
            }
          }}
          quoteId={approvedQuoteId}
          quoteItems={approvedItems}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            queryClient.invalidateQueries({ queryKey: ["rfid-tags"] });
          }}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Cancelar Venta
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de cancelar la venta <strong>{quoteToCancel?.folio}</strong>?
              <br />
              <br />
              Esta acción devolverá el stock de los productos al inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={isCancelling}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isCancelling ? "Cancelando..." : "Sí, cancelar venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Eliminar Cotización
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Está seguro de eliminar la cotización <strong>{quoteToDelete?.folio}</strong>?
              <br />
              <br />
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Eliminando..." : "Sí, eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
