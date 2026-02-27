import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShoppingCart, Plus, Trash2, Phone } from "lucide-react";
import { toast } from "sonner";

interface Requester {
  id: string;
  phone: string;
  name: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
}

export const WhatsAppSalesRequestersManager = () => {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const queryClient = useQueryClient();

  const { data: requesters = [], isLoading } = useQuery({
    queryKey: ["whatsapp-sales-requesters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_sales_requesters")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Requester[];
    },
  });

  const addRequester = useMutation({
    mutationFn: async () => {
      const phone = newPhone.replace(/\D/g, "");
      if (!phone || !newName.trim()) throw new Error("Nombre y teléfono requeridos");
      const { error } = await supabase.from("whatsapp_sales_requesters").insert({
        phone,
        name: newName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      setNewPhone("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sales-requesters"] });
      toast.success("Solicitante agregado");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_sales_requesters")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-sales-requesters"] }),
  });

  const deleteRequester = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_sales_requesters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-sales-requesters"] });
      toast.success("Solicitante eliminado");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Clientes autorizados para solicitudes por WhatsApp
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Estos números pueden enviar pedidos (texto, imagen, Excel o PDF) por WhatsApp y se registrarán automáticamente en Solicitudes de Ventas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nombre del cliente"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Teléfono (ej: 5512345678)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => addRequester.mutate()}
            disabled={!newName.trim() || !newPhone.trim() || addRequester.isPending}
          >
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : requesters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay clientes autorizados aún.</p>
        ) : (
          <div className="space-y-2">
            {requesters.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">+{r.phone}</p>
                  </div>
                  <Badge variant={r.is_active ? "default" : "secondary"}>
                    {r.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: r.id, is_active: checked })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRequester.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
