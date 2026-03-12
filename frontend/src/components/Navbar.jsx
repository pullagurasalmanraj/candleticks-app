import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">

      {/* NAVBAR */}

      <div className="flex items-center justify-between px-10 py-4 bg-indigo-900 text-white">

        <div className="text-xl font-bold">
          Candlesticks
        </div>

        <div className="flex gap-8 text-sm">

          <a href="#">Home</a>

          <div
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="relative cursor-pointer"
          >
            Products
          </div>

          <a href="#">About</a>

          <a href="#">Contact</a>

        </div>

      </div>


      {/* MEGA MENU */}

      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute left-0 top-full w-full bg-indigo-950 text-white p-10 grid grid-cols-4 gap-10 shadow-2xl"
        >

          {/* Column 1 */}

          <div>
            <h3 className="font-semibold mb-4">Market Data</h3>
            <ul className="space-y-2 text-sm text-indigo-200">
              <li>Stocks</li>
              <li>Futures</li>
              <li>Options</li>
              <li>Indices</li>
            </ul>
          </div>


          {/* Column 2 */}

          <div>
            <h3 className="font-semibold mb-4">Indicators</h3>
            <ul className="space-y-2 text-sm text-indigo-200">
              <li>EMA Engine</li>
              <li>VWAP Engine</li>
              <li>RSI Scanner</li>
              <li>MACD Signals</li>
            </ul>
          </div>


          {/* Column 3 */}

          <div>
            <h3 className="font-semibold mb-4">AI Tools</h3>
            <ul className="space-y-2 text-sm text-indigo-200">
              <li>ML Training</li>
              <li>Prediction Engine</li>
              <li>Signal Classification</li>
              <li>Backtesting</li>
            </ul>
          </div>


          {/* Column 4 */}

          <div>
            <h3 className="font-semibold mb-4">Platform</h3>
            <ul className="space-y-2 text-sm text-indigo-200">
              <li>Dashboard</li>
              <li>Live Signals</li>
              <li>Strategies</li>
              <li>Market Scanner</li>
            </ul>
          </div>

        </div>
      )}

    </div>
  );
}