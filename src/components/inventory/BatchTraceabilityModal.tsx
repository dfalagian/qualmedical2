import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  FileSearch, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Package,
  Calendar,
  Tag,
  MapPin,
  User,
  History
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface InventoryMovement {
  id: string;
  product_id: string;
  rfid_tag_id: string | null;
  movement_type: string;
  quantity: number;
  previous_stock: number | null;
  new_stock: number | null;
  location: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  reference_type: string | null;
  reference_id: string | null;
  products: {
    name: string;
    sku: string;
  } | null;
  rfid_tags: {
    epc: string;
    batch_id: string | null;
  } | null;
  profiles: {
    full_name: string;
  } | null;
}

interface ProductBatch {
  id: string;
  batch_number: string;
  product_id: string;
  products: {
    name: string;
    sku: string;
  } | null;
}

export function BatchTraceabilityModal() {
  const [open, setOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [searchEpc, setSearchEpc] = useState("");

  // Fetch all batches for filter
  const { data: batches = [] } = useQuery({
    queryKey: ["batches_for_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select(`
          id,
          batch_number,
          product_id,
          products:product_id (name, sku)
        `)
        .order("batch_number", { ascending: false });

      if (error) throw error;
      return data as ProductBatch[];
    },
    enabled: open
  });

  // Fetch products for filter
  const { data: products = [] } = useQuery({
    queryKey: ["products_for_traceability"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch movements with filters
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inventory_movements_trace", selectedBatch, selectedProduct, searchEpc],
    queryFn: async () => {
      let query = supabase
        .from("inventory_movements")
        .select(`
          *,
          products:product_id (name, sku),
          rfid_tags:rfid_tag_id (epc, batch_id),
          profiles:created_by (full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (selectedProduct) {
        query = query.eq("product_id", selectedProduct);
      }

      if (searchEpc) {
        // First get tag id by EPC
        const { data: tagData } = await supabase
          .from("rfid_tags")
          .select("id")
          .ilike("epc", `%${searchEpc}%`);
        
        if (tagData && tagData.length > 0) {
          query = query.in("rfid_tag_id", tagData.map(t => t.id));
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter by batch if selected
      let result = data as InventoryMovement[];
      if (selectedBatch) {
        result = result.filter(m => 
          m.rfid_tags?.batch_id === selectedBatch ||
          m.notes?.includes(selectedBatch)
        );
      }

      return result;
    },
    enabled: open
  });

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "entrada":
        return <ArrowDownCircle className="h-4 w-4 text-green-500" />;
      case "salida":
        return <ArrowUpCircle className="h-4 w-4 text-red-500" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getMovementBadge = (type: string) => {
    switch (type) {
      case "entrada":
        return <Badge className="bg-green-100 text-green-700">Entrada</Badge>;
      case "salida":
        return <Badge className="bg-red-100 text-red-700">Salida</Badge>;
      case "ajuste":
        return <Badge variant="secondary">Ajuste</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  // Stats
  const entradas = movements.filter(m => m.movement_type === "entrada").length;
  const salidas = movements.filter(m => m.movement_type === "salida").length;
  const totalQuantity = movements.reduce((acc, m) => {
    if (m.movement_type === "entrada") return acc + m.quantity;
    if (m.movement_type === "salida") return acc - m.quantity;
    return acc;
  }, 0);

  const clearFilters = () => {
    setSelectedBatch("");
    setSelectedProduct("");
    setSearchEpc("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSearch className="h-4 w-4" />
          Trazabilidad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Control de Trazabilidad de Movimientos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Producto</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los productos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku} - {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Lote</Label>
                  <Select value={selectedBatch} onValueChange={setSelectedBatch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los lotes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batch_number} - {b.products?.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Buscar por EPC</Label>
                  <Input
                    placeholder="EPC del tag..."
                    value={searchEpc}
                    onChange={(e) => setSearchEpc(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button variant="ghost" onClick={clearFilters} className="w-full">
                    Limpiar filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold text-green-600">{entradas}</p>
                    <p className="text-xs text-muted-foreground">Entradas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-600">{salidas}</p>
                    <p className="text-xs text-muted-foreground">Salidas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  <div>
                    <p className={`text-2xl font-bold ${totalQuantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {totalQuantity > 0 ? '+' : ''}{totalQuantity}
                    </p>
                    <p className="text-xs text-muted-foreground">Balance neto</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Movements Table */}
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="ml-2">Cargando movimientos...</span>
              </div>
            ) : movements.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No hay movimientos registrados con los filtros seleccionados
                </CardContent>
              </Card>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Tipo</TableHead>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tag EPC</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell>
                        {getMovementIcon(mov.movement_type)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {format(parseISO(mov.created_at), "dd MMM yyyy", { locale: es })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(mov.created_at), "HH:mm:ss")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{mov.products?.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {mov.products?.sku}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {mov.rfid_tags ? (
                          <div className="flex items-center gap-1">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-xs">
                              {mov.rfid_tags.epc.slice(-8)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {getMovementBadge(mov.movement_type)}
                        <span className="ml-2 font-mono">
                          {mov.movement_type === "entrada" ? "+" : "-"}{mov.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-muted-foreground">{mov.previous_stock ?? '-'}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">{mov.new_stock ?? '-'}</span>
                      </TableCell>
                      <TableCell>
                        {mov.location ? (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{mov.location}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {mov.profiles ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{mov.profiles.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sistema</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>

          {/* Notes */}
          <p className="text-xs text-muted-foreground text-center">
            Mostrando últimos 100 movimientos. Use los filtros para buscar movimientos específicos.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
