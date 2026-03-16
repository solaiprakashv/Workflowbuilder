export default function Card({ children, className = '', glow = false }) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-all ${glow ? 'glow-blue' : ''} ${className}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  );
}
