import { Star } from "lucide-react";

export function Rating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-foreground">—</span>;
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-4 ${i < filled ? "fill-amber-400 text-amber-400" : "text-foreground/40"}`}
        />
      ))}
      <span className="ml-1 text-sm text-foreground">
        {rating.toLocaleString("en-US", { maximumFractionDigits: 1 })}
      </span>
    </span>
  );
}
