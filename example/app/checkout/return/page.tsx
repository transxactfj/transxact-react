"use client";

import { useCheckoutReturn } from "@transxact/react";
import Link from "next/link";

export default function CheckoutReturnPage() {
    const { state, session, error, refresh } = useCheckoutReturn({ retrieveSessionUrl: "/api/checkout" });

    return (
        <main style={{ padding: 32, fontFamily: "sans-serif" }}>
            <h1>Payment result</h1>
            {/* Debug line so you can watch the hook work */}
            <p><small>hook state: <b>{state}</b> · session.status: <b>{session?.status ?? "—"}</b></small></p>

            {state === "missing" && <p>No payment to show.</p>}
            {state === "error" && (
                <p>{`Couldn't check your payment (${error?.message})`}. <button onClick={refresh}>Try again</button></p>
            )}
            {state === "timed_out" && (
                <p>Still confirming… <button onClick={refresh}>Check again</button></p>
            )}
            {(state === "idle" || state === "loading" || state === "polling") && <p>Confirming your payment…</p>}

            {state === "settled" && session?.status === "succeeded" && <p>✅ Paid — thank you!</p>}
            {state === "settled" && session?.status === "failed" && <p>❌ The payment didn't go through.</p>}
            {state === "settled" && session?.status === "cancelled" && <p>↩️ The payment was cancelled.</p>}

            <Link href="/">Back to shop</Link>
        </main>
    );
}