export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        borderRadius: '6px',
        background: 'var(--panel-hover)',
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

export function SkeletonText({ width, height = 14, style }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return <Skeleton style={{ width: width ?? '100%', height: `${height}px`, borderRadius: '4px', ...style }} />;
}

export function SkeletonAvatar({ size = 28 }: { size?: number }) {
  return <Skeleton style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }} />;
}

// Inject keyframes once via a module-level side effect
if (typeof document !== 'undefined' && !document.getElementById('skeleton-keyframes')) {
  const style = document.createElement('style');
  style.id = 'skeleton-keyframes';
  style.textContent = `
    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
}
