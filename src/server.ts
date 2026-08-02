import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "./lib/prisma.js";
import { applyPaymentResult, nextPeriodEnd } from "./lib/billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3003);

async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(fastifyStatic, {
    root: path.join(__dirname, "../public"),
    prefix: "/",
  });

  app.get("/health", async () => ({ status: "ok", service: "payrail" }));

  app.get("/v1/plans", async () => prisma.plan.findMany({ orderBy: { amountCents: "asc" } }));

  app.post("/v1/customers", async (req, reply) => {
    const parsed = z
      .object({ email: z.string().email(), name: z.string().min(2) })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const customer = await prisma.customer.create({ data: parsed.data });
    return reply.code(201).send(customer);
  });

  app.post("/v1/subscriptions", async (req, reply) => {
    const parsed = z
      .object({
        customerId: z.string().min(1),
        planCode: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });
    if (!customer) return reply.code(404).send({ error: "Customer not found" });
    const plan = await prisma.plan.findUnique({ where: { code: parsed.data.planCode } });
    if (!plan) return reply.code(404).send({ error: "Plan not found" });

    const periodEnd = nextPeriodEnd(new Date(), plan.intervalDays);
    const subscription = await prisma.subscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        customerId: customer.id,
        subscriptionId: subscription.id,
        amountCents: plan.amountCents,
        status: "OPEN",
        providerRef: `inv_${subscription.id.slice(0, 8)}_${Date.now()}`,
      },
    });

    return reply.code(201).send({ subscription, invoice });
  });

  app.get("/v1/subscriptions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, customer: true, invoices: { orderBy: { createdAt: "desc" } } },
    });
    if (!sub) return reply.code(404).send({ error: "Not found" });
    return sub;
  });

  app.get("/v1/invoices", async (req) => {
    const q = req.query as { customerId?: string };
    return prisma.invoice.findMany({
      where: q.customerId ? { customerId: q.customerId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { subscription: true, customer: true },
    });
  });

  app.post("/webhooks/provider", async (req, reply) => {
    const parsed = z
      .object({
        providerRef: z.string().min(1),
        success: z.boolean(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const invoice = await prisma.invoice.findUnique({
      where: { providerRef: parsed.data.providerRef },
      include: { subscription: true },
    });
    if (!invoice) return reply.code(404).send({ error: "Invoice not found" });

    const next = applyPaymentResult({
      subscriptionStatus: invoice.subscription.status,
      invoiceStatus: invoice.status,
      failedPaymentCount: invoice.subscription.failedPaymentCount,
      success: parsed.data.success,
    });

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: next.invoiceStatus,
        paidAt: next.invoiceStatus === "PAID" ? new Date() : invoice.paidAt,
      },
    });

    const updatedSub = await prisma.subscription.update({
      where: { id: invoice.subscriptionId },
      data: {
        status: next.subscriptionStatus,
        failedPaymentCount: next.failedPaymentCount,
        currentPeriodEnd:
          next.subscriptionStatus === "ACTIVE" && parsed.data.success
            ? nextPeriodEnd(new Date(), (await prisma.plan.findUnique({ where: { id: invoice.subscription.planId } }))!.intervalDays)
            : invoice.subscription.currentPeriodEnd,
      },
    });

    return { invoice: updatedInvoice, subscription: updatedSub };
  });

  return app;
}

const app = await buildApp();
await app.listen({ port: PORT, host: "0.0.0.0" });
