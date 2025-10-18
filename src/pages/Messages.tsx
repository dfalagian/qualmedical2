import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, Send, Mail, MailOpen } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Messages = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState("");

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`
          *,
          from_profile:profiles!messages_from_user_id_fkey(full_name, company_name),
          to_profile:profiles!messages_to_user_id_fkey(full_name, company_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, email")
        .neq("id", user?.id);

      if (error) throw error;
      return data;
    },
  });

  const { data: adminUsers } = useQuery({
    queryKey: ["admins"],
    enabled: !isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, profiles(id, full_name, email)")
        .eq("role", "admin");

      if (error) throw error;
      return data.map(d => d.profiles).filter(Boolean);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!subject || !message || !selectedRecipient || !user) {
        throw new Error("Todos los campos son obligatorios");
      }

      const { error } = await supabase
        .from("messages")
        .insert({
          from_user_id: user.id,
          to_user_id: selectedRecipient,
          subject,
          message,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mensaje enviado");
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setSubject("");
      setMessage("");
      setSelectedRecipient("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al enviar mensaje");
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({ read: true })
        .eq("id", messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });

  const recipientList = isAdmin ? suppliers : adminUsers;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Mensajes</h2>
          <p className="text-muted-foreground">
            Comunícate con {isAdmin ? "los proveedores" : "el equipo administrativo"}
          </p>
        </div>

        <Card className="shadow-md border-primary/20">
          <CardHeader className="bg-gradient-primary/10">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Nuevo Mensaje
            </CardTitle>
            <CardDescription>Envía un mensaje</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessageMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="recipient">Destinatario *</Label>
                <Select value={selectedRecipient} onValueChange={setSelectedRecipient} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un destinatario" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipientList?.map((recipient: any) => (
                      <SelectItem key={recipient.id} value={recipient.id}>
                        {recipient.company_name || recipient.full_name} ({recipient.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Asunto *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Asunto del mensaje"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Mensaje *</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  rows={4}
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                <Send className="h-4 w-4 mr-2" />
                Enviar Mensaje
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Bandeja de Entrada
            </CardTitle>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando mensajes...</p>
            ) : messages && messages.length > 0 ? (
              <div className="space-y-3">
                {messages.map((msg: any) => {
                  const isReceived = msg.to_user_id === user?.id;
                  const otherParty = isReceived ? msg.from_profile : msg.to_profile;

                  return (
                    <div
                      key={msg.id}
                      className={`p-4 border rounded-lg transition-colors cursor-pointer ${
                        isReceived && !msg.read
                          ? "bg-accent/10 border-accent"
                          : "hover:bg-accent/5"
                      }`}
                      onClick={() => {
                        if (isReceived && !msg.read) {
                          markAsReadMutation.mutate(msg.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isReceived ? (
                            msg.read ? (
                              <MailOpen className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Mail className="h-4 w-4 text-accent" />
                            )
                          ) : (
                            <Send className="h-4 w-4 text-primary" />
                          )}
                          <h4 className="font-semibold">{msg.subject}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {isReceived ? (
                            <Badge variant="secondary">Recibido</Badge>
                          ) : (
                            <Badge className="bg-primary">Enviado</Badge>
                          )}
                          {isReceived && !msg.read && (
                            <Badge className="bg-accent">Nuevo</Badge>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-2">
                        {isReceived ? "De: " : "Para: "}
                        {otherParty?.company_name || otherParty?.full_name}
                      </p>

                      <p className="text-sm mb-2">{msg.message}</p>

                      <p className="text-xs text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString('es-MX')}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">
                No hay mensajes
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Messages;