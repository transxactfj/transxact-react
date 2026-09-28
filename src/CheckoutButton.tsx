import { type ButtonHTMLAttributes, forwardRef } from "react";
import { type UseCheckoutOptions, useCheckout } from "./useCheckout";

export type CheckoutButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onError"> & UseCheckoutOptions;

/**
 * An unstyled `<button>` that starts a Checkout attempt when clicked. The Merchant's own `onClick` runs first;
 * calling `preventDefault` there (e.g. after failed form validation) stops the Checkout attempt.
 */
export const CheckoutButton = forwardRef<HTMLButtonElement, CheckoutButtonProps>(function CheckoutButton(
    { createSession, createSessionUrl, payload, onError, redirect, type = "button", onClick, disabled, ...buttonProps },
    ref,
) {
    const { start, state } = useCheckout({ createSession, createSessionUrl, payload, onError, redirect });
    const busy = state === "creating" || state === "redirecting";
    return (
        <button
            {...buttonProps}
            ref={ref}
            type={type}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented) void start();
            }}
        />
    );
});
