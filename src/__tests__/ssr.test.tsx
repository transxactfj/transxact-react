// @vitest-environment node
import { renderToString } from "react-dom/server";
import { CheckoutButton, TransxactProvider, useCheckoutReturn } from "../index";

function ReturnPage() {
    const { state } = useCheckoutReturn({ retrieveSession: async (id) => ({ id, status: "succeeded" }) });
    return <p>state:{state}</p>;
}

describe("server rendering", () => {
    it("renders the pay button without a window", () => {
        expect(typeof window).toBe("undefined");
        const html = renderToString(
            <CheckoutButton createSession={async () => ({ hostedUrl: "https://transxact.io/c/cs_1" })}>
                Pay
            </CheckoutButton>,
        );
        expect(html).toContain('type="button"');
        expect(html).toContain("Pay");
    });

    it("renders a provider wrapping a pay button without a window", () => {
        const html = renderToString(
            <TransxactProvider createSessionUrl="/api/checkout" fetchInit={{ credentials: "include" }}>
                <CheckoutButton payload={{ orderId: "ord_1" }}>Pay</CheckoutButton>
            </TransxactProvider>,
        );
        expect(html).toContain("Pay");
    });

    it("renders a Return page in its idle state without a window", () => {
        expect(renderToString(<ReturnPage />)).toContain("idle");
    });
});
