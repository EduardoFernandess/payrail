import { PrismaClient } from "@prisma/client";
import { nextPeriodEnd } from "../src/lib/billing.js";

const prisma = new PrismaClient();

async function main() {
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.plan.deleteMany();

  await prisma.plan.createMany({
    data: [
      { code: "free", name: "Free", amountCents: 0, intervalDays: 30 },
      { code: "pro", name: "Pro", amountCents: 2900, intervalDays: 30 },
      { code: "enterprise", name: "Enterprise", amountCents: 19900, intervalDays: 30 },
    ],
  });

  const customer = await prisma.customer.create({
    data: { email: "billing@payrail.local", name: "Demo Customer" },
  });
  const pro = await prisma.plan.findUniqueOrThrow({ where: { code: "pro" } });
  const sub = await prisma.subscription.create({
    data: {
      customerId: customer.id,
      planId: pro.id,
      status: "ACTIVE",
      currentPeriodEnd: nextPeriodEnd(new Date(), pro.intervalDays),
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      subscriptionId: sub.id,
      amountCents: pro.amountCents,
      status: "OPEN",
      providerRef: "inv_demo_open",
    },
  });

  console.log("Seeded plans free/pro/enterprise");
  console.log({ customerId: customer.id, subscriptionId: sub.id, providerRef: invoice.providerRef });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
