import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  Plus, 
  Upload, 
  Building2, 
  Search, 
  Edit, 
  Trash2, 
  Phone, 
  Mail, 
  MapPin,
  FileText,
  Loader2,
  Check,
  X
} from "lucide-react";

interface GeneralSupplier {
  id: string;
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  telefono: string | null;
  email: string | null;
  regimen_fiscal: string | null;
  lugar_expedicion: string | null;
  invoice_image_url: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ExtractedData {
  rfc?: string;
  razon_social?: string;
  nombre_comercial?: string;
  direccion?: string;
  codigo_postal?: string;
  telefono?: string;
  email?: string;
  regimen_fiscal?: string;
  lugar_expedicion?: string;
}

export default function GeneralSuppliers() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<GeneralSupplier | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<ExtractedData & { notes?: string }>({
    rfc: "",
    razon_social: "",
    nombre_comercial: "",
    direccion: "",
    codigo_postal: "",
    telefono: "",
    email: "",
    regimen_fiscal: "",
    lugar_expedicion: "",
    notes: ""
  });

  // Fetch suppliers
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["general-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("general_suppliers")
        .select("*")
        .order("razon_social", { ascending: true });

      if (error) throw error;
      return data as GeneralSupplier[];
    }
  });

  // Create supplier mutation
  const createMutation = useMutation({
    mutationFn: async (data: { rfc: string; razon_social: string } & Partial<Omit<GeneralSupplier, 'rfc' | 'razon_social'>>) => {
      const { data: result, error } = await supabase
        .from("general_suppliers")
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["general-suppliers"] });
      toast.success("Proveedor creado exitosamente");
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast.error("Ya existe un proveedor con ese RFC");
      } else {
        toast.error("Error al crear proveedor: " + error.message);
      }
    }
  });

  // Update supplier mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GeneralSupplier> }) => {
      const { error } = await supabase
        .from("general_suppliers")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["general-suppliers"] });
      toast.success("Proveedor actualizado");
      setIsEditDialogOpen(false);
      setSelectedSupplier(null);
    },
    onError: (error: Error) => {
      toast.error("Error al actualizar: " + error.message);
    }
  });

  // Delete supplier mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("general_suppliers")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["general-suppliers"] });
      toast.success("Proveedor eliminado");
    },
    onError: (error: Error) => {
      toast.error("Error al eliminar: " + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      rfc: "",
      razon_social: "",
      nombre_comercial: "",
      direccion: "",
      codigo_postal: "",
      telefono: "",
      email: "",
      regimen_fiscal: "",
      lugar_expedicion: "",
      notes: ""
    });
    setExtractedData(null);
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      toast.error("Por favor selecciona una imagen o un archivo PDF");
      return;
    }

    setSelectedImage(file);
    if (isImage) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleExtractData = async () => {
    if (!selectedImage) {
      toast.error("Selecciona una imagen primero");
      return;
    }

    setIsExtracting(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(selectedImage);
      const imageBase64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke("extract-general-supplier", {
        body: { imageBase64, mimeType: selectedImage.type }
      });

      if (error) throw error;

      if (data.success && data.data) {
        setExtractedData(data.data);
        setFormData(prev => ({
          ...prev,
          ...data.data
        }));
        toast.success("Información extraída exitosamente");
      } else {
        toast.error(data.error || "No se pudo extraer información");
      }
    } catch (error) {
      console.error("Error extrayendo datos:", error);
      toast.error("Error al procesar la imagen");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.rfc || !formData.razon_social) {
      toast.error("RFC y Razón Social son requeridos");
      return;
    }

    // Upload image if exists
    let imageUrl = null;
    if (selectedImage) {
      const fileName = `${formData.rfc}_${Date.now()}.${selectedImage.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(`general-suppliers/${fileName}`, selectedImage);

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(`general-suppliers/${fileName}`);
        imageUrl = urlData.publicUrl;
      }
    }

    createMutation.mutate({
      rfc: formData.rfc,
      razon_social: formData.razon_social,
      nombre_comercial: formData.nombre_comercial || null,
      direccion: formData.direccion || null,
      codigo_postal: formData.codigo_postal || null,
      telefono: formData.telefono || null,
      email: formData.email || null,
      regimen_fiscal: formData.regimen_fiscal || null,
      lugar_expedicion: formData.lugar_expedicion || null,
      invoice_image_url: imageUrl,
      notes: formData.notes || null
    });
  };

  const handleEdit = (supplier: GeneralSupplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      rfc: supplier.rfc,
      razon_social: supplier.razon_social,
      nombre_comercial: supplier.nombre_comercial || "",
      direccion: supplier.direccion || "",
      codigo_postal: supplier.codigo_postal || "",
      telefono: supplier.telefono || "",
      email: supplier.email || "",
      regimen_fiscal: supplier.regimen_fiscal || "",
      lugar_expedicion: supplier.lugar_expedicion || "",
      notes: supplier.notes || ""
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedSupplier) return;

    updateMutation.mutate({
      id: selectedSupplier.id,
      data: {
        rfc: formData.rfc,
        razon_social: formData.razon_social,
        nombre_comercial: formData.nombre_comercial || null,
        direccion: formData.direccion || null,
        codigo_postal: formData.codigo_postal || null,
        telefono: formData.telefono || null,
        email: formData.email || null,
        regimen_fiscal: formData.regimen_fiscal || null,
        lugar_expedicion: formData.lugar_expedicion || null,
        notes: formData.notes || null
      }
    });
  };

  const filteredSuppliers = suppliers.filter(s =>
    s.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rfc.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Proveedores Generales
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Proveedores externos que no se registran en el portal (ej: Costco, Sam's)
            </p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo Proveedor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Agregar Proveedor General</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[75vh] pr-4">
                <div className="space-y-6">
                  {/* Option tabs */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Puedes completar el formulario manualmente o extraer datos desde una imagen de factura</span>
                  </div>

                  {/* Image Upload Section - Optional */}
                  <Card className="border-dashed">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Extracción desde Factura
                        <Badge variant="outline" className="ml-2 text-xs font-normal">
                          Opcional
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                          <Label htmlFor="invoice-file">Imagen o PDF de Factura</Label>
                          <Input
                            id="invoice-file"
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleFileSelect}
                            className="mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Sube una imagen o PDF de una factura para extraer automáticamente los datos del proveedor
                          </p>
                        </div>
                        {selectedImage && (
                          <Button
                            type="button"
                            onClick={handleExtractData}
                            disabled={isExtracting}
                            className="gap-2 self-end"
                          >
                            {isExtracting ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Extrayendo...
                              </>
                            ) : (
                              <>
                                <FileText className="h-4 w-4" />
                                Extraer Datos
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {selectedImage && (
                        <div className="relative">
                          {imagePreview ? (
                            <img
                              src={imagePreview}
                              alt="Vista previa"
                              className="max-h-48 rounded-lg border object-contain mx-auto"
                            />
                          ) : (
                            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <span className="text-sm">{selectedImage.name}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {extractedData && (
                        <div className="p-3 bg-accent/50 rounded-lg border border-accent">
                          <p className="text-sm text-accent-foreground flex items-center gap-2">
                            <Check className="h-4 w-4" />
                            Datos extraídos correctamente. Revisa y ajusta si es necesario.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Manual Form Section */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Edit className="h-4 w-4" />
                        Datos del Proveedor
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="rfc">RFC *</Label>
                          <Input
                            id="rfc"
                            value={formData.rfc}
                            onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                            placeholder="RFC del proveedor"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="razon_social">Razón Social *</Label>
                          <Input
                            id="razon_social"
                            value={formData.razon_social}
                            onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                            placeholder="Nombre legal del proveedor"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="nombre_comercial">Nombre Comercial</Label>
                          <Input
                            id="nombre_comercial"
                            value={formData.nombre_comercial}
                            onChange={(e) => setFormData({ ...formData, nombre_comercial: e.target.value })}
                            placeholder="Ej: Costco, Sam's Club"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="regimen_fiscal">Régimen Fiscal</Label>
                          <Input
                            id="regimen_fiscal"
                            value={formData.regimen_fiscal}
                            onChange={(e) => setFormData({ ...formData, regimen_fiscal: e.target.value })}
                            placeholder="Régimen fiscal"
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="direccion">Dirección</Label>
                          <Input
                            id="direccion"
                            value={formData.direccion}
                            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                            placeholder="Dirección completa"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="codigo_postal">Código Postal</Label>
                          <Input
                            id="codigo_postal"
                            value={formData.codigo_postal}
                            onChange={(e) => setFormData({ ...formData, codigo_postal: e.target.value })}
                            placeholder="C.P."
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="lugar_expedicion">Lugar de Expedición</Label>
                          <Input
                            id="lugar_expedicion"
                            value={formData.lugar_expedicion}
                            onChange={(e) => setFormData({ ...formData, lugar_expedicion: e.target.value })}
                            placeholder="C.P. expedición"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="telefono">Teléfono</Label>
                          <Input
                            id="telefono"
                            value={formData.telefono}
                            onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                            placeholder="Teléfono de contacto"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="correo@proveedor.com"
                          />
                        </div>

                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="notes">Notas</Label>
                          <Textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Notas adicionales sobre el proveedor"
                            rows={3}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsAddDialogOpen(false);
                        resetForm();
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        "Guardar Proveedor"
                      )}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por RFC, razón social o nombre comercial..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Suppliers Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {searchTerm
                  ? "No se encontraron proveedores con ese criterio"
                  : "Aún no hay proveedores generales. Agrega uno nuevo."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((supplier) => (
              <Card key={supplier.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {supplier.nombre_comercial || supplier.razon_social}
                      </CardTitle>
                      {supplier.nombre_comercial && (
                        <p className="text-xs text-muted-foreground truncate">
                          {supplier.razon_social}
                        </p>
                      )}
                    </div>
                    <Badge variant={supplier.is_active ? "default" : "secondary"}>
                      {supplier.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5 text-sm">
                    <p className="font-mono text-xs bg-muted px-2 py-1 rounded inline-block">
                      {supplier.rfc}
                    </p>

                    {supplier.regimen_fiscal && (
                      <p className="text-muted-foreground text-xs truncate">
                        {supplier.regimen_fiscal}
                      </p>
                    )}

                    {supplier.direccion && (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="truncate">{supplier.direccion}</span>
                      </p>
                    )}

                    {supplier.telefono && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {supplier.telefono}
                      </p>
                    )}

                    {supplier.email && (
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{supplier.email}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(supplier)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("¿Eliminar este proveedor?")) {
                          deleteMutation.mutate(supplier.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Proveedor</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-rfc">RFC *</Label>
                  <Input
                    id="edit-rfc"
                    value={formData.rfc}
                    onChange={(e) => setFormData({ ...formData, rfc: e.target.value.toUpperCase() })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-razon_social">Razón Social *</Label>
                  <Input
                    id="edit-razon_social"
                    value={formData.razon_social}
                    onChange={(e) => setFormData({ ...formData, razon_social: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-nombre_comercial">Nombre Comercial</Label>
                  <Input
                    id="edit-nombre_comercial"
                    value={formData.nombre_comercial}
                    onChange={(e) => setFormData({ ...formData, nombre_comercial: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-regimen_fiscal">Régimen Fiscal</Label>
                  <Input
                    id="edit-regimen_fiscal"
                    value={formData.regimen_fiscal}
                    onChange={(e) => setFormData({ ...formData, regimen_fiscal: e.target.value })}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-direccion">Dirección</Label>
                  <Input
                    id="edit-direccion"
                    value={formData.direccion}
                    onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-codigo_postal">Código Postal</Label>
                  <Input
                    id="edit-codigo_postal"
                    value={formData.codigo_postal}
                    onChange={(e) => setFormData({ ...formData, codigo_postal: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-lugar_expedicion">Lugar de Expedición</Label>
                  <Input
                    id="edit-lugar_expedicion"
                    value={formData.lugar_expedicion}
                    onChange={(e) => setFormData({ ...formData, lugar_expedicion: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-telefono">Teléfono</Label>
                  <Input
                    id="edit-telefono"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit-notes">Notas</Label>
                  <Textarea
                    id="edit-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 mt-4">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar Cambios"
                  )}
                </Button>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
