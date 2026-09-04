export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_users: {
        Row: {
          active: boolean;
          can_crm: boolean;
          can_financeiro: boolean;
          can_inicio: boolean;
          can_workflows: boolean;
          created_at: string;
          email: string;
          full_name: string;
          is_admin: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          can_crm?: boolean;
          can_financeiro?: boolean;
          can_inicio?: boolean;
          can_workflows?: boolean;
          created_at?: string;
          email: string;
          full_name?: string;
          is_admin?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          can_crm?: boolean;
          can_financeiro?: boolean;
          can_inicio?: boolean;
          can_workflows?: boolean;
          created_at?: string;
          email?: string;
          full_name?: string;
          is_admin?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      crm_activities: {
        Row: {
          activity_type: string;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          lead_id: string;
          metadata: Json;
        };
        Insert: {
          activity_type: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          lead_id: string;
          metadata?: Json;
        };
        Update: {
          activity_type?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          lead_id?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      crm_commands: {
        Row: {
          command_type: string;
          created_at: string;
          created_by: string | null;
          error: string;
          id: string;
          lead_id: string | null;
          processed_at: string | null;
          status: string;
        };
        Insert: {
          command_type: string;
          created_at?: string;
          created_by?: string | null;
          error?: string;
          id?: string;
          lead_id?: string | null;
          processed_at?: string | null;
          status?: string;
        };
        Update: {
          command_type?: string;
          created_at?: string;
          created_by?: string | null;
          error?: string;
          id?: string;
          lead_id?: string | null;
          processed_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      crm_leads: {
        Row: {
          address: string;
          assigned_to: string | null;
          capital_social: number | null;
          city: string;
          cnae: string;
          cnpj: string;
          company_name: string;
          created_at: string;
          created_by: string | null;
          email: string;
          group_message_id: string | null;
          group_sent_at: string | null;
          id: string;
          instagram_url: string;
          maps_rating: number | null;
          maps_reviews: number | null;
          next_action: string;
          next_action_at: string | null;
          notes: string;
          partner_name: string;
          phone: string;
          phone_normalized: string | null;
          score: number;
          service_interest: string;
          source: string;
          source_refs: Json;
          stage: string;
          state: string;
          updated_at: string;
          website: string;
        };
        Insert: {
          address?: string;
          assigned_to?: string | null;
          capital_social?: number | null;
          city?: string;
          cnae?: string;
          cnpj?: string;
          company_name: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          group_message_id?: string | null;
          group_sent_at?: string | null;
          id?: string;
          instagram_url?: string;
          maps_rating?: number | null;
          maps_reviews?: number | null;
          next_action?: string;
          next_action_at?: string | null;
          notes?: string;
          partner_name?: string;
          phone?: string;
          score?: number;
          service_interest?: string;
          source?: string;
          source_refs?: Json;
          stage?: string;
          state?: string;
          updated_at?: string;
          website?: string;
        };
        Update: {
          address?: string;
          assigned_to?: string | null;
          capital_social?: number | null;
          city?: string;
          cnae?: string;
          cnpj?: string;
          company_name?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          group_message_id?: string | null;
          group_sent_at?: string | null;
          id?: string;
          instagram_url?: string;
          maps_rating?: number | null;
          maps_reviews?: number | null;
          next_action?: string;
          next_action_at?: string | null;
          notes?: string;
          partner_name?: string;
          phone?: string;
          score?: number;
          service_interest?: string;
          source?: string;
          source_refs?: Json;
          stage?: string;
          state?: string;
          updated_at?: string;
          website?: string;
        };
        Relationships: [];
      };
      home_workspaces: {
        Row: {
          focus_text: string;
          goals: Json;
          notes: string;
          priorities: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          focus_text?: string;
          goals?: Json;
          notes?: string;
          priorities?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          focus_text?: string;
          goals?: Json;
          notes?: string;
          priorities?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      dashboard_tabs: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workflows: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          status: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
