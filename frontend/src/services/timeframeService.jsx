export async function fetchTimeframes() {
    const res = await fetch("/api/timeframes");

    if (!res.ok) {
        throw new Error("Failed to load timeframes");
    }

    const data = await res.json();

    return Array.isArray(data.timeframes) ? data.timeframes : [];
}