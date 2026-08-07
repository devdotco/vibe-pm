export default function PortfoliosPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: "400px",
        padding: "40px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "16px",
          background: "var(--accent-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px",
          marginBottom: "20px",
        }}
      >
        📁
      </div>
      <h1
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "10px",
        }}
      >
        Portfolios
      </h1>
      <p
        style={{
          fontSize: "14px",
          color: "var(--text-muted)",
          maxWidth: "360px",
          lineHeight: "1.6",
          marginBottom: "8px",
        }}
      >
        Group related projects into portfolios to track progress across teams.
      </p>
      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: "20px",
          fontSize: "11px",
          fontWeight: 500,
          background: "var(--panel-hover)",
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
        }}
      >
        Coming soon
      </span>
    </div>
  );
}
