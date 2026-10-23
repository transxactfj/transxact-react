// REAL Merchant backend: talks to Transxact with your secret key. Server-only.
import { TransxactApiClient, TransxactApiError } from "@transxact/node";

const transxact = new TransxactApiClient({
    environment: process.env.TRANSXACT_API_URL!,
    headers: { Authorization: `Bearer ${process.env.TRANSXACT_SECRET_KEY}`},
});

// Prices live here, never on the browser.
const ORDERS: Record<string, { totalCents: number }> = {
    order_1: { totalCents: 200 }, //FJD: 2.00
};

function apiErrorResponse(label: string, error: unknown){
    if(error instanceof TransxactApiError){
        console.error(`[${label}] Transxact said ${error.statusCode}:`, error.body);
        return Response.json({ error: `${label}_failed`}, { status:error.statusCode ?? 502 });
    }
    console.error(`[${label}] unexpected error:`, error);
    return Response.json({ error: `${label}_failed`},{status: 502});
}

// CREATE: called when the Customer clicks Pay.
export async function POST(request: Request) {
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? crypto.randomUUID();
    const { orderId } = await request.json();
    const order = ORDERS[orderId];
    if (!order) return Response.json({ error: "unknown_order" }, { status: 404 });

    const returnUrl = `${process.env.PUBLIC_BASE_URL}/checkout/return`;
    try {
        const session = await transxact.postV1CheckoutSessions({
            "idempotency-key": idempotencyKey, // forward the browser's key
            amount: order.totalCents,
            currency: "FJD",
            successUrl: returnUrl,
            cancelUrl: returnUrl,
            metadata: { orderId },
        });
        console.log(`[create] ${session.id} key=${idempotencyKey} -> ${session.hostedUrl}`);
        return Response.json({ id: session.id, hostedUrl: session.hostedUrl });
    } catch (error) {
        return apiErrorResponse("create", error);
    }
}

// RETRIEVE: called by the Return page to ask what actually happened.
export async function GET(request: Request) {
    const id = new URL(request.url).searchParams.get("session_id");
    if (!id) return Response.json({ error: "missing_session_id" }, { status: 400 });
    try {
        const session = await transxact.getV1CheckoutSessionsId({ id });
        console.log(`[retrieve] ${id} -> ${session.status}`);
        // Only send the browser what it needs.
        return Response.json({ id: session.id, status: session.status, amount: session.amount });
    } catch (error) {
        return apiErrorResponse("retrieve", error);
    }
}