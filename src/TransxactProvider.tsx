import { createContext, type ReactNode, useContext } from "react";
import type { FetchInit } from "./http";
import type { RetrieveSessionUrl } from "./retrieveSession";
import type { CheckoutSessionLike, CreateSession, PollingOptions, RetrieveSession } from "./types";

/** Defaults for every hook and component beneath a `TransxactProvider`. Props always override them. */
export interface TransxactConfig {
    /** Asks the Merchant backend to create a Checkout Session. */
    createSession?: CreateSession;
    /** Shorthand for `createSession`: POSTs the payload as JSON here and expects `{ hostedUrl }` back. */
    createSessionUrl?: string;
    /** Asks the Merchant backend for a Checkout Session by id, on the Return page. */
    retrieveSession?: RetrieveSession<CheckoutSessionLike>;
    /** Shorthand for `retrieveSession`: a URL to GET (the SDK adds `session_id`), or one built from the id. */
    retrieveSessionUrl?: RetrieveSessionUrl;
    /** Extra fetch options (headers, credentials) for requests the URL shorthands send. */
    fetchInit?: FetchInit;
    /** Default polling for every Return page; per-hook `polling` overrides it field by field. */
    polling?: PollingOptions;
}

const TransxactContext = createContext<TransxactConfig>({});

export interface TransxactProviderProps extends TransxactConfig {
    children?: ReactNode;
}

/** Optional. Configures how the SDK reaches the Merchant backend, once, for everything beneath it. */
export function TransxactProvider({ children, ...config }: TransxactProviderProps) {
    return <TransxactContext.Provider value={config}>{children}</TransxactContext.Provider>;
}

export function useTransxactConfig(): TransxactConfig {
    return useContext(TransxactContext);
}
