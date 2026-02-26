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
      activity_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          section: string
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          section: string
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          section?: string
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      cipi_request_items: {
        Row: {
          caducidad: string | null
          cantidad: number
          categoria: string | null
          cipi_request_id: string
          created_at: string
          descripcion: string
          id: string
          iva: number | null
          lote: string | null
          marca: string | null
          matched_product_name: string | null
          precio: number | null
          precio_unitario: number | null
          product_id: string | null
        }
        Insert: {
          caducidad?: string | null
          cantidad?: number
          categoria?: string | null
          cipi_request_id: string
          created_at?: string
          descripcion: string
          id?: string
          iva?: number | null
          lote?: string | null
          marca?: string | null
          matched_product_name?: string | null
          precio?: number | null
          precio_unitario?: number | null
          product_id?: string | null
        }
        Update: {
          caducidad?: string | null
          cantidad?: number
          categoria?: string | null
          cipi_request_id?: string
          created_at?: string
          descripcion?: string
          id?: string
          iva?: number | null
          lote?: string | null
          marca?: string | null
          matched_product_name?: string | null
          precio?: number | null
          precio_unitario?: number | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cipi_request_items_cipi_request_id_fkey"
            columns: ["cipi_request_id"]
            isOneToOne: false
            referencedRelation: "cipi_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cipi_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cipi_requests: {
        Row: {
          cfdi: string | null
          concepto: string | null
          created_at: string
          created_by: string | null
          empresa: string | null
          extracted_data: Json | null
          extraction_status: string | null
          factura_anterior: string | null
          fecha_cotizacion: string | null
          fecha_entrega: string | null
          fecha_ultima_factura: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          folio: string | null
          id: string
          impuestos: number | null
          monto_ultima_factura: number | null
          quote_id: string | null
          raw_text: string | null
          razon_social: string | null
          rfc: string | null
          status: string
          subtotal: number | null
          total: number | null
          type: string
          updated_at: string
        }
        Insert: {
          cfdi?: string | null
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          extracted_data?: Json | null
          extraction_status?: string | null
          factura_anterior?: string | null
          fecha_cotizacion?: string | null
          fecha_entrega?: string | null
          fecha_ultima_factura?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          folio?: string | null
          id?: string
          impuestos?: number | null
          monto_ultima_factura?: number | null
          quote_id?: string | null
          raw_text?: string | null
          razon_social?: string | null
          rfc?: string | null
          status?: string
          subtotal?: number | null
          total?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          cfdi?: string | null
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          extracted_data?: Json | null
          extraction_status?: string | null
          factura_anterior?: string | null
          fecha_cotizacion?: string | null
          fecha_entrega?: string | null
          fecha_ultima_factura?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          folio?: string | null
          id?: string
          impuestos?: number | null
          monto_ultima_factura?: number | null
          quote_id?: string | null
          raw_text?: string | null
          razon_social?: string | null
          rfc?: string | null
          status?: string
          subtotal?: number | null
          total?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cipi_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          cfdi: string | null
          codigo_postal: string | null
          created_at: string | null
          created_by: string | null
          direccion: string | null
          email: string | null
          id: string
          is_active: boolean | null
          nombre_cliente: string
          persona_contacto: string | null
          razon_social: string | null
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          cfdi?: string | null
          codigo_postal?: string | null
          created_at?: string | null
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          nombre_cliente: string
          persona_contacto?: string | null
          razon_social?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          cfdi?: string | null
          codigo_postal?: string | null
          created_at?: string | null
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          nombre_cliente?: string
          persona_contacto?: string | null
          razon_social?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
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
      general_supplier_invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string | null
          descuento: number | null
          emisor_nombre: string | null
          emisor_rfc: string | null
          fecha_emision: string | null
          forma_pago: string | null
          general_supplier_id: string
          id: string
          invoice_number: string
          lugar_expedicion: string | null
          metodo_pago: string | null
          notes: string | null
          pdf_url: string | null
          receptor_nombre: string | null
          receptor_rfc: string | null
          subtotal: number | null
          total_impuestos: number | null
          updated_at: string
          uuid: string | null
          xml_url: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          general_supplier_id: string
          id?: string
          invoice_number: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          pdf_url?: string | null
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          total_impuestos?: number | null
          updated_at?: string
          uuid?: string | null
          xml_url: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string | null
          descuento?: number | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          forma_pago?: string | null
          general_supplier_id?: string
          id?: string
          invoice_number?: string
          lugar_expedicion?: string | null
          metodo_pago?: string | null
          notes?: string | null
          pdf_url?: string | null
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          total_impuestos?: number | null
          updated_at?: string
          uuid?: string | null
          xml_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_supplier_invoices_general_supplier_id_fkey"
            columns: ["general_supplier_id"]
            isOneToOne: false
            referencedRelation: "general_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      general_suppliers: {
        Row: {
          codigo_postal: string | null
          created_at: string | null
          created_by: string | null
          direccion: string | null
          email: string | null
          id: string
          invoice_image_url: string | null
          is_active: boolean | null
          lugar_expedicion: string | null
          nombre_comercial: string | null
          notes: string | null
          razon_social: string
          regimen_fiscal: string | null
          rfc: string
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string | null
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          invoice_image_url?: string | null
          is_active?: boolean | null
          lugar_expedicion?: string | null
          nombre_comercial?: string | null
          notes?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          rfc: string
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string | null
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          invoice_image_url?: string | null
          is_active?: boolean | null
          lugar_expedicion?: string | null
          nombre_comercial?: string | null
          notes?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          rfc?: string
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          product_id: string | null
          purchase_order_id: string | null
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
          product_id?: string | null
          purchase_order_id?: string | null
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
          product_id?: string | null
          purchase_order_id?: string | null
          purchase_order_number?: string | null
          receipt_acknowledgment_url?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_counts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicine_counts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
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
      notification_recipients: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string
        }
        Relationships: []
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
      product_batches: {
        Row: {
          barcode: string
          batch_number: string
          created_at: string
          current_quantity: number
          expiration_date: string
          id: string
          initial_quantity: number
          is_active: boolean
          notes: string | null
          product_id: string
          received_at: string
          updated_at: string
        }
        Insert: {
          barcode: string
          batch_number: string
          created_at?: string
          current_quantity?: number
          expiration_date: string
          id?: string
          initial_quantity?: number
          is_active?: boolean
          notes?: string | null
          product_id: string
          received_at?: string
          updated_at?: string
        }
        Update: {
          barcode?: string
          batch_number?: string
          created_at?: string
          current_quantity?: number
          expiration_date?: string
          id?: string
          initial_quantity?: number
          is_active?: boolean
          notes?: string | null
          product_id?: string
          received_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          previous_price: number | null
          price: number
          price_change_percentage: number | null
          product_id: string
          purchase_order_id: string | null
          supplier_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          previous_price?: number | null
          price: number
          price_change_percentage?: number | null
          product_id: string
          purchase_order_id?: string | null
          supplier_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          previous_price?: number | null
          price?: number
          price_change_percentage?: number | null
          product_id?: string
          purchase_order_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          citio_id: string | null
          clave_unidad: string | null
          codigo_sat: string | null
          created_at: string | null
          current_stock: number | null
          description: string | null
          grupo_sat: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          minimum_stock: number | null
          name: string
          price_type_1: number | null
          price_type_2: number | null
          price_type_3: number | null
          price_type_4: number | null
          price_type_5: number | null
          price_with_tax: number | null
          price_without_tax: number | null
          rfid_required: boolean
          sku: string
          supplier_id: string | null
          tax_rate: number | null
          unit: string | null
          unit_price: number | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          citio_id?: string | null
          clave_unidad?: string | null
          codigo_sat?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          grupo_sat?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          minimum_stock?: number | null
          name: string
          price_type_1?: number | null
          price_type_2?: number | null
          price_type_3?: number | null
          price_type_4?: number | null
          price_type_5?: number | null
          price_with_tax?: number | null
          price_without_tax?: number | null
          rfid_required?: boolean
          sku: string
          supplier_id?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          citio_id?: string | null
          clave_unidad?: string | null
          codigo_sat?: string | null
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          grupo_sat?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          minimum_stock?: number | null
          name?: string
          price_type_1?: number | null
          price_type_2?: number | null
          price_type_3?: number | null
          price_type_4?: number | null
          price_type_5?: number | null
          price_with_tax?: number | null
          price_without_tax?: number | null
          rfid_required?: boolean
          sku?: string
          supplier_id?: string | null
          tax_rate?: number | null
          unit?: string | null
          unit_price?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          original_price: number | null
          price_updated_at: string | null
          price_updated_by: string | null
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_price?: number | null
          price_updated_at?: string | null
          price_updated_by?: string | null
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          original_price?: number | null
          price_updated_at?: string | null
          price_updated_by?: string | null
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_price_updated_by_fkey"
            columns: ["price_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          delivery_date: string | null
          description: string | null
          general_supplier_invoice_id: string | null
          id: string
          invoice_id: string | null
          order_number: string
          received_date: string | null
          status: string | null
          supplier_id: string
          supplier_type: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          description?: string | null
          general_supplier_invoice_id?: string | null
          id?: string
          invoice_id?: string | null
          order_number: string
          received_date?: string | null
          status?: string | null
          supplier_id: string
          supplier_type?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          description?: string | null
          general_supplier_invoice_id?: string | null
          id?: string
          invoice_id?: string | null
          order_number?: string
          received_date?: string | null
          status?: string | null
          supplier_id?: string
          supplier_type?: string | null
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
            foreignKeyName: "purchase_orders_general_supplier_invoice_id_fkey"
            columns: ["general_supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "general_supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          batch_id: string | null
          cantidad: number
          created_at: string | null
          fecha_caducidad: string | null
          id: string
          importe: number
          is_sub_product: boolean
          lote: string | null
          marca: string | null
          nombre_producto: string
          parent_item_id: string | null
          precio_unitario: number
          product_id: string | null
          quote_id: string
          tipo_precio: string | null
        }
        Insert: {
          batch_id?: string | null
          cantidad?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          importe?: number
          is_sub_product?: boolean
          lote?: string | null
          marca?: string | null
          nombre_producto: string
          parent_item_id?: string | null
          precio_unitario?: number
          product_id?: string | null
          quote_id: string
          tipo_precio?: string | null
        }
        Update: {
          batch_id?: string | null
          cantidad?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          importe?: number
          is_sub_product?: boolean
          lote?: string | null
          marca?: string | null
          nombre_producto?: string
          parent_item_id?: string | null
          precio_unitario?: number
          product_id?: string | null
          quote_id?: string
          tipo_precio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          concepto: string | null
          created_at: string | null
          created_by: string | null
          factura_anterior: string | null
          fecha_cotizacion: string
          fecha_entrega: string | null
          fecha_factura_anterior: string | null
          folio: string
          id: string
          inventory_exit_status: string | null
          is_remision: boolean
          monto_factura_anterior: number | null
          notes: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          concepto?: string | null
          created_at?: string | null
          created_by?: string | null
          factura_anterior?: string | null
          fecha_cotizacion?: string
          fecha_entrega?: string | null
          fecha_factura_anterior?: string | null
          folio: string
          id?: string
          inventory_exit_status?: string | null
          is_remision?: boolean
          monto_factura_anterior?: number | null
          notes?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          concepto?: string | null
          created_at?: string | null
          created_by?: string | null
          factura_anterior?: string | null
          fecha_cotizacion?: string
          fecha_entrega?: string | null
          fecha_factura_anterior?: string | null
          folio?: string
          id?: string
          inventory_exit_status?: string | null
          is_remision?: boolean
          monto_factura_anterior?: number | null
          notes?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      rfid_tags: {
        Row: {
          batch_id: string | null
          created_at: string | null
          epc: string
          id: string
          last_location: string | null
          last_read_at: string | null
          notes: string | null
          product_id: string | null
          status: string | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          epc: string
          id?: string
          last_location?: string | null
          last_read_at?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          epc?: string
          id?: string
          last_location?: string | null
          last_read_at?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfid_tags_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfid_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfid_tags_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string | null
          emisor_nombre: string | null
          emisor_rfc: string | null
          fecha_emision: string | null
          folio: string
          id: string
          items: Json | null
          notes: string | null
          pdf_url: string | null
          quote_id: string | null
          receptor_nombre: string | null
          receptor_rfc: string | null
          subtotal: number | null
          total: number
          uuid: string | null
          xml_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          folio: string
          id?: string
          items?: Json | null
          notes?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          total: number
          uuid?: string | null
          xml_url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string | null
          emisor_nombre?: string | null
          emisor_rfc?: string | null
          fecha_emision?: string | null
          folio?: string
          id?: string
          items?: Json | null
          notes?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          receptor_nombre?: string | null
          receptor_rfc?: string | null
          subtotal?: number | null
          total?: number
          uuid?: string | null
          xml_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_requests: {
        Row: {
          created_at: string
          extracted_data: Json | null
          extraction_status: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          notes: string | null
          raw_text: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          extracted_data?: Json | null
          extraction_status?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          raw_text?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          extracted_data?: Json | null
          extraction_status?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          raw_text?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
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
      warehouse_stock: {
        Row: {
          current_stock: number
          id: string
          product_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          current_stock?: number
          id?: string
          product_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          current_stock?: number
          id?: string
          product_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          created_at: string
          created_by: string | null
          from_warehouse_id: string
          id: string
          notes: string | null
          product_id: string | null
          quantity: number | null
          rfid_tag_id: string | null
          status: string
          to_warehouse_id: string
          transfer_group_id: string | null
          transfer_type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          rfid_tag_id?: string | null
          status?: string
          to_warehouse_id: string
          transfer_group_id?: string | null
          transfer_type: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number | null
          rfid_tag_id?: string | null
          status?: string
          to_warehouse_id?: string
          transfer_group_id?: string | null
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_rfid_tag_id_fkey"
            columns: ["rfid_tag_id"]
            isOneToOne: false
            referencedRelation: "rfid_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_bot_users: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          contact_name: string | null
          created_at: string
          direction: string
          from_phone: string
          id: string
          is_read: boolean
          message: string
          timestamp: string
          whatsapp_message_id: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          direction?: string
          from_phone: string
          id?: string
          is_read?: boolean
          message: string
          timestamp?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          direction?: string
          from_phone?: string
          id?: string
          is_read?: boolean
          message?: string
          timestamp?: string
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_budget_folio: { Args: never; Returns: string }
      generate_quote_folio: { Args: never; Returns: string }
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
      is_inventario_rfid: { Args: { _user_id: string }; Returns: boolean }
      is_vendedor: { Args: { _user_id: string }; Returns: boolean }
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
      user_role:
        | "admin"
        | "proveedor"
        | "contador"
        | "contador_proveedor"
        | "inventario_rfid"
        | "vendedor"
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
      user_role: [
        "admin",
        "proveedor",
        "contador",
        "contador_proveedor",
        "inventario_rfid",
        "vendedor",
      ],
    },
  },
} as const
