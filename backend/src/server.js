import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";

const catalog = [
  {
    id: "500",
    name: "Sprite 500ml",
    description: "A refreshing individual-size pick for your day.",
    priceRwf: 2000,
    rewardRwf: 15000,
    imageUrl: "https://images.pexels.com/photos/4161715/pexels-photo-4161715.jpeg"
  },
  {
    id: "1l",
    name: "Sprite 1L",
    description: "A bigger bottle for sharing the refreshment.",
    priceRwf: 5000,
    rewardRwf: 25000,
    imageUrl: "https://images.pexels.com/photos/2775860/pexels-photo-2775860.jpeg"
  },
  {
    id: "family",
    name: "Sprite Family Pack",
    description: "A family-size choice for a bigger occasion.",
    priceRwf: 10000,
    rewardRwf: 50000,
    imageUrl: "https://images.pexels.com/photos/1266267/pexels-photo-1266267.jpeg"
  }
];

function makeReferralCode() {
  return `SPRITE${Math.floor(100000 + Math.random() * 900000)}`;
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required." });
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired session." });
  }
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    referralCode: user.referralCode,
    createdAt: user.createdAt
  };
}

async function seedCatalog() {
  for (const item of catalog) {
    await prisma.product.upsert({
      where: { id: item.id },
      update: item,
      create: item
    });
  }
}

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/products", async (_, res) => {
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { priceRwf: "asc" } });
  res.json(products);
});

app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(80),
    phone: z.string().regex(/^\+?[\d\s-]{9,17}$/),
    password: z.string().min(8).max(128),
    referralCode: z.string().trim().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Please provide valid registration details." });

  const { name, phone, password, referralCode } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return res.status(409).json({ message: "An account with this phone already exists." });

  let referredById = null;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (referrer) referredById = referrer.id;
  }

  let referral = makeReferralCode();
  while (await prisma.user.findUnique({ where: { referralCode: referral } })) referral = makeReferralCode();

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, phone, passwordHash, referralCode: referral, referredById }
  });

  res.status(201).json({ token: signToken(user), user: serializeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({
    phone: z.string(),
    password: z.string()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid login details." });

  const user = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ message: "Phone number or password is incorrect." });
  }

  res.json({ token: signToken(user), user: serializeUser(user) });
});

app.get("/api/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({ user: serializeUser(user) });
});

/*
 * Payment adapters:
 * The mock adapter lets us develop safely. A real MTN/Airtel adapter should:
 * - create a payment request using server-held credentials
 * - verify callback signatures
 * - query the provider before accepting SUCCESS
 * - use provider reference + order idempotency
 */
async function requestPayment({ order, phone, provider }) {
  if (process.env.PAYMENT_PROVIDER !== "mock") {
    throw new Error("Real provider adapter not configured yet.");
  }
  return {
    provider,
    providerReference: `MOCK-${order.id}`,
    status: "PENDING",
    message: `Demo payment request created for ${phone}.`
  };
}

async function confirmPayment(orderId, providerReference) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (!payment) throw new Error("Payment not found.");

    if (payment.status === "SUCCESS") {
      return tx.order.findUnique({ where: { id: orderId }, include: { reward: true } });
    }

    const confirmedAt = new Date();
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: "PAID", paidAt: confirmedAt }
    });

    await tx.payment.update({
      where: { orderId },
      data: { status: "SUCCESS", providerReference, confirmedAt }
    });

    const existingReward = await tx.reward.findUnique({ where: { orderId } });
    if (!existingReward) {
      await tx.reward.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          amountRwf: order.rewardUnitRwf * order.quantity,
          eligibleAt: new Date(confirmedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
        }
      });
    }

    return tx.order.findUnique({
      where: { id: orderId },
      include: { reward: true, product: true, payment: true }
    });
  });
}

