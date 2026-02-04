import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Users } from "lucide-react";
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

interface Client {
  id: string;
  nombre_cliente: string;
  razon_social: string | null;
  rfc: string | null;
  cfdi: string | null;
  direccion: string | null;
  codigo_postal: string | null;
  persona_contacto: string | null;
  telefono: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

interface ClientFormData {
  nombre_cliente: string;
  razon_social: string;
  rfc: string;
  cfdi: string;
  direccion: string;
  codigo_postal: string;
  persona_contacto: string;
  telefono: string;
  email: string;
}

const initialFormData: ClientFormData = {
  nombre_cliente: "",
  razon_social: "",
  rfc: "",
  cfdi: "",
  direccion: "",
  codigo_postal: "",
  persona_contacto: "",
  telefono: "",
  email: "",
};

export const ClientsManagement = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("is_active", true)
        .order("nombre_cliente");

      if (error) throw error;
      return data as Client[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const { error } = await supabase.from("clients").insert({
        nombre_cliente: data.nombre_cliente,
        razon_social: data.razon_social || null,
        rfc: data.rfc || null,
        cfdi: data.cfdi || null,
        direccion: data.direccion || null,
        codigo_postal: data.codigo_postal || null,
        persona_contacto: data.persona_contacto || null,
        telefono: data.telefono || null,
        email: data.email || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente creado exitosamente");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Error al crear cliente: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClientFormData }) => {
      const { error } = await supabase
        .from("clients")
        .update({
          nombre_cliente: data.nombre_cliente,
          razon_social: data.razon_social || null,
          rfc: data.rfc || null,
          cfdi: data.cfdi || null,
          direccion: data.direccion || null,
          codigo_postal: data.codigo_postal || null,
          persona_contacto: data.persona_contacto || null,
          telefono: data.telefono || null,
          email: data.email || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente actualizado exitosamente");
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error("Error al actualizar cliente: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente eliminado exitosamente");
      setDeleteClientId(null);
    },
    onError: (error) => {
      toast.error("Error al eliminar cliente: " + error.message);
    },
  });

  const handleOpenCreate = () => {
    setEditingClient(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      nombre_cliente: client.nombre_cliente,
      razon_social: client.razon_social || "",
      rfc: client.rfc || "",
      cfdi: client.cfdi || "",
      direccion: client.direccion || "",
      codigo_postal: client.codigo_postal || "",
      persona_contacto: client.persona_contacto || "",
      telefono: client.telefono || "",
      email: client.email || "",
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingClient(null);
    setFormData(initialFormData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre_cliente.trim()) {
      toast.error("El nombre del cliente es requerido");
      return;
    }

    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.nombre_cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.razon_social?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Gestión de Clientes
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? "Editar Cliente" : "Nuevo Cliente"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre_cliente">Nombre Cliente *</Label>
                    <Input
                      id="nombre_cliente"
                      value={formData.nombre_cliente}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre_cliente: e.target.value })
                      }
                      placeholder="Nombre del cliente"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="razon_social">Razón Social</Label>
                    <Input
                      id="razon_social"
                      value={formData.razon_social}
                      onChange={(e) =>
                        setFormData({ ...formData, razon_social: e.target.value })
                      }
                      placeholder="Razón social"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rfc">RFC</Label>
                    <Input
                      id="rfc"
                      value={formData.rfc}
                      onChange={(e) =>
                        setFormData({ ...formData, rfc: e.target.value.toUpperCase() })
                      }
                      placeholder="RFC"
                      maxLength={13}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cfdi">Uso CFDI</Label>
                    <Input
                      id="cfdi"
                      value={formData.cfdi}
                      onChange={(e) =>
                        setFormData({ ...formData, cfdi: e.target.value })
                      }
                      placeholder="Uso de CFDI (ej: G03)"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="direccion">Dirección</Label>
                    <Input
                      id="direccion"
                      value={formData.direccion}
                      onChange={(e) =>
                        setFormData({ ...formData, direccion: e.target.value })
                      }
                      placeholder="Dirección completa"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="codigo_postal">Código Postal</Label>
                    <Input
                      id="codigo_postal"
                      value={formData.codigo_postal}
                      onChange={(e) =>
                        setFormData({ ...formData, codigo_postal: e.target.value })
                      }
                      placeholder="Código postal"
                      maxLength={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="persona_contacto">Persona de Contacto</Label>
                    <Input
                      id="persona_contacto"
                      value={formData.persona_contacto}
                      onChange={(e) =>
                        setFormData({ ...formData, persona_contacto: e.target.value })
                      }
                      placeholder="Nombre del contacto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefono">Teléfono</Label>
                    <Input
                      id="telefono"
                      value={formData.telefono}
                      onChange={(e) =>
                        setFormData({ ...formData, telefono: e.target.value })
                      }
                      placeholder="Teléfono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDialog}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Guardando..."
                      : editingClient
                      ? "Actualizar"
                      : "Crear"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm
              ? "No se encontraron clientes con ese criterio"
              : "No hay clientes registrados"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Razón Social</TableHead>
                  <TableHead className="hidden sm:table-cell">RFC</TableHead>
                  <TableHead className="hidden lg:table-cell">Contacto</TableHead>
                  <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      {client.nombre_cliente}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {client.razon_social || "-"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {client.rfc || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {client.persona_contacto || "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {client.telefono || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(client)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteClientId(client.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!deleteClientId}
        onOpenChange={() => setDeleteClientId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción desactivará el cliente. Podrá ser reactivado más tarde
              si es necesario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteClientId && deleteMutation.mutate(deleteClientId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
