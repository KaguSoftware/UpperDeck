export type Role = "admin" | "owner";

export type OrderStatus = "new" | "seen" | "preparing" | "served" | "cancelled";

export type OrderItem = {
  menu_item_id: string;
  name_en: string;
  name_tr: string;
  price: number;
  qty: number;
};

export type Order = {
  id: string;
  table_number: number;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  note: string;
  created_at: string;
  updated_at: string;
  seen_at: string | null;
  served_at: string | null;
};

export type OrderInsert = {
  table_number: number;
  items: OrderItem[];
  total: number;
  note?: string;
};

export type OrderUpdate = Partial<{
  status: OrderStatus;
  note: string;
}>;

export type Profile = {
  id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
  image_url: string | null;
  emoji: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name_en: string;
  name_tr: string;
  hook_en: string;
  hook_tr: string;
  desc_en: string;
  desc_tr: string;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  image_url: string | null;
  price: number;
  spicy: boolean;
  is_available: boolean;
  sold_out: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type ProfileInsert = {
  id: string;
  role?: Role;
  display_name?: string | null;
};

type ProfileUpdate = Partial<{
  role: Role;
  display_name: string | null;
}>;

type CategoryInsert = {
  id?: string;
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order?: number;
  image_url?: string | null;
  emoji?: string | null;
  parent_id?: string | null;
  created_by?: string | null;
};

type CategoryUpdate = Partial<{
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
  image_url: string | null;
  emoji: string | null;
  parent_id: string | null;
}>;

type MenuItemInsert = {
  id?: string;
  category_id: string;
  name_en: string;
  name_tr: string;
  hook_en?: string;
  hook_tr?: string;
  desc_en?: string;
  desc_tr?: string;
  emoji?: string;
  highlight?: "green-fill" | "orange-fill" | null;
  image_url?: string | null;
  price: number;
  spicy?: boolean;
  is_available?: boolean;
  sold_out?: boolean;
  sort_order?: number;
  created_by?: string | null;
};

type MenuItemUpdate = Partial<Omit<MenuItem, "id" | "created_at" | "updated_at" | "created_by">>;

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: CategoryInsert;
        Update: CategoryUpdate;
        Relationships: [];
      };
      menu_items: {
        Row: MenuItem;
        Insert: MenuItemInsert;
        Update: MenuItemUpdate;
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: Order;
        Insert: OrderInsert;
        Update: OrderUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: Role };
    CompositeTypes: Record<string, never>;
  };
};
