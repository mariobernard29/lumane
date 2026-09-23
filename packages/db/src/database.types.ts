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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label: string | null
          ends_at: string | null
          eyebrow: string | null
          id: string
          image_alt: string
          image_path: string | null
          is_active: boolean
          position: number
          slot_key: string
          starts_at: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: string
          image_alt?: string
          image_path?: string | null
          is_active?: boolean
          position?: number
          slot_key: string
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: string
          image_alt?: string
          image_path?: string | null
          is_active?: boolean
          position?: number
          slot_key?: string
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cart_lines: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          quantity: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_lines_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          status: Database["public"]["Enums"]["cart_status"]
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          status?: Database["public"]["Enums"]["cart_status"]
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id: string
          reason: string
          session_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          id?: string
          reason: string
          session_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["cash_direction"]
          id?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_alt: string | null
          image_path: string | null
          is_visible: boolean
          name: string
          parent_id: string | null
          position: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_visible?: boolean
          name: string
          parent_id?: string | null
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_visible?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          badge_label: string | null
          banner_alt: string | null
          banner_path: string | null
          created_at: string
          description: string | null
          id: string
          image_alt: string | null
          image_path: string | null
          is_visible: boolean
          name: string
          position: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          badge_label?: string | null
          banner_alt?: string | null
          banner_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_visible?: boolean
          name: string
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          badge_label?: string | null
          banner_alt?: string | null
          banner_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_alt?: string | null
          image_path?: string | null
          is_visible?: boolean
          name?: string
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          amount_cents: number
          coupon_id: string
          created_at: string
          customer_id: string | null
          id: string
          order_id: string
        }
        Insert: {
          amount_cents: number
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id: string
        }
        Update: {
          amount_cents?: number
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_targets: {
        Row: {
          coupon_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["coupon_scope"]
        }
        Insert: {
          coupon_id: string
          target_id: string
          target_type: Database["public"]["Enums"]["coupon_scope"]
        }
        Update: {
          coupon_id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["coupon_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "coupon_targets_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          amount_off_cents: number | null
          channels: string[]
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          ends_at: string | null
          id: string
          is_active: boolean
          min_subtotal_cents: number
          percent_off: number | null
          scope: Database["public"]["Enums"]["coupon_scope"]
          starts_at: string | null
          times_used: number
          updated_at: string
          usage_limit_per_customer: number | null
          usage_limit_total: number | null
        }
        Insert: {
          amount_off_cents?: number | null
          channels?: string[]
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_subtotal_cents?: number
          percent_off?: number | null
          scope?: Database["public"]["Enums"]["coupon_scope"]
          starts_at?: string | null
          times_used?: number
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
        }
        Update: {
          amount_off_cents?: number | null
          channels?: string[]
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          min_subtotal_cents?: number
          percent_off?: number | null
          scope?: Database["public"]["Enums"]["coupon_scope"]
          starts_at?: string | null
          times_used?: number
          updated_at?: string
          usage_limit_per_customer?: number | null
          usage_limit_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          customer_id: string
          delivery_notes: string | null
          ext_no: string | null
          google_place_id: string | null
          id: string
          int_no: string | null
          is_default: boolean
          label: string | null
          lat: number | null
          lng: number | null
          neighborhood: string | null
          phone: string | null
          postal_code: string
          recipient: string
          state: string
          street: string
          updated_at: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          customer_id: string
          delivery_notes?: string | null
          ext_no?: string | null
          google_place_id?: string | null
          id?: string
          int_no?: string | null
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          phone?: string | null
          postal_code: string
          recipient: string
          state: string
          street: string
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          customer_id?: string
          delivery_notes?: string | null
          ext_no?: string | null
          google_place_id?: string | null
          id?: string
          int_no?: string | null
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          phone?: string | null
          postal_code?: string
          recipient?: string
          state?: string
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customer_favorites: {
        Row: {
          created_at: string
          customer_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      customers: {
        Row: {
          accepts_marketing: boolean
          archived_at: string | null
          auth_user_id: string | null
          birthday: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["customer_origin"]
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          accepts_marketing?: boolean
          archived_at?: string | null
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["customer_origin"]
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          accepts_marketing?: boolean
          archived_at?: string | null
          auth_user_id?: string | null
          birthday?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["customer_origin"]
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_visible: boolean
          position: number
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          position?: number
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label: string | null
          ends_at: string | null
          eyebrow: string | null
          id: string
          image_alt: string
          image_path: string
          is_active: boolean
          mobile_image_path: string | null
          page_key: string
          position: number
          secondary_cta_href: string | null
          secondary_cta_label: string | null
          starts_at: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: string
          image_alt?: string
          image_path: string
          is_active?: boolean
          mobile_image_path?: string | null
          page_key: string
          position?: number
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          ends_at?: string | null
          eyebrow?: string | null
          id?: string
          image_alt?: string
          image_path?: string
          is_active?: boolean
          mobile_image_path?: string | null
          page_key?: string
          position?: number
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          starts_at?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_levels: {
        Row: {
          available: number | null
          location_id: string
          on_hand: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          available?: number | null
          location_id: string
          on_hand?: number
          reserved?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          available?: number | null
          location_id?: string
          on_hand?: number
          reserved?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          note: string | null
          quantity_delta: number
          reference_id: string | null
          reference_type: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost_cents: number | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          note?: string | null
          quantity_delta: number
          reference_id?: string | null
          reference_type?: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost_cents?: number | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          note?: string | null
          quantity_delta?: number
          reference_id?: string | null
          reference_type?: string | null
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost_cents?: number | null
          variant_id?: string
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
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          cart_id: string | null
          created_at: string
          expires_at: string
          id: string
          location_id: string
          order_id: string | null
          quantity: number
          released_at: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          variant_id: string
        }
        Insert: {
          cart_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          location_id: string
          order_id?: string | null
          quantity: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          variant_id: string
        }
        Update: {
          cart_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          location_id?: string
          order_id?: string | null
          quantity?: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      local_delivery_rates: {
        Row: {
          id: string
          max_km: number
          min_km: number
          position: number
          price_cents: number
          shipping_method_id: string
        }
        Insert: {
          id?: string
          max_km: number
          min_km: number
          position?: number
          price_cents: number
          shipping_method_id: string
        }
        Update: {
          id?: string
          max_km?: number
          min_km?: number
          position?: number
          price_cents?: number
          shipping_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_delivery_rates_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: Json
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: Json
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: Json
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      navigation_items: {
        Row: {
          created_at: string
          href: string
          id: string
          is_emphasized: boolean
          is_visible: boolean
          label: string
          menu_id: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          href: string
          id?: string
          is_emphasized?: boolean
          is_visible?: boolean
          label: string
          menu_id: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          href?: string
          id?: string
          is_emphasized?: boolean
          is_visible?: boolean
          label?: string
          menu_id?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "navigation_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "navigation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_menus: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirmed_at: string | null
          created_at: string
          customer_id: string | null
          email: string
          id: string
          is_active: boolean
          source: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          email: string
          id?: string
          is_active?: boolean
          source?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string
          id?: string
          is_active?: boolean
          source?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_subscribers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      order_lines: {
        Row: {
          cost_cents: number
          created_at: string
          discount_cents: number
          id: string
          order_id: string
          position: number
          product_id: string | null
          product_name: string
          quantity: number
          sku: string
          tax_cents: number
          tax_rate: number
          total_cents: number
          unit_price_cents: number
          variant_id: string | null
          variant_title: string
        }
        Insert: {
          cost_cents?: number
          created_at?: string
          discount_cents?: number
          id?: string
          order_id: string
          position?: number
          product_id?: string | null
          product_name: string
          quantity: number
          sku: string
          tax_cents?: number
          tax_rate?: number
          total_cents: number
          unit_price_cents: number
          variant_id?: string | null
          variant_title?: string
        }
        Update: {
          cost_cents?: number
          created_at?: string
          discount_cents?: number
          id?: string
          order_id?: string
          position?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string
          tax_cents?: number
          tax_rate?: number
          total_cents?: number
          unit_price_cents?: number
          variant_id?: string | null
          variant_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          created_at: string
          created_by: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          note: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          cancelled_at: string | null
          channel: Database["public"]["Enums"]["order_channel"]
          client_uuid: string | null
          coupon_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_cents: number
          guest_token: string | null
          id: string
          location_id: string
          note: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string | null
          register_session_id: string | null
          shipping_address: Json | null
          shipping_cents: number
          shipping_method_snapshot: Json | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          cancelled_at?: string | null
          channel: Database["public"]["Enums"]["order_channel"]
          client_uuid?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          guest_token?: string | null
          id?: string
          location_id: string
          note?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string | null
          register_session_id?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          shipping_method_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          cancelled_at?: string | null
          channel?: Database["public"]["Enums"]["order_channel"]
          client_uuid?: string | null
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_cents?: number
          guest_token?: string | null
          id?: string
          location_id?: string
          note?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string | null
          register_session_id?: string | null
          shipping_address?: Json | null
          shipping_cents?: number
          shipping_method_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_register_session_id_fkey"
            columns: ["register_session_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          topic: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          topic: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["outbox_status"]
          topic?: string
        }
        Relationships: []
      }
      page_sections: {
        Row: {
          config: Json
          created_at: string
          eyebrow: string | null
          id: string
          is_active: boolean
          page_key: string
          position: number
          subtitle: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          eyebrow?: string | null
          id?: string
          is_active?: boolean
          page_key: string
          position?: number
          subtitle?: string | null
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          eyebrow?: string | null
          id?: string
          is_active?: boolean
          page_key?: string
          position?: number
          subtitle?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      pages: {
        Row: {
          body: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_published: boolean
          position: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          template: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          template?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          position?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          template?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          change_cents: number | null
          created_at: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider: string | null
          provider_payment_id: string | null
          reference: string | null
          status: string
          tendered_cents: number | null
        }
        Insert: {
          amount_cents: number
          change_cents?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          provider?: string | null
          provider_payment_id?: string | null
          reference?: string | null
          status?: string
          tendered_cents?: number | null
        }
        Update: {
          amount_cents?: number
          change_cents?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          provider?: string | null
          provider_payment_id?: string | null
          reference?: string | null
          status?: string
          tendered_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "v_public_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string
          created_at: string
          height: number | null
          id: string
          position: number
          product_id: string
          storage_path: string
          variant_id: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string
          created_at?: string
          height?: number | null
          id?: string
          position?: number
          product_id: string
          storage_path: string
          variant_id?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          height?: number | null
          id?: string
          position?: number
          product_id?: string
          storage_path?: string
          variant_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          hex: string | null
          id: string
          option_id: string
          position: number
          value: string
        }
        Insert: {
          hex?: string | null
          id?: string
          option_id: string
          position?: number
          value: string
        }
        Update: {
          hex?: string | null
          id?: string
          option_id?: string
          position?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          id: string
          name: string
          position: number
          product_id: string
        }
        Insert: {
          id?: string
          name: string
          position?: number
          product_id: string
        }
        Update: {
          id?: string
          name?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_relations: {
        Row: {
          position: number
          product_id: string
          related_product_id: string
        }
        Insert: {
          position?: number
          product_id: string
          related_product_id: string
        }
        Update: {
          position?: number
          product_id?: string
          related_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          author_name: string
          body: string
          created_at: string
          customer_id: string | null
          id: string
          is_published: boolean
          order_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
        }
        Insert: {
          author_name: string
          body: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          order_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          bin_location: string | null
          compare_at_price_cents: number | null
          cost_cents: number
          created_at: string
          id: string
          is_active: boolean
          low_stock_threshold: number
          position: number
          price_cents: number
          product_id: string
          sku: string
          title: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          bin_location?: string | null
          compare_at_price_cents?: number | null
          cost_cents?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          position?: number
          price_cents: number
          product_id: string
          sku: string
          title?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          bin_location?: string | null
          compare_at_price_cents?: number | null
          cost_cents?: number
          created_at?: string
          id?: string
          is_active?: boolean
          low_stock_threshold?: number
          position?: number
          price_cents?: number
          product_id?: string
          sku?: string
          title?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          brand: string | null
          created_at: string
          created_by: string | null
          fit_note: string | null
          id: string
          is_online: boolean
          long_description: string | null
          name: string
          primary_category_id: string | null
          published_at: string | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          fit_note?: string | null
          id?: string
          is_online?: boolean
          long_description?: string | null
          name: string
          primary_category_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          fit_note?: string | null
          id?: string
          is_online?: boolean
          long_description?: string | null
          name?: string
          primary_category_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_primary_category_id_fkey"
            columns: ["primary_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          location_id: string | null
          pin_hash: string | null
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          location_id?: string | null
          pin_hash?: string | null
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          pin_hash?: string | null
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      register_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          counted_cash_cents: number | null
          created_at: string
          difference_cents: number | null
          expected_cash_cents: number | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float_cents: number
          status: Database["public"]["Enums"]["register_session_status"]
          totals_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          location_id: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float_cents?: number
          status?: Database["public"]["Enums"]["register_session_status"]
          totals_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash_cents?: number | null
          created_at?: string
          difference_cents?: number | null
          expected_cash_cents?: number | null
          id?: string
          location_id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float_cents?: number
          status?: Database["public"]["Enums"]["register_session_status"]
          totals_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "register_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "register_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      return_lines: {
        Row: {
          amount_cents: number
          id: string
          order_line_id: string
          quantity: number
          return_id: string
        }
        Insert: {
          amount_cents: number
          id?: string
          order_line_id: string
          quantity: number
          return_id: string
        }
        Update: {
          amount_cents?: number
          id?: string
          order_line_id?: string
          quantity?: number
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_lines_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          client_uuid: string | null
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          reason: string | null
          reference: string
          refund_amount_cents: number
          refund_method: Database["public"]["Enums"]["payment_method"] | null
          restock: boolean
          status: Database["public"]["Enums"]["return_status"]
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          reason?: string | null
          reference?: string
          refund_amount_cents?: number
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          restock?: boolean
          status?: Database["public"]["Enums"]["return_status"]
        }
        Update: {
          client_uuid?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          reference?: string
          refund_amount_cents?: number
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          restock?: boolean
          status?: Database["public"]["Enums"]["return_status"]
        }
        Relationships: [
          {
            foreignKeyName: "returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission: string
          role_id: string
        }
        Insert: {
          permission: string
          role_id: string
        }
        Update: {
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          order_id: string
          shipped_at: string | null
          shipping_method_id: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id: string
          shipped_at?: string | null
          shipping_method_id?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          shipped_at?: string | null
          shipping_method_id?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_shipping_method_id_fkey"
            columns: ["shipping_method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          code: string
          created_at: string
          description: string | null
          free_over_cents: number | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["shipping_kind"]
          location_id: string | null
          max_days: number | null
          min_days: number | null
          name: string
          position: number
          price_cents: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          free_over_cents?: number | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["shipping_kind"]
          location_id?: string | null
          max_days?: number | null
          min_days?: number | null
          name: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          free_over_cents?: number | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["shipping_kind"]
          location_id?: string | null
          max_days?: number | null
          min_days?: number | null
          name?: string
          position?: number
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_methods_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_quotes: {
        Row: {
          address_hash: string
          computed_at: string
          distance_meters: number
          duration_seconds: number | null
          lat: number
          lng: number
          location_id: string
        }
        Insert: {
          address_hash: string
          computed_at?: string
          distance_meters: number
          duration_seconds?: number | null
          lat: number
          lng: number
          location_id: string
        }
        Update: {
          address_hash?: string
          computed_at?: string
          distance_meters?: number
          duration_seconds?: number | null
          lat?: number
          lng?: number
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_quotes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          note: string | null
          reference: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_location_id: string
          id?: string
          note?: string | null
          reference: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_location_id?: string
          id?: string
          note?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          copyright_text: string | null
          currency: string
          free_shipping_over_cents: number | null
          id: boolean
          newsletter_body: string | null
          newsletter_disclaimer: string | null
          newsletter_title: string | null
          opening_hours: string | null
          reservation_minutes: number
          social_links: Json
          store_name: string
          tagline: string | null
          tax_rate: number
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          copyright_text?: string | null
          currency?: string
          free_shipping_over_cents?: number | null
          id?: boolean
          newsletter_body?: string | null
          newsletter_disclaimer?: string | null
          newsletter_title?: string | null
          opening_hours?: string | null
          reservation_minutes?: number
          social_links?: Json
          store_name?: string
          tagline?: string | null
          tax_rate?: number
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          copyright_text?: string | null
          currency?: string
          free_shipping_over_cents?: number | null
          id?: boolean
          newsletter_body?: string | null
          newsletter_disclaimer?: string | null
          newsletter_title?: string | null
          opening_hours?: string | null
          reservation_minutes?: number
          social_links?: Json
          store_name?: string
          tagline?: string | null
          tax_rate?: number
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
          slug: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      variant_option_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_option_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_customer_stats: {
        Row: {
          customer_id: string | null
          last_order_at: string | null
          orders_count: number | null
          total_spent_cents: number | null
        }
        Relationships: []
      }
      v_inventory_valuation: {
        Row: {
          cost_value_cents: number | null
          location_id: string | null
          retail_value_cents: number | null
          units_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_ratings: {
        Row: {
          average_rating: number | null
          five_star: number | null
          four_star: number | null
          one_star: number | null
          product_id: string | null
          reviews_count: number | null
          three_star: number | null
          two_star: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_stock_alerts"
            referencedColumns: ["product_id"]
          },
        ]
      }
      v_public_collections: {
        Row: {
          badge_label: string | null
          banner_alt: string | null
          banner_path: string | null
          description: string | null
          id: string | null
          image_alt: string | null
          image_path: string | null
          name: string | null
          position: number | null
          product_count: number | null
          seo_description: string | null
          seo_title: string | null
          slug: string | null
        }
        Relationships: []
      }
      v_stock_alerts: {
        Row: {
          alert: string | null
          available: number | null
          bin_location: string | null
          location_id: string | null
          low_stock_threshold: number | null
          on_hand: number | null
          product_id: string | null
          product_name: string | null
          reserved: number | null
          sku: string | null
          variant_id: string | null
          variant_title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_cart_line: {
        Args: { p_quantity?: number; p_token?: string; p_variant_id?: string }
        Returns: Json
      }
      add_cash_movement: {
        Args: {
          p_amount_cents: number
          p_direction: Database["public"]["Enums"]["cash_direction"]
          p_reason: string
        }
        Returns: Json
      }
      adjust_inventory: {
        Args: {
          p_location_id?: string
          p_new_quantity: number
          p_reason: string
          p_variant_id: string
        }
        Returns: Json
      }
      apply_stock_count: {
        Args: { p_counts: Json; p_location_id?: string; p_note?: string }
        Returns: Json
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      close_register: {
        Args: {
          p_counted_cash_cents: number
          p_notes?: string
          p_session_id?: string
        }
        Returns: Json
      }
      confirm_online_order: {
        Args: {
          p_accepts_marketing?: boolean
          p_cart_token?: string
          p_coupon_code?: string
          p_distance_meters?: number
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_note?: string
          p_payment?: Json
          p_phone?: string
          p_shipping_address?: Json
          p_shipping_method_code?: string
        }
        Returns: Json
      }
      get_cart: { Args: { p_token?: string }; Returns: Json }
      get_customer_profile: { Args: { p_customer_id: string }; Returns: Json }
      get_my_orders: { Args: { p_limit?: number }; Returns: Json }
      get_my_staff_profile: { Args: never; Returns: Json }
      get_order_by_payment_intent: {
        Args: { p_provider_payment_id?: string }
        Returns: Json
      }
      get_order_by_token: {
        Args: { p_guest_token: string; p_order_number: string }
        Returns: Json
      }
      get_pos_sale: { Args: { p_order_id: string }; Returns: Json }
      get_register_summary: { Args: { p_session_id?: string }; Returns: Json }
      get_staff_order: { Args: { p_order_id: string }; Returns: Json }
      list_inventory: {
        Args: {
          p_limit?: number
          p_low_only?: boolean
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      list_staff_orders: {
        Args: {
          p_before?: string
          p_channel?: Database["public"]["Enums"]["order_channel"]
          p_limit?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["order_status"][]
        }
        Returns: Json
      }
      merge_cart: { Args: { p_token: string }; Returns: Json }
      open_register: {
        Args: { p_location_id?: string; p_opening_float_cents?: number }
        Returns: Json
      }
      order_email_payload: { Args: { p_order_id: string }; Returns: Json }
      outbox_claim: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          provider_ref: string | null
          status: Database["public"]["Enums"]["outbox_status"]
          topic: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      outbox_mark_failed: {
        Args: { p_error: string; p_id: string; p_max_attempts?: number }
        Returns: undefined
      }
      outbox_mark_sent: {
        Args: { p_id: string; p_provider_ref?: string }
        Returns: undefined
      }
      outbox_mark_skipped: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      pos_create_return: { Args: { p_payload: Json }; Returns: Json }
      pos_create_sale: { Args: { p_payload: Json }; Returns: Json }
      pos_search_variants: {
        Args: { p_limit?: number; p_location_id?: string; p_query?: string }
        Returns: Json
      }
      pos_send_receipt: {
        Args: { p_email?: string; p_order_id: string }
        Returns: Json
      }
      pos_ship_order: { Args: { p_payload: Json }; Returns: Json }
      pos_upsert_customer: { Args: { p_payload: Json }; Returns: Json }
      preview_checkout: {
        Args: {
          p_coupon_code?: string
          p_distance_meters?: number
          p_shipping_method_code?: string
          p_token: string
        }
        Returns: Json
      }
      receive_stock: {
        Args: {
          p_location_id?: string
          p_note?: string
          p_quantity: number
          p_unit_cost_cents?: number
          p_variant_id: string
        }
        Returns: Json
      }
      release_cart_reservations: {
        Args: { p_cart_id: string }
        Returns: number
      }
      release_cart_stock: { Args: { p_token?: string }; Returns: number }
      release_expired_reservations: { Args: never; Returns: number }
      reserve_cart_stock: { Args: { p_token: string }; Returns: Json }
      search_customers: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      search_products: {
        Args: {
          p_category_slug?: string
          p_collection_slug?: string
          p_colors?: string[]
          p_in_stock_only?: boolean
          p_limit?: number
          p_offset?: number
          p_on_sale?: boolean
          p_query?: string
          p_sizes?: string[]
          p_sort?: string
        }
        Returns: Json
      }
      set_cart_line_quantity: {
        Args: { p_quantity: number; p_token: string; p_variant_id: string }
        Returns: Json
      }
      update_my_profile: {
        Args: {
          p_accepts_marketing?: boolean
          p_birthday?: string
          p_first_name?: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: Json
      }
      validate_coupon: {
        Args: {
          p_channel?: Database["public"]["Enums"]["order_channel"]
          p_code: string
          p_lines: Json
        }
        Returns: Json
      }
    }
    Enums: {
      cart_status: "active" | "converted" | "abandoned"
      cash_direction: "in" | "out"
      coupon_scope: "all" | "products" | "collections" | "categories"
      customer_origin: "pos" | "online"
      discount_type: "percentage" | "fixed_amount" | "free_shipping"
      inventory_movement_type:
        | "initial"
        | "sale"
        | "return"
        | "purchase"
        | "adjustment"
        | "transfer_in"
        | "transfer_out"
      order_channel: "pos" | "online"
      order_status:
        | "draft"
        | "placed"
        | "preparing"
        | "packed"
        | "shipped"
        | "delivered"
        | "completed"
        | "cancelled"
      outbox_status: "pending" | "processing" | "sent" | "failed"
      payment_method: "cash" | "card" | "transfer" | "stripe" | "store_credit"
      payment_status:
        | "pending"
        | "partially_paid"
        | "paid"
        | "partially_refunded"
        | "refunded"
        | "voided"
      product_status: "draft" | "active" | "archived"
      register_session_status: "open" | "closed"
      reservation_status: "active" | "consumed" | "released"
      return_status: "pending" | "approved" | "completed" | "rejected"
      shipping_kind: "flat" | "local_delivery" | "pickup"
      transfer_status: "draft" | "in_transit" | "received" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      cart_status: ["active", "converted", "abandoned"],
      cash_direction: ["in", "out"],
      coupon_scope: ["all", "products", "collections", "categories"],
      customer_origin: ["pos", "online"],
      discount_type: ["percentage", "fixed_amount", "free_shipping"],
      inventory_movement_type: [
        "initial",
        "sale",
        "return",
        "purchase",
        "adjustment",
        "transfer_in",
        "transfer_out",
      ],
      order_channel: ["pos", "online"],
      order_status: [
        "draft",
        "placed",
        "preparing",
        "packed",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
      ],
      outbox_status: ["pending", "processing", "sent", "failed"],
      payment_method: ["cash", "card", "transfer", "stripe", "store_credit"],
      payment_status: [
        "pending",
        "partially_paid",
        "paid",
        "partially_refunded",
        "refunded",
        "voided",
      ],
      product_status: ["draft", "active", "archived"],
      register_session_status: ["open", "closed"],
      reservation_status: ["active", "consumed", "released"],
      return_status: ["pending", "approved", "completed", "rejected"],
      shipping_kind: ["flat", "local_delivery", "pickup"],
      transfer_status: ["draft", "in_transit", "received", "cancelled"],
    },
  },
} as const
