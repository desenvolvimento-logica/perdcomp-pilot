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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      acompanhamentos: {
        Row: {
          aviso_pagamento: boolean
          aviso_pagamento_data: string | null
          aviso_pagamento_prazo: string | null
          compensacao_oficio: boolean
          compensacao_oficio_prazo: string | null
          declaracao_id: string
          encerrado: boolean
          encerrado_em: string | null
          intimacao: boolean
          intimacao_prazo: string | null
          observacao: string
          responsavel_id: string | null
          updated_at: string
        }
        Insert: {
          aviso_pagamento?: boolean
          aviso_pagamento_data?: string | null
          aviso_pagamento_prazo?: string | null
          compensacao_oficio?: boolean
          compensacao_oficio_prazo?: string | null
          declaracao_id: string
          encerrado?: boolean
          encerrado_em?: string | null
          intimacao?: boolean
          intimacao_prazo?: string | null
          observacao?: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Update: {
          aviso_pagamento?: boolean
          aviso_pagamento_data?: string | null
          aviso_pagamento_prazo?: string | null
          compensacao_oficio?: boolean
          compensacao_oficio_prazo?: string | null
          declaracao_id?: string
          encerrado?: boolean
          encerrado_em?: string | null
          intimacao?: boolean
          intimacao_prazo?: string | null
          observacao?: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acompanhamentos_declaracao_id_fkey"
            columns: ["declaracao_id"]
            isOneToOne: true
            referencedRelation: "declaracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          criado_em: string
          declaracao_id: string
          id: string
          mensagem: string
          prioridade: string
          resolvido: boolean
          resolvido_em: string | null
          resolvido_por: string | null
          tipo: string
        }
        Insert: {
          criado_em?: string
          declaracao_id: string
          id?: string
          mensagem: string
          prioridade?: string
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          tipo: string
        }
        Update: {
          criado_em?: string
          declaracao_id?: string
          id?: string
          mensagem?: string
          prioridade?: string
          resolvido?: boolean
          resolvido_em?: string | null
          resolvido_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_declaracao_id_fkey"
            columns: ["declaracao_id"]
            isOneToOne: false
            referencedRelation: "declaracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_achados: {
        Row: {
          codigo: string
          criado_em: string
          declaracao_id: string
          descricao: string
          id: string
          revisado: boolean
          revisado_em: string | null
          revisado_por: string | null
          severidade: string
        }
        Insert: {
          codigo: string
          criado_em?: string
          declaracao_id: string
          descricao: string
          id?: string
          revisado?: boolean
          revisado_em?: string | null
          revisado_por?: string | null
          severidade?: string
        }
        Update: {
          codigo?: string
          criado_em?: string
          declaracao_id?: string
          descricao?: string
          id?: string
          revisado?: boolean
          revisado_em?: string | null
          revisado_por?: string | null
          severidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_achados_declaracao_id_fkey"
            columns: ["declaracao_id"]
            isOneToOne: false
            referencedRelation: "declaracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      declaracoes: {
        Row: {
          ajuda_situacao: string | null
          cnpj: string | null
          codigo_receita: string | null
          credito_atualizado: number | null
          dados: Json
          data_transmissao: string | null
          gob_id: string
          grupo_tributo: string | null
          id: string
          nome: string | null
          numero_perdcomp: string | null
          periodo_apuracao: string | null
          primeira_sincronizacao: string
          processo_administrativo: string | null
          processo_habilitacao: string | null
          processo_judicial: string | null
          razao_social: string | null
          saldo_credito_original: number | null
          saldo_restante: number | null
          situacao: string | null
          tipo_credito: string | null
          tipo_documento: string | null
          total_debitos: number | null
          ultima_sincronizacao: string
          ultimo_registro: boolean
          updated_at: string
          valor_total_credito: number | null
          valor_utilizado: number | null
        }
        Insert: {
          ajuda_situacao?: string | null
          cnpj?: string | null
          codigo_receita?: string | null
          credito_atualizado?: number | null
          dados?: Json
          data_transmissao?: string | null
          gob_id: string
          grupo_tributo?: string | null
          id?: string
          nome?: string | null
          numero_perdcomp?: string | null
          periodo_apuracao?: string | null
          primeira_sincronizacao?: string
          processo_administrativo?: string | null
          processo_habilitacao?: string | null
          processo_judicial?: string | null
          razao_social?: string | null
          saldo_credito_original?: number | null
          saldo_restante?: number | null
          situacao?: string | null
          tipo_credito?: string | null
          tipo_documento?: string | null
          total_debitos?: number | null
          ultima_sincronizacao?: string
          ultimo_registro?: boolean
          updated_at?: string
          valor_total_credito?: number | null
          valor_utilizado?: number | null
        }
        Update: {
          ajuda_situacao?: string | null
          cnpj?: string | null
          codigo_receita?: string | null
          credito_atualizado?: number | null
          dados?: Json
          data_transmissao?: string | null
          gob_id?: string
          grupo_tributo?: string | null
          id?: string
          nome?: string | null
          numero_perdcomp?: string | null
          periodo_apuracao?: string | null
          primeira_sincronizacao?: string
          processo_administrativo?: string | null
          processo_habilitacao?: string | null
          processo_judicial?: string | null
          razao_social?: string | null
          saldo_credito_original?: number | null
          saldo_restante?: number | null
          situacao?: string | null
          tipo_credito?: string | null
          tipo_documento?: string | null
          total_debitos?: number | null
          ultima_sincronizacao?: string
          ultimo_registro?: boolean
          updated_at?: string
          valor_total_credito?: number | null
          valor_utilizado?: number | null
        }
        Relationships: []
      }
      log_alteracoes: {
        Row: {
          campo: string
          criado_em: string
          declaracao_id: string | null
          id: string
          usuario_id: string | null
          usuario_nome: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          campo: string
          criado_em?: string
          declaracao_id?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo?: string
          criado_em?: string
          declaracao_id?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_alteracoes_declaracao_id_fkey"
            columns: ["declaracao_id"]
            isOneToOne: false
            referencedRelation: "declaracoes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          nome?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      status_historico: {
        Row: {
          declaracao_id: string
          id: string
          registrado_em: string
          situacao_anterior: string | null
          situacao_nova: string
        }
        Insert: {
          declaracao_id: string
          id?: string
          registrado_em?: string
          situacao_anterior?: string | null
          situacao_nova: string
        }
        Update: {
          declaracao_id?: string
          id?: string
          registrado_em?: string
          situacao_anterior?: string | null
          situacao_nova?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_historico_declaracao_id_fkey"
            columns: ["declaracao_id"]
            isOneToOne: false
            referencedRelation: "declaracoes"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador"
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
      app_role: ["admin", "operador"],
    },
  },
} as const
