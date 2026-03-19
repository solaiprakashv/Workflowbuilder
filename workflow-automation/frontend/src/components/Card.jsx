export default function Card({ children, className = '', glow = false }) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-all backdrop-blur-sm ${glow ? 'glow-blue accent-glow' : ''} ${className}`}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  );
}
