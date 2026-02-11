import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
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
  ArrowRightLeft,
  Eye,
  EyeOff,
  Smartphone,
  Unlink,
  Download,
  Pill,
  ScanSearch,
  TrendingDown,
  Boxes,
  CalendarIcon,
  X,
  ScanBarcode
} from "lucide-react";

import { logActivity } from "@/lib/activityLogger";
import { RFIDScannerCard, ScanMode } from "@/components/inventory/RFIDScannerCard";
import { MassRFIDScanner, MassScanMode } from "@/components/inventory/MassRFIDScanner";
import { CITIOImportDialog } from "@/components/inventory/CITIOImportDialog";
import { NFCConfirmationModal, NFCMovementResult } from "@/components/inventory/NFCConfirmationModal";
import { BatchManagement } from "@/components/inventory/BatchManagement";
import { VirginTagAssignment } from "@/components/inventory/VirginTagAssignment";
import { RFIDConsultaDialog } from "@/components/inventory/RFIDConsultaDialog";
import { ProductEntryDialog } from "@/components/inventory/ProductEntryDialog";
import { ProductRowWithBatches } from "@/components/inventory/ProductRowWithBatches";

import { WarehouseTransferDialog } from "@/components/inventory/WarehouseTransferDialog";
import { WarehouseTransferHistory } from "@/components/inventory/WarehouseTransferHistory";
import { WarehouseFilter } from "@/components/inventory/WarehouseFilter";
import { StockByWarehouseModal } from "@/components/dashboard/StockByWarehouseModal";
import { PriceTypesEditor } from "@/components/inventory/PriceTypesEditor";

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
  barcode: string | null;
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
  warehouse_id?: string | null;
  rfid_required?: boolean;
}

interface RfidTag {
  id: string;
  epc: string;
  product_id: string | null;
  batch_id: string | null;
  status: string;
  last_read_at: string | null;
  last_location: string | null;
  notes: string | null;
  created_at: string;
  warehouse_id?: string | null;
  products?: { name: string; sku: string } | null;
  product_batches?: { batch_number: string; barcode: string; expiration_date: string; products: { name: string; sku: string } | null } | null;
  warehouses?: { name: string; code: string } | null;
}

interface ProductBatch {
  id: string;
  product_id: string;
  batch_number: string;
  barcode: string;
  expiration_date: string;
  initial_quantity: number;
  current_quantity: number;
  products?: { name: string; sku: string } | null;
}

