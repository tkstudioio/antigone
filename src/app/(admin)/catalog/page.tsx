import type { Metadata } from "next";
import { AdminProductsTable } from "@/components/admin-products-table";

export const metadata: Metadata = { title: "Catalog" };

export default function AdminCatalogPage() {
  return <AdminProductsTable />;
}
