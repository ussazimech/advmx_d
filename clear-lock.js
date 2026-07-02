const { execSync } = require("child_process");

try {
  console.log("Clearing failed Prisma migration status...");
  // Force Prisma to mark the broken migration as safely rolled back
  execSync('npx prisma migrate resolve --rolled-back "20260630221152_init"', {
    stdio: "inherit",
  });
  console.log("Successfully unlocked migration history!");
} catch (error) {
  console.error("Lock clear skipped or failed:", error.message);
}
