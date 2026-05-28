import Image from "next/image";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
    >
      <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_50%_42%,rgba(37,99,235,0.18),transparent_62%)]" />
      <Image
        src="/aetheris-logo-mark.png"
        alt=""
        width={1024}
        height={1024}
        className="relative h-[78%] w-[78%] object-contain mix-blend-screen drop-shadow-[0_0_12px_rgba(96,165,250,0.28)]"
        priority
      />
    </span>
  );
}
