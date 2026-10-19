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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: []
      }
      chore_events: {
        Row: {
          actor_id: string | null
          chore_id: string
          created_at: string
          due_date: string | null
          event_type: Database["public"]["Enums"]["chore_event_type"]
          id: string
          photo_path: string | null
          reason: string | null
          resident_id: string | null
          target_resident_id: string | null
        }
        Insert: {
          actor_id?: string | null
          chore_id: string
          created_at?: string
          due_date?: string | null
          event_type: Database["public"]["Enums"]["chore_event_type"]
          id?: string
          photo_path?: string | null
          reason?: string | null
          resident_id?: string | null
          target_resident_id?: string | null
        }
        Update: {
          actor_id?: string | null
          chore_id?: string
          created_at?: string
          due_date?: string | null
          event_type?: Database["public"]["Enums"]["chore_event_type"]
          id?: string
          photo_path?: string | null
          reason?: string | null
          resident_id?: string | null
          target_resident_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chore_events_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_events_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "chore_events_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_events_target_resident_id_fkey"
            columns: ["target_resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "chore_events_target_resident_id_fkey"
            columns: ["target_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_members: {
        Row: {
          chore_id: string
          position: number
          resident_id: string
        }
        Insert: {
          chore_id: string
          position?: number
          resident_id: string
        }
        Update: {
          chore_id?: string
          position?: number
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_members_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_members_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "chore_members_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      chores: {
        Row: {
          active: boolean
          created_at: string
          current_resident_id: string | null
          frequency_days: number
          id: string
          kind: Database["public"]["Enums"]["chore_kind"]
          name: string
          needed_reported_at: string | null
          next_due: string
          rotates: boolean
          space_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          current_resident_id?: string | null
          frequency_days?: number
          id?: string
          kind: Database["public"]["Enums"]["chore_kind"]
          name: string
          needed_reported_at?: string | null
          next_due?: string
          rotates?: boolean
          space_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          current_resident_id?: string | null
          frequency_days?: number
          id?: string
          kind?: Database["public"]["Enums"]["chore_kind"]
          name?: string
          needed_reported_at?: string | null
          next_due?: string
          rotates?: boolean
          space_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chores_current_resident_id_fkey"
            columns: ["current_resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "chores_current_resident_id_fkey"
            columns: ["current_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chores_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          amount_cents: number
          expense_id: string
          id: string
          resident_id: string
        }
        Insert: {
          amount_cents: number
          expense_id: string
          id?: string
          resident_id: string
        }
        Update: {
          amount_cents?: number
          expense_id?: string
          id?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "expense_shares_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          group_id: string | null
          id: string
          items: Json | null
          kind: Database["public"]["Enums"]["expense_kind"]
          notes: string | null
          payer_resident_id: string | null
          receipt_hash: string | null
          receipt_path: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string
        }
        Insert: {
          amount_cents: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          group_id?: string | null
          id?: string
          items?: Json | null
          kind: Database["public"]["Enums"]["expense_kind"]
          notes?: string | null
          payer_resident_id?: string | null
          receipt_hash?: string | null
          receipt_path?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title: string
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          group_id?: string | null
          id?: string
          items?: Json | null
          kind?: Database["public"]["Enums"]["expense_kind"]
          notes?: string | null
          payer_resident_id?: string | null
          receipt_hash?: string | null
          receipt_path?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "household_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_resident_id_fkey"
            columns: ["payer_resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "expenses_payer_resident_id_fkey"
            columns: ["payer_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          resident_id: string
        }
        Insert: {
          group_id: string
          resident_id: string
        }
        Update: {
          group_id?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "household_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "group_members_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      household_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      hub_items: {
        Row: {
          created_at: string
          created_by: string
          details: string
          id: string
          kind: string
          payload: Json
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          details?: string
          id?: string
          kind: string
          payload?: Json
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          details?: string
          id?: string
          kind?: string
          payload?: Json
          status?: string
          title?: string
        }
        Relationships: []
      }
      hub_responses: {
        Row: {
          created_at: string
          item_id: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          item_id: string
          user_id?: string
          value: string
        }
        Update: {
          created_at?: string
          item_id?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "hub_items"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          admin_response: string | null
          assigned_resident_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          photo_path: string | null
          reporter_id: string
          reporter_resident_id: string | null
          resolution_notes: string | null
          space_id: string | null
          status: Database["public"]["Enums"]["issue_status"]
          updated_at: string
        }
        Insert: {
          admin_response?: string | null
          assigned_resident_id?: string | null
          category?: string
          created_at?: string
          description: string
          id?: string
          photo_path?: string | null
          reporter_id?: string
          reporter_resident_id?: string | null
          resolution_notes?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Update: {
          admin_response?: string | null
          assigned_resident_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          photo_path?: string | null
          reporter_id?: string
          reporter_resident_id?: string | null
          resolution_notes?: string | null
          space_id?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_assigned_resident_id_fkey"
            columns: ["assigned_resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "issues_assigned_resident_id_fkey"
            columns: ["assigned_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_reporter_resident_id_fkey"
            columns: ["reporter_resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "issues_reporter_resident_id_fkey"
            columns: ["reporter_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          expense_id: string | null
          id: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          note: string | null
          resident_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          resident_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["ledger_kind"]
          note?: string | null
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "resident_balances"
            referencedColumns: ["resident_id"]
          },
          {
            foreignKeyName: "ledger_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_role_members: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_role_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "portal_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          permissions?: string[]
        }
        Relationships: []
      }
      residents: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string | null
          id: string
          is_sample: boolean
          phone: string | null
          room_id: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          is_sample?: boolean
          phone?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          is_sample?: boolean
          phone?: string | null
          room_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "residents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          capacity: number
          code: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["space_kind"]
          name: string
          notes: string | null
          shape: Json
          sort: number
        }
        Insert: {
          capacity?: number
          code: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["space_kind"]
          name: string
          notes?: string | null
          shape?: Json
          sort?: number
        }
        Update: {
          capacity?: number
          code?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["space_kind"]
          name?: string
          notes?: string | null
          shape?: Json
          sort?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      washroom_access: {
        Row: {
          bedroom_id: string
          washroom_id: string
        }
        Insert: {
          bedroom_id: string
          washroom_id: string
        }
        Update: {
          bedroom_id?: string
          washroom_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "washroom_access_bedroom_id_fkey"
            columns: ["bedroom_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "washroom_access_washroom_id_fkey"
            columns: ["washroom_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      resident_balances: {
        Row: {
          adjustments_cents: number | null
          balance_cents: number | null
          credits_cents: number | null
          payments_cents: number | null
          resident_id: string | null
          shares_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _apply_split: {
        Args: {
          _amount: number
          _custom: Json
          _expense_id: string
          _participants: string[]
        }
        Returns: undefined
      }
      add_adjustment: {
        Args: { _amount_cents: number; _reason: string; _resident_id: string }
        Returns: undefined
      }
      admin_chore_action: {
        Args: {
          _action: Database["public"]["Enums"]["chore_event_type"]
          _chore_id: string
          _reason: string
          _target: string
        }
        Returns: undefined
      }
      assign_portal_roles: {
        Args: { _resident_id: string; _roles: string[] }
        Returns: undefined
      }
      complete_chore: {
        Args: { _chore_id: string; _note: string; _photo_path: string }
        Returns: undefined
      }
      delete_portal_role: { Args: { _id: string }; Returns: undefined }
      has_portal_permission: { Args: { _permission: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hub_edit_item: {
        Args: {
          _details: string
          _item_id: string
          _payload: Json
          _title: string
        }
        Returns: undefined
      }
      hub_respond: {
        Args: { _item_id: string; _value: string }
        Returns: undefined
      }
      hub_set_status: {
        Args: { _item_id: string; _status: string }
        Returns: undefined
      }
      in_group: { Args: { _group_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      list_admin_residents: { Args: never; Returns: string[] }
      log_audit: {
        Args: {
          _action: string
          _details: Json
          _entity: string
          _entity_id: string
        }
        Returns: undefined
      }
      my_resident_id: { Args: never; Returns: string }
      next_chore_member: {
        Args: { _after: string; _chore_id: string }
        Returns: string
      }
      portal_permissions: { Args: never; Returns: string[] }
      record_payment: {
        Args: { _amount_cents: number; _note: string; _resident_id: string }
        Returns: undefined
      }
      record_shared_expense: {
        Args: {
          _amount_cents: number
          _category: string
          _custom: Json
          _description: string
          _expense_date: string
          _group_id: string
          _items: Json
          _notes: string
          _participants: string[]
          _receipt_hash: string
          _receipt_path: string
          _title: string
        }
        Returns: string
      }
      report_chore_needed: {
        Args: { _chore_id: string; _note: string }
        Returns: undefined
      }
      review_claim: {
        Args: { _approve: boolean; _expense_id: string; _note: string }
        Returns: undefined
      }
      save_portal_role: {
        Args: {
          _description: string
          _id: string
          _name: string
          _permissions: string[]
        }
        Returns: string
      }
      set_admin: {
        Args: { _make_admin: boolean; _resident_id: string }
        Returns: undefined
      }
      void_expense: {
        Args: { _expense_id: string; _reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "resident"
      chore_event_type:
        | "complete"
        | "skip"
        | "reassign"
        | "reset"
        | "report_needed"
      chore_kind: "washroom" | "hall" | "kitchen" | "garbage" | "other"
      expense_kind: "shared" | "claim"
      expense_status: "pending" | "approved" | "rejected" | "voided"
      issue_status: "open" | "acknowledged" | "in_progress" | "resolved"
      ledger_kind: "share" | "claim_credit" | "payment" | "adjustment"
      space_kind:
        | "bedroom"
        | "kitchen"
        | "hall"
        | "balcony"
        | "washroom"
        | "storage"
        | "other"
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
      app_role: ["admin", "resident"],
      chore_event_type: [
        "complete",
        "skip",
        "reassign",
        "reset",
        "report_needed",
      ],
      chore_kind: ["washroom", "hall", "kitchen", "garbage", "other"],
      expense_kind: ["shared", "claim"],
      expense_status: ["pending", "approved", "rejected", "voided"],
      issue_status: ["open", "acknowledged", "in_progress", "resolved"],
      ledger_kind: ["share", "claim_credit", "payment", "adjustment"],
      space_kind: [
        "bedroom",
        "kitchen",
        "hall",
        "balcony",
        "washroom",
        "storage",
        "other",
      ],
    },
  },
} as const