app.post("/api/orders", auth, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    quantity: z.number().int().min(1).max(20),
    phone: z.string().regex(/^\+?[\d\s-]{9,17}$/),
    provider: z.enum(["MTN_MOMO", "AIRTEL_MONEY"])
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid order details." });

  const { productId, quantity, phone, provider } = parsed.data;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.active) return res.status(404).json({ message: "Product not found." });

  const order = await prisma.order.create({
    data: {
      userId: req.userId,
      productId,
      quantity,
      unitPriceRwf: product.priceRwf,
      rewardUnitRwf: product.rewardRwf,
      totalRwf: product.priceRwf * quantity,
      provider
    }
  });

  try {
    const payment = await requestPayment({ order, phone, provider });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider,
        providerReference: payment.providerReference
      }
    });

    res.status(201).json({
      orderId: order.id,
      totalRwf: order.totalRwf,
      rewardRwf: order.rewardUnitRwf * order.quantity,
      payment: { status: "PENDING", providerReference: payment.providerReference }
    });
  } catch (error) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    res.status(502).json({ message: error.message });
  }
});

/*
 * DEVELOPMENT-ONLY confirmation route.
 * In production this endpoint must be replaced/locked down and confirmation
 * should come from a verified provider webhook + provider-side transaction check.
 */
app.post("/api/dev/payments/:orderId/confirm", auth, async (req, res) => {
  if (process.env.PAYMENT_PROVIDER !== "mock") {
    return res.status(404).json({ message: "Development payment confirmation is disabled." });
  }

  const order = await prisma.order.findFirst({ where: { id: req.params.orderId, userId: req.userId } });
  if (!order) return res.status(404).json({ message: "Order not found." });

  try {
    const result = await confirmPayment(order.id, `MOCK-${order.id}`);
    res.json({ order: result });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/orders", auth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId },
    include: { product: true, payment: true, reward: true },
    orderBy: { createdAt: "desc" }
  });
  res.json(orders);
});

app.get("/api/rewards", auth, async (req, res) => {
  const rewards = await prisma.reward.findMany({
    where: { userId: req.userId },
    include: { order: { include: { product: true } } },
    orderBy: { createdAt: "desc" }
  });

  const now = new Date();
  const result = rewards.map((reward) => {
    const claimable = reward.status === "WAITING" && now >= reward.eligibleAt;
    return {
      ...reward,
      status: claimable ? "CLAIMABLE" : reward.status,
      remainingMs: Math.max(0, reward.eligibleAt.getTime() - now.getTime())
    };
  });

  res.json(result);
});

app.post("/api/rewards/:id/claim", auth, async (req, res) => {
  const reward = await prisma.reward.findFirst({
    where: { id: req.params.id, userId: req.userId }
  });

  if (!reward) return res.status(404).json({ message: "Reward not found." });

  const now = new Date();
  if (now < reward.eligibleAt) {
    return res.status(409).json({ message: "This reward is still in its 30-day waiting period." });
  }

  const updated = await prisma.reward.update({
    where: { id: reward.id },
    data: { status: "CLAIMED", claimedAt: now }
  });

  res.json(updated);
});

app.get("/api/dashboard", auth, async (req, res) => {
  const [user, orders, rewards] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId } }),
    prisma.order.findMany({ where: { userId: req.userId }, include: { product: true }, orderBy: { createdAt: "desc" } }),
    prisma.reward.findMany({ where: { userId: req.userId } })
  ]);

  res.json({
    user: serializeUser(user),
    totalSpentRwf: orders.filter(o => o.status === "PAID").reduce((sum, o) => sum + o.totalRwf, 0),
    totalRewardsRwf: rewards.reduce((sum, r) => sum + r.amountRwf, 0),
    waitingRewards: rewards.filter(r => r.status === "WAITING").length,
    claimableRewards: rewards.filter(r => r.status === "CLAIMABLE").length,
    orders
  });
});

async function start() {
  await seedCatalog();
  app.listen(PORT, () => console.log(`Sprite Rewards API running on http://localhost:${PORT}`));
}

start().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
