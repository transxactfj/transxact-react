import type { TransxactApi } from "@transxact/node";
import { expectTypeOf } from "vitest";
import {
    type CheckoutButtonProps,
    type CheckoutSessionLike,
    type UseCheckoutOptions,
    useCheckoutReturn,
} from "../index";

describe("the SDK never takes an amount", () => {
    it("has no amount on useCheckout options or CheckoutButton props", () => {
        expectTypeOf<UseCheckoutOptions>().not.toHaveProperty("amount");
        expectTypeOf<CheckoutButtonProps>().not.toHaveProperty("amount");
    });
});

describe("structural compatibility with @transxact/node", () => {
    it("accepts @transxact/node's CheckoutSession as a CheckoutSessionLike", () => {
        expectTypeOf<TransxactApi.CheckoutSession>().toExtend<CheckoutSessionLike>();
    });

    it("returns the Merchant's own session type from the Return page hook", () => {
        const retrieveSession = async (): Promise<TransxactApi.CheckoutSession> => {
            throw new Error("type test only");
        };
        expectTypeOf(useCheckoutReturn({ retrieveSession }).session).toEqualTypeOf<
            TransxactApi.CheckoutSession | undefined
        >();
    });
});
