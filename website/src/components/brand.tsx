import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link aria-label="FXSnap home" className="brand" href="/">
      <Image
        alt=""
        className="brand-mark"
        height={38}
        priority
        src="/images/fxsnap-icon.png"
        width={38}
      />
      {!compact && <span>FXSnap</span>}
    </Link>
  );
}
