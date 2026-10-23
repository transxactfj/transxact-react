"use client";

import { CheckoutButton, TransxactProvider } from "@transxact/react";
import { useState } from "react";

export default function CartPage() {
    const [error, setError] = useState<string | null>(null);

    return (
        <TransxactProvider createSessionUrl="/api/checkout" retrieveSessionUrl="/api/checkout">
            <main style={{ padding: 32, fontFamily: "sans-serif" }}>
                <h1>🛒 Demo Shop</h1>
                <p>1 × T-shirt — FJD 2.00</p>

                <CheckoutButton payload={{ orderId: "order_1" }} onError={(e) => setError(e.message)}>
                    Pay with M-PAiSA or MyCash
                </CheckoutButton>

                <hr />
                <p>Error test (backend returns 404):</p>
                <CheckoutButton payload={{ orderId: "does_not_exist" }} onError={(e) => setError(e.message)}>
                    Pay for a missing order
                </CheckoutButton>

                {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
            </main>
        </TransxactProvider>
    );
}