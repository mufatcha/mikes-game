export default function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 p-6 ${
          wide ? "max-w-4xl" : "max-w-md"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
