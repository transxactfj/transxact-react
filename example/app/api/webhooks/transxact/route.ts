// Receives Transxact's signed webhooks. THIS is where a real shop marks orders paid.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { TransxactApi } from "@transxact/node";

export const runtime = "nodejs"; // needs node:crypto

// Same check as @transxact/node's verifyWebhookSignature (see note below).
function verifySignature(rawBody: string, header: string, secret: string, toleranceMs = 5 * 60 * 1000) {
    const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2)));
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false; // blocks replays
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

type WebhookEvent = {
    id: string;
    type: string;
    data: { object: TransxactApi.CheckoutSession };
};

// Transxact retries, so the same event can arrive twice. A real shop stores this in its database.
const processedEventIds = new Set<string>();

export async function POST(request: Request) {
    // Must be the RAW text: re-serialized JSON would change the bytes and break the signature.
    const rawBody = await request.text();
    const header = request.headers.get("Transxact-Signature") ?? "";

    if (!verifySignature(rawBody, header, process.env.TRANSXACT_WEBHOOK_SECRET!)) {
        console.warn("[webhook] ❌ bad or missing signature — ignored");
        return new Response("invalid signature", { status: 400 });
    }

    const event = JSON.parse(rawBody) as WebhookEvent;

    if (processedEventIds.has(event.id)) {
        console.log(`[webhook] duplicate ${event.id} — already handled`);
        return new Response("ok");
    }
    processedEventIds.add(event.id);

    const session = event.data.object;
    switch (event.type) {
        case "checkout_session.succeeded":
            console.log(`[webhook] ✅ FULFIL order ${session.metadata?.orderId} — ${session.id}, ${session.amount} cents`);
            break;
        case "checkout_session.failed":
        case "checkout_session.cancelled":
            console.log(`[webhook] ${event.type} for order ${session.metadata?.orderId} — release stock`);
            break;
        case "webhook.test":
            console.log("[webhook] 👋 test event from the dashboard");
            break;
        default:
            console.log(`[webhook] ignoring ${event.type}`);
    }

    return new Response("ok"); // answer quickly with 2xx, or Transxact will retry
}