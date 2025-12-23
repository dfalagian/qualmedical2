import { useState } from "react";
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
  CheckCircle
} from "lucide-react";

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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingTag, setEditingTag] = useState<RfidTag | null>(null);

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

  // Create/Update RFID tag
  const tagMutation = useMutation({
    mutationFn: async (tag: typeof tagForm & { id?: string }) => {
      if (tag.id) {
        const { error } = await supabase
          .from("rfid_tags")
          .update({
            epc: tag.epc,
            product_id: tag.product_id || null,
            status: tag.status,
            notes: tag.notes || null
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
            notes: tag.notes || null
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
        title: "Error",
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
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Productos
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags RFID
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Catálogo de Productos</h2>
              {canEdit && (
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
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                        <TableCell colSpan={6} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Cargando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hay productos registrados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow key={product.id}>
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
                      ))
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
                        <Label>Código EPC *</Label>
                        <Input
                          value={tagForm.epc}
                          onChange={(e) => setTagForm({ ...tagForm, epc: e.target.value })}
                          placeholder="E2003412..."
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          Código único del tag RFID (normalmente 24 caracteres hex)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Producto asociado</Label>
                        <Select
                          value={tagForm.product_id}
                          onValueChange={(value) => setTagForm({ ...tagForm, product_id: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar producto..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sin asignar</SelectItem>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.sku} - {product.name}
                              </SelectItem>
                            ))}
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
                      <TableHead>Estado</TableHead>
                      <TableHead>Última lectura</TableHead>
                      {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingTags ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            Cargando...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredTags.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}