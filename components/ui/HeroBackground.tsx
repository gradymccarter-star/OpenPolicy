'use client';

const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${(i * 4.3) % 100}%`,
  size: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1.5,
  duration: `${14 + (i * 1.7) % 18}s`,
  delay: `${(i * 1.1) % 12}s`,
  opacity: i % 4 === 0 ? 0.5 : 0.25,
}));

export default function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="absolute bottom-0 rounded-full"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            background: p.id % 5 === 0 ? '#c9a84c' : 'white',
            opacity: p.opacity,
            animation: `float-up ${p.duration} ${p.delay} linear infinite`,
          }}
        />
      ))}

      {/* Light sweep */}
      <div
        className="absolute inset-y-0 w-[120px]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)',
          animation: 'light-sweep 8s 2s ease-in-out infinite',
          left: 0,
        }}
      />

      {/* Pulsing gold glow center */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)',
          animation: 'pulse-glow 6s ease-in-out infinite',
        }}
      />
    </div>
  );
}
