import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { setMyAvatar } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";
import { SchoolLogo, type LogoSize } from "./SchoolLogo";
import { ImagePicker } from "./ImageUpload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/** A user's picture; the school logo is everyone's default until they upload their own. */
export function UserAvatar({ url, name, size = "sm", className }: { url?: string | null | undefined; name: string; size?: LogoSize; className?: string }) {
  if (url) {
    const px = { xs: "size-6", sm: "size-9", md: "size-12", lg: "size-20", xl: "size-32", document: "size-[22mm]" }[size];
    return <img src={url} alt={`${name}'s picture`} className={cn("shrink-0 rounded-full object-cover", px, className)} />;
  }
  return <SchoolLogo size={size} className={cn("rounded-full", className)} />;
}

/** Header control: shows the signed-in user's picture and lets them change or remove it. */
export function AvatarPicker() {
  const { profile, refresh } = useSession();
  const save = useServerFn(setMyAvatar);
  if (!profile) return null;
  const apply = async (avatarUrl: string | null) => {
    try {
      await save({ data: { avatarUrl } });
      await refresh();
      toast.success(avatarUrl ? "Profile picture updated." : "Profile picture removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update your picture.");
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Change profile picture" className="rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <UserAvatar url={profile.avatar_url} name={profile.full_name || profile.email} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="flex items-center gap-3">
          <UserAvatar url={profile.avatar_url} name={profile.full_name} size="md" />
          <p className="text-sm">Your profile picture</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImagePicker maxSize={256} label="Upload photo" onPick={(v) => void apply(v)} />
          {profile.avatar_url ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void apply(null)}>Use school logo</Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
