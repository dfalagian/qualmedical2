import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Package, 
  Tag, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowUpDown,
  Radio,
  AlertTriangle,
  CheckCircle,
  Bell,
  MapPin,
  ArrowRight,
  Eye,
  EyeOff,
  Smartphone,
  Wifi,
  WifiOff,
  Download,
  Pill
} from "lucide-react";
import { useWebNFC } from "@/hooks/useWebNFC";
import { NFCScannerCard, ScanMode } from "@/components/inventory/NFCScannerCard";
import { CITIOImportDialog } from "@/components/inventory/CITIOImportDialog";

// Ubicaciones de las antenas RFID
const ANTENNA_LOCATIONS = [
  { id: "antena-1", name: "Antena 1 - Almacén Principal", color: "bg-blue-500" },
  { id: "antena-2", name: "Antena 2 - Zona de Salida", color: "bg-green-500" }
];

interface StockAlert {
  id: string;
  product_id: string | null;
  rfid_tag_id: string | null;
  alert_type: string;
  previous_location: string | null;
  new_location: string | null;
  message: string;
  severity: string;
  is_read: boolean;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  rfid_tags?: { epc: string; products?: { name: string; sku: string } | null } | null;
  products?: { name: string; sku: string } | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  minimum_stock: number;
  current_stock: number;
  unit_price: number | null;
  supplier_id: string | null;
  is_active: boolean;
  created_at: string;
  citio_id?: string | null;
}

interface RfidTag {
  id: string;
  epc: string;
  product_id: string | null;
  status: string;
  last_read_at: string | null;
  last_location: string | null;
  notes: string | null;
  created_at: string;
  products?: { name: string; sku: string } | null;
}

