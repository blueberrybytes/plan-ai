/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient, Role } from "@prisma/client";
import { createFirebaseUser, setUserRole, firebaseAdmin } from "../src/firebase/firebaseAdmin";
import dotenv from "dotenv";

// Load environment variables so firebaseAdmin can initialize
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@plan-ai.local";
  const adminPassword = "password123";

  console.log(`Checking if admin user ${adminEmail} exists in Firebase...`);

  let firebaseUid: string;
  try {
    const userRecord = await firebaseAdmin.auth().getUserByEmail(adminEmail);
    firebaseUid = userRecord.uid;
    console.log("Admin user already exists in Firebase.");
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      console.log("Admin user not found in Firebase. Creating...");
      firebaseUid = await createFirebaseUser({
        email: adminEmail,
        password: adminPassword,
        displayName: "Admin",
      });
      console.log("Admin user created in Firebase successfully!");
    } else {
      throw error;
    }
  }

  // Set the custom claims in Firebase
  await setUserRole(firebaseUid, Role.ADMIN);
  console.log("Firebase custom claims set to ADMIN.");

  // Check if they exist in Postgres
  const dbUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!dbUser) {
    console.log("Creating admin user in PostgreSQL database...");
    await prisma.user.create({
      data: {
        email: adminEmail,
        firebaseUid: firebaseUid,
        name: "Admin",
        role: Role.ADMIN,
      },
    });
    console.log("Admin user created in PostgreSQL successfully!");
  } else {
    console.log("Admin user already exists in PostgreSQL database.");
    // Ensure they have admin role
    if (dbUser.role !== Role.ADMIN) {
      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: Role.ADMIN },
      });
      console.log("Updated PostgreSQL user role to ADMIN.");
    }
  }

  console.log("\n=========================================");
  console.log("✅ Seed completed successfully!");
  console.log("You can now login with:");
  console.log(`Email:    ${adminEmail}`);
  console.log(`Password: ${adminPassword}`);
  console.log("=========================================\n");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
