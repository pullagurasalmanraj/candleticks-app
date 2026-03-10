export default function ChangeBadge({ pct, up }) {

    const sign = up ? "+" : "";

    return (
        <span
            className={
                "text-[11px] font-semibold px-2 py-0.5 rounded-full " +
                (up
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300")
            }
        >
            {sign}
            {pct.toFixed(2)}%
        </span>
    );
}

