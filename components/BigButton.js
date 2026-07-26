import Link from "next/link";

export default function BigButton({ href, icon, label, sublabel, color = "bg-green-700" }) {
  return (
    <Link
      href={href}
      className={`${color} text-white rounded-2xl p-6 flex flex-col items-center justify-center gap-2 shadow-md active:scale-95 transition-transform min-h-[140px]`}
    >
      <span className="text-5xl leading-none" aria-hidden>
        {icon}
      </span>
      <span className="text-xl font-bold text-center">{label}</span>
      {sublabel && <span className="text-xs opacity-80 text-center">{sublabel}</span>}
    </Link>
  );
}
