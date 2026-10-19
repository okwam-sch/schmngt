import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { imageFileToDataUrl } from "@/lib/image-resize";

/** Shared image picker: resizes the chosen file and hands back a data URL. */
export function ImagePicker({
  maxSize,
  onPick,
  label = "Upload image",
  disabled,
}: {
  maxSize: number;
  onPick: (dataUrl: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onPick(await imageFileToDataUrl(f, maxSize));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not use that image.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => ref.current?.click()}>
        <Upload className="size-4" aria-hidden /> {busy ? "Preparing…" : label}
      </Button>
    </>
  );
}

/** School logo upload for Branding — the crest is drawn automatically when none is uploaded. */
export function LogoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ImagePicker maxSize={512} label={value ? "Replace logo" : "Upload logo"} onPick={onChange} />
      {value ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
          <X className="size-4" aria-hidden /> Remove (use generated crest)
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">No logo uploaded — a crest is drawn from the name, tagline, year and colours.</p>
      )}
    </div>
  );
}
