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
          nombre_banco: string | null
          nombre_cliente: string | null
          nombre_completo_ine: string | null
          notes: string | null
          numero_cuenta: string | null
          numero_cuenta_clabe: string | null
          objeto_social: string | null
          razon_social: string | null
          regimen_fiscal: string | null
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
          nombre_banco?: string | null
          nombre_cliente?: string | null
          nombre_completo_ine?: string | null
          notes?: string | null
          numero_cuenta?: string | null
          numero_cuenta_clabe?: string | null
          objeto_social?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
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
          nombre_banco?: string | null
          nombre_cliente?: string | null
          nombre_completo_ine?: string | null
          notes?: string | null
          numero_cuenta?: string | null
          numero_cuenta_clabe?: string | null
          objeto_social?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
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
      inventory_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          location: string | null
          movement_type: string
          new_stock: number | null
          notes: string | null
          previous_stock: number | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          rfid_tag_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          movement_type: string
          new_stock?: number | null
          notes?: string | null
          previous_stock?: number | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          rfid_tag_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          movement_type?: string
          new_stock?: number | null
          notes?: string | null
          previous_stock?: number | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          rfid_tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_rfid_tag_id_fkey"
            columns: ["rfid_tag_id"]
            isOneToOne: false
            referencedRelation: "rfid_tags"
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
          delivery_evidence_url: string[] | null
          descuento: number | null
          emisor_nombre: string | null
          emisor_regimen_fiscal: string | null
          emisor_rfc: string | null
          evidence_rejection_reason: string | null
          evidence_reviewed_at: string | null
          evidence_reviewed_by: string | null
          evidence_status: string | null
          fecha_emision: string | null
          forma_pago: string | null
          id: string
          impuestos_detalle: Json | null
          invoice_number: string
          lugar_expedicion: string | null
          metodo_pago: string | null
          notes: string | null
          payment_date: string | null
          pdf_url: string
          receptor_nombre: string | null
          receptor_rfc: string | null
          receptor_uso_cfdi: string | null
          rejection_reason: string | null
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
          delivery_evidence_url?: string[] | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_regimen_fiscal?: string | null
          emisor_rfc?: string | null
          evidence_rejection_reason?: string | null
          evidence_reviewed_at?: string | null
          evidence_reviewed_by?: string | null
          evidence_status?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          id?: string
          impuestos_detalle?: Json | null
          invoice_number: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          payment_date?: string | null
          pdf_url: string
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          rejection_reason?: string | null
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
          delivery_evidence_url?: string[] | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_regimen_fiscal?: string | null
          emisor_rfc?: string | null
          evidence_rejection_reason?: string | null
          evidence_reviewed_at?: string | null
          evidence_reviewed_by?: string | null
          evidence_status?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          id?: string
          impuestos_detalle?: Json | null
          invoice_number?: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          payment_date?: string | null
          pdf_url?: string
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          receptor_uso_cfdi?: string | null
          rejection_reason?: string | null
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
      medicine_counts: {
        Row: {
          analysis: string | null
          brand_image_urls: string[] | null
          count: number
          created_at: string
          created_by: string
          delivery_document_url: string | null
          expected_quantity: number | null
          id: string
          image_url: string
          is_partial_delivery: boolean | null
          lot_expiry_image_urls: string[] | null
          notes: string | null
          purchase_order_number: string | null
          receipt_acknowledgment_url: string | null
          supplier_id: string
        }
        Insert: {
          analysis?: string | null
          brand_image_urls?: string[] | null
          count: number
          created_at?: string
          created_by: string
          delivery_document_url?: string | null
          expected_quantity?: number | null
          id?: string
          image_url: string
          is_partial_delivery?: boolean | null
          lot_expiry_image_urls?: string[] | null
          notes?: string | null
          purchase_order_number?: string | null
          receipt_acknowledgment_url?: string | null
          supplier_id: string
        }
        Update: {
          analysis?: string | null
          brand_image_urls?: string[] | null
          count?: number
          created_at?: string
          created_by?: string
          delivery_document_url?: string | null
          expected_quantity?: number | null
          id?: string
          image_url?: string
          is_partial_delivery?: boolean | null
          lot_expiry_image_urls?: string[] | null
          notes?: string | null
          purchase_order_number?: string | null
          receipt_acknowledgment_url?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_counts_supplier_id_fkey"
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
      pagos: {
        Row: {
          amount: number
          comprobante_pago_url: string | null
          created_at: string
          created_by: string | null
          datos_bancarios_id: string
          fecha_pago: string | null
          id: string
          invoice_id: string
          is_split_payment: boolean | null
          nombre_banco: string | null
          original_amount: number | null
          paid_amount: number | null
          status: string
          supplier_id: string
          total_installments: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          comprobante_pago_url?: string | null
          created_at?: string
          created_by?: string | null
          datos_bancarios_id: string
          fecha_pago?: string | null
          id?: string
          invoice_id: string
          is_split_payment?: boolean | null
          nombre_banco?: string | null
          original_amount?: number | null
          paid_amount?: number | null
          status?: string
          supplier_id: string
          total_installments?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          comprobante_pago_url?: string | null
          created_at?: string
          created_by?: string | null
          datos_bancarios_id?: string
          fecha_pago?: string | null
          id?: string
          invoice_id?: string
          is_split_payment?: boolean | null
          nombre_banco?: string | null
          original_amount?: number | null
          paid_amount?: number | null
          status?: string
          supplier_id?: string
          total_installments?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_datos_bancarios_id_fkey"
            columns: ["datos_bancarios_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_complements: {
        Row: {
          created_at: string
          fecha_pago: string | null
          id: string
          invoice_id: string
          monto: number | null
          payment_proof_id: string
          pdf_url: string | null
          supplier_id: string
          updated_at: string
          uuid_cfdi: string | null
          xml_url: string
        }
        Insert: {
          created_at?: string
          fecha_pago?: string | null
          id?: string
          invoice_id: string
          monto?: number | null
          payment_proof_id: string
          pdf_url?: string | null
          supplier_id: string
          updated_at?: string
          uuid_cfdi?: string | null
          xml_url: string
        }
        Update: {
          created_at?: string
          fecha_pago?: string | null
          id?: string
          invoice_id?: string
          monto?: number | null
          payment_proof_id?: string
          pdf_url?: string | null
          supplier_id?: string
          updated_at?: string
          uuid_cfdi?: string | null
          xml_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_complements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_complements_payment_proof_id_fkey"
            columns: ["payment_proof_id"]
            isOneToOne: false
            referencedRelation: "payment_proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          actual_amount: number | null
          comprobante_url: string | null
          created_at: string
          expected_amount: number
          id: string
          installment_number: number
          invoice_id: string
          notes: string | null
          pago_id: string
          payment_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          comprobante_url?: string | null
          created_at?: string
          expected_amount: number
          id?: string
          installment_number: number
          invoice_id: string
          notes?: string | null
          pago_id: string
          payment_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          comprobante_url?: string | null
          created_at?: string
          expected_amount?: number
          id?: string
          installment_number?: number
          invoice_id?: string
          notes?: string | null
          pago_id?: string
          payment_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          amount: number
          comprobante_url: string
          created_at: string
          created_by: string | null
          fecha_pago: string | null
          id: string
          invoice_id: string
          pago_id: string
          proof_number: number
        }
        Insert: {
          amount: number
          comprobante_url: string
          created_at?: string
          created_by?: string | null
          fecha_pago?: string | null
          id?: string
          invoice_id: string
          pago_id: string
          proof_number?: number
        }
        Update: {
          amount?: number
          comprobante_url?: string
          created_at?: string
          created_by?: string | null
          fecha_pago?: string | null
          id?: string
          invoice_id?: string
          pago_id?: string
          proof_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string | null
          current_stock: number | null
          description: string | null
          id: string
          is_active: boolean | null
          minimum_stock: number | null
          name: string
          sku: string
          supplier_id: string | null
          unit: string | null
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          minimum_stock?: number | null
          name: string
          sku: string
          supplier_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          minimum_stock?: number | null
          name?: string
          sku?: string
          supplier_id?: string | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          company_name: string | null
          created_at: string | null
          email: string
          first_login_at: string | null
          full_name: string
          id: string
          last_login_at: string | null
          parent_supplier_id: string | null
          phone: string | null
          rfc: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"] | null
          tipo_venta: Database["public"]["Enums"]["tipo_venta"] | null
          updated_at: string | null
        }
        Insert: {
          approved?: boolean
          company_name?: string | null
          created_at?: string | null
          email: string
          first_login_at?: string | null
          full_name: string
          id: string
          last_login_at?: string | null
          parent_supplier_id?: string | null
          phone?: string | null
          rfc?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"] | null
          tipo_venta?: Database["public"]["Enums"]["tipo_venta"] | null
          updated_at?: string | null
        }
        Update: {
          approved?: boolean
          company_name?: string | null
          created_at?: string | null
          email?: string
          first_login_at?: string | null
          full_name?: string
          id?: string
          last_login_at?: string | null
          parent_supplier_id?: string | null
          phone?: string | null
          rfc?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"] | null
          tipo_venta?: Database["public"]["Enums"]["tipo_venta"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_supplier_id_fkey"
            columns: ["parent_supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      rfid_tags: {
        Row: {
          created_at: string | null
          epc: string
          id: string
          last_location: string | null
          last_read_at: string | null
          notes: string | null
          product_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          epc: string
          id?: string
          last_location?: string | null
          last_read_at?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          epc?: string
          id?: string
          last_location?: string | null
          last_read_at?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfid_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          new_location: string | null
          previous_location: string | null
          product_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          rfid_tag_id: string | null
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          new_location?: string | null
          previous_location?: string | null
          product_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rfid_tag_id?: string | null
          severity?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          new_location?: string | null
          previous_location?: string | null
          product_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rfid_tag_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_rfid_tag_id_fkey"
            columns: ["rfid_tag_id"]
            isOneToOne: false
            referencedRelation: "rfid_tags"
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
      get_parent_supplier_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_contador: { Args: { _user_id: string }; Returns: boolean }
      is_contador_proveedor: { Args: { _user_id: string }; Returns: boolean }
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
        | "datos_bancarios"
        | "ine_sanitario"
      payment_status:
        | "pendiente"
        | "procesando"
        | "pagado"
        | "rechazado"
        | "cancelado"
      tipo_persona: "fisica" | "moral"
      tipo_venta: "medicamentos" | "otros"
      user_role: "admin" | "proveedor" | "contador" | "contador_proveedor"
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
        "datos_bancarios",
        "ine_sanitario",
      ],
      payment_status: [
        "pendiente",
        "procesando",
        "pagado",
        "rechazado",
        "cancelado",
      ],
      tipo_persona: ["fisica", "moral"],
      tipo_venta: ["medicamentos", "otros"],
      user_role: ["admin", "proveedor", "contador", "contador_proveedor"],
    },
  },
} as const
