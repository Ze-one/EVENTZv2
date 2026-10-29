import React from "react";

// Keep the supplied EVENTZ identity intact, including its ETS.NTECH signature.
export default function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <img
      className={`p-brand-logo ${className}`}
      src="/assets/eventz-official-logo.png"
      alt="EVENTZ — manage your event access by ETS.NTECH"
      width={1663}
      height={488}
      decoding="async"
    />
  );
}
