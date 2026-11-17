interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function CameraIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7.5h2.2l1.2-1.7h5.2l1.2 1.7H20v10.7H4z" />
      <circle cx="12" cy="12.6" r="3.1" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4v10.5" />
      <path d="m7.8 10.6 4.2 4.1 4.2-4.1" />
      <path d="M5 18.5h14" />
    </svg>
  );
}

export function TrashIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 7h14" />
      <path d="M9.5 7V5.2h5V7" />
      <path d="M7 7l.8 12h8.4L17 7" />
      <path d="M10.5 10.5v5.2M13.5 10.5v5.2" />
    </svg>
  );
}

export function SparkIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.5l1.7 4.9 4.9 1.7-4.9 1.7L12 16.7l-1.7-4.9L5.4 10l4.9-1.7z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function CloseIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ShieldIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3.6l7 2.4v5.4c0 4.1-2.9 7.3-7 8.9-4.1-1.6-7-4.8-7-8.9V6z" />
      <path d="m9.2 12.2 2 2 3.6-4" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12.5 4.4 4.4L19 6.8" />
    </svg>
  );
}

export function FileIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.5 3.5h7L18.5 8v12.5h-12z" />
      <path d="M13.5 3.5V8h5" />
      <path d="M9.5 12h5M9.5 15.5h5" />
    </svg>
  );
}

export function ScanIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 8.5V5.5h3M20 8.5v-3h-3M4 15.5v3h3M20 15.5v3h-3" />
      <path d="M8.5 10.5h7M8.5 13.5h7" />
    </svg>
  );
}

export function SmileMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <circle cx="11.4" cy="13.4" r="1.5" fill="currentColor" />
      <circle cx="20.6" cy="13.4" r="1.5" fill="currentColor" />
      <path
        d="M10.3 18.2c1.4 2.6 3.4 4 5.7 4s4.3-1.4 5.7-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
