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
      agreement_records: {
        Row: {
          amount: number
          borrower_confirmed: boolean | null
          borrower_id: string
          created_at: string | null
          due_date: string
          id: string
          lender_confirmed: boolean | null
          lender_id: string
          match_id: string | null
          payment_proof_url: string | null
          repay_amount: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          borrower_confirmed?: boolean | null
          borrower_id: string
          created_at?: string | null
          due_date: string
          id?: string
          lender_confirmed?: boolean | null
          lender_id: string
          match_id?: string | null
          payment_proof_url?: string | null
          repay_amount: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          borrower_confirmed?: boolean | null
          borrower_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          lender_confirmed?: boolean | null
          lender_id?: string
          match_id?: string | null
          payment_proof_url?: string | null
          repay_amount?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_records_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_records_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_records_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          trust_score: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          trust_score?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          trust_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      debts: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          payment_link: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          payment_link?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          payment_link?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          amount: number
          created_at: string | null
          expires_at: string
          from_wallet: string | null
          id: string
          method: string
          status: string | null
          unique_amount: number
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          expires_at: string
          from_wallet?: string | null
          id?: string
          method: string
          status?: string | null
          unique_amount: number
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          expires_at?: string
          from_wallet?: string | null
          id?: string
          method?: string
          status?: string | null
          unique_amount?: number
          user_id?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string | null
          id: string
          name: string
          price: number
          sku: string
          stock: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          price: number
          sku: string
          stock?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          price?: number
          sku?: string
          stock?: number | null
          user_id?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          barcode: string
          created_at: string | null
          id: string
          price: number
          quantity_change: number
          type: string
          user_id: string
        }
        Insert: {
          barcode: string
          created_at?: string | null
          id?: string
          price: number
          quantity_change: number
          type: string
          user_id: string
        }
        Update: {
          barcode?: string
          created_at?: string | null
          id?: string
          price?: number
          quantity_change?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_offers: {
        Row: {
          amount_offer: number
          created_at: string | null
          duration_days: number
          id: string
          lender_id: string
          repay_amount: number
          status: string | null
        }
        Insert: {
          amount_offer: number
          created_at?: string | null
          duration_days: number
          id?: string
          lender_id: string
          repay_amount: number
          status?: string | null
        }
        Update: {
          amount_offer?: number
          created_at?: string | null
          duration_days?: number
          id?: string
          lender_id?: string
          repay_amount?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_offers_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_requests: {
        Row: {
          amount: number
          borrower_id: string
          created_at: string | null
          duration_days: number
          id: string
          purpose: string | null
          repay_amount: number
          status: string | null
        }
        Insert: {
          amount: number
          borrower_id: string
          created_at?: string | null
          duration_days: number
          id?: string
          purpose?: string | null
          repay_amount: number
          status?: string | null
        }
        Update: {
          amount?: number
          borrower_id?: string
          created_at?: string | null
          duration_days?: number
          id?: string
          purpose?: string | null
          repay_amount?: number
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_requests_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          amount: number
          borrower_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          lender_id: string
          photo_evidence: Json | null
          repay_amount: number | null
          signature_data: string | null
          status: string | null
          updated_at: string | null
          verification_evidence: Json | null
        }
        Insert: {
          amount: number
          borrower_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lender_id: string
          photo_evidence?: Json | null
          repay_amount?: number | null
          signature_data?: string | null
          status?: string | null
          updated_at?: string | null
          verification_evidence?: Json | null
        }
        Update: {
          amount?: number
          borrower_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lender_id?: string
          photo_evidence?: Json | null
          repay_amount?: number | null
          signature_data?: string | null
          status?: string | null
          updated_at?: string | null
          verification_evidence?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          borrower_id: string
          created_at: string | null
          id: string
          is_identity_unlocked: boolean | null
          lender_id: string
          match_status: string | null
          offer_id: string | null
          request_id: string | null
          unlock_fee_paid: boolean | null
        }
        Insert: {
          borrower_id: string
          created_at?: string | null
          id?: string
          is_identity_unlocked?: boolean | null
          lender_id: string
          match_status?: string | null
          offer_id?: string | null
          request_id?: string | null
          unlock_fee_paid?: boolean | null
        }
        Update: {
          borrower_id?: string
          created_at?: string | null
          id?: string
          is_identity_unlocked?: boolean | null
          lender_id?: string
          match_status?: string | null
          offer_id?: string | null
          request_id?: string | null
          unlock_fee_paid?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "loan_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "loan_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_requests: {
        Row: {
          amount: number
          borrower_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          interest_rate: number
          lender_id: string | null
          overdue_policy: string | null
          status: string | null
          type: string
        }
        Insert: {
          amount: number
          borrower_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          interest_rate: number
          lender_id?: string | null
          overdue_policy?: string | null
          status?: string | null
          type: string
        }
        Update: {
          amount?: number
          borrower_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          interest_rate?: number
          lender_id?: string | null
          overdue_policy?: string | null
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "matching_requests_borrower_id_fkey"
            columns: ["borrower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_requests_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          amount_claimed: number
          auto_confirm_deadline: string
          created_at: string | null
          deposited_at: string
          gcash_reference: string
          id: string
          loan_id: string
          payment_method: string
          screenshot_url: string
          status: string | null
          submitter_id: string | null
          wallet_address: string | null
        }
        Insert: {
          amount_claimed: number
          auto_confirm_deadline: string
          created_at?: string | null
          deposited_at: string
          gcash_reference: string
          id?: string
          loan_id: string
          payment_method: string
          screenshot_url: string
          status?: string | null
          submitter_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          amount_claimed?: number
          auto_confirm_deadline?: string
          created_at?: string | null
          deposited_at?: string
          gcash_reference?: string
          id?: string
          loan_id?: string
          payment_method?: string
          screenshot_url?: string
          status?: string | null
          submitter_id?: string | null
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          debt_id: string | null
          id: string
          method: string | null
          paid_at: string | null
          reference_no: string | null
        }
        Insert: {
          amount: number
          debt_id?: string | null
          id?: string
          method?: string | null
          paid_at?: string | null
          reference_no?: string | null
        }
        Update: {
          amount?: number
          debt_id?: string | null
          id?: string
          method?: string | null
          paid_at?: string | null
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_barangay: string | null
          address_city: string | null
          address_province: string | null
          credit: number | null
          full_name: string | null
          id: string
          id_back_url: string | null
          id_back_url_2: string | null
          id_expiry: string | null
          id_front_url: string | null
          id_front_url_2: string | null
          id_number: string | null
          id_type: string | null
          is_admin: boolean | null
          is_id_verified: boolean | null
          is_phone_verified: boolean | null
          phone_number: string | null
          selfie_url: string | null
          solana_wallet: string | null
          tier: Database["public"]["Enums"]["user_tier"] | null
          trust_score: number | null
          updated_at: string | null
          verification_status: string | null
        }
        Insert: {
          address_barangay?: string | null
          address_city?: string | null
          address_province?: string | null
          credit?: number | null
          full_name?: string | null
          id: string
          id_back_url?: string | null
          id_back_url_2?: string | null
          id_expiry?: string | null
          id_front_url?: string | null
          id_front_url_2?: string | null
          id_number?: string | null
          id_type?: string | null
          is_admin?: boolean | null
          is_id_verified?: boolean | null
          is_phone_verified?: boolean | null
          phone_number?: string | null
          selfie_url?: string | null
          solana_wallet?: string | null
          tier?: Database["public"]["Enums"]["user_tier"] | null
          trust_score?: number | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Update: {
          address_barangay?: string | null
          address_city?: string | null
          address_province?: string | null
          credit?: number | null
          full_name?: string | null
          id?: string
          id_back_url?: string | null
          id_back_url_2?: string | null
          id_expiry?: string | null
          id_front_url?: string | null
          id_front_url_2?: string | null
          id_number?: string | null
          id_type?: string | null
          is_admin?: boolean | null
          is_id_verified?: boolean | null
          is_phone_verified?: boolean | null
          phone_number?: string | null
          selfie_url?: string | null
          solana_wallet?: string | null
          tier?: Database["public"]["Enums"]["user_tier"] | null
          trust_score?: number | null
          updated_at?: string | null
          verification_status?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          subscription: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          subscription: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          subscription?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: number
          value_text: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: number
          value_text?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: number
          value_text?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_gcash_deposit: {
        Args: { p_received_amount: number; p_ref_no: string; p_secret?: string }
        Returns: Json
      }
      complete_solana_deposit: {
        Args: {
          p_amount: number
          p_from_wallet: string
          p_method: string
          p_secret?: string
          p_tx_id: string
        }
        Returns: Json
      }
      deduct_credit: {
        Args: { p_amount: number; p_loan_id?: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      user_tier: "Iron" | "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond"
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
      user_tier: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond"],
    },
  },
} as const
