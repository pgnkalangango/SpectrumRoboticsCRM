import {
  Sun, Inbox, CheckSquare, Sparkles, Users, Building2, Kanban, FileText, Receipt, MapPin, Bot, LifeBuoy, Megaphone, Flag, BookOpen, Package, ShieldCheck, BarChart3, UserCog, KeyRound, Workflow, Plug, Network, Settings, ScrollText, Home, FolderOpen, GraduationCap, UserRound, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Sun, Inbox, CheckSquare, Sparkles, Users, Building2, Kanban, FileText, Receipt, MapPin, Bot, LifeBuoy, Megaphone, Flag, BookOpen, Package, ShieldCheck, BarChart3, UserCog, KeyRound, Workflow, Plug, Network, Settings, ScrollText, Home, FolderOpen, GraduationCap, UserRound,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sun;
  return <Icon className={className} />;
}
