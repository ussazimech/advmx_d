import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

export default {
  datasource: {
    provider: "postgresql",
    //url: env('DATABASE_URL'),
    url:
      process.env.DATABASE_URL ||
      "postgresql://advmxdb_user:T3rysOUOKWSjVNJq7khKHqey60bnV2Ql@dpg-d93apbdaeets739u5670-a/advmxdb",
  },
};