export default function Inventory() {
  // Hooks de librerías - siempre primero y en orden fijo
  const { toast } = useToast();
  const { isAdmin, isContador, isInventarioRfid } = useAuth();
  const queryClient = useQueryClient();
  
  // Estados del componente - orden fijo
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [productDialogOpen, setProductDialogOpen] = useState<boolean>(false);
  const [tagDialogOpen, setTagDialogOpen] = useState<boolean>(false);
  const [citioImportDialogOpen, setCitioImportDialogOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingTag, setEditingTag] = useState<RfidTag | null>(null);
  
  const [recentlyReadTagId, setRecentlyReadTagId] = useState<string | null>(null);
  const [nfcConfirmationOpen, setNfcConfirmationOpen] = useState<boolean>(false);
  const [nfcMovementResult, setNfcMovementResult] = useState<NFCMovementResult | null>(null);
  const [consultaDialogOpen, setConsultaDialogOpen] = useState<boolean>(false);
  const [lowStockDialogOpen, setLowStockDialogOpen] = useState<boolean>(false);
  const [massRfidScannerOpen, setMassRfidScannerOpen] = useState<boolean>(false);
  const [virginTagAssignmentOpen, setVirginTagAssignmentOpen] = useState<boolean>(false);
  const [tagSearchTerm, setTagSearchTerm] = useState<string>("");
  const [tagStatusFilter, setTagStatusFilter] = useState<string>("all");
  const [tagDateFilter, setTagDateFilter] = useState<Date | undefined>(undefined);
  const [productEntryDialogOpen, setProductEntryDialogOpen] = useState<boolean>(false);
  
  const [warehouseTransferDialogOpen, setWarehouseTransferDialogOpen] = useState<boolean>(false);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  
  // Refs - después de los estados
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Suscripción a Supabase Realtime para sincronizar parpadeo entre navegadores
  useEffect(() => {
    const channel = supabase.channel('inventory-tag-reads')
      .on('broadcast', { event: 'tag-read' }, (payload) => {
        const { tagId } = payload.payload as { tagId: string };
        console.log('📡 Tag leído en otro navegador:', tagId);
        
        // Activar el efecto de parpadeo por 30 segundos
        setRecentlyReadTagId(tagId);
        setTimeout(() => {
          setRecentlyReadTagId(null);
        }, 30000);
      })
      .subscribe((status) => {
        console.log('📡 Estado del canal realtime:', status);
      });
    
    // Guardar referencia al canal para usarlo en el broadcast
    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, []);

  // Form states
  const [productForm, setProductForm] = useState({
    sku: "",
    name: "",
    description: "",
    category: "",
    unit: "pieza",
    minimum_stock: 0,
    current_stock: 0,
    unit_price: 0,
    price_type_1: 0,
    price_type_2: 0,
    price_type_3: 0,
    price_type_4: 0,
    price_type_5: 0,
    rfid_required: false,
    warehouse_id: ""
  });

  const [tagForm, setTagForm] = useState({
    epc: "",
    product_id: "",
    batch_id: "",
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

  // Fetch RFID tags with batch info and warehouse
  const { data: rfidTags = [], isLoading: loadingTags } = useQuery({
    queryKey: ["rfid_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfid_tags")
        .select(`
          *,
          products:product_id (name, sku),
          product_batches:batch_id (
            batch_number, 
            barcode, 
            expiration_date,
            products:product_id (name, sku)
          ),
          warehouses:warehouse_id (name, code)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as RfidTag[];
    }
  });

  // Fetch batches for tag assignment
  const { data: batches = [] } = useQuery({
    queryKey: ["product_batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_batches")
        .select(`
          *,
          products:product_id (name, sku)
        `)
        .eq("is_active", true)
        .order("expiration_date", { ascending: true });

      if (error) throw error;
      return data as ProductBatch[];
    }
  });

  // Fetch warehouses for product assignment
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    }
  });
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
      // Get default warehouse if none selected
      let warehouseId = product.warehouse_id;
      if (!warehouseId) {
        const { data: warehouses } = await supabase
          .from("warehouses")
          .select("id")
          .or("name.ilike.%principal%,code.eq.PRINCIPAL")
          .limit(1);
        warehouseId = warehouses?.[0]?.id || null;
      }
      
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
            unit_price: product.unit_price || null,
            price_type_1: product.price_type_1 || null,
            price_type_2: product.price_type_2 || null,
            price_type_3: product.price_type_3 || null,
            price_type_4: product.price_type_4 || null,
            price_type_5: product.price_type_5 || null,
            rfid_required: product.rfid_required,
            warehouse_id: warehouseId || null
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
            unit_price: product.unit_price || null,
            price_type_1: product.price_type_1 || null,
            price_type_2: product.price_type_2 || null,
            price_type_3: product.price_type_3 || null,
            price_type_4: product.price_type_4 || null,
            price_type_5: product.price_type_5 || null,
            rfid_required: product.rfid_required,
            warehouse_id: warehouseId || null
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      logActivity({
        section: "inventario",
        action: editingProduct ? "editar" : "crear",
        entityType: "Producto",
        entityId: editingProduct?.id,
        entityName: productForm.name,
        details: editingProduct ? { note: "Producto editado" } : { note: "Producto creado manualmente" },
      });
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

  // Helper function to generate next QUAL sequence number
  const generateNextQualSequence = async (): Promise<string> => {
    // Get the highest QUAL number from existing products
    const { data: existingProducts, error } = await supabase
      .from("products")
      .select("sku")
      .like("sku", "%-QUAL-%")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    let maxNumber = 0;
    if (existingProducts && existingProducts.length > 0) {
      for (const product of existingProducts) {
        const match = product.sku.match(/-QUAL-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }
    
    const nextNumber = maxNumber + 1;
    return `QUAL-${nextNumber.toString().padStart(4, '0')}`;
  };

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
      medication_code?: string;
      medication_families?: { name: string };
    }) => {
      // First check if product already exists by citio_id
      const { data: existingProduct, error: searchError } = await supabase
        .from("products")
        .select("id, name")
        .eq("citio_id", citioMedication.id)
        .maybeSingle();
      
      if (searchError) throw searchError;
      
      if (existingProduct) {
        // Product already exists, return its name
        return { name: existingProduct.name, existed: true };
      }
      
      // Get barcode (medication_code) from CITIO
      const barcode = citioMedication.medication_code || '';
      
      // Generate unique SKU: {barcode}-QUAL-XXXX
      const qualSequence = await generateNextQualSequence();
      const sku = barcode ? `${barcode}-${qualSequence}` : qualSequence;
      
      // Build description including barcode info
      const descParts = [
        citioMedication.brand || '',
        citioMedication.description || '',
        citioMedication.presentacion || ''
      ].filter(Boolean).join(' - ');
      
      // Get default warehouse (Almacén Principal)
      const { data: defaultWarehouse } = await supabase
        .from("warehouses")
        .select("id")
        .or("name.ilike.%principal%,code.eq.PRINCIPAL")
        .limit(1);
      
      const { error } = await supabase
        .from("products")
        .insert({
          sku,
          barcode: barcode || null,
          name: citioMedication.name,
          description: descParts || null,
          category: citioMedication.medication_families?.name || "Medicamentos",
          unit: "pieza",
          minimum_stock: 5,
          current_stock: 0,
          unit_price: citioMedication.price_type_1 || 0,
          citio_id: citioMedication.id,
          warehouse_id: defaultWarehouse?.[0]?.id || null
        });
      
      if (error) throw error;
      return { name: citioMedication.name, existed: false, barcode, sku };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setCitioImportDialogOpen(false);
      if (result.existed) {
        toast({
          title: "Producto ya existe",
          description: `"${result.name}" ya está en el inventario.`
        });
      } else {
        logActivity({
          section: "inventario",
          action: "importar",
          entityType: "Producto",
          entityName: result.name,
          details: { note: "Importado desde CITIO", sku: result.sku, barcode: result.barcode },
        });
        const skuInfo = result.sku ? ` SKU: ${result.sku}` : '';
        const barcodeInfo = result.barcode ? ` | CB: ${result.barcode}` : '';
        toast({
          title: "Producto importado",
          description: `"${result.name}"${skuInfo}${barcodeInfo} fue agregado al inventario desde CITIO.`
        });
      }
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
      const product = products.find(p => p.id === id);

      // Delete child records first to avoid FK constraint violations
      const deletes = [
        supabase.from("purchase_order_items").delete().eq("product_id", id),
        supabase.from("inventory_movements").delete().eq("product_id", id),
        supabase.from("rfid_tags").delete().eq("product_id", id),
        supabase.from("product_batches").delete().eq("product_id", id),
        supabase.from("product_price_history").delete().eq("product_id", id),
        supabase.from("quote_items").delete().eq("product_id", id),
        supabase.from("stock_alerts").delete().eq("product_id", id),
      ];
      const results = await Promise.all(deletes);
      for (const r of results) {
        if (r.error) throw r.error;
      }

      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-list"] });
      queryClient.invalidateQueries({ queryKey: ["product-batches"] });
      logActivity({
        section: "inventario",
        action: "eliminar",
        entityType: "Producto",
        entityId: product?.id,
        entityName: product?.name,
      });
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

      // Si se selecciona un lote, obtener el product_id del lote
      let productIdToUse = tag.product_id || null;
      if (tag.batch_id) {
        const batch = batches.find(b => b.id === tag.batch_id);
        if (batch) {
          productIdToUse = batch.product_id;
        }
      }

      // Always trim EPC to prevent whitespace issues from RFID readers
      const cleanEpc = tag.epc.trim();
      
      if (tag.id) {
        const { error } = await supabase
          .from("rfid_tags")
          .update({
            epc: cleanEpc,
            product_id: productIdToUse,
            batch_id: tag.batch_id || null,
            status: tag.batch_id ? "asignado" : (tag.status || "disponible"),
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
            epc: cleanEpc,
            product_id: productIdToUse,
            batch_id: tag.batch_id || null,
            status: tag.batch_id ? "asignado" : (tag.status || "disponible"),
            last_location: tag.last_location || null,
            notes: tag.notes || null,
            last_read_at: tag.last_location ? new Date().toISOString() : null
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["tags_per_batch"] });
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
      // 1. Obtener el tag para saber si tiene lote asignado
      const { data: tag, error: tagFetchError } = await supabase
        .from("rfid_tags")
        .select("batch_id, epc")
        .eq("id", tagId)
        .single();
      
      if (tagFetchError) throw tagFetchError;

      // 2. Obtener el producto actual para saber el stock
      const { data: product, error: productError } = await supabase
        .from("products")
        .select("current_stock, name, sku")
        .eq("id", productId)
        .single();
      
      if (productError) throw productError;

      const previousStock = product.current_stock || 0;
      const quantity = mode === "entrada" ? 1 : -1;
      const newStock = previousStock + quantity;

      // 3. Si hay lote asignado, actualizar el current_quantity del lote
      let batchNumber: string | null = null;
      if (tag.batch_id) {
        // Obtener el lote
        const { data: batch, error: batchFetchError } = await supabase
          .from("product_batches")
          .select("current_quantity, batch_number")
          .eq("id", tag.batch_id)
          .single();
        
        if (batchFetchError) throw batchFetchError;
        
        batchNumber = batch.batch_number;
        const batchPreviousQty = batch.current_quantity || 0;
        const batchNewQty = Math.max(0, batchPreviousQty + quantity);
        
        // Actualizar el lote
        const { error: batchUpdateError } = await supabase
          .from("product_batches")
          .update({ 
            current_quantity: batchNewQty,
            updated_at: new Date().toISOString()
          })
          .eq("id", tag.batch_id);
        
        if (batchUpdateError) throw batchUpdateError;
        
        console.log(`📦 Lote ${batch.batch_number}: ${batchPreviousQty} → ${batchNewQty}`);
      }

      // 4. Actualizar el stock del producto
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ 
          current_stock: Math.max(0, newStock),
          updated_at: new Date().toISOString()
        })
        .eq("id", productId);
      
      if (productUpdateError) throw productUpdateError;

      // 5. Registrar el movimiento de inventario
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
          notes: `${mode === "entrada" ? "Entrada" : "Salida"} vía NFC${batchNumber ? ` - Lote: ${batchNumber}` : ''}`
        });
      
      if (movementError) throw movementError;

      // 6. Actualizar tag - En SALIDA: desvincular automáticamente para reutilización
      if (mode === "salida") {
        // Desvincular el tag del producto y lote para que esté disponible
        const { error: tagError } = await supabase
          .from("rfid_tags")
          .update({
            product_id: null,
            batch_id: null,
            status: "disponible",
            last_location: "Zona de Salida",
            last_read_at: new Date().toISOString(),
            notes: `Desvinculado automáticamente por salida el ${new Date().toLocaleString()}`
          })
          .eq("id", tagId);
        
        if (tagError) throw tagError;
      } else {
        // En entrada solo actualizar ubicación
        const { error: tagError } = await supabase
          .from("rfid_tags")
          .update({
            last_location: "Almacén Principal",
            last_read_at: new Date().toISOString()
          })
          .eq("id", tagId);
        
        if (tagError) throw tagError;
      }

      return { 
        mode, 
        productName, 
        productSku: product.sku || '',
        newStock: Math.max(0, newStock), 
        previousStock, 
        tagId, 
        epc: tag.epc || '',
        batchNumber
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product_batches"] });
      queryClient.invalidateQueries({ queryKey: ["stock_alerts"] });

      logActivity({
        section: "inventario",
        action: data.mode === "entrada" ? "ingreso" : "salida",
        entityType: "Producto",
        entityName: data.productName,
        details: {
          previous_value: data.previousStock,
          new_value: data.newStock,
          note: `Movimiento NFC - EPC: ${data.epc?.substring(0, 12)}...`,
        },
      });
      
      // Activar el efecto de parpadeo por 30 segundos (local)
      setRecentlyReadTagId(data.tagId);
      setTimeout(() => {
        setRecentlyReadTagId(null);
      }, 30000);
      
      // Broadcast a otros navegadores para sincronizar el parpadeo (usar canal existente)
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'tag-read',
          payload: { tagId: data.tagId }
        }).then(() => {
          console.log('📡 Parpadeo sincronizado a otros navegadores');
        });
      }
      
      // Mostrar modal de confirmación llamativo
      setNfcMovementResult({
        mode: data.mode,
        productName: data.productName,
        productSku: data.productSku,
        previousStock: data.previousStock,
        newStock: data.newStock,
        epc: data.epc,
        timestamp: new Date()
      });
      setNfcConfirmationOpen(true);
      
      // Toast adicional si hay lote
      if (data.batchNumber) {
        toast({
          title: `${data.mode === "entrada" ? "Entrada" : "Salida"} registrada`,
          description: `Lote ${data.batchNumber} actualizado correctamente.`
        });
      }
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

  // Delete all available RFID tags
  const deleteAvailableTagsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("rfid_tags")
        .delete()
        .eq("status", "disponible");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      toast({
        title: "Tags eliminados",
        description: "Todos los tags en estado Disponible fueron eliminados."
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

  // Unlink tag from product (make it available for reuse)
  const unlinkTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from("rfid_tags")
        .update({
          product_id: null,
          status: "disponible",
          last_location: null,
          notes: `Desvinculado el ${new Date().toLocaleString()}`
        })
        .eq("id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
      toast({
        title: "Tag desvinculado",
        description: "El tag está disponible para reutilizar."
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
      unit_price: 0,
      price_type_1: 0,
      price_type_2: 0,
      price_type_3: 0,
      price_type_4: 0,
      price_type_5: 0,
      rfid_required: false,
      warehouse_id: ""
    });
  };

  const resetTagForm = () => {
    setTagForm({
      epc: "",
      product_id: "",
      batch_id: "",
      status: "disponible",
      last_location: "",
      notes: ""
    });
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    // Need to fetch full product data with price types
    supabase
      .from("products")
      .select("*")
      .eq("id", product.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProductForm({
            sku: data.sku,
            name: data.name,
            description: data.description || "",
            category: data.category || "",
            unit: data.unit || "pieza",
            minimum_stock: data.minimum_stock || 0,
            current_stock: data.current_stock || 0,
            unit_price: data.unit_price || 0,
            price_type_1: data.price_type_1 || 0,
            price_type_2: data.price_type_2 || 0,
            price_type_3: data.price_type_3 || 0,
            price_type_4: data.price_type_4 || 0,
            price_type_5: data.price_type_5 || 0,
            rfid_required: data.rfid_required || false,
            warehouse_id: data.warehouse_id || ""
          });
          setProductDialogOpen(true);
        }
      });
  };

  const handleEditTag = (tag: RfidTag) => {
    setEditingTag(tag);
    setTagForm({
      epc: tag.epc,
      product_id: tag.product_id || "",
      batch_id: tag.batch_id || "",
      status: tag.status,
      last_location: tag.last_location || "",
      notes: tag.notes || ""
    });
    setTagDialogOpen(true);
  };

  // Helper: find product IDs that have tags matching the search term (EPC search)
  const productIdsWithMatchingTags = searchTerm
    ? rfidTags
        .filter(t => t.epc.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(t => t.product_id)
        .filter((id): id is string => id !== null)
    : [];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.category?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      productIdsWithMatchingTags.includes(p.id);
    
    // Warehouse filter
    const matchesWarehouse = warehouseFilter === "all" || p.warehouse_id === warehouseFilter;
    
    return matchesSearch && matchesWarehouse;
  });

  // Use local tag search term if available, otherwise use global search
  const effectiveTagSearch = tagSearchTerm || searchTerm;
  const filteredTags = rfidTags.filter(t => {
    // Text search filter
    const matchesSearch = 
      t.epc.toLowerCase().includes(effectiveTagSearch.toLowerCase()) ||
      (t.products?.name?.toLowerCase() || "").includes(effectiveTagSearch.toLowerCase()) ||
      (t.products?.sku?.toLowerCase() || "").includes(effectiveTagSearch.toLowerCase()) ||
      (t.product_batches?.batch_number?.toLowerCase() || "").includes(effectiveTagSearch.toLowerCase()) ||
      (t.product_batches?.products?.name?.toLowerCase() || "").includes(effectiveTagSearch.toLowerCase()) ||
      (t.product_batches?.barcode?.toLowerCase() || "").includes(effectiveTagSearch.toLowerCase());
    
    // Status filter
    const matchesStatus = tagStatusFilter === "all" || t.status === tagStatusFilter;
    
    // Date filter (matches created_at date)
    const matchesDate = !tagDateFilter || (
      t.created_at && 
      new Date(t.created_at).toDateString() === tagDateFilter.toDateString()
    );
    
    // Warehouse filter
    const matchesWarehouse = warehouseFilter === "all" || t.warehouse_id === warehouseFilter;
    
    return matchesSearch && matchesStatus && matchesDate && matchesWarehouse;
  });

  // Stats
  const lowStockProducts = products.filter(p => p.current_stock <= p.minimum_stock);
  const assignedTags = rfidTags.filter(t => t.status === "asignado").length;
  const availableTags = rfidTags.filter(t => t.status === "disponible").length;
  const unreadAlerts = alerts.filter(a => !a.is_read).length;
  
  // Get existing CITIO IDs to mark them as already imported
  const existingCitioIds = products
    .filter(p => p.citio_id)
    .map(p => p.citio_id as string);

  const canEdit = isAdmin || isContador || isInventarioRfid;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventario RFID</h1>
            <p className="text-muted-foreground">Gestión de productos y tags RFID</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WarehouseFilter
              value={warehouseFilter}
              onChange={setWarehouseFilter}
              className="w-[180px]"
            />
            {canEdit && (
              <Button 
                variant="outline" 
                onClick={() => setWarehouseTransferDialogOpen(true)}
                className="gap-2"
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transferir
              </Button>
            )}
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

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-l-4 border-l-warning"
            onClick={() => setLowStockDialogOpen(true)}
          >
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

        {/* Botón Stock por Almacén - Solo para admin */}
        {isAdmin && (
          <div className="flex justify-start">
            <StockByWarehouseModal />
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="batches" className="w-full">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="batches" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Lotes
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Productos
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags RFID
            </TabsTrigger>
            <TabsTrigger value="transfers" className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Transferencias
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

          {/* Batches Tab */}
          <TabsContent value="batches" className="space-y-4">
            {/* Botones de escaneo masivo y asignación */}
            <div className="flex justify-end gap-2">
              <Button 
                onClick={() => setVirginTagAssignmentOpen(true)}
                className="gap-2"
                variant="outline"
              >
                <Tag className="h-4 w-4" />
                Asignar Tags Vírgenes
              </Button>
              <Button 
                onClick={() => setMassRfidScannerOpen(true)}
                className="gap-2"
                variant="outline"
              >
                <Radio className="h-4 w-4" />
                Escaneo Masivo RFID
              </Button>
            </div>
            
            <BatchManagement 
              searchTerm={searchTerm}
              canEdit={canEdit}
              isAdmin={isAdmin}
              products={products}
            />
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
                <h2 className="text-lg font-semibold whitespace-nowrap">Catálogo de Productos</h2>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nombre o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
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
                  <Button onClick={() => setProductEntryDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Producto
                  </Button>
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
                          <ProductRowWithBatches
                            key={product.id}
                            product={product}
                            hasTag={hasTag}
                            canEdit={canEdit}
                            isAdmin={isAdmin}
                            isInventarioRfid={isInventarioRfid}
                            onEdit={handleEditProduct}
                            onDelete={(id) => deleteProductMutation.mutate(id)}
                          />
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
            <div className="flex flex-col gap-4">
              {/* Header with title and action buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex-1 w-full sm:w-auto">
                  <h2 className="text-lg font-semibold">Tags RFID</h2>
                  <p className="text-sm text-muted-foreground">
                    {availableTags} disponibles | {assignedTags} asignados | {filteredTags.length} mostrados
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Botón Eliminar Tags Disponibles */}
                  {isAdmin && availableTags > 0 && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="destructive" className="gap-2">
                          <Trash2 className="h-4 w-4" />
                          Eliminar Tags
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Eliminar Tags Disponibles</DialogTitle>
                          <DialogDescription className="pt-2">
                            Se eliminarán <span className="font-bold text-destructive">{availableTags}</span> tags en estado "Disponible".
                            <br /><br />
                            Esta acción no se puede deshacer.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0">
                          <DialogClose asChild>
                            <Button variant="outline">Cancelar</Button>
                          </DialogClose>
                          <Button 
                            variant="destructive"
                            onClick={() => deleteAvailableTagsMutation.mutate()}
                            disabled={deleteAvailableTagsMutation.isPending}
                          >
                            {deleteAvailableTagsMutation.isPending ? "Eliminando..." : `Eliminar ${availableTags} tags`}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  
                  {/* Botón Consultar Artículo */}
                  <Button 
                    onClick={() => setConsultaDialogOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ScanSearch className="h-4 w-4 mr-2" />
                    Consultar Artículo
                  </Button>
                  
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
                          <Label>Código EPC *</Label>
                          <Input
                            value={tagForm.epc}
                            onChange={(e) => setTagForm({ ...tagForm, epc: e.target.value.toUpperCase() })}
                            placeholder="Pase el tag por el lector RFID o ingrese manualmente..."
                            className="font-mono"
                            autoComplete="off"
                          />
                          <p className="text-xs text-muted-foreground">
                            El lector RFID USB escribirá automáticamente el EPC en este campo
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Lote de Medicamento *</Label>
                          <Select
                            value={tagForm.batch_id || "none"}
                            onValueChange={(value) => {
                              const batch = batches.find(b => b.id === value);
                              setTagForm({ 
                                ...tagForm, 
                                batch_id: value === "none" ? "" : value,
                                product_id: batch?.product_id || ""
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar lote..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin asignar</SelectItem>
                              {batches.map((batch) => (
                                <SelectItem 
                                  key={batch.id} 
                                  value={batch.id}
                                >
                                  <div className="flex flex-col">
                                    <span>{batch.products?.name} - Lote: {batch.batch_number}</span>
                                    <span className="text-xs text-muted-foreground">
                                      Cód: {batch.barcode} | Cad: {new Date(batch.expiration_date).toLocaleDateString()}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Asigna este tag a un lote específico de medicamento
                          </p>
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
              </div>

              {/* Filters Section */}
              <Card className="p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  {/* Search */}
                  <div className="flex-1 w-full sm:max-w-xs">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Buscar</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="EPC, producto o lote..."
                        value={tagSearchTerm}
                        onChange={(e) => setTagSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  
                  {/* Status Filter */}
                  <div className="w-full sm:w-40">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Estado</Label>
                    <Select
                      value={tagStatusFilter}
                      onValueChange={setTagStatusFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="disponible">Disponible</SelectItem>
                        <SelectItem value="asignado">Asignado</SelectItem>
                        <SelectItem value="dañado">Dañado</SelectItem>
                        <SelectItem value="perdido">Perdido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Date Filter */}
                  <div className="w-full sm:w-auto">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Fecha de Registro</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full sm:w-[200px] justify-start text-left font-normal",
                            !tagDateFilter && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {tagDateFilter ? format(tagDateFilter, "PPP", { locale: es }) : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={tagDateFilter}
                          onSelect={setTagDateFilter}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  {/* Clear Filters Button */}
                  {(tagSearchTerm || tagStatusFilter !== "all" || tagDateFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTagSearchTerm("");
                        setTagStatusFilter("all");
                        setTagDateFilter(undefined);
                      }}
                      className="gap-1"
                    >
                      <X className="h-4 w-4" />
                      Limpiar
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>EPC</TableHead>
                      <TableHead>Lote / Producto</TableHead>
                      <TableHead>Código Barras</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Última lectura</TableHead>
                      {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTags ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Cargando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredTags.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No hay tags RFID registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTags.map((tag) => (
                        <TableRow 
                          key={tag.id}
                          className={recentlyReadTagId === tag.id ? "animate-tag-blink" : ""}
                        >
                          <TableCell className="font-mono text-sm">{tag.epc}</TableCell>
                          <TableCell>
                            {tag.product_batches ? (
                              <div className="flex flex-col">
                                <span className="font-medium">{tag.product_batches.products?.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  Lote: {tag.product_batches.batch_number}
                                </span>
                              </div>
                            ) : tag.products ? (
                              <span>{tag.products.sku} - {tag.products.name}</span>
                            ) : (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {tag.product_batches?.barcode || "-"}
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
                                {/* Botón Desvincular - solo si tiene producto asignado */}
                                {tag.product_id && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => unlinkTagMutation.mutate(tag.id)}
                                    disabled={unlinkTagMutation.isPending}
                                    title="Desvincular tag del producto"
                                  >
                                    <Unlink className="h-4 w-4 text-orange-500" />
                                  </Button>
                                )}
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

            {/* RFID USB Scanner Section */}
            <RFIDScannerCard 
              onTagRead={(epc, records, mode) => {
                // Buscar si el tag ya existe en el sistema (comparar EPC exacto)
                const cleanEpc = epc.replace(/:/g, '').toUpperCase();
                const existingTag = rfidTags.find(t => 
                  t.epc.toUpperCase() === cleanEpc
                );
                
                if (existingTag) {
                  // Tag encontrado - procesar movimiento
                  if (existingTag.product_id && existingTag.products) {
                    // Si es una ENTRADA y el tag ya tiene lote asignado, mostrar advertencia
                    if (mode === "entrada" && existingTag.batch_id && existingTag.product_batches) {
                      // Mostrar advertencia pero permitir continuar
                      toast({
                        title: "⚠️ Advertencia: Tag ya vinculado",
                        description: `Esta entrada incrementará el stock del Lote "${existingTag.product_batches.batch_number}" para el producto "${existingTag.product_batches.products?.name || existingTag.products.name}".`,
                        variant: "default",
                        duration: 5000
                      });
                    }
                    
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
                    epc: cleanEpc,
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
                      {alerts.map((alert) => {
                        const isUnauthorizedExit = alert.alert_type === 'unauthorized_exit';
                        
                        return (
                          <div 
                            key={alert.id} 
                            className={`p-4 hover:bg-muted/50 transition-colors ${
                              isUnauthorizedExit 
                                ? 'bg-red-100 dark:bg-red-950/50 border-l-4 border-l-red-500 animate-pulse' 
                                : !alert.is_read 
                                  ? 'bg-primary/5' 
                                  : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-full ${
                                isUnauthorizedExit ? 'bg-red-500 text-white' :
                                alert.severity === 'critical' ? 'bg-destructive/10 text-destructive' :
                                alert.severity === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                                'bg-blue-500/10 text-blue-500'
                              }`}>
                                {isUnauthorizedExit ? (
                                  <AlertTriangle className="h-5 w-5" />
                                ) : alert.alert_type === 'movement' ? (
                                  <ArrowRight className="h-4 w-4" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`font-medium ${isUnauthorizedExit ? 'text-red-600 dark:text-red-400 text-lg' : ''}`}>
                                    {alert.message}
                                  </span>
                                  {!alert.is_read && (
                                    <Badge variant="secondary" className="text-xs">Nuevo</Badge>
                                  )}
                                  {isUnauthorizedExit && (
                                    <Badge variant="destructive" className="text-xs animate-bounce">
                                      🚨 CRÍTICO
                                    </Badge>
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
                                {isUnauthorizedExit && alert.rfid_tags && (
                                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                                    <p className="font-mono text-xs text-red-700 dark:text-red-300">
                                      EPC: {alert.rfid_tags.epc}
                                    </p>
                                    {alert.products && (
                                      <p className="text-red-600 dark:text-red-400">
                                        Producto: {alert.products.name} ({alert.products.sku})
                                      </p>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                                  <span>{new Date(alert.created_at).toLocaleString()}</span>
                                  <Badge 
                                    variant={isUnauthorizedExit ? "destructive" : "outline"} 
                                    className="text-xs"
                                  >
                                    {isUnauthorizedExit ? "SALIDA NO AUTORIZADA" : alert.alert_type}
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
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transfers Tab */}
          <TabsContent value="transfers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-primary" />
                  Historial de Transferencias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WarehouseTransferHistory />
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

        {/* NFC Confirmation Modal */}
        <NFCConfirmationModal
          open={nfcConfirmationOpen}
          onClose={() => setNfcConfirmationOpen(false)}
          result={nfcMovementResult}
        />

        {/* Low Stock Dialog */}
        <Dialog open={lowStockDialogOpen} onOpenChange={setLowStockDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-warning" />
                Productos con Stock Bajo
              </DialogTitle>
              <DialogDescription>
                {lowStockProducts.length} productos requieren reabastecimiento
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-destructive">
                  {lowStockProducts.filter(p => p.current_stock === 0).length}
                </p>
                <p className="text-xs text-muted-foreground">Sin stock</p>
              </div>
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-center">
                <p className="text-2xl font-bold text-warning">
                  {lowStockProducts.filter(p => p.current_stock > 0).length}
                </p>
                <p className="text-xs text-muted-foreground">Stock bajo</p>
              </div>
            </div>

            <ScrollArea className="max-h-[50vh] pr-2">
              <div className="space-y-2">
                {lowStockProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingDown className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No hay productos con stock bajo</p>
                  </div>
                ) : (
                  lowStockProducts.map((product) => {
                    const current = product.current_stock ?? 0;
                    const minimum = product.minimum_stock ?? 0;
                    const percentage = minimum === 0 ? 100 : Math.min(100, Math.max(0, (current / minimum) * 100));
                    const colorClass = current === 0 ? "bg-destructive" : percentage <= 50 ? "bg-warning" : "bg-success";
                    
                    return (
                      <div
                        key={product.id}
                        className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>
                          </div>
                          <Badge 
                            variant={current === 0 ? "destructive" : "secondary"}
                            className="shrink-0"
                          >
                            {current === 0 ? "Agotado" : "Bajo"}
                          </Badge>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>Stock actual: <strong>{current}</strong> {product.unit || "uds"}</span>
                            <span className="text-muted-foreground">Mín: {minimum}</span>
                          </div>
                          <Progress 
                            value={percentage} 
                            className="h-2"
                            indicatorClassName={colorClass}
                          />
                        </div>

                        {product.category && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Categoría: {product.category}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Mass RFID Scanner */}
        <MassRFIDScanner
          open={massRfidScannerOpen}
          onOpenChange={setMassRfidScannerOpen}
          onComplete={(scannedTags, mode) => {
            console.log(`✅ Escaneo masivo completado: ${scannedTags.length} tags en modo ${mode}`);
            
            // Mostrar resumen
            const found = scannedTags.filter(t => t.status === "found").length;
            const notFound = scannedTags.filter(t => t.status === "not_found").length;
            const noProduct = scannedTags.filter(t => t.status === "no_product").length;
            
            toast({
              title: `Escaneo masivo completado`,
              description: `${scannedTags.length} tags escaneados: ${found} encontrados, ${notFound} no registrados, ${noProduct} sin producto.`
            });
            
            // Modo REGISTRO: refrescar queries y mostrar botón de asignación
            if (mode === "registro") {
              const registeredCount = scannedTags.filter(t => t.status === "registered").length;
              queryClient.invalidateQueries({ queryKey: ["rfid_tags"] });
              toast({
                title: "Tags vírgenes registrados",
                description: `${registeredCount} tags guardados. Use 'Asignar Tags Vírgenes' para vincularlos.`
              });
              setMassRfidScannerOpen(false);
              return;
            }
            
            // Para entrada/salida masiva, procesar cada tag
            if (mode === "entrada" || mode === "salida") {
              const validTags = scannedTags.filter(t => t.status === "found" && t.tagId && t.productId);
              
              if (validTags.length > 0) {
                toast({
                  title: `Procesando ${mode === "entrada" ? "entradas" : "salidas"}`,
                  description: `${validTags.length} tags válidos serán procesados.`
                });
                
                validTags.forEach((tag, index) => {
                  setTimeout(() => {
                    if (tag.tagId && tag.productId) {
                      processInventoryMovement.mutate({
                        tagId: tag.tagId,
                        productId: tag.productId,
                        mode: mode as ScanMode,
                        productName: tag.productName || "Producto"
                      });
                    }
                  }, index * 500);
                });
              }
            }
            
            setMassRfidScannerOpen(false);
          }}
        />

        {/* Modal de asignación de tags vírgenes */}
        <VirginTagAssignment
          open={virginTagAssignmentOpen}
          onOpenChange={setVirginTagAssignmentOpen}
        />

        {/* Modal de consulta RFID */}
        <RFIDConsultaDialog
          open={consultaDialogOpen}
          onOpenChange={setConsultaDialogOpen}
        />

        {/* Modal de ingreso de productos */}
        <ProductEntryDialog
          open={productEntryDialogOpen}
          onOpenChange={setProductEntryDialogOpen}
        />

        {/* Modal de edición de productos */}
        <Dialog open={productDialogOpen} onOpenChange={(open) => {
          setProductDialogOpen(open);
          if (!open) {
            setEditingProduct(null);
            resetProductForm();
          }
        }}>
          <DialogContent className="w-[96vw] sm:max-w-5xl h-[92vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0 pb-2">
              <DialogTitle>
                {editingProduct ? "Editar Producto" : "Nuevo Producto"}
              </DialogTitle>
              <DialogDescription>
                {editingProduct
                  ? "Modifica los datos del producto seleccionado."
                  : "Completa los datos para crear un nuevo producto."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0">
              <div className="grid gap-4 py-2 h-full">
                <div className="grid grid-cols-1 lg:grid-cols-[1.25fr,1fr] gap-4">
                  {/* Datos generales */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="sku" className="text-xs">SKU</Label>
                        <Input
                          id="sku"
                          value={productForm.sku}
                          onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                          className="h-9"
                          disabled={!!editingProduct}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="name" className="text-xs">Nombre</Label>
                        <Input
                          id="name"
                          value={productForm.name}
                          onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="description" className="text-xs">Descripción</Label>
                      <Textarea
                        id="description"
                        value={productForm.description}
                        onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                        className="min-h-[64px] resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="category" className="text-xs">Categoría</Label>
                        <Input
                          id="category"
                          value={productForm.category}
                          onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                          className="h-9"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Unidad</Label>
                        <Select
                          value={productForm.unit}
                          onValueChange={(value) => setProductForm({ ...productForm, unit: value })}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pieza">Pieza</SelectItem>
                            <SelectItem value="caja">Caja</SelectItem>
                            <SelectItem value="frasco">Frasco</SelectItem>
                            <SelectItem value="ampolleta">Ampolleta</SelectItem>
                            <SelectItem value="sobre">Sobre</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Almacén</Label>
                        <Select
                          value={productForm.warehouse_id || "none"}
                          onValueChange={(value) =>
                            setProductForm({
                              ...productForm,
                              warehouse_id: value === "none" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Seleccionar almacén..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* RFID */}
                      <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg border">
                        <Checkbox
                          id="rfid_required"
                          checked={productForm.rfid_required}
                          onCheckedChange={(checked) =>
                            setProductForm({ ...productForm, rfid_required: checked === true })
                          }
                          className="mt-0.5"
                        />
                        <div className="grid gap-1 leading-none">
                          <Label
                            htmlFor="rfid_required"
                            className="text-xs font-medium cursor-pointer"
                          >
                            Solo movimientos con lector RFID
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Desactiva ajustes manuales (+/-) y obliga escaneo de etiquetas RFID.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stock y precios */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="minimum_stock" className="text-xs text-muted-foreground">Stock Mínimo</Label>
                        <Input
                          id="minimum_stock"
                          type="number"
                          value={productForm.minimum_stock}
                          disabled
                          className="h-9 bg-muted/50 cursor-not-allowed"
                          title="El stock mínimo se gestiona desde órdenes de compra"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="current_stock" className="text-xs text-muted-foreground">Stock Actual</Label>
                        <Input
                          id="current_stock"
                          type="number"
                          value={productForm.current_stock}
                          disabled
                          className="h-9 bg-muted/50 cursor-not-allowed"
                          title="El stock se modifica mediante ingresos y salidas"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="unit_price" className="text-xs">Precio Base</Label>
                        <Input
                          id="unit_price"
                          type="number"
                          step="0.01"
                          value={productForm.unit_price}
                          onChange={(e) =>
                            setProductForm({
                              ...productForm,
                              unit_price: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-9"
                        />
                      </div>
                    </div>

                    {/* 5 Tipos de Precio con ajuste por % (visible sin scroll) */}
                    <PriceTypesEditor
                      priceType1={productForm.price_type_1}
                      priceType2={productForm.price_type_2}
                      priceType3={productForm.price_type_3}
                      priceType4={productForm.price_type_4}
                      priceType5={productForm.price_type_5}
                      onChange={(prices) =>
                        setProductForm({
                          ...productForm,
                          ...prices,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-shrink-0 pt-3 border-t mt-2">
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


        {/* Warehouse Transfer Dialog */}
        <WarehouseTransferDialog
          open={warehouseTransferDialogOpen}
          onOpenChange={setWarehouseTransferDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
}