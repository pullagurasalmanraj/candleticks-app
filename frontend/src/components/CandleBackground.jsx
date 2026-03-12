import { useEffect, useRef } from "react";

export default function CandleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    const candles = [];

    for (let i = 0; i < 60; i++) {
      candles.push({
        x: i * 20,
        open: 200 + Math.random() * 100,
        close: 200 + Math.random() * 100,
        high: 200 + Math.random() * 120,
        low: 200 + Math.random() * 80
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      candles.forEach((c, i) => {
        const color = c.close > c.open ? "#4ade80" : "#f87171";

        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        const yOpen = canvas.height - c.open;
        const yClose = canvas.height - c.close;
        const yHigh = canvas.height - c.high;
        const yLow = canvas.height - c.low;

        // wick
        ctx.beginPath();
        ctx.moveTo(c.x + 5, yHigh);
        ctx.lineTo(c.x + 5, yLow);
        ctx.stroke();

        // body
        ctx.fillRect(
          c.x,
          Math.min(yOpen, yClose),
          10,
          Math.abs(yClose - yOpen)
        );
      });

      // move candles
      candles.forEach(c => {
        c.x -= 0.3;
      });

      if (candles[0].x < -20) {
        candles.shift();
        candles.push({
          x: canvas.width,
          open: 200 + Math.random() * 100,
          close: 200 + Math.random() * 100,
          high: 200 + Math.random() * 120,
          low: 200 + Math.random() * 80
        });
      }

      requestAnimationFrame(draw);
    }

    draw();

    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 opacity-50"
    />
  );
}