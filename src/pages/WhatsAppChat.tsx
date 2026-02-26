import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Send, 
  Search, 
  MessageCircle, 
  Check, 
  CheckCheck, 
  Clock,
  Phone,
  ArrowLeft,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { WhatsAppBotUsersManager } from "@/components/whatsapp/WhatsAppBotUsersManager";

interface WhatsAppMessage {
  id: string;
  from_phone: string;
  contact_name: string | null;
  message: string;
  direction: string;
  whatsapp_message_id: string | null;
  timestamp: string;
  is_read: boolean;
  created_at: string;
}

interface Conversation {
  phone: string;
  contact_name: string;
  last_message: string;
  last_timestamp: string;
  unread_count: number;
}

const WhatsAppChat = () => {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newChatPhone, setNewChatPhone] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch all messages grouped by conversation
  const { data: messages = [] } = useQuery({
    queryKey: ["whatsapp-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return data as WhatsAppMessage[];
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Build conversations list
  const conversations: Conversation[] = (() => {
    const map = new Map<string, Conversation>();
    messages.forEach((msg) => {
      const phone = msg.from_phone || "";
      const existing = map.get(phone);
      if (!existing) {
        map.set(phone, {
          phone,
          contact_name: msg.contact_name || phone,
          last_message: msg.message,
          last_timestamp: msg.timestamp,
          unread_count: msg.direction === "incoming" && !msg.is_read ? 1 : 0,
        });
      } else {
        if (msg.timestamp > existing.last_timestamp) {
          existing.last_message = msg.message;
          existing.last_timestamp = msg.timestamp;
          existing.contact_name = msg.contact_name || existing.contact_name;
        }
        if (msg.direction === "incoming" && !msg.is_read) {
          existing.unread_count++;
        }
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.last_timestamp).getTime() - new Date(a.last_timestamp).getTime()
    );
  })();

  const filteredConversations = conversations.filter(
    (c) =>
      c.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
  );

  // Messages for selected conversation
  const conversationMessages = messages.filter(
    (msg) => msg.from_phone === selectedPhone
  );

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationMessages.length]);

  // Mark as read when selecting
  useEffect(() => {
    if (selectedPhone) {
      const unreadIds = messages
        .filter((m) => m.from_phone === selectedPhone && m.direction === "incoming" && !m.is_read)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        supabase
          .from("whatsapp_messages")
          .update({ is_read: true })
          .in("id", unreadIds)
          .then(() => queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] }));
      }
    }
  }, [selectedPhone, messages]);

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async ({ phone, text }: { phone: string; text: string }) => {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { to: phone, message: text },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_, variables) => {
      // Store outgoing message locally
      await supabase.from("whatsapp_messages").insert({
        from_phone: variables.phone,
        contact_name: conversations.find((c) => c.phone === variables.phone)?.contact_name || variables.phone,
        message: variables.text,
        direction: "outgoing",
        is_read: true,
        timestamp: new Date().toISOString(),
      });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
    },
    onError: (error) => {
      toast.error("Error al enviar mensaje: " + error.message);
    },
  });

  const handleSend = () => {
    if (!messageText.trim() || !selectedPhone) return;
    sendMessage.mutate({ phone: selectedPhone, text: messageText.trim() });
  };

  const handleNewChat = () => {
    if (!newChatPhone.trim()) return;
    const phone = newChatPhone.replace(/\D/g, "");
    setSelectedPhone(phone);
    setShowNewChat(false);
    setNewChatPhone("");
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return format(date, "HH:mm");
    return format(date, "dd/MM HH:mm");
  };

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  return (
    <DashboardLayout>
      <Tabs defaultValue="chat" className="h-[calc(100vh-140px)]">
        <TabsList className="mb-2">
          <TabsTrigger value="chat" className="gap-1.5">
            <MessageCircle className="h-4 w-4" /> Chat
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-1.5">
            <Bot className="h-4 w-4" /> Bot IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-0 h-[calc(100%-48px)]">
          <div className="h-full flex rounded-xl overflow-hidden border bg-card shadow-lg">
            {/* Sidebar - Conversations List */}
            <div
              className={cn(
                "w-full md:w-[340px] md:min-w-[340px] border-r flex flex-col bg-card",
                selectedPhone ? "hidden md:flex" : "flex"
              )}
            >
              {/* Header */}
              <div className="p-3 border-b bg-primary/5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    WhatsApp
                  </h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowNewChat(!showNewChat)}
                  >
                    {showNewChat ? "Cancelar" : "Nuevo"}
                  </Button>
                </div>

                {showNewChat ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Número (ej: 5512345678)"
                      value={newChatPhone}
                      onChange={(e) => setNewChatPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNewChat()}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={handleNewChat}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar conversación..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Conversations */}
              <ScrollArea className="flex-1">
                {filteredConversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No hay conversaciones
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <button
                      key={conv.phone}
                      onClick={() => setSelectedPhone(conv.phone)}
                      className={cn(
                        "w-full p-3 flex items-start gap-3 hover:bg-accent/10 transition-colors border-b text-left",
                        selectedPhone === conv.phone && "bg-primary/10"
                      )}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">
                            {conv.contact_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatTime(conv.last_timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-xs text-muted-foreground truncate pr-2">
                            {conv.last_message}
                          </p>
                          {conv.unread_count > 0 && (
                            <Badge className="h-5 min-w-5 flex items-center justify-center rounded-full text-[10px] bg-primary text-primary-foreground shrink-0">
                              {conv.unread_count}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </ScrollArea>
            </div>

            {/* Chat Area */}
            <div
              className={cn(
                "flex-1 flex flex-col",
                !selectedPhone ? "hidden md:flex" : "flex"
              )}
            >
              {selectedPhone ? (
                <>
                  {/* Chat Header */}
                  <div className="p-3 border-b bg-primary/5 flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden shrink-0"
                      onClick={() => setSelectedPhone(null)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {selectedConversation?.contact_name || selectedPhone}
                      </p>
                      <p className="text-xs text-muted-foreground">+{selectedPhone}</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-2 max-w-3xl mx-auto">
                      {conversationMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex",
                            msg.direction === "outgoing" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                              msg.direction === "outgoing"
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-secondary text-secondary-foreground rounded-bl-md"
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                            <div
                              className={cn(
                                "flex items-center justify-end gap-1 mt-1",
                                msg.direction === "outgoing"
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              )}
                            >
                              <span className="text-[10px]">
                                {formatTime(msg.timestamp)}
                              </span>
                              {msg.direction === "outgoing" && (
                                <CheckCheck className="h-3 w-3" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Message Input */}
                  <div className="p-3 border-t bg-card">
                    <div className="flex gap-2 max-w-3xl mx-auto">
                      <Input
                        placeholder="Escribe un mensaje..."
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                        disabled={sendMessage.isPending}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleSend}
                        disabled={!messageText.trim() || sendMessage.isPending}
                        size="icon"
                        className="shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <MessageCircle className="h-10 w-10 text-primary/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-muted-foreground">
                      WhatsApp Business
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Selecciona una conversación o inicia una nueva
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bot" className="mt-0">
          <WhatsAppBotUsersManager />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default WhatsAppChat;
