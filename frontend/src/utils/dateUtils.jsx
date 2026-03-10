export const startOfDay = (date) => {
    if (!date) return null;

    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    return d;
};

export const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const normalizeDate = (d) => format(d, "yyyy-MM-dd");