export default function Inventory() {
  const { toast } = useToast();
  const { isAdmin, isContador } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [citioImportDialogOpen, setCitioImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingTag, setEditingTag] = useState<RfidTag | null>(null);
  const [tagScanActive, setTagScanActive] = useState(false);
  
  // Hook NFC para escanear tags al registrar
  const tagNfc = useWebNFC();

  // Form states
  const [productForm, setProductForm] = useState({
    sku: "",
    name: "",
    description: "",
    category: "",
    unit: "pieza",
    minimum_stock: 0,
    current_stock: 0,
    unit_price: 0
  });

  const [tagForm, setTagForm] = useState({
    epc: "",
    product_id: "",
    status: "disponible",
    last_location: "",
    notes: ""
  });

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Product[];
    }
  });

  // Fetch RFID tags
  const { data: rfidTags = [], isLoading: loadingTags } = useQuery({
    queryKey: ["rfid_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select(`
          *,
          products:product_id (name, sku)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as RfidTag[];
    }
  });

  // Fetch stock alerts
  const { data: alerts = [], isLoading: loadingAlerts, refetch: refetchAlerts } = useQuery({
    queryKey: ["stock_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_alerts")
        .select(`
          *,
          rfid_tags:rfid_tag_id (
            epc,
            products:product_id (name, sku)
          ),
          products:product_id (name, sku)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as StockAlert[];
    }
  });

  // Efecto para capturar EPC cuando se escanea un tag en el formulario
  useEffect(() => {
    if (tagScanActive && tagNfc.lastRead?.serialNumber) {
      const epc = tagNfc.lastRead.serialNumber.replace(/:/g, '').toUpperCase();
      setTagForm(prev => ({ ...prev, epc }));
      setTagScanActive(false);
      tagNfc.stopScan();
      toast({
        title: "Tag NFC leído",
        description: `Código EPC: ${epc}`,
      });
    }
  }, [tagNfc.lastRead, tagScanActive, tagNfc, toast]);

  // Realtime subscription for alerts
  useEffect(() => {
    const channel = supabase
      .channel('stock-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stock_alerts'
        },
        (payload) => {
          console.log('Nueva alerta:', payload);
          refetchAlerts();
          toast({
            title: "Nueva alerta de movimiento",
            description: (payload.new as StockAlert).message,
            variant: payload.new.severity === 'critical' ? 'destructive' : 'default'
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchAlerts, toast]);

  // Create/Update product
  const productMutation = useMutation({
    mutationFn: async (product: typeof productForm & { id?: string }) => {
      if (product.id) {
        const { error } = await supabase
          .from("products")
          .update({
            sku: product.sku,
            name: product.name,
            description: product.description || null,
            category: product.category || null,
            unit: product.unit,
            minimum_stock: product.minimum_stock,
            current_stock: product.current_stock,
            unit_price: product.unit_price || null
          })
          .eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({
            sku: product.sku,
            name: product.name,
            description: product.description || null,
            category: product.category || null,
            unit: product.unit,
            minimum_stock: product.minimum_stock,
            current_stock: product.current_stock,
            unit_price: product.unit_price || null
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setProductDialogOpen(false);
      setEditingProduct(null);
      resetProductForm();
      toast({
        title: editingProduct ? "Producto actualizado" : "Producto creado",
        description: "Los cambios se guardaron correctamente."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Import from CITIO mutation
  const importFromCitioMutation = useMutation({
    mutationFn: async (citioMedication: {
      id: string;
      name: string;
      brand: string;
      description?: string;
      presentacion?: string;
      price_type_1?: number;
      codigo_sat?: string;
      medication_families?: { name: string };
    }) => {
      // Generate SKU from CITIO ID
      const sku = `CITIO-${citioMedication.id.slice(0, 8).toUpperCase()}`;
      
      const { error } = await supabase
        .from("products")
        .insert({
          sku,
          name: citioMedication.name,
          description: `${citioMedication.brand || ''} - ${citioMedication.description || ''} ${citioMedication.presentacion || ''}`.trim(),
          category: citioMedication.medication_families?.name || "Medicamentos",
          unit: "pieza",
          minimum_stock: 5,
          current_stock: 0,
          unit_price: citioMedication.price_type_1 || 0,
          citio_id: citioMedication.id,
        });
      
      if (error) throw error;
      return citioMedication.name;
    },
    onSuccess: (productName) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCitioImportDialogOpen(false);
      toast({
        title: "Producto importado",
        description: `"${productName}" fue agregado al inventario desde CITIO.`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al importar",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete product
  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({
        title: "Producto eliminado",
        description: "El producto fue eliminado correctamente."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Validar duplicados de tags
  const validateTagDuplicates = (epc: string, productId: string | null, editingTagId?: string): { valid: boolean; error?: string } => {
    // Validar EPC duplicado (excepto si es el mismo tag que estamos editando)
    const existingEpc = rfidTags?.find(tag => 
      tag.epc.toLowerCase() === epc.toLowerCase() && tag.id !== editingTagId
    );
    if (existingEpc) {
      const productName = products.find(p => p.id === existingEpc.product_id)?.name || 'Sin asignar';
      return { 
        valid: false, 
        error: `Este EPC ya está registrado y asignado a: ${productName}` 
      };
    }

    // Validar producto ya con tag asignado (excepto si es el mismo tag que estamos editando)
    if (productId) {
      const productHasTag = rfidTags?.find(tag => 
        tag.product_id === productId && tag.id !== editingTagId
      );
      if (productHasTag) {
        const productName = products.find(p => p.id === productId)?.name;
        return { 
          valid: false, 
          error: `El producto "${productName}" ya tiene un tag asignado (EPC: ${productHasTag.epc.substring(0, 12)}...)` 
        };
      }
    }

    return { valid: true };
  };

  // Create/Update RFID tag
  const tagMutation = useMutation({
    mutationFn: async (tag: typeof tagForm & { id?: string }) => {
      // Validar duplicados antes de guardar
      const validation = validateTagDuplicates(tag.epc, tag.product_id || null, tag.id);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      if (tag.id) {
        const { error } = await supabase
          .from("rfid_tags")
          .update({
            epc: tag.epc,
            product_id: tag.product_id || null,
            status: tag.status,
            last_location: tag.last_location || null,
            notes: tag.notes || null,
            last_read_at: tag.last_location ? new Date().toISOString() : undefined
          })
          .eq("id", tag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rfid_tags")
          .insert({
            epc: tag.epc,
            product_id: tag.product_id || null,
            status: tag.status,
            last_location: tag.last_location || null,
            notes: tag.notes || null,
            last_read_at: tag.last_location ? new Date().toISOString() : null
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      setTagDialogOpen(false);
      setEditingTag(null);
      resetTagForm();
      toast({
        title: editingTag ? "Tag actualizado" : "Tag registrado",
        description: "Los cambios se guardaron correctamente."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error de validación",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Mark alert as read
  const markAlertReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      const { error } = await supabase
        .from("stock_alerts")
        .update({ is_read: isRead })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock_alerts"] });
    }
  });

  // Simulate tag reading from antenna (for testing)
  const simulateTagRead = useMutation({
    mutationFn: async ({ tagId, location }: { tagId: string; location: string }) => {
      const { error } = await supabase
        .from("rfid_tags")
        .update({
          last_location: location,
          last_read_at: new Date().toISOString()
        })
        .eq("id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      toast({
        title: "Tag leído",
        description: "La ubicación del tag fue actualizada."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Procesar movimiento de inventario (Entrada/Salida)
  const processInventoryMovement = useMutation({
    mutationFn: async ({ 
      tagId, 
      productId, 
      mode, 
      productName 
    }: { 
      tagId: string; 
      productId: string; 
      mode: ScanMode; 
      productName: string;
    }) => {
      // 1. Obtener el producto actual para saber el stock
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("current_stock, name")
        .eq("id", productId)
        .single();
      
      if (productError) throw productError;

      const previousStock = product.current_stock || 0;
      const quantity = mode === "entrada" ? 1 : -1;
      const newStock = previousStock + quantity;

      // NOTA: El stock se actualiza automáticamente vía trigger en inventory_movements
      // NO actualizar manualmente aquí para evitar doble conteo

      // 3. Registrar el movimiento de inventario
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          product_id: productId,
          rfid_tag_id: tagId,
          movement_type: mode === "entrada" ? "entrada" : "salida",
          quantity: Math.abs(quantity),
          previous_stock: previousStock,
          new_stock: Math.max(0, newStock),
          location: mode === "entrada" ? "Almacén Principal" : "Zona de Salida",
          notes: `${mode === "entrada" ? "Entrada" : "Salida"} vía NFC`
        });
      
      if (movementError) throw movementError;

      // 4. Actualizar última lectura del tag
      const { error: tagError } = await supabase
        .from("rfid_tags")
        .update({
          last_location: mode === "entrada" ? "Almacén Principal" : "Zona de Salida",
          last_read_at: new Date().toISOString()
        })
        .eq("id", tagId);
      
      if (tagError) throw tagError;

      return { mode, productName, newStock, previousStock };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_alerts"] });
      
      const isEntry = data.mode === "entrada";
      toast({
        title: isEntry ? "✅ Entrada registrada" : "📤 Salida registrada",
        description: `${data.productName}: Stock ${data.previousStock} → ${data.newStock}`,
        variant: isEntry ? "default" : "default"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al procesar movimiento",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete RFID tag
  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rfid_tags")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      toast({
        title: "Tag eliminado",
        description: "El tag fue eliminado correctamente."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const resetProductForm = () => {
    setProductForm({
      sku: "",
      name: "",
      description: "",
      category: "",
      unit: "pieza",
      minimum_stock: 0,
      current_stock: 0,
      unit_price: 0
    });
  };

  const resetTagForm = () => {
    setTagForm({
      epc: "",
      product_id: "",
      status: "disponible",
      last_location: "",
      notes: ""
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      sku: product.sku,
      name: product.name,
      description: product.description || "",
      category: product.category || "",
      unit: product.unit,
      minimum_stock: product.minimum_stock,
      current_stock: product.current_stock,
      unit_price: product.unit_price || 0
    });
    setProductDialogOpen(true);
  };

  const handleEditTag = (tag: RfidTag) => {
    setEditingTag(tag);
    setTagForm({
      epc: tag.epc,
      product_id: tag.product_id || "",
      status: tag.status,
      last_location: tag.last_location || "",
      notes: tag.notes || ""
    });
    setTagDialogOpen(true);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.category?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  const filteredTags = rfidTags.filter(t =>
    t.epc.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.products?.name?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  // Stats
  const lowStockProducts = products.filter(p => p.current_stock <= p.minimum_stock);
  const assignedTags = rfidTags.filter(t => t.status === "asignado").length;
  const availableTags = rfidTags.filter(t => t.status === "disponible").length;
  const unreadAlerts = alerts.filter(a => !a.is_read).length;
  
  // Get existing CITIO IDs to mark them as already imported
  const existingCitioIds = products
    .filter(p => p.citio_id)
    .map(p => p.citio_id as string);

  const canEdit = isAdmin || isContador;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventario RFID</h1>
            <p className="text-muted-foreground">Gestión de productos y tags RFID</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{products.length}</p>
                  <p className="text-sm text-muted-foreground">Productos</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{lowStockProducts.length}</p>
                  <p className="text-sm text-muted-foreground">Stock bajo</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Radio className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{rfidTags.length}</p>
                  <p className="text-sm text-muted-foreground">Tags RFID</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{assignedTags}</p>
                  <p className="text-sm text-muted-foreground">Tags asignados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Productos
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags RFID
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center gap-2 relative">
              <Bell className="h-4 w-4" />
              Alertas
              {unreadAlerts > 0 && (
                <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
                  {unreadAlerts}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-lg font-semibold">Catálogo de Productos</h2>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setCitioImportDialogOpen(true)}
                    className="gap-2"
                  >
                    <Pill className="h-4 w-4" />
                    Importar desde CITIO
                  </Button>
                  <Dialog open={productDialogOpen} onOpenChange={(open) => {
                    setProductDialogOpen(open);
                    if (!open) {
                      setEditingProduct(null);
                      resetProductForm();
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo Producto
                      </Button>
                    </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {editingProduct ? "Editar Producto" : "Nuevo Producto"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>SKU *</Label>
                          <Input
                            value={productForm.sku}
                            onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                            placeholder="SKU-001"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Categoría</Label>
                          <Input
                            value={productForm.category}
                            onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                            placeholder="Medicamentos"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Nombre *</Label>
                        <Input
                          value={productForm.name}
                          onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          placeholder="Nombre del producto"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Descripción</Label>
                        <Textarea
                          value={productForm.description}
                          onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                          placeholder="Descripción del producto..."
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Unidad</Label>
                          <Select
                            value={productForm.unit}
                            onValueChange={(value) => setProductForm({ ...productForm, unit: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pieza">Pieza</SelectItem>
                              <SelectItem value="caja">Caja</SelectItem>
                              <SelectItem value="paquete">Paquete</SelectItem>
                              <SelectItem value="kg">Kilogramo</SelectItem>
                              <SelectItem value="litro">Litro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Precio unitario</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={productForm.unit_price}
                            onChange={(e) => setProductForm({ ...productForm, unit_price: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Stock actual</Label>
                          <Input
                            type="number"
                            value={productForm.current_stock}
                            onChange={(e) => setProductForm({ ...productForm, current_stock: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Stock mínimo</Label>
                          <Input
                            type="number"
                            value={productForm.minimum_stock}
                            onChange={(e) => setProductForm({ ...productForm, minimum_stock: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                      </DialogClose>
                      <Button 
                        onClick={() => productMutation.mutate({ 
                          ...productForm, 
                          id: editingProduct?.id 
                        })}
                        disabled={!productForm.sku || !productForm.name || productMutation.isPending}
                      >
                        {productMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                </div>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Tag</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingProducts ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Cargando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No hay productos registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => {
                        const hasTag = rfidTags?.some(tag => tag.product_id === product.id);
                        return (
                        <TableRow key={product.id} className={hasTag ? "bg-green-50 dark:bg-green-950/20" : ""}>
                          <TableCell>
                            {hasTag ? (
                              <div className="flex items-center justify-center">
                                <Tag className="h-4 w-4 text-green-600" />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center">
                                <span className="text-muted-foreground text-xs">—</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>
                            {product.category && (
                              <Badge variant="secondary">{product.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={product.current_stock <= product.minimum_stock ? "destructive" : "default"}
                            >
                              {product.current_stock} / {product.minimum_stock}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {product.unit_price ? `$${product.unit_price.toFixed(2)}` : "-"}
                          </TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleEditProduct(product)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => deleteProductMutation.mutate(product.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tags Tab */}
          <TabsContent value="tags" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Tags RFID</h2>
              {canEdit && (
                <Dialog open={tagDialogOpen} onOpenChange={(open) => {
                  setTagDialogOpen(open);
                  if (!open) {
                    setEditingTag(null);
                    resetTagForm();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Nuevo Tag
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        {editingTag ? "Editar Tag RFID" : "Registrar Tag RFID"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Código EPC/NFC *</Label>
                        <div className="flex gap-2">
                          <Input
                            value={tagForm.epc}
                            onChange={(e) => setTagForm({ ...tagForm, epc: e.target.value })}
                            placeholder="Escanea o ingresa código..."
                            className="font-mono flex-1"
                          />
                          <Button
                            type="button"
                            variant={tagScanActive ? "destructive" : "outline"}
                            size="icon"
                            onClick={async () => {
                              if (tagScanActive) {
                                tagNfc.stopScan();
                                setTagScanActive(false);
                              } else {
                                setTagScanActive(true);
                                await tagNfc.startScan();
                              }
                            }}
                            disabled={!tagNfc.isSupported}
                            title={tagNfc.isSupported ? (tagScanActive ? "Detener escaneo" : "Escanear tag NFC") : "NFC no disponible"}
                          >
                            {tagScanActive ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                          </Button>
                        </div>
                        {tagScanActive && (
                          <p className="text-xs text-blue-600 animate-pulse flex items-center gap-1">
                            <Radio className="h-3 w-3" /> Acerca el tag NFC al dispositivo...
                          </p>
                        )}
                        {!tagNfc.isSupported && (
                          <p className="text-xs text-amber-600">
                            NFC no disponible. Ingresa el código manualmente.
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Código único del tag (serial number NFC)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Producto asociado</Label>
                        <Select
                          value={tagForm.product_id || "none"}
                          onValueChange={(value) => setTagForm({ ...tagForm, product_id: value === "none" ? "" : value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar producto..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {products.map((product) => {
                              const hasTag = rfidTags?.some(tag => tag.product_id === product.id);
                              return (
                                <SelectItem 
                                  key={product.id} 
                                  value={product.id}
                                  className={hasTag ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400" : ""}
                                >
                                  {hasTag && "✓ "}{product.sku} - {product.name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select
                          value={tagForm.status}
                          onValueChange={(value) => setTagForm({ ...tagForm, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disponible">Disponible</SelectItem>
                            <SelectItem value="asignado">Asignado</SelectItem>
                            <SelectItem value="dañado">Dañado</SelectItem>
                            <SelectItem value="perdido">Perdido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Ubicación actual</Label>
                        <Select
                          value={tagForm.last_location || "none"}
                          onValueChange={(value) => setTagForm({ ...tagForm, last_location: value === "none" ? "" : value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar ubicación..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin ubicación</SelectItem>
                            {ANTENNA_LOCATIONS.map((loc) => (
                              <SelectItem key={loc.id} value={loc.name}>
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  {loc.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Notas</Label>
                        <Textarea
                          value={tagForm.notes}
                          onChange={(e) => setTagForm({ ...tagForm, notes: e.target.value })}
                          placeholder="Observaciones..."
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancelar</Button>
                      </DialogClose>
                      <Button 
                        onClick={() => tagMutation.mutate({ 
                          ...tagForm, 
                          id: editingTag?.id 
                        })}
                        disabled={!tagForm.epc || tagMutation.isPending}
                      >
                        {tagMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>EPC</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Última lectura</TableHead>
                      {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTags ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Cargando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredTags.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay tags RFID registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTags.map((tag) => (
                        <TableRow key={tag.id}>
                          <TableCell className="font-mono text-sm">{tag.epc}</TableCell>
                          <TableCell>
                            {tag.products ? (
                              <span>{tag.products.sku} - {tag.products.name}</span>
                            ) : (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {tag.last_location ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                <span className="text-sm">{tag.last_location}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              tag.status === "asignado" ? "default" :
                              tag.status === "disponible" ? "secondary" :
                              tag.status === "dañado" ? "destructive" : "outline"
                            }>
                              {tag.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tag.last_read_at 
                              ? new Date(tag.last_read_at).toLocaleString()
                              : "-"
                            }
                          </TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleEditTag(tag)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => deleteTagMutation.mutate(tag.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* WebNFC Scanner Section */}
            <NFCScannerCard 
              onTagRead={(serialNumber, records, mode) => {
                // Buscar si el tag ya existe en el sistema
                const existingTag = rfidTags.find(t => 
                  t.epc.toLowerCase() === serialNumber.toLowerCase() ||
                  t.epc.toLowerCase().includes(serialNumber.toLowerCase().replace(/:/g, ''))
                );
                
                if (existingTag) {
                  // Tag encontrado - procesar movimiento
                  if (existingTag.product_id && existingTag.products) {
                    // Tag tiene producto asignado - procesar entrada/salida
                    processInventoryMovement.mutate({
                      tagId: existingTag.id,
                      productId: existingTag.product_id,
                      mode: mode,
                      productName: existingTag.products.name
                    });
                  } else {
                    // Tag sin producto asignado
                    toast({
                      title: "Tag sin producto",
                      description: "Este tag no tiene un producto asignado. Asígnelo primero.",
                      variant: "destructive"
                    });
                    handleEditTag(existingTag);
                  }
                } else {
                  // Tag nuevo - ofrecer registrarlo
                  setTagForm(prev => ({
                    ...prev,
                    epc: serialNumber.replace(/:/g, '').toUpperCase(),
                    status: "disponible",
                    last_location: mode === "entrada" ? "Almacén Principal" : "Zona de Salida"
                  }));
                  setTagDialogOpen(true);
                  toast({
                    title: "Nuevo tag detectado",
                    description: "Registre el tag y asigne un producto para continuar."
                  });
                }
              }}
            />

            {/* Simulate RFID Reading Section */}
            {canEdit && rfidTags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Radio className="h-5 w-5" />
                    Simular Lectura de Antena (Testing)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Usa esta sección para simular la lectura de tags desde las antenas RFID mientras no tengas el hardware conectado.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {ANTENNA_LOCATIONS.map((antenna) => (
                      <Card key={antenna.id} className="border-dashed">
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2 mb-3">
                            <div className={`h-3 w-3 rounded-full ${antenna.color} animate-pulse`} />
                            <span className="font-medium">{antenna.name}</span>
                          </div>
                          <Select
                            onValueChange={(tagId) => {
                              if (tagId) {
                                simulateTagRead.mutate({ tagId, location: antenna.name });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tag para simular lectura..." />
                            </SelectTrigger>
                            <SelectContent>
                              {rfidTags.map((tag) => (
                                <SelectItem key={tag.id} value={tag.id}>
                                  {tag.epc} {tag.products ? `(${tag.products.name})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Alertas de Movimiento</h2>
              {unreadAlerts > 0 && (
                <Badge variant="destructive">
                  {unreadAlerts} sin leer
                </Badge>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {loadingAlerts ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="ml-2">Cargando alertas...</span>
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No hay alertas registradas</p>
                      <p className="text-sm">Las alertas aparecerán aquí cuando un tag cambie de ubicación</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {alerts.map((alert) => (
                        <div 
                          key={alert.id} 
                          className={`p-4 hover:bg-muted/50 transition-colors ${!alert.is_read ? 'bg-primary/5' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full ${
                              alert.severity === 'critical' ? 'bg-destructive/10 text-destructive' :
                              alert.severity === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                              'bg-blue-500/10 text-blue-500'
                            }`}>
                              {alert.alert_type === 'movement' ? (
                                <ArrowRight className="h-4 w-4" />
                              ) : (
                                <AlertTriangle className="h-4 w-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{alert.message}</span>
                                {!alert.is_read && (
                                  <Badge variant="secondary" className="text-xs">Nuevo</Badge>
                                )}
                              </div>
                              {alert.alert_type === 'movement' && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                  <MapPin className="h-3 w-3" />
                                  <span>{alert.previous_location}</span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span>{alert.new_location}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{new Date(alert.created_at).toLocaleString()}</span>
                                <Badge variant="outline" className="text-xs">
                                  {alert.alert_type}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => markAlertReadMutation.mutate({ 
                                id: alert.id, 
                                isRead: !alert.is_read 
                              })}
                              title={alert.is_read ? "Marcar como no leído" : "Marcar como leído"}
                            >
                              {alert.is_read ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* CITIO Import Dialog */}
        <CITIOImportDialog
          open={citioImportDialogOpen}
          onOpenChange={setCitioImportDialogOpen}
          onImport={(medication) => importFromCitioMutation.mutate(medication)}
          existingCitioIds={existingCitioIds}
        />
      </div>
    </DashboardLayout>
  );
}