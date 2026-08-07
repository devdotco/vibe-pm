"use client";

const ACCENT_COLORS = [
  "#2f5cff", "#0d8f80", "#0f7a52", "#a6620a", "#bf2434", "#6d4be0", "#6c7484",
];

function colorForUserId(id: string) {
  const hash = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}

export function UserAvatar({
  userId,
  name,
  avatarUrl,
  size = 24,
}: {
  userId: string;
  name?: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = name ? name.charAt(0).toUpperCase() : "?";
  const color = colorForUserId(userId);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? "User"}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      title={name ?? userId}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color + "20",
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.42,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
