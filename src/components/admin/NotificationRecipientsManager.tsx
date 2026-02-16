import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Phone, Plus, Pencil, Trash2, Bell } from "lucide-react";

interface RecipientForm {
  name: string;
  phone: string;
  channel: string;
  event_type: string;
  notes: string;
}

const DEFAULT_FORM: RecipientForm = {
  name: "",
  phone: "",
  channel: "both",
  event_type: "pos_sale",
  notes: "",
};

const EVENT_LABELS: Record<string, string> = {
  pos_sale: "Venta POS",
  new_registration: "Nuevo registro",
  invoice_uploaded: "Factura subida",
  payment_completed: "Pago completado",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  both: "Ambos",
};

export const NotificationRecipientsManager = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RecipientForm>(DEFAULT_FORM);

  const { data: recipients, isLoading } = useQuery({
    queryKey: ["notification_recipients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_recipients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (data: RecipientForm & { id?: string }) => {
      if (data.id) {
        const { error } = await supabase
          .from("notification_recipients")
          .update({
            name: data.name,
            phone: data.phone,
            channel: data.channel,
            event_type: data.event_type,
            notes: data.notes || null,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("notification_recipients")
          .insert({
            name: data.name,
            phone: data.phone,
            channel: data.channel,
            event_type: data.event_type,
            notes: data.notes || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Destinatario actualizado" : "Destinatario agregado");
      queryClient.invalidateQueries({ queryKey: ["notification_recipients"] });
      closeDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al guardar");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("notification_recipients")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification_recipients"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notification_recipients")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinatario eliminado");
      queryClient.invalidateQueries({ queryKey: ["notification_recipients"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al eliminar");
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
  };

  const handleEdit = (recipient: any) => {
    setEditingId(recipient.id);
    setForm({
      name: recipient.name,
      phone: recipient.phone,
      channel: recipient.channel,
      event_type: recipient.event_type,
      notes: recipient.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Nombre y teléfono son requeridos");
      return;
    }
    upsertMutation.mutate({ ...form, id: editingId || undefined });
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Destinatarios de Notificaciones
            </CardTitle>
            <CardDescription>
              Gestiona los números que reciben alertas por WhatsApp/SMS
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar Destinatario" : "Nuevo Destinatario"}</DialogTitle>
                <DialogDescription>
                  Configura quién recibirá las notificaciones
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ej: Gerente Juan"
                    required
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ej: 5512345678"
                    required
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Número a 10 dígitos (se agrega +52 automáticamente)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Canal</Label>
                  <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="both">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Evento</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notas (opcional)</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Notas adicionales"
                    maxLength={200}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
                  <Button type="submit" disabled={upsertMutation.isPending}>
                    {upsertMutation.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Cargando...</p>
        ) : !recipients?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay destinatarios configurados. Agrega uno para empezar a recibir notificaciones.
          </p>
        ) : (
          <div className="space-y-3">
            {recipients.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3 min-w-0">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.phone}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {CHANNEL_LABELS[r.channel] || r.channel}
                  </Badge>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {EVENT_LABELS[r.event_type] || r.event_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: r.id, is_active: checked })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar destinatario?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará a {r.name} de las notificaciones.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
