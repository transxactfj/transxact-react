// Pretends to be Transxact's hosted checkout page.
export default async function FakeHostedPage({
    searchParams,
}: {
    searchParams: Promise<{ session_id?: string }>;
}) {
    const { session_id } = await searchParams;
    const back = (outcome: string) => `/checkout/return?session_id=${session_id}_${outcome}`;

    return (
        <main style={{ padding: 32, fontFamily: "sans-serif" }}>
            <h1>🧪 Fake Transxact checkout</h1>
            <p>Session: <code>{session_id}</code></p>
            <ul>
                <li><a href={back("succeeded")}>Pay successfully</a></li>
                <li><a href={back("failed")}>Payment fails</a></li>
                <li><a href={back("cancelled")}>Cancel</a></li>
                <li><a href={back("stuck")}>Stay pending forever (tests timeout)</a></li>
            </ul>
        </main>
    );
}