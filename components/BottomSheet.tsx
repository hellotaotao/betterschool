"use client";

import { ReactNode } from 'react';

export type SheetSnap = 'peek' | 'expanded';

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  /** Accessible names for the handle: what pressing it will do. */
  labels: { expand: string; collapse: string };
  children: ReactNode;
}

export default function BottomSheet({ snap, onSnapChange, labels, children }: BottomSheetProps) {
  const height = snap === 'expanded' ? '75vh' : '128px';
  return (
    <div
      className="absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.18)] flex flex-col transition-[height] duration-300 ease-out"
      style={{ height }}
    >
      <button
        onClick={() => onSnapChange(snap === 'peek' ? 'expanded' : 'peek')}
        className="shrink-0 py-2 flex items-center justify-center cursor-pointer"
        aria-label={snap === 'peek' ? labels.expand : labels.collapse}
        aria-expanded={snap === 'expanded'}
      >
        <span aria-hidden="true" className="w-9 h-1 rounded-full bg-gray-300" />
      </button>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
