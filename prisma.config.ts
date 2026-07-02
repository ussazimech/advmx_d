import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://advmxdb_user:T3rysOUOKWSjVNJq7khKHqey60bnV2Ql@dpg-d93apbdaeets739u5670-a/advmxdb",
  },
});
