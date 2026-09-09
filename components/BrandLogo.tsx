import Image from 'next/image';
import { SITE_NAME } from '@/lib/site';

export default function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-[#182C3A]">
      <Image src="/brand/mark.svg" width={28} height={28} alt={compact ? SITE_NAME : ''} unoptimized />
      {!compact && <span className="text-sm font-semibold tracking-tight">{SITE_NAME}</span>}
    </span>
  );
}
