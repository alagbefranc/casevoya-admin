// Casevoya branded icons (Core UI 17.3 Pro, Hugeicons stroke-rounded), the same set and sprite markup the
// main app uses (public/assets/icons-coreui in alagbefranc/casevoya; see its ICONS.md). public/icons/sprite.svg
// holds only the symbols the admin uses. Exports keep the old lucide names so call sites did not change; "*"
// marks a closest match where the set has no exact equivalent. Colour follows currentColor, size follows .ic.
import type { CSSProperties } from "react";

export const SPRITE = "/icons/sprite.svg";

type IconProps = { className?: string; size?: number; style?: CSSProperties; "aria-hidden"?: boolean | "true" | "false"; "aria-label"?: string };

function make(name: string) {
  function Icon({ className, size, style, "aria-label": label }: IconProps) {
    return (
      <svg className={className} style={style} width={size ?? 16} height={size ?? 16} viewBox="0 0 24 24" fill="currentColor" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" data-icon={name}>
        <use href={`${SPRITE}#i-${name}`} />
      </svg>
    );
  }
  Icon.displayName = `Icon(${name})`;
  return Icon;
}

export type IconComponent = ReturnType<typeof make>;

export const ICON_MAP = {
  Activity: "health",
  AlarmClock: "alarm",
  AlertCircle: "alert",
  AlertOctagon: "incident", // closest match
  AlertTriangle: "alert", // closest match
  ArrowRight: "arrow-right",
  ArrowRightLeft: "import", // closest match
  ArrowUpRight: "external-link",
  BadgeCheck: "certificate", // closest match
  Ban: "x-circle", // closest match
  Bot: "ai-chat", // closest match
  Building2: "building",
  ChartColumn: "reports",
  Check: "check-circle", // closest match
  CheckCircle2: "check-circle",
  ChevronDown: "chevron-down",
  ChevronRight: "chevron-right",
  CircleAlert: "alert",
  CircleCheck: "check-circle",
  CircleX: "x-circle",
  ClipboardCheck: "task",
  Clock: "clock",
  CreditCard: "credit-card",
  ExternalLink: "external-link",
  FileDiff: "merge", // closest match
  FileSpreadsheet: "file", // closest match
  FileText: "file-doc",
  FlaskConical: "sparkles", // closest match
  FolderOpen: "folder",
  FolderSync: "reconcile", // closest match
  HardDrive: "database", // closest match
  History: "history",
  Hourglass: "hourglass",
  House: "home",
  Inbox: "inbox",
  Info: "info",
  KeyRound: "key",
  Layers: "templates", // closest match
  LayoutGrid: "grid",
  Link2: "link",
  ListChecks: "task", // closest match
  Loader: "loading",
  Loader2: "loading",
  Lock: "lock",
  LogOut: "logout",
  Mail: "mail",
  Megaphone: "bell", // closest match
  Menu: "menu",
  MessageSquareWarning: "message", // closest match
  NotebookPen: "note",
  PanelLeftClose: "chevron-left", // closest match
  PanelLeftOpen: "chevron-right", // closest match
  Plus: "plus",
  RefreshCw: "refresh",
  Rocket: "send", // closest match
  RotateCcw: "undo",
  ScrollText: "file-check", // closest match
  Server: "database", // closest match
  Settings: "settings",
  Settings2: "settings",
  ShieldCheck: "shield",
  ShieldX: "privacy", // closest match
  Siren: "incident",
  StickyNote: "note",
  Timer: "clock", // closest match
  ToggleLeft: "toggle",
  Trash2: "trash",
  TriangleAlert: "alert", // closest match
  Upload: "upload",
  UserPlus: "user-plus",
  Users: "users",
  WifiOff: "wifi-off",
  X: "close",
  XCircle: "x-circle",
} as const;

