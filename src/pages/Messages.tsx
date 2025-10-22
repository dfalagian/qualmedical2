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

// Constantes de seguridad
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;

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

  const { data: adminUsers, isLoading: adminsLoading } = useQuery({
    queryKey: ["admins"],
    enabled: !isAdmin,
    queryFn: async () => {
      // Primero obtenemos los user_ids de los admins
      const { data: adminRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (rolesError) {
        console.error("Error fetching admin roles:", rolesError);
        throw rolesError;
      }

      if (!adminRoles || adminRoles.length === 0) {
        console.log("No admin users found in user_roles");
        return [];
      }

      // Luego obtenemos los perfiles de esos usuarios
      const adminIds = adminRoles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", adminIds);

      if (profilesError) {
        console.error("Error fetching admin profiles:", profilesError);
        throw profilesError;
      }

      console.log("Admin profiles found:", profiles);
      return profiles || [];
    },
  });

  // Auto-select first admin for suppliers
  const defaultRecipient = !isAdmin && adminUsers && adminUsers.length > 0 ? adminUsers[0].id : null;

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const recipientId = isAdmin ? selectedRecipient : defaultRecipient;
      
      console.log("Sending message - Debug info:", {
        isAdmin,
        recipientId,
        defaultRecipient,
        selectedRecipient,
        subject,
        message,
        user: user?.id,
        adminUsers
      });
      
      if (!subject || !message || !user) {
        throw new Error("El asunto y mensaje son obligatorios");
      }

      if (!recipientId) {
        if (!isAdmin) {
          throw new Error("No se pudo encontrar un administrador. Por favor, contacte al soporte.");
        } else {
          throw new Error("Por favor, selecciona un destinatario");
        }
      }

      // Validar y sanitizar inputs
      const sanitizedSubject = subject.trim().substring(0, MAX_SUBJECT_LENGTH);
      const sanitizedMessage = message.trim().substring(0, MAX_MESSAGE_LENGTH);

      if (sanitizedSubject.length === 0 || sanitizedMessage.length === 0) {
        throw new Error("El asunto y mensaje no pueden estar vacíos");
      }

      // Validar caracteres peligrosos en HTML
      const dangerousPattern = /<script|javascript:|onerror=|onclick=/i;
      if (dangerousPattern.test(sanitizedSubject) || dangerousPattern.test(sanitizedMessage)) {
        throw new Error("Contenido no permitido detectado");
      }

      const { error } = await supabase
        .from("messages")
        .insert({
          from_user_id: user.id,
          to_user_id: recipientId,
          subject: sanitizedSubject,
          message: sanitizedMessage,
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
              {isAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="recipient">Destinatario *</Label>
                  <Select value={selectedRecipient} onValueChange={setSelectedRecipient} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un proveedor" />
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
              )}
              
              {!isAdmin && (
                <div className="space-y-2">
                  <Label>Destinatario</Label>
                  <div className="px-3 py-2 border rounded-md bg-muted/50">
                    {adminsLoading ? (
                      <p className="text-sm text-muted-foreground">Cargando administradores...</p>
                    ) : defaultRecipient ? (
                      <p className="text-sm font-medium">Administración del Sistema</p>
                    ) : (
                      <p className="text-sm text-destructive">No se encontraron administradores</p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="subject">Asunto *</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value.substring(0, MAX_SUBJECT_LENGTH))}
                  placeholder="Asunto del mensaje"
                  required
                  maxLength={MAX_SUBJECT_LENGTH}
                />
                <p className="text-xs text-muted-foreground">
                  {subject.length}/{MAX_SUBJECT_LENGTH} caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Mensaje *</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.substring(0, MAX_MESSAGE_LENGTH))}
                  placeholder="Escribe tu mensaje..."
                  rows={4}
                  required
                  maxLength={MAX_MESSAGE_LENGTH}
                />
                <p className="text-xs text-muted-foreground">
                  {message.length}/{MAX_MESSAGE_LENGTH} caracteres
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={sendMessageMutation.isPending || (!isAdmin && adminsLoading)}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendMessageMutation.isPending ? "Enviando..." : "Enviar Mensaje"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Historial de Conversaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            {messagesLoading ? (
              <p className="text-center py-8 text-muted-foreground">Cargando mensajes...</p>
            ) : messages && messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((msg: any) => {
                  const isReceived = msg.to_user_id === user?.id;
                  const otherParty = isReceived ? msg.from_profile : msg.to_profile;
                  const isSent = msg.from_user_id === user?.id;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                      onClick={() => {
                        if (isReceived && !msg.read) {
                          markAsReadMutation.mutate(msg.id);
                        }
                      }}
                    >
                      <div className={`max-w-[75%] ${isSent ? 'ml-auto' : 'mr-auto'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {!isSent && (
                            <>
                              {msg.read ? (
                                <MailOpen className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <Mail className="h-3 w-3 text-accent" />
                              )}
                              <span className="text-xs font-medium text-muted-foreground">
                                {otherParty?.company_name || otherParty?.full_name}
                              </span>
                            </>
                          )}
                          {isSent && (
                            <>
                              <span className="text-xs font-medium text-muted-foreground">
                                Tú
                              </span>
                              <Send className="h-3 w-3 text-primary" />
                            </>
                          )}
                          {isReceived && !msg.read && (
                            <Badge className="bg-accent text-xs py-0">Nuevo</Badge>
                          )}
                        </div>
                        
                        <div className={`p-4 rounded-lg border ${
                          isSent 
                            ? 'bg-primary/5 border-primary/20' 
                            : isReceived && !msg.read 
                              ? 'bg-accent/10 border-accent'
                              : 'bg-card border-border'
                        }`}>
                          <h4 className="font-semibold text-sm mb-2">{msg.subject}</h4>
                          <p className="text-sm mb-2 whitespace-pre-wrap">{msg.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(msg.created_at).toLocaleString('es-MX', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
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