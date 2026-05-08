import React from "react";

/**
 * Génère une teinte HSL déterministe à partir d'un nom.
 * Utilisé pour les avatars sans photo (style Slack / GitLab / Linear).
 */
export function nameToHsl(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return { h, gradient: `linear-gradient(135deg, hsl(${h},65%,52%), hsl(${(h + 40) % 360},70%,40%))` };
}

/**
 * Avatar avec gradient déterministe basé sur le nom.
 */
export function GradientAvatar({ name, size = 32, fontSize, style = {} }) {
  const initials = (name || "?")
    .split(/[\s._-]/)
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
    
  const { gradient } = nameToHsl(name || "?");
  const fs = fontSize || Math.round(size * 0.38);
  
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: gradient,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: fs,
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
        letterSpacing: "0.02em",
        userSelect: "none",
        ...style
      }}
      title={name}
    >
      {initials}
    </div>
  );
}

/**
 * Avatar Robot pour les actions automatisées (Scheduler).
 */
export function RobotAvatar({ size = 32, style = {} }) {
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #06b6d4, #0284c7)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(size * 0.48),
        flexShrink: 0,
        boxShadow: "0 2px 6px rgba(6,182,212,0.35)",
        ...style
      }}
      title="Système / Automatique"
    >
      <i className="ri-robot-line"></i>
    </div>
  );
}

/**
 * Composant Avatar Intelligent : bascule entre Robot et Humain.
 */
const UserAvatar = ({ name, isSystem, size = 32, fontSize, style }) => {
  const lowerName = (name || "").toLowerCase();
  const systemNames = ["système", "system", "scheduler", "automate"];
  if (isSystem || !name || systemNames.includes(lowerName)) {
    return <RobotAvatar size={size} style={style} />;
  }
  return <GradientAvatar name={name} size={size} fontSize={fontSize} style={style} />;
};

export default UserAvatar;
