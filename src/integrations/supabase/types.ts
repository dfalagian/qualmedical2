export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      document_versions: {
        Row: {
          created_at: string | null
          document_id: string
          file_name: string
          file_url: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["document_status"]
          version: number
        }
        Insert: {
          created_at?: string | null
          document_id: string
          file_name: string
          file_url: string
          id?: string
          notes?: string | null
          status: Database["public"]["Enums"]["document_status"]
          version: number
        }
        Update: {
          created_at?: string | null
          document_id?: string
          file_name?: string
          file_url?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          actividad_economica: string | null
          codigo_postal: string | null
          created_at: string | null
          curp: string | null
          direccion: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_at: string | null
          extraction_status: string | null
          fecha_emision: string | null
          file_name: string
          file_url: string
          id: string
          image_urls: string[] | null
          is_valid: boolean | null
          nombre_completo_ine: string | null
          notes: string | null
          objeto_social: string | null
          razon_social: string | null
          regimen_tributario: string | null
          registro_publico: string | null
          representante_legal: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rfc: string | null
          status: Database["public"]["Enums"]["document_status"] | null
          supplier_id: string
          updated_at: string | null
          validation_errors: Json | null
          version: number | null
        }
        Insert: {
          actividad_economica?: string | null
          codigo_postal?: string | null
          created_at?: string | null
          curp?: string | null
          direccion?: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          extracted_at?: string | null
          extraction_status?: string | null
          fecha_emision?: string | null
          file_name: string
          file_url: string
          id?: string
          image_urls?: string[] | null
          is_valid?: boolean | null
          nombre_completo_ine?: string | null
          notes?: string | null
          objeto_social?: string | null
          razon_social?: string | null
          regimen_tributario?: string | null
          registro_publico?: string | null
          representante_legal?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rfc?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          supplier_id: string
          updated_at?: string | null
          validation_errors?: Json | null
          version?: number | null
        }
        Update: {
          actividad_economica?: string | null
          codigo_postal?: string | null
          created_at?: string | null
          curp?: string | null
          direccion?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          extracted_at?: string | null
          extraction_status?: string | null
          fecha_emision?: string | null
          file_name?: string
          file_url?: string
          id?: string
          image_urls?: string[] | null
          is_valid?: boolean | null
          nombre_completo_ine?: string | null
          notes?: string | null
          objeto_social?: string | null
          razon_social?: string | null
          regimen_tributario?: string | null
          registro_publico?: string | null
          representante_legal?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rfc?: string | null
          status?: Database["public"]["Enums"]["document_status"] | null
          supplier_id?: string
          updated_at?: string | null
          validation_errors?: Json | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cantidad: number
          clave_prod_serv: string | null
          clave_unidad: string | null
          created_at: string | null
          descripcion: string
          descuento: number | null
          id: string
          importe: number
          invoice_id: string
          unidad: string | null
          valor_unitario: number
        }
        Insert: {
          cantidad: number
          clave_prod_serv?: string | null
          clave_unidad?: string | null
          created_at?: string | null
          descripcion: string
          descuento?: number | null
          id?: string
          importe: number
          invoice_id: string
          unidad?: string | null
          valor_unitario: number
        }
        Update: {
          cantidad?: number
          clave_prod_serv?: string | null
          clave_unidad?: string | null
          created_at?: string | null
          descripcion?: string
          descuento?: number | null
          id?: string
          importe?: number
          invoice_id?: string
          unidad?: string | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          complemento_pago_url: string | null
          created_at: string | null
          currency: string | null
          descuento: number | null
          emisor_nombre: string | null
          emisor_regimen_fiscal: string | null
          emisor_rfc: string | null
          fecha_emision: string | null
          forma_pago: string | null
          id: string
          invoice_number: string
          lugar_expedicion: string | null
          metodo_pago: string | null
          notes: string | null
          payment_date: string | null
          pdf_url: string
          receptor_nombre: string | null
          receptor_rfc: string | null
          receptor_uso_cfdi: string | null
          requiere_complemento: boolean | null
          status: Database["public"]["Enums"]["payment_status"] | null
          subtotal: number | null
          supplier_id: string
          total_impuestos: number | null
          updated_at: string | null
          uuid: string | null
          xml_url: string
        }
        Insert: {
          amount: number
          complemento_pago_url?: string | null
          created_at?: string | null
          currency?: string | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_regimen_fiscal?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          payment_date?: string | null
          pdf_url: string
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          requiere_complemento?: boolean | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal?: number | null
          supplier_id: string
          total_impuestos?: number | null
          updated_at?: string | null
          uuid?: string | null
          xml_url: string
        }
        Update: {
          amount?: number
          complemento_pago_url?: string | null
          created_at?: string | null
          currency?: string | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_regimen_fiscal?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          id?: string
          invoice_number?: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          payment_date?: string | null
          pdf_url?: string
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          requiere_complemento?: boolean | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal?: number | null
          supplier_id?: string
          total_impuestos?: number | null
          updated_at?: string | null
          uuid?: string | null
          xml_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          from_user_id: string
          id: string
          message: string
          read: boolean | null
          subject: string
          to_user_id: string
        }
        Insert: {
          created_at?: string | null
          from_user_id: string
          id?: string
          message: string
          read?: boolean | null
          subject: string
          to_user_id: string
        }
        Update: {
          created_at?: string | null
          from_user_id?: string
          id?: string
          message?: string
          read?: boolean | null
          subject?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          rfc: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          rfc?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          rfc?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          id: string
          order_number: string
          status: string | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          order_number: string
          status?: string | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          order_number?: string
          status?: string | null
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      document_status: "pendiente" | "aprobado" | "rechazado"
      document_type:
        | "factura"
        | "contrato"
        | "certificado"
        | "constancia_fiscal"
        | "acta_constitutiva"
        | "comprobante_domicilio"
        | "aviso_funcionamiento"
        | "ine"
      payment_status: "pendiente" | "procesando" | "pagado" | "rechazado"
      user_role: "admin" | "proveedor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      document_status: ["pendiente", "aprobado", "rechazado"],
      document_type: [
        "factura",
        "contrato",
        "certificado",
        "constancia_fiscal",
        "acta_constitutiva",
        "comprobante_domicilio",
        "aviso_funcionamiento",
        "ine",
      ],
      payment_status: ["pendiente", "procesando", "pagado", "rechazado"],
      user_role: ["admin", "proveedor"],
    },
  },
} as const
