// REAL Merchant backend: talks to Transxact with your secret key. Server-only.
import { TransxactApiClient, TransxactApiError } from "@transxact/node";

const transxact = new TransxactApiClient({
    token: process.env.TRANSXACT_SECRET_KEY!,
    // Optional: omit to use the production API.
    ...(process.env.TRANSXACT_API_URL ? { environment: process.env.TRANSXACT_API_URL } : {}),
});

// Prices live here, never on the browser.
const ORDERS: Record<string, { totalCents: number }> = {
    order_1: { totalCents: 200 }, // FJD 2.00
};

function apiErrorResponse(label: string, error: unknown) {
    // Log the details server-side; the browser only learns that the step failed.
    if (error instanceof TransxactApiError) {
        console.error(`[${label}] Transxact said ${error.statusCode}:`, error.body);
        return Response.json({ error: `${label}_failed` }, { status: error.statusCode ?? 502 });
    }
    console.error(`[${label}] unexpected error:`, error);
    return Response.json({ error: `${label}_failed` }, { status: 502 });
}

// CREATE: called when the Customer clicks Pay.
// A real shop must also check that the signed-in Customer owns this order before creating a session.
export async function POST(request: Request) {
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const { orderId } = await request.json();
    const order = ORDERS[orderId];
    if (!order) return Response.json({ error: "unknown_order" }, { status: 404 });

    const returnUrl = `${process.env.PUBLIC_BASE_URL}/checkout/return`;
    try {
        const session = await transxact.checkoutSessions.create({
            idempotencyKey, // forward the browser's key so a retry returns the same Checkout Session
            amount: order.totalCents,
            currency: "FJD",
            successUrl: returnUrl,
            cancelUrl: returnUrl,
            metadata: { orderId },
        });
        return Response.json({ id: session.id, hostedUrl: session.hostedUrl });
    } catch (error) {
        return apiErrorResponse("create", error);
    }
}

// RETRIEVE: called by the Return page to ask what actually happened.
// A real shop must also check that this session belongs to the signed-in Customer's order.
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get("session_id");
    if (!id) return Response.json({ error: "missing_session_id" }, { status: 400 });
    try {
        const session = await transxact.checkoutSessions.retrieve({ id });
        // Only send the browser what it needs.
        return Response.json({ id: session.id, status: session.status, amount: session.amount });
    } catch (error) {
        return apiErrorResponse("retrieve", error);
    }
}
