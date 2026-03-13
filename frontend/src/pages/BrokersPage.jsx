import { Button } from "@mui/material";

export default function BrokersPage() {

  const brokers = [
    { name: "Upstox", logo: "/logos/upstox.png", action: "/auth/login" },
    { name: "Zerodha", logo: "/logos/zerodha.png" },
    { name: "Angel One", logo: "/logos/angelone.png" },
    { name: "Algo Trading", logo: "/logos/algo.png", action: "/options" },
  ];

  return (
    <div className="p-8">

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {brokers.map((broker) => (

          <div
            key={broker.name}
            className="
              rounded-xl
              border
              p-6
              text-center
              transition
              hover:shadow-glow
              bg-white
              dark:bg-dark-card
              border-gray-200
              dark:border-slate-700
            "
          >

            <img
              src={broker.logo}
              alt={broker.name}
              className="h-10 mx-auto mb-3"
            />

            <div className="text-sm font-semibold mb-4">
              {broker.name}
            </div>

            <Button
              variant="contained"
              fullWidth
              onClick={() =>
                broker.action && (window.location.href = broker.action)
              }
            >
              {broker.name === "Algo Trading" ? "Open" : "Connect"}
            </Button>

          </div>

        ))}

      </div>

    </div>
  );
}