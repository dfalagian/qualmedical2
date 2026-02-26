import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Plus, Trash2, Phone } from "lucide-react";
import { toast } from "sonner";

interface BotUser {
  id: string;
  phone: string;
  name: string;
  is_active: boolean;
  created_at: string;
  notes: string | null;
}

export const WhatsAppBotUsersManager = () => {
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const queryClient = useQueryClient();

  const { data: botUsers = [], isLoading } = useQuery({
    queryKey: ["whatsapp-bot-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_bot_users")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BotUser[];
    },
  });

  const addUser = useMutation({
    mutationFn: async () => {
      const phone = newPhone.replace(/\D/g, "");
      if (!phone || !newName.trim()) throw new Error("Nombre y teléfono requeridos");
      const { error } = await supabase.from("whatsapp_bot_users").insert({
        phone,
        name: newName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      setNewPhone("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-bot-users"] });
      toast.success("Usuario bot agregado");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_bot_users")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-bot-users"] }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_bot_users").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-bot-users"] });
      toast.success("Usuario eliminado");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" />
          Usuarios autorizados del Bot IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nombre"
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
            onClick={() => addUser.mutate()}
            disabled={!newName.trim() || !newPhone.trim() || addUser.isPending}
          >
            <Plus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : botUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay usuarios autorizados aún.</p>
        ) : (
          <div className="space-y-2">
            {botUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">+{user.phone}</p>
                  </div>
                  <Badge variant={user.is_active ? "default" : "secondary"}>
                    {user.is_active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={user.is_active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: user.id, is_active: checked })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteUser.mutate(user.id)}
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