export const Activity = make(ICON_MAP.Activity);
export const AlarmClock = make(ICON_MAP.AlarmClock);
export const AlertCircle = make(ICON_MAP.AlertCircle);
export const AlertOctagon = make(ICON_MAP.AlertOctagon);
export const AlertTriangle = make(ICON_MAP.AlertTriangle);
export const ArrowRight = make(ICON_MAP.ArrowRight);
export const ArrowRightLeft = make(ICON_MAP.ArrowRightLeft);
export const ArrowUpRight = make(ICON_MAP.ArrowUpRight);
export const BadgeCheck = make(ICON_MAP.BadgeCheck);
export const Ban = make(ICON_MAP.Ban);
export const Bot = make(ICON_MAP.Bot);
export const Building2 = make(ICON_MAP.Building2);
export const ChartColumn = make(ICON_MAP.ChartColumn);
export const Check = make(ICON_MAP.Check);
export const CheckCircle2 = make(ICON_MAP.CheckCircle2);
export const ChevronDown = make(ICON_MAP.ChevronDown);
export const ChevronRight = make(ICON_MAP.ChevronRight);
export const CircleAlert = make(ICON_MAP.CircleAlert);
export const CircleCheck = make(ICON_MAP.CircleCheck);
export const CircleX = make(ICON_MAP.CircleX);
export const ClipboardCheck = make(ICON_MAP.ClipboardCheck);
export const Clock = make(ICON_MAP.Clock);
export const CreditCard = make(ICON_MAP.CreditCard);
export const ExternalLink = make(ICON_MAP.ExternalLink);
export const FileDiff = make(ICON_MAP.FileDiff);
export const FileSpreadsheet = make(ICON_MAP.FileSpreadsheet);
export const FileText = make(ICON_MAP.FileText);
export const FlaskConical = make(ICON_MAP.FlaskConical);
export const FolderOpen = make(ICON_MAP.FolderOpen);
export const FolderSync = make(ICON_MAP.FolderSync);
export const HardDrive = make(ICON_MAP.HardDrive);
export const History = make(ICON_MAP.History);
export const Hourglass = make(ICON_MAP.Hourglass);
export const House = make(ICON_MAP.House);
export const Inbox = make(ICON_MAP.Inbox);
export const Info = make(ICON_MAP.Info);
export const KeyRound = make(ICON_MAP.KeyRound);
export const Layers = make(ICON_MAP.Layers);
export const LayoutGrid = make(ICON_MAP.LayoutGrid);
export const Link2 = make(ICON_MAP.Link2);
export const ListChecks = make(ICON_MAP.ListChecks);
export const Loader = make(ICON_MAP.Loader);
export const Loader2 = make(ICON_MAP.Loader2);
export const Lock = make(ICON_MAP.Lock);
export const LogOut = make(ICON_MAP.LogOut);
export const Mail = make(ICON_MAP.Mail);
export const Megaphone = make(ICON_MAP.Megaphone);
export const Menu = make(ICON_MAP.Menu);
export const MessageSquareWarning = make(ICON_MAP.MessageSquareWarning);
export const NotebookPen = make(ICON_MAP.NotebookPen);
export const PanelLeftClose = make(ICON_MAP.PanelLeftClose);
export const PanelLeftOpen = make(ICON_MAP.PanelLeftOpen);
export const Plus = make(ICON_MAP.Plus);
export const RefreshCw = make(ICON_MAP.RefreshCw);
export const Rocket = make(ICON_MAP.Rocket);
export const RotateCcw = make(ICON_MAP.RotateCcw);
export const ScrollText = make(ICON_MAP.ScrollText);
export const Server = make(ICON_MAP.Server);
export const Settings = make(ICON_MAP.Settings);
export const Settings2 = make(ICON_MAP.Settings2);
export const ShieldCheck = make(ICON_MAP.ShieldCheck);
export const ShieldX = make(ICON_MAP.ShieldX);
export const Siren = make(ICON_MAP.Siren);
export const StickyNote = make(ICON_MAP.StickyNote);
export const Timer = make(ICON_MAP.Timer);
export const ToggleLeft = make(ICON_MAP.ToggleLeft);
export const Trash2 = make(ICON_MAP.Trash2);
export const TriangleAlert = make(ICON_MAP.TriangleAlert);
export const Upload = make(ICON_MAP.Upload);
export const UserPlus = make(ICON_MAP.UserPlus);
export const Users = make(ICON_MAP.Users);
export const WifiOff = make(ICON_MAP.WifiOff);
export const X = make(ICON_MAP.X);
export const XCircle = make(ICON_MAP.XCircle);